import { EventEmitter } from "eventemitter3";
import { Go2Connection } from "../robot/connection.js";
import { ChainClient } from "../chain/client.js";
import { ChainListener } from "../chain/listener.js";
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
  commandExecuted: (command: OnChainCommand, success: boolean) => void;
  error: (error: Error) => void;
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

  /** Command expiry in seconds (matches contract COMMAND_EXPIRY) */
  private static readonly COMMAND_EXPIRY_S = 5 * 60;

  constructor(
    robotConfig: RobotConfig,
    chainConfig: ChainConfig,
    private robotId: string,
  ) {
    super();
    this.connection = new Go2Connection(robotConfig);
    this.client = new ChainClient(chainConfig);
    this.listener = new ChainListener(this.client, robotId);
  }

  /**
   * Connect to the robot over WebRTC and start the on-chain listener. Resolves
   * once both are running; the bridge then processes commands indefinitely
   * until `stop()` is called. Idempotent — calling twice is a no-op.
   *
   * Commands older than 5 minutes (matches the contract's `COMMAND_EXPIRY`)
   * are auto-rejected with `success=false, resultData="Command expired"`
   * rather than executed. `Move` commands with a `duration_ms` parameter
   * are issued repeatedly for the duration, then halted with `StopMove`.
   */
  async start(): Promise<void> {
    if (this.running) return;

    // Connect to robot
    await this.connection.connect();

    // Start chain listener
    this.listener.on("command", (cmd) => this.handleCommand(cmd));
    this.listener.on("error", (err) => this.emit("error", err));
    await this.listener.start();

    this.running = true;
    this.emit("started");
  }

  /**
   * Stop the listener and disconnect the robot. Idempotent.
   */
  async stop(): Promise<void> {
    this.running = false;
    this.listener.stop();
    await this.connection.disconnect();
    this.emit("stopped");
  }

  private async handleCommand(cmd: OnChainCommand): Promise<void> {
    this.emit("commandReceived", cmd);

    // Check if command has expired
    const now = Math.floor(Date.now() / 1000);
    const cmdTime = Number(cmd.timestamp);
    if (now - cmdTime > OperatorNode.COMMAND_EXPIRY_S) {
      await this.submitReceipt(cmd, false, "Command expired");
      return;
    }

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
        // Single command
        this.connection.sportCommand(cmd.apiId as SportCommand, params);

        // Wait for estimated command duration
        const schema = SCHEMA_BY_API_ID.get(cmd.apiId);
        if (schema && schema.estimatedDurationMs > 0) {
          await sleep(schema.estimatedDurationMs);
        }
      }

      await this.submitReceipt(cmd, true, "");
      this.emit("commandExecuted", cmd, true);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.submitReceipt(cmd, false, errMsg);
      this.emit("commandExecuted", cmd, false);
    }
  }

  private async submitReceipt(
    cmd: OnChainCommand,
    success: boolean,
    resultData: string,
  ): Promise<void> {
    try {
      await this.client.submitReceipt(
        this.robotId,
        cmd.nonce,
        success,
        resultData,
      );
    } catch (err) {
      this.emit(
        "error",
        new Error(
          `Failed to submit receipt for nonce ${cmd.nonce}: ${err instanceof Error ? err.message : err}`,
        ),
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
