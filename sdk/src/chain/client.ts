import { ethers, type ContractTransactionReceipt } from "ethers";
import type {
  ChainConfig,
  CommandStatus,
  DispatchOptions,
  OnChainCommand,
  Robot,
} from "../types/chain.js";
import type { CommandPayload } from "../types/commands.js";
import { REGISTRY_ABI, DISPATCHER_ABI } from "./abis.js";
import { resolveSigner } from "./adapter.js";
import { waitForReceipt } from "./wait.js";

/**
 * Client for interacting with the 0G Robot smart contracts. Write methods
 * auto-await `tx.wait()` and resolve to the receipt; read methods return the
 * raw value.
 *
 * Without a wallet in the config (`signer`, `walletClient` or `privateKey`)
 * the client is read-only, and write methods reject.
 */
export class ChainClient {
  public readonly provider: ethers.JsonRpcProvider;
  /** Undefined for a read-only client. */
  public readonly signer: ethers.Signer | undefined;
  public readonly registry: ethers.Contract;
  public readonly dispatcher: ethers.Contract;

  constructor(config: ChainConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    if (config.pollingIntervalMs) {
      this.provider.pollingInterval = config.pollingIntervalMs;
    }

    // Pass `this.provider` so the privateKey path reuses it instead of
    // constructing a second JsonRpcProvider against the same RPC.
    const hasWallet = Boolean(
      config.signer || config.walletClient || config.privateKey,
    );
    this.signer = hasWallet
      ? resolveSigner(config, "ChainConfig", this.provider)
      : undefined;

    const runner = this.signer ?? this.provider;
    this.registry = new ethers.Contract(
      config.registryAddress,
      REGISTRY_ABI,
      runner,
    );
    this.dispatcher = new ethers.Contract(
      config.dispatcherAddress,
      DISPATCHER_ABI,
      runner,
    );
  }

