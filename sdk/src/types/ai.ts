import type { Signer } from "ethers";
import type { WalletClient } from "viem";

/**
 * Configuration for `AIBroker`. Provide exactly one of `signer`, `walletClient`,
 * or `privateKey` — same wallet-resolution union used by `ChainConfig`, so the
 * SDK speaks one consistent wallet-input language at every entry point. The
 * `walletClient` path requires viem (optional peer dep), and the `privateKey`
 * path requires `rpcUrl`.
 */
export interface AIConfig {
  // Wallet (provide exactly one)
  signer?: Signer;
  walletClient?: WalletClient;
  privateKey?: string;
  /** Required when using `privateKey`. */
  rpcUrl?: string;

  // AI settings
  /** 0G Compute provider address (discovered automatically if not set) */
  providerAddress?: string;
  /** Model name to use for inference */
  model?: string;
}

export interface AICommandResult {
  command: string;
  params?: Record<string, unknown>;
  duration_ms?: number;
}
