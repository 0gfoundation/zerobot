import { ethers, type ContractTransactionReceipt } from "ethers";
import type { ChainConfig, Robot } from "../types/chain.js";
import type { CommandPayload } from "../types/commands.js";
import { REGISTRY_ABI, DISPATCHER_ABI } from "./abis.js";
import { walletClientToSigner } from "./adapter.js";

/**
 * Client for interacting with the 0G Robot smart contracts.
 */
export class ChainClient {
  public readonly provider: ethers.JsonRpcProvider;
  public readonly signer: ethers.Signer;
  public readonly registry: ethers.Contract;
  public readonly dispatcher: ethers.Contract;

  constructor(config: ChainConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

    // Precedence: explicit ethers Signer > viem WalletClient (adapted) > privateKey.
    if (config.signer) {
      this.signer = config.signer;
    } else if (config.walletClient) {
      this.signer = walletClientToSigner(config.walletClient);
    } else if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    } else {
      throw new Error(
        "ChainConfig must provide one of: signer, walletClient, or privateKey",
      );
    }

    this.registry = new ethers.Contract(
      config.registryAddress,
      REGISTRY_ABI,
      this.signer,
    );
    this.dispatcher = new ethers.Contract(
      config.dispatcherAddress,
      DISPATCHER_ABI,
      this.signer,
    );
  }

  async registerRobot(
    robotId: string,
    name: string,
    robotType: string,
    storageRoot: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.registerRobot(
      robotId,
      name,
      robotType,
      storageRoot,
    );
    return tx.wait();
  }

  async updateRobot(
    robotId: string,
    storageRoot: string,
    active: boolean,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.updateRobot(robotId, storageRoot, active);
    return tx.wait();
  }

  async addController(
    robotId: string,
    controller: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.addController(robotId, controller);
    return tx.wait();
  }

  async removeController(
    robotId: string,
    controller: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.removeController(robotId, controller);
    return tx.wait();
  }

  async setCommandPrice(
    robotId: string,
    price: bigint,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.setCommandPrice(robotId, price);
    return tx.wait();
  }

  async dispatchCommand(
    robotId: string,
    apiId: number,
    parameters: string,
    value?: bigint,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.dispatcher.dispatchCommand(
      robotId,
      apiId,
      parameters,
      { value: value ?? 0n },
    );
    return tx.wait();
  }

  async dispatchBatch(
    robotId: string,
    commands: CommandPayload[],
    value?: bigint,
  ): Promise<ContractTransactionReceipt | null> {
    const apiIds = commands.map((c) => c.apiId);
    const params = commands.map((c) =>
      c.params ? JSON.stringify(c.params) : "",
    );
    const tx = await this.dispatcher.dispatchBatch(
      robotId,
      apiIds,
      params,
      { value: value ?? 0n },
    );
    return tx.wait();
  }

  async submitReceipt(
    robotId: string,
    nonce: bigint,
    success: boolean,
    resultData: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.dispatcher.submitReceipt(
      robotId,
      nonce,
      success,
      resultData,
    );
    return tx.wait();
  }

  async withdrawBalance(
    robotId: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.dispatcher.withdrawBalance(robotId);
    return tx.wait();
  }

  async getRobotNonce(robotId: string): Promise<bigint> {
    return this.dispatcher.getRobotNonce(robotId);
  }

  async getCommand(
    robotId: string,
    nonce: bigint,
  ): Promise<Record<string, unknown>> {
    return this.dispatcher.getCommand(robotId, nonce);
  }

  async isAuthorized(robotId: string, address: string): Promise<boolean> {
    return this.registry.isAuthorized(robotId, address);
  }

  /**
   * Read a robot's record from the registry. Returns the canonical struct
   * shape; ethers gives back a tuple-indexed Result, which we normalize into
   * a plain object so consumers can destructure by field name reliably.
   */
  async getRobot(robotId: string): Promise<Robot> {
    const r = await this.registry.getRobot(robotId);
    return {
      owner: r.owner,
      name: r.name,
      robotType: r.robotType,
      storageRoot: r.storageRoot,
      active: r.active,
      registeredAt: r.registeredAt,
    };
  }

  async getCommandPrice(robotId: string): Promise<bigint> {
    return this.registry.getCommandPrice(robotId);
  }
}
