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
   * internally — see `walletClientToSigner`. Provide exactly one of
   * `signer`, `walletClient`, or `privateKey`.
   */
  walletClient?: WalletClient;
}

export interface OnChainCommand {
  robotId: string;
  nonce: bigint;
  sender: string;
  apiId: number;
  parameters: string;
  value: bigint;
  timestamp: bigint;
}

export const GALILEO_TESTNET = {
  rpcUrl: "https://evmrpc-testnet.0g.ai",
  chainId: 16602,
} as const;
