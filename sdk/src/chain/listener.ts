import { EventEmitter } from "eventemitter3";
import { toOnChainCommand, type ChainClient } from "./client.js";
import type { OnChainCommand } from "../types/chain.js";

export interface ChainListenerEvents {
  command: (command: OnChainCommand) => void;
  error: (error: Error) => void;
}

/**
 * Watches a robot's command nonce on-chain and emits each new command once,
 * in nonce order.
 *
 * Polls contract state rather than subscribing to `CommandDispatched` logs.
 * On the Galileo public RPC, ethers' log subscription delivered nothing, and
 * reading by nonce never skips a command.
 */
export class ChainListener extends EventEmitter<ChainListenerEvents> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private nextNonce = 0n;
  private listening = false;

  constructor(
    private client: ChainClient,
    private robotId: string,
  ) {
    super();
  }

  /**
   * Start watching for new commands. Idempotent — calling twice is a no-op.
   *
   * Only commands with a nonce ≥ the current on-chain nonce at start time
   * are surfaced; historical commands are skipped. To replay history, read
   * them via `ChainClient.getPendingCommands` or `getCommand`.
   *
   * @param pollIntervalMs Polling cadence in milliseconds. Defaults to the
   *   client's `pollingIntervalMs`, or ethers' 4000.
   */
  async start(
    pollIntervalMs = this.client.provider.pollingInterval,
  ): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    this.nextNonce = await this.client.getRobotNonce(this.robotId);

    const tick = async () => {
      try {
        await this.poll();
      } catch (err) {
        this.emit("error", err instanceof Error ? err : new Error(String(err)));
      }
      if (this.listening) this.timer = setTimeout(tick, pollIntervalMs);
    };
    this.timer = setTimeout(tick, pollIntervalMs);
  }

  /**
   * Stop watching for commands. Idempotent.
   */
  stop(): void {
    this.listening = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    const currentNonce = await this.client.getRobotNonce(this.robotId);

    while (this.listening && this.nextNonce < currentNonce) {
      const cmd = toOnChainCommand(
        await this.client.getCommand(this.robotId, this.nextNonce),
      );
      // A load-balanced RPC can answer from a node that hasn't seen this
      // command yet, which reads back as an empty struct. Retry next poll.
      if (cmd.timestamp === 0n) return;
      this.nextNonce++;
      this.emit("command", cmd);
    }
  }
}
