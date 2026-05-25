import { EventEmitter } from "eventemitter3";
import type { ChainClient } from "./client.js";
import type { OnChainCommand } from "../types/chain.js";

export interface ChainListenerEvents {
  command: (command: OnChainCommand) => void;
  error: (error: Error) => void;
}

/**
 * Listens for CommandDispatched events on-chain and emits them for processing.
 *
 * Supports two modes:
 * - Event subscription (real-time, requires WebSocket RPC)
 * - Polling (reliable fallback, works with any RPC)
 */
export class ChainListener extends EventEmitter<ChainListenerEvents> {
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private lastProcessedNonce: bigint = 0n;
  private listening = false;

  constructor(
    private client: ChainClient,
    private robotId: string,
  ) {
    super();
  }

  /**
   * Start watching for new commands. Tries WebSocket-style event subscription
   * first; on failure (RPC doesn't support `eth_subscribe`), silently falls
   * back to polling at `pollIntervalMs`. Idempotent — calling twice is a no-op.
   *
   * Only commands with a nonce ≥ the current on-chain nonce at start time
   * are surfaced; historical commands are skipped. To replay history, read
   * them directly via `ChainClient.getCommand`.
   *
   * @param pollIntervalMs Polling cadence in milliseconds, only used when
   *   subscription is unavailable. Defaults to 3000.
   */
  async start(pollIntervalMs = 3000): Promise<void> {
    if (this.listening) return;
    this.listening = true;

    // Get current nonce to start from
    this.lastProcessedNonce = await this.client.getRobotNonce(this.robotId);

    try {
      await this.startEventSubscription();
    } catch {
      // Fallback to polling
      this.startPolling(pollIntervalMs);
    }
  }

  /**
   * Stop watching for commands. Idempotent.
   */
  stop(): void {
    this.listening = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.client.dispatcher.removeAllListeners("CommandDispatched");
  }

  private async startEventSubscription(): Promise<void> {
    const filter = this.client.dispatcher.filters.CommandDispatched(
      this.robotId,
    );

    this.client.dispatcher.on(
      filter,
      (
        robotId: string,
        nonce: bigint,
        sender: string,
        apiId: number,
        parameters: string,
        value: bigint,
      ) => {
        const command: OnChainCommand = {
          robotId,
          nonce,
          sender,
          apiId,
          parameters,
          value,
          timestamp: BigInt(Math.floor(Date.now() / 1000)),
        };
        this.lastProcessedNonce = nonce + 1n;
        this.emit("command", command);
      },
    );
  }

  private startPolling(intervalMs: number): void {
    this.pollInterval = setInterval(async () => {
      try {
        await this.pollPendingCommands();
      } catch (err) {
        this.emit(
          "error",
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    }, intervalMs);
  }

  private async pollPendingCommands(): Promise<void> {
    const currentNonce = await this.client.getRobotNonce(this.robotId);
    if (currentNonce <= this.lastProcessedNonce) return;

    const count = Number(currentNonce - this.lastProcessedNonce);
    const batchSize = Math.min(count, 50);

    for (let i = 0; i < batchSize; i++) {
      const nonce = this.lastProcessedNonce + BigInt(i);
      const cmd = await this.client.getCommand(this.robotId, nonce);

      const command: OnChainCommand = {
        robotId: cmd.robotId as string,
        nonce: cmd.nonce as bigint,
        sender: cmd.sender as string,
        apiId: Number(cmd.apiId),
        parameters: cmd.parameters as string,
        value: cmd.value as bigint,
        timestamp: cmd.timestamp as bigint,
      };

      this.emit("command", command);
    }

    this.lastProcessedNonce += BigInt(batchSize);
  }
}
