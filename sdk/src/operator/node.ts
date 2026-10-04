import { EventEmitter } from "eventemitter3";
import { NonceManager, type Contract, type ContractTransactionResponse } from "ethers";
import { Go2Connection } from "../robot/connection.js";
import { RtcTopic } from "../robot/constants.js";
import { ChainClient, UNKNOWN_BATTERY } from "../chain/client.js";
import { ChainListener } from "../chain/listener.js";
import { waitForReceipt } from "../chain/wait.js";
import { GO2_SPORT_SCHEMAS } from "../command/schemas/go2.js";

// Operator currently dispatches Go2 sport commands; this lookup gives
// estimatedDurationMs for the wait-after-send pacing. When operators
// handle other robot types, swap in a registry lookup keyed by robotType.
const SCHEMA_BY_API_ID = new Map(GO2_SPORT_SCHEMAS.map((s) => [s.apiId, s]));
import type { RobotConfig } from "../types/robot.js";
import type { ChainConfig, OnChainCommand, OperatorStatus } from "../types/chain.js";
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
  /** The robot link came up or went down, or the battery level changed */
  status: (status: OperatorStatus) => void;
  error: (error: Error) => void;
}

/**
 * Where the operator reports its status for pages to read. Swappable so
 * status can move off-chain (e.g. to a pub/sub network) without touching
 * the operator.
 */
export interface StatusPublisher {
  publish(robotId: string, status: OperatorStatus): Promise<void>;
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
  /**
   * Where to report status. Defaults to the registry's `reportStatus` on
   * the operator's own key. `null` turns reporting off.
   */
  statusPublisher?: StatusPublisher | null;
  /** How often to report status when nothing changes, in ms. Default 60000. */
  statusIntervalMs?: number;
  /**
   * How long the robot can go without sending anything before the link
   * counts as lost and is reconnected, in ms. It streams low state about
   * once a second. Default 5000.
   */
  robotSilenceMs?: number;
}

/** The link to the robot dropped while a command was running */
class RobotLinkLost extends Error {}

/**
 * After a missed reply, this long without any data from the robot means the
 * link is dead rather than the reply lost. It streams low state at ~1 Hz.
 */
const NO_REPLY_SILENCE_MS = 2000;

