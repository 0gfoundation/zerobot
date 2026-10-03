import { EventEmitter } from "eventemitter3";
import { NonceManager, type Contract } from "ethers";
import { Go2Connection } from "../robot/connection.js";
import { ChainClient } from "../chain/client.js";
import { ChainListener } from "../chain/listener.js";
import { waitForReceipt } from "../chain/wait.js";
import { GO2_SPORT_SCHEMAS } from "../command/schemas/go2.js";

// Operator currently dispatches Go2 sport commands; this lookup gives
// estimatedDurationMs for the wait-after-send pacing. When operators
// handle other robot types, swap in a registry lookup keyed by robotType.
const SCHEMA_BY_API_ID = new Map(GO2_SPORT_SCHEMAS.map((s) => [s.apiId, s]));
import type { RobotConfig } from "../types/robot.js";
import type { ChainConfig, OnChainCommand } from "../types/chain.js";
import { SportCommand } from "../types/commands.js";

export interface OperatorNodeEvents {
  started: () => void;
  stopped: () => void;
  commandReceived: (command: OnChainCommand) => void;
  commandStarted: (command: OnChainCommand) => void;
  commandExecuted: (
    command: OnChainCommand,
    success: boolean,
    resultData: string,
  ) => void;
  error: (error: Error) => void;
}

export interface OperatorNodeOptions {
  /**
   * Only these api ids run on the robot. Anything else gets a failed
   * receipt. Omit to run every command.
   */
  allowedApiIds?: Iterable<number>;
  /** Pause after each command before starting the next, in ms. Default 1000. */
  settleMs?: number;
  /**
   * On start, pick up commands still pending among the last this many
   * nonces, e.g. ones paid for while the operator was restarting. Default 50.
   */
  recoverCount?: number;
}

/**
 * Operator node that watches the blockchain for commands and executes them on the robot.
 *
 * Usage:
 * ```ts
 * const operator = new OperatorNode(robotConfig, chainConfig, robotId);
 * await operator.start();
 * // ... runs indefinitely, processing commands from the chain
 * await operator.stop();
 * ```
 */
export class OperatorNode extends EventEmitter<OperatorNodeEvents> {
  private connection: Go2Connection;
  private client: ChainClient;
  private listener: ChainListener;
  private running = false;
  private allowed: Set<number> | null;
  private settleMs: number;
  private recoverCount: number;

  private queue: OnChainCommand[] = [];
  private seen = new Set<bigint>();
  private draining = false;
  // Receipts are broadcast one at a time, each without waiting for the
  // previous to confirm. The public RPC takes ~10s to return a receipt, so
  // waiting would leave the on-chain queue status far behind the robot.
  // NonceManager counts nonces locally because that RPC's view of the
  // pending nonce lags too.
  private receiptDispatcher: Contract;
  private receipts: Promise<void> = Promise.resolve();
  private confirmations = new Set<Promise<void>>();

  /** Command expiry in seconds (matches contract COMMAND_EXPIRY) */
  private static readonly COMMAND_EXPIRY_S = 5 * 60;

  constructor(
    robotConfig: RobotConfig,
    chainConfig: ChainConfig,
    private robotId: string,
    options: OperatorNodeOptions = {},
  ) {
    super();
    this.connection = new Go2Connection(robotConfig);
    this.client = new ChainClient(chainConfig);
    this.listener = new ChainListener(this.client, robotId);
    this.receiptDispatcher = this.client.dispatcher.connect(
      new NonceManager(this.client.signer),
    ) as Contract;
    this.allowed = options.allowedApiIds ? new Set(options.allowedApiIds) : null;
    this.settleMs = options.settleMs ?? 1000;
    this.recoverCount = options.recoverCount ?? 50;
  }

  /**
   * Connect to the robot over WebRTC and start the on-chain listener. Resolves
   * once both are running; the bridge then processes commands indefinitely
   * until `stop()` is called. Idempotent — calling twice is a no-op.
   *
   * Commands run one at a time in nonce order, each followed by its schema's
   * exit command if it has one. Each waits for the robot's reply, which it
   * sends once the move is done. The receipt goes out after that,
   * so the oldest pending nonce on-chain is the one running or next up.
   * Commands older than 5 minutes (matches the contract's `COMMAND_EXPIRY`)
   * or not in `allowedApiIds` get `success=false` receipts and never run.
   * `Move` commands with a `duration_ms` parameter are issued repeatedly for
   * the duration, then halted with `StopMove`.
   */
  async start(): Promise<void> {
    if (this.running) return;

    // Connect to robot
    await this.connection.connect();
    this.running = true;

    // Listen first, then recover, so a command landing in between is seen
    // by at least one of them. `seen` drops the duplicates.
    this.listener.on("command", (cmd) => this.enqueue(cmd));
    this.listener.on("error", (err) => this.emit("error", err));
    await this.listener.start();
    await this.recoverPending();

    this.emit("started");
  }

