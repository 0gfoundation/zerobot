import type { Signer } from "ethers";

export interface ChainConfig {
  rpcUrl: string;
  chainId?: number;
  registryAddress: string;
  dispatcherAddress: string;
  privateKey?: string;
  signer?: Signer;
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