  /**
   * Register a new robot. `msg.sender` becomes the owner — registration is
   * permissionless and has no admin override, so the wallet that sends this
   * transaction is the only address that can later update or transfer it.
   *
   * @param robotId 32-byte hex identifier (e.g. `keccak256(toBytes(name))`).
   *   Must be unique across the registry.
   * @param storageRoot 32-byte hex reference into 0G Storage; pass
   *   `0x000...0` if no off-chain metadata yet.
   * @throws If `robotId` is already registered.
   */
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
    return waitForReceipt(tx);
  }

  /**
   * Update the storage root and/or active flag on an existing robot.
   * `storageRoot` is *unconditionally overwritten* — pass the current value
   * to leave it unchanged, or `0x000...0` to clear it.
   *
   * @throws If the caller is not the robot's owner.
   */
  async updateRobot(
    robotId: string,
    storageRoot: string,
    active: boolean,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.updateRobot(robotId, storageRoot, active);
    return waitForReceipt(tx);
  }

  /**
   * Authorize a controller address to dispatch commands for this robot.
   * Controllers can call `dispatchCommand` / `dispatchBatch` but cannot
   * transfer ownership or manage other controllers.
   *
   * @throws If the caller is not the robot's owner.
   */
  async addController(
    robotId: string,
    controller: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.addController(robotId, controller);
    return waitForReceipt(tx);
  }

  /**
   * Let an address submit receipts for this robot, so an operator node can
   * run on its own key rather than the owner's. Operators can't dispatch
   * to a private robot or change its settings. Any number can be added.
   *
   * @throws If the caller is not the robot's owner.
   */
  async addOperator(
    robotId: string,
    operator: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.addOperator(robotId, operator);
    return waitForReceipt(tx);
  }

  /** Revoke an operator's receipt rights at once. Only callable by the owner. */
  async removeOperator(
    robotId: string,
    operator: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.removeOperator(robotId, operator);
    return waitForReceipt(tx);
  }

  async isOperator(robotId: string, address: string): Promise<boolean> {
    return this.registry.isOperator(robotId, address);
  }

  /**
   * The robot's current operators, from the OperatorAdded and
   * OperatorRemoved logs, checked against `isOperator`.
   */
  async listOperators(robotId: string): Promise<string[]> {
    const added = await this.registry.queryFilter(
      this.registry.filters.OperatorAdded(robotId),
    );
    const candidates = [
      ...new Set(added.map((e) => (e as ethers.EventLog).args.operator as string)),
    ];
    const current = await Promise.all(
      candidates.map((a) => this.isOperator(robotId, a)),
    );
    return candidates.filter((_, i) => current[i]);
  }

  /**
   * Revoke a controller's dispatch authorization. Only callable by the owner.
   */
  async removeController(
    robotId: string,
    controller: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.removeController(robotId, controller);
    return waitForReceipt(tx);
  }

  /**
   * Set the per-command price for this robot. Senders must include at least
   * this value when dispatching or the call reverts. Default is `0` (free).
   * Only callable by the owner.
   *
   * @param price Price per command in **wei**.
   */
  async setCommandPrice(
    robotId: string,
    price: bigint,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.setCommandPrice(robotId, price);
    return waitForReceipt(tx);
  }

  /**
   * Let anyone dispatch commands to this robot, as long as they pay the
   * command price. Owner and controllers are unaffected. Only callable by
   * the owner.
   */
  async setPublicCommands(
    robotId: string,
    enabled: boolean,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.registry.setPublicCommands(robotId, enabled);
    return waitForReceipt(tx);
  }

  /**
   * Dispatch a single command on-chain.
   *
   * @param parameters Command params serialized as a JSON string (e.g.
   *   `JSON.stringify({x: 0.5, y: 0, z: 0})`); pass `""` for commands that
   *   take no parameters. This string ends up double-serialized when the
   *   robot receives it via WebRTC — the contract treats it as opaque.
   * @throws If `msg.sender` is not authorized (owner, controller, or anyone
   *   when the robot has public commands enabled).
   */
  async dispatchCommand(
    robotId: string,
    apiId: number,
    parameters: string,
    { value = 0n, note = "" }: DispatchOptions = {},
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.dispatcher.dispatchCommand(
      robotId,
      apiId,
      parameters,
      note,
      { value },
    );
    return waitForReceipt(tx);
  }

  /**
   * Dispatch multiple commands atomically in one transaction. Cheaper than
   * N separate `dispatchCommand` calls when batching is acceptable. The
   * `note` is stored on every command in the batch.
   */
  async dispatchBatch(
    robotId: string,
    commands: CommandPayload[],
    { value = 0n, note = "" }: DispatchOptions = {},
  ): Promise<ContractTransactionReceipt | null> {
    const apiIds = commands.map((c) => c.apiId);
    const params = commands.map((c) =>
      c.params ? JSON.stringify(c.params) : "",
    );
    const tx = await this.dispatcher.dispatchBatch(
      robotId,
      apiIds,
      params,
      note,
      { value },
    );
    return waitForReceipt(tx);
  }

  /**
   * Submit the execution receipt for a previously-dispatched command.
   * Typically called by the operator node after the robot finishes (or
   * fails) the command. Only callable by the robot's owner or an operator
   * (see `addOperator`).
   *
   * @param nonce The nonce of the command being acknowledged.
   * @param resultData Free-form result string (e.g. error message on failure).
   */
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
    return waitForReceipt(tx);
  }

  /**
   * Withdraw all accumulated command-payment balance for this robot to the
   * owner. Only callable by the owner.
   */
  async withdrawBalance(
    robotId: string,
  ): Promise<ContractTransactionReceipt | null> {
    const tx = await this.dispatcher.withdrawBalance(robotId);
    return waitForReceipt(tx);
  }

  /**
   * Get the next nonce that will be assigned to a command for this robot
   * (equal to the total number of commands dispatched so far). Useful as
   * a starting point for a chain listener.
   */
  async getRobotNonce(robotId: string): Promise<bigint> {
    return this.dispatcher.getRobotNonce(robotId);
  }

  /**
   * Read a previously-dispatched command by `robotId + nonce`.
   *
   * @throws If no such command exists.
   */
  async getCommand(
    robotId: string,
    nonce: bigint,
  ): Promise<Record<string, unknown>> {
    return this.dispatcher.getCommand(robotId, nonce);
  }

  /**
   * Read the commands still pending (no receipt yet) among nonces
   * `fromNonce` to `fromNonce + count - 1`, in nonce order. Includes
   * commands past their expiry that nobody has rejected yet.
   */
  async getPendingCommands(
    robotId: string,
    fromNonce: bigint,
    count: number,
  ): Promise<OnChainCommand[]> {
    const cmds = await this.dispatcher.getPendingCommands(
      robotId,
      fromNonce,
      count,
    );
    return cmds.map(toOnChainCommand);
  }

  /**
   * Check whether an address is authorized to dispatch commands for this
   * robot — returns true for the owner, any added controller, or any address
   * when the robot has public commands enabled. Always false while the robot
   * is inactive.
   */
  async isAuthorized(robotId: string, address: string): Promise<boolean> {
    return this.registry.isAuthorized(robotId, address);
  }

  /**
   * Read a robot's record from the registry. Returns the canonical struct
   * shape; ethers gives back a tuple-indexed Result, which we normalize into
   * a plain object so consumers can destructure by field name reliably.
   *
   * @throws If the robot is not registered. Callers checking for existence
   *   should catch this rather than relying on the zero-owner pattern.
   */
  async getRobot(robotId: string): Promise<Robot> {
    const r = await this.registry.getRobot(robotId);
    return {
      owner: r.owner,
      name: r.name,
      robotType: r.robotType,
      storageRoot: r.storageRoot,
      active: r.active,
      publicCommands: r.publicCommands,
      registeredAt: r.registeredAt,
    };
  }

  /**
   * Get the per-command price for this robot in **wei**. Returns `0n` for
   * free robots.
   */
  async getCommandPrice(robotId: string): Promise<bigint> {
    return this.registry.getCommandPrice(robotId);
  }

  /**
   * List all robots registered to a given owner address. Queries the
   * RobotRegistered event log filtered by owner, then fetches the current
   * Robot record for each so the returned data reflects post-registration
   * updates (name/type can't change, but `active` and `storageRoot` can).
   *
   * Does an N+1 read (1 log scan + N `getRobot` calls). For owners with
   * many robots, consider caching the result.
   */
  async listRobotsByOwner(
    owner: string,
  ): Promise<Array<Robot & { robotId: string }>> {
    const filter = this.registry.filters.RobotRegistered(null, owner);
    const events = await this.registry.queryFilter(filter);
    const robotIds = events.map((e) => {
      // ethers v6 returns EventLog with parsed args; cast for typing
      const log = e as ethers.EventLog;
      return log.args.robotId as string;
    });
    return Promise.all(
      robotIds.map(async (robotId) => ({
        robotId,
        ...(await this.getRobot(robotId)),
      })),
    );
  }
}

/** Normalize a `Command` struct as ethers returns it. */
export function toOnChainCommand(cmd: Record<string, unknown>): OnChainCommand {
  return {
    robotId: cmd.robotId as string,
    nonce: cmd.nonce as bigint,
    sender: cmd.sender as string,
    apiId: Number(cmd.apiId),
    parameters: cmd.parameters as string,
    note: cmd.note as string,
    value: cmd.value as bigint,
    timestamp: cmd.timestamp as bigint,
    status: Number(cmd.status) as CommandStatus,
  };
}
