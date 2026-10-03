import type { ContractTransactionReceipt } from "ethers";
import { ChainClient } from "../chain/client.js";
import type { ChainConfig, DispatchOptions } from "../types/chain.js";
import type { CommandPayload } from "../types/commands.js";

/**
 * Commander for sending robot commands on-chain.
 *
 * Usage:
 * ```ts
 * const commander = new Commander(chainConfig);
 * await commander.sendCommand(robotId, {
 *   command: "Hello",
 *   apiId: SportCommand.Hello,
 * });
 * ```
 */
export class Commander {
  private client: ChainClient;

  constructor(chainConfig: ChainConfig) {
    this.client = new ChainClient(chainConfig);
  }

  /**
   * Send a single command on-chain. The payload's `params` object is
   * JSON-stringified into the contract's `parameters` field; the call
   * auto-waits for the transaction receipt. See `DispatchOptions` for the
   * payment and note.
   */
  async sendCommand(
    robotId: string,
    command: CommandPayload,
    options?: DispatchOptions,
  ): Promise<ContractTransactionReceipt | null> {
    return this.client.dispatchCommand(
      robotId,
      command.apiId,
      command.params ? JSON.stringify(command.params) : "",
      options,
    );
  }

  /**
   * Send multiple commands atomically. The `value` in `options` must cover
   * `commandPrice * commands.length`.
   */
  async sendBatch(
    robotId: string,
    commands: CommandPayload[],
    options?: DispatchOptions,
  ): Promise<ContractTransactionReceipt | null> {
    return this.client.dispatchBatch(robotId, commands, options);
  }
}
