import type { Signer } from "ethers";
import type { WalletClient } from "viem";

export interface ChainConfig {
  rpcUrl: string;
  chainId?: number;
  registryAddress: string;
  dispatcherAddress: string;
  /** Hex-encoded private key (Node-side / scripted usage). */
  privateKey?: string;
  /** An ethers `Signer` (e.g. `Wallet`, `JsonRpcSigner`). */
  signer?: Signer;
  /**
   * A viem `WalletClient` (e.g. from wagmi). Adapted to an ethers `Signer`
   * internally — see `walletClientToSigner`. Provide at most one of
   * `signer`, `walletClient`, or `privateKey`. With none, `ChainClient` is
   * read-only.
   */
  walletClient?: WalletClient;
  /**
   * How often to poll the RPC for new blocks and events, in ms. ethers
   * defaults to 4000. Also the default poll cadence for `ChainListener`.
   * Galileo makes a block about every 0.5s.
   */
  pollingIntervalMs?: number;
}

/** Mirrors `IRobotCommandDispatcher.CommandStatus`. */
export enum CommandStatus {
  Pending = 0,
  Executed = 1,
  Failed = 2,
  Expired = 3,
}

export interface OnChainCommand {
  robotId: string;
  nonce: bigint;
  sender: string;
  apiId: number;
  parameters: string;
  /** Free text from the sender, e.g. their name. Empty when none was given. */
  note: string;
  value: bigint;
  /** Block timestamp of the dispatch, in seconds. */
  timestamp: bigint;
  status: CommandStatus;
}

/**
 * Owner settings to apply in one transaction (the registry's `multicall`).
 * Unset fields are left as they are.
 */
export interface RobotSettings {
  /** Price per command in wei */
  price?: bigint;
  publicCommands?: boolean;
  active?: boolean;
  addOperators?: string[];
  removeOperators?: string[];
  addControllers?: string[];
  removeControllers?: string[];
}

/** Options for dispatching commands on-chain. */
export interface DispatchOptions {
  /**
   * Wei to include. Must be at least the robot's `commandPrice` (times the
   * number of commands for a batch) or the call reverts. Defaults to `0`.
   */
  value?: bigint;
  /**
   * Free text stored with the command and emitted in `CommandDispatched`,
   * e.g. the sender's name. At most 64 bytes of UTF-8 or the call reverts.
   * Defaults to `""`.
   */
  note?: string;
}

/** Robot record as stored in RobotRegistry. */
export interface Robot {
  owner: string;
  name: string;
  robotType: string;
  /** `bytes32` reference into 0G Storage (or zero if unused). */
  storageRoot: string;
  active: boolean;
  /** Anyone may dispatch (paying the price), not just owner and controllers. */
  publicCommands: boolean;
  registeredAt: bigint;
}

export const GALILEO_TESTNET = {
  rpcUrl: "https://evmrpc-testnet.0g.ai",
  chainId: 16602,
} as const;