  /**
   * Stop the listener and disconnect the robot. Commands still queued stay
   * pending on-chain and are picked up by the next `start()`. Idempotent.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.listener.stop();
    this.queue = [];
    this.seen.clear();
    await this.receipts;
    await Promise.all(this.confirmations);
    await this.connection.disconnect();
    this.emit("stopped");
  }

  private async recoverPending(): Promise<void> {
    const nonce = await this.client.getRobotNonce(this.robotId);
    const from = nonce > BigInt(this.recoverCount)
      ? nonce - BigInt(this.recoverCount)
      : 0n;
    const pending = await this.client.getPendingCommands(
      this.robotId,
      from,
      this.recoverCount,
    );
    for (const cmd of pending) this.enqueue(cmd);
  }

  private enqueue(cmd: OnChainCommand): void {
    if (!this.running || this.seen.has(cmd.nonce)) return;
    this.seen.add(cmd.nonce);
    this.emit("commandReceived", cmd);

    // Keep nonce order even if recovery and the listener interleave
    const i = this.queue.findIndex((q) => q.nonce > cmd.nonce);
    if (i === -1) this.queue.push(cmd);
    else this.queue.splice(i, 0, cmd);

    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.running && this.queue.length > 0) {
        await this.handleCommand(this.queue.shift()!);
      }
    } finally {
      this.draining = false;
    }
  }

  private async handleCommand(cmd: OnChainCommand): Promise<void> {
    // Check if command has expired
    const now = Math.floor(Date.now() / 1000);
    const cmdTime = Number(cmd.timestamp);
    if (now - cmdTime > OperatorNode.COMMAND_EXPIRY_S) {
      this.finish(cmd, false, "Command expired");
      return;
    }

    if (this.allowed && !this.allowed.has(cmd.apiId)) {
      this.finish(cmd, false, "Command not allowed");
      return;
    }

    this.emit("commandStarted", cmd);

    try {
      const params = cmd.parameters
        ? JSON.parse(cmd.parameters)
        : undefined;

      // Move command with duration: send repeatedly then stop
      if (cmd.apiId === SportCommand.Move && params?.duration_ms) {
        const durationMs = params.duration_ms as number;
        const moveParams = { x: params.x ?? 0, y: params.y ?? 0, z: params.z ?? 0 };
        const endTime = Date.now() + durationMs;
        while (Date.now() < endTime) {
          this.connection.sportCommand(SportCommand.Move, moveParams);
          await sleep(500);
        }
        this.connection.sportCommand(SportCommand.StopMove);
      } else {
        // Single command, run until the robot says it's done
        await this.runAndWait(cmd.apiId, params);

        // Return to standing, e.g. RiseSit after Sit
        const exitApiId = SCHEMA_BY_API_ID.get(cmd.apiId)?.exitApiId;
        if (exitApiId !== undefined) {
          await sleep(this.settleMs);
          await this.runAndWait(exitApiId);
        }
      }

      this.finish(cmd, true, "");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.finish(cmd, false, errMsg);
    }

    await sleep(this.settleMs);
  }

  /**
   * Send a sport command and wait for the robot's reply, which comes once
   * the move is done. Without a reply, fall back to twice the schema's
   * duration so a dropped reply can't stall the queue.
   *
   * @throws If the robot replies with a non-zero status code.
   */
  private async runAndWait(
    apiId: number,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const estimate = SCHEMA_BY_API_ID.get(apiId)?.estimatedDurationMs ?? 0;
    const code = await this.connection.sportCommandAndWait(
      apiId as SportCommand,
      params,
      Math.max(estimate * 2, 3000),
    );
    if (code === null) {
      this.emit("error", new Error(`No reply from the robot to apiId ${apiId}`));
    } else if (code !== 0) {
      throw new Error(`Robot replied with code ${code} to apiId ${apiId}`);
    }
  }

  private finish(cmd: OnChainCommand, success: boolean, resultData: string): void {
    this.emit("commandExecuted", cmd, success, resultData);
    this.receipts = this.receipts.then(() =>
      this.submitReceipt(cmd, success, resultData),
    );
  }

  private async submitReceipt(
    cmd: OnChainCommand,
    success: boolean,
    resultData: string,
  ): Promise<void> {
    const fail = (err: unknown): void => {
      this.emit(
        "error",
        new Error(
          `Failed to submit receipt for nonce ${cmd.nonce}: ${err instanceof Error ? err.message : err}`,
        ),
      );
    };
    try {
      const tx = await this.receiptDispatcher.submitReceipt(
        this.robotId,
        cmd.nonce,
        success,
        resultData,
      );
      const confirmation: Promise<void> = waitForReceipt(tx)
        .then(() => undefined, fail)
        .finally(() => this.confirmations.delete(confirmation));
      this.confirmations.add(confirmation);
    } catch (err) {
      fail(err);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