/** Waits between reconnect attempts, in ms; the last repeats */
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10_000];

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
  private connection: Go2Connection | null = null;
  private client: ChainClient;
  private listener: ChainListener;
  private running = false;
  private allowed: Set<number> | null;
  private settleMs: number;
  private recoverCount: number;
  private statusPublisher: StatusPublisher | null;
  private statusIntervalMs: number;
  private robotSilenceMs: number;

  private queue: OnChainCommand[] = [];
  private seen = new Set<bigint>();
  /** Steps of a command the robot has finished, by nonce, so a retry skips them */
  private stepsDone = new Map<bigint, number>();
  private draining = false;

  private robotConnected = false;
  private battery: number | undefined;
  private lastRobotMessageAt = 0;
  private reconnecting = false;
  private robotWaiters: Array<() => void> = [];
  private timers: ReturnType<typeof setInterval>[] = [];

  // Receipts and status reports are broadcast one at a time from the same
  // key, each without waiting for the previous to confirm. The public RPC
  // takes ~10s to return a receipt, so waiting would leave the on-chain
  // queue status far behind the robot. NonceManager counts nonces locally
  // because that RPC's view of the pending nonce lags too.
  private dispatcherWriter: Contract;
  private registryWriter: Contract;
  private sends: Promise<void> = Promise.resolve();
  private confirmations = new Set<Promise<void>>();

  /** Command expiry in seconds (matches contract COMMAND_EXPIRY) */
  private static readonly COMMAND_EXPIRY_S = 5 * 60;

  constructor(
    private robotConfig: RobotConfig,
    chainConfig: ChainConfig,
    private robotId: string,
    options: OperatorNodeOptions = {},
  ) {
    super();
    this.client = new ChainClient(chainConfig);
    this.listener = new ChainListener(this.client, robotId);
    if (!this.client.signer) {
      throw new Error("OperatorNode: chainConfig needs the wallet of the robot's owner or an operator, to submit receipts");
    }
    const signer = new NonceManager(this.client.signer);
    this.dispatcherWriter = this.client.dispatcher.connect(signer) as Contract;
    this.registryWriter = this.client.registry.connect(signer) as Contract;
    this.allowed = options.allowedApiIds ? new Set(options.allowedApiIds) : null;
    this.settleMs = options.settleMs ?? 1000;
    this.recoverCount = options.recoverCount ?? 50;
    this.statusPublisher =
      options.statusPublisher === undefined ? this.chainStatusPublisher() : options.statusPublisher;
    this.statusIntervalMs = options.statusIntervalMs ?? 60_000;
    this.robotSilenceMs = options.robotSilenceMs ?? 5000;
  }

  /** The operator's current view of itself and the robot */
  get status(): OperatorStatus {
    return { online: this.running, robotConnected: this.robotConnected, battery: this.battery };
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
   *
   * If the robot link drops (the channel closes, or the robot sends nothing
   * for `robotSilenceMs`), the operator reconnects with backoff and the
   * queue waits. A command the drop interrupted resumes once the robot is
   * back, rather than failing: a step counts as done when the robot replies
   * to it, so a Sit that finished before the drop only reruns RiseSit. A
   * step whose reply the drop lost runs again. A `Move` with `duration_ms`
   * runs again in full.
   *
   * @throws If the first connection to the robot fails.
   */
  async start(): Promise<void> {
    if (this.running) return;

    await this.connectRobot();
    this.running = true;

    // Listen first, then recover, so a command landing in between is seen
    // by at least one of them. `seen` drops the duplicates.
    this.listener.on("command", (cmd) => this.enqueue(cmd));
    this.listener.on("error", (err) => this.emit("error", err));
    await this.listener.start();
    await this.recoverPending();

    this.timers.push(
      setInterval(() => this.checkRobot(), 1000),
      setInterval(() => this.publishStatus(), this.statusIntervalMs),
    );
    this.publishStatus();
    this.emit("started");
  }

  /**
   * Stop the listener and disconnect the robot. Commands still queued stay
   * pending on-chain and are picked up by the next `start()`. Reports the
   * operator offline first. Idempotent.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this.listener.stop();
    this.queue = [];
    this.seen.clear();
    this.stepsDone.clear();
    this.robotConnected = false;
    this.publishStatus();
    for (const resolve of this.robotWaiters.splice(0)) resolve();
    await this.sends;
    await Promise.all(this.confirmations);
    await this.dropConnection();
    this.emit("stopped");
  }

  /** Open a fresh WebRTC connection and subscribe to the robot's low state */
  private async connectRobot(): Promise<void> {
    const connection = new Go2Connection(this.robotConfig);
    connection.on("message", (msg) => {
      this.lastRobotMessageAt = Date.now();
      if (msg.topic !== RtcTopic.LOW_STATE) return;
      const soc = (msg.data as { bms_state?: { soc?: number } } | undefined)?.bms_state?.soc;
      if (typeof soc === "number" && soc !== this.battery) {
        this.battery = soc;
        this.emit("status", this.status);
      }
    });
    connection.on("disconnected", () => {
      if (connection === this.connection) this.robotLost("Robot connection closed");
    });
    await connection.connect();
    connection.subscribe(RtcTopic.LOW_STATE);
    this.connection = connection;
    this.lastRobotMessageAt = Date.now();
    this.setRobotConnected(true);
  }

  /** A channel can stay open after the robot has gone quiet, so watch for silence too */
  private checkRobot(): void {
    if (this.robotConnected && Date.now() - this.lastRobotMessageAt > this.robotSilenceMs) {
      this.robotLost(`No data from the robot for ${this.robotSilenceMs / 1000}s`);
    }
  }

  private robotLost(reason: string): void {
    if (!this.robotConnected || !this.running) return;
    this.emit("error", new Error(`${reason}, reconnecting`));
    this.setRobotConnected(false);
    void this.dropConnection();
    void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    try {
      for (let attempt = 0; this.running && !this.robotConnected; attempt++) {
        await sleep(RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)]);
        if (!this.running) break;
        try {
          await this.connectRobot();
        } catch (err) {
          await this.dropConnection();
          this.emit("error", new Error(`Reconnect failed: ${err instanceof Error ? err.message : err}`));
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }

  private async dropConnection(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (!connection) return;
    connection.removeAllListeners();
    await connection.disconnect().catch(() => {});
  }

  private setRobotConnected(connected: boolean): void {
    if (connected === this.robotConnected) return;
    this.robotConnected = connected;
    if (connected) for (const resolve of this.robotWaiters.splice(0)) resolve();
    this.emit("status", this.status);
    this.publishStatus();
  }

  /** Resolves when the robot is connected, or the operator stops */
  private waitForRobot(): Promise<void> {
    if (this.robotConnected || !this.running) return Promise.resolve();
    return new Promise((resolve) => this.robotWaiters.push(resolve));
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

  private expired(cmd: OnChainCommand): boolean {
    return Math.floor(Date.now() / 1000) - Number(cmd.timestamp) > OperatorNode.COMMAND_EXPIRY_S;
  }

  private async handleCommand(cmd: OnChainCommand): Promise<void> {
    if (this.allowed && !this.allowed.has(cmd.apiId)) {
      this.finish(cmd, false, "Command not allowed");
      return;
    }

    // While the robot is away the queue waits, rather than failing
    // commands people paid for. They still expire.
    await this.waitForRobot();
    if (!this.running) return;
    if (this.expired(cmd)) {
      this.finish(cmd, false, "Command expired");
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
          this.robot().sportCommand(SportCommand.Move, moveParams);
          await sleep(500);
        }
        this.robot().sportCommand(SportCommand.StopMove);
      } else {
        // The move, then its exit move if it has one (RiseSit after Sit).
        // Each step runs until the robot says it's done, and a retry after
        // a dropped link resumes at the first step the robot didn't finish.
        const exitApiId = SCHEMA_BY_API_ID.get(cmd.apiId)?.exitApiId;
        const steps = [
          { apiId: cmd.apiId, params },
          ...(exitApiId === undefined ? [] : [{ apiId: exitApiId, params: undefined }]),
        ];
        for (let i = this.stepsDone.get(cmd.nonce) ?? 0; i < steps.length; i++) {
          if (i > 0) await sleep(this.settleMs);
          await this.runAndWait(steps[i].apiId, steps[i].params);
          this.stepsDone.set(cmd.nonce, i + 1);
        }
      }

      this.stepsDone.delete(cmd.nonce);
      this.finish(cmd, true, "");
    } catch (err) {
      if (err instanceof RobotLinkLost || !this.robotConnected) {
        // Run it again once the robot is back
        this.queue.unshift(cmd);
        return;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      this.stepsDone.delete(cmd.nonce);
      this.finish(cmd, false, errMsg);
    }

    await sleep(this.settleMs);
  }

  /** The live connection, or a link-lost error to requeue the command */
  private robot(): Go2Connection {
    if (!this.connection || !this.robotConnected) throw new RobotLinkLost("Robot link lost");
    return this.connection;
  }

  /**
   * Send a sport command and wait for the robot's reply, which comes once
   * the move is done. Without a reply, fall back to twice the schema's
   * duration so a dropped reply can't stall the queue.
   *
   * @throws If the robot replies with a non-zero status code, or the link
   *   drops before it replies.
   */
  private async runAndWait(
    apiId: number,
    params?: Record<string, unknown>,
  ): Promise<void> {
    const estimate = SCHEMA_BY_API_ID.get(apiId)?.estimatedDurationMs ?? 0;
    let code: number | null;
    try {
      code = await this.robot().sportCommandAndWait(
        apiId as SportCommand,
        params,
        Math.max(estimate * 2, 3000),
      );
    } catch (err) {
      // Sending fails when the data channel has closed
      throw new RobotLinkLost(err instanceof Error ? err.message : String(err));
    }
    if (code === null) {
      // A dead link can still look open for a while. The robot streams state
      // about once a second, so silence as well as no reply means it's gone.
      if (!this.robotConnected || Date.now() - this.lastRobotMessageAt > NO_REPLY_SILENCE_MS) {
        this.robotLost("No reply and no data from the robot");
        throw new RobotLinkLost("Robot link lost before it replied");
      }
      this.emit("error", new Error(`No reply from the robot to apiId ${apiId}`));
    } else if (code !== 0) {
      throw new Error(`Robot replied with code ${code} to apiId ${apiId}`);
    }
  }

  private finish(cmd: OnChainCommand, success: boolean, resultData: string): void {
    this.emit("commandExecuted", cmd, success, resultData);
    this.send(`receipt for nonce ${cmd.nonce}`, () =>
      this.dispatcherWriter.submitReceipt(this.robotId, cmd.nonce, success, resultData),
    );
  }

  private publishStatus(): void {
    if (!this.statusPublisher) return;
    this.statusPublisher.publish(this.robotId, this.status).catch((err) => {
      this.emit("error", new Error(`Status report failed: ${err instanceof Error ? err.message : err}`));
    });
  }

  /** The default: the registry's `reportStatus`, through the same transaction queue as receipts */
  private chainStatusPublisher(): StatusPublisher {
    return {
      publish: async (robotId, status) => {
        this.send("status report", () =>
          this.registryWriter.reportStatus(
            robotId,
            status.online,
            status.robotConnected,
            status.battery ?? UNKNOWN_BATTERY,
          ),
        );
      },
    };
  }

  /** Broadcast a transaction after the previous one, without waiting for either to confirm */
  private send(label: string, write: () => Promise<ContractTransactionResponse>): void {
    const fail = (err: unknown): void => {
      this.emit(
        "error",
        new Error(`Failed to submit ${label}: ${err instanceof Error ? err.message : err}`),
      );
    };
    this.sends = this.sends.then(async () => {
      try {
        const tx = await write();
        const confirmation: Promise<void> = waitForReceipt(tx)
          .then(() => undefined, fail)
          .finally(() => this.confirmations.delete(confirmation));
        this.confirmations.add(confirmation);
      } catch (err) {
        fail(err);
      }
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
