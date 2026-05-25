import type { ContractTransactionReceipt } from "ethers";
import { ChainClient } from "../chain/client.js";
import type { ChainConfig } from "../types/chain.js";
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
   * auto-waits for the transaction receipt.
   *
   * @param value Wei to include — must be at least the robot's
   *   `commandPrice` (see `ChainClient.getCommandPrice`). Defaults to `0`.
   */
  async sendCommand(
    robotId: string,
    command: CommandPayload,
    value?: bigint,
  ): Promise<ContractTransactionReceipt | null> {
    return this.client.dispatchCommand(
      robotId,
      command.apiId,
      command.params ? JSON.stringify(command.params) : "",
      value,
    );
  }

  /**
   * Send multiple commands atomically.
   *
   * @param value Wei to include — must be at least
   *   `commandPrice * commands.length`. Defaults to `0`.
   */
  async sendBatch(
    robotId: string,
    commands: CommandPayload[],
    value?: bigint,
  ): Promise<ContractTransactionReceipt | null> {
    return this.client.dispatchBatch(robotId, commands, value);
  }
}
