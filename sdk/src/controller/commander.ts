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

  async sendBatch(
    robotId: string,
    commands: CommandPayload[],
    value?: bigint,
  ): Promise<ContractTransactionReceipt | null> {
    return this.client.dispatchBatch(robotId, commands, value);
  }
}
