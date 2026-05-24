import {
  BrowserProvider,
  JsonRpcProvider,
  JsonRpcSigner,
  Wallet,
  type Provider,
  type Signer,
} from "ethers";
import type { WalletClient } from "viem";

/**
 * Adapt a viem `WalletClient` to an ethers `JsonRpcSigner`.
 *
 * The SDK is built on ethers internally (the chain layer wraps `ethers.Contract`,
 * and the 0G compute broker requires an ethers `Signer`). Consumers using viem
 * — including any wagmi/RainbowKit/AppKit stack — can pass their `WalletClient`
 * directly to `ChainConfig.walletClient`, and this function performs the
 * conversion at the SDK boundary.
 *
 * The viem dependency is type-only: this function reads `account`, `chain`, and
 * `transport` as structural properties and never calls into viem at runtime, so
 * the SDK does not bundle viem and ethers-only consumers do not need it
 * installed.
 *
 * Adapted from viem's documented ethers-adapter pattern:
 * https://viem.sh/docs/ethers-migration#wallet-client--signer
 */
export function walletClientToSigner(walletClient: WalletClient): JsonRpcSigner {
  const { account, chain, transport } = walletClient;
  if (!account) {
    throw new Error(
      "walletClientToSigner: WalletClient has no account. " +
        "Did you pass a PublicClient instead, or forget to connect a wallet?",
    );
  }
  if (!chain) {
    throw new Error(
      "walletClientToSigner: WalletClient has no chain configured.",
    );
  }
  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };
  // `transport` is an EIP-1193-style provider; ethers' BrowserProvider speaks
  // the same protocol, so it accepts it as the underlying request handler.
  const provider = new BrowserProvider(transport, network);
  return new JsonRpcSigner(provider, account.address);
}

/**
 * Shape of the wallet-resolution inputs accepted by SDK entry points
 * (`ChainConfig`, `AIConfig`). Consumers provide exactly one of `signer`,
 * `walletClient`, or `privateKey`; `rpcUrl` is required only for the
 * `privateKey` path so a `JsonRpcProvider` can be built.
 */
export interface WalletConfig {
  rpcUrl?: string;
  signer?: Signer;
  walletClient?: WalletClient;
  privateKey?: string;
}

/**
 * Resolve a `WalletConfig` to an ethers `Signer`. `context` is included in
 * thrown error messages so consumers can tell which entry point misconfigured
 * its wallet (e.g. `"ChainConfig"`, `"AIConfig"`). When the caller already
 * has a `Provider` for the same RPC, pass it as `fallbackProvider` so the
 * `privateKey` path doesn't construct a redundant one.
 */
export function resolveSigner(
  config: WalletConfig,
  context = "wallet config",
  fallbackProvider?: Provider,
): Signer {
  if (config.signer) return config.signer;
  if (config.walletClient) return walletClientToSigner(config.walletClient);
  if (config.privateKey) {
    const provider =
      fallbackProvider ??
      (config.rpcUrl ? new JsonRpcProvider(config.rpcUrl) : undefined);
    if (!provider) {
      throw new Error(
        `${context}: rpcUrl is required when providing privateKey`,
      );
    }
    return new Wallet(config.privateKey, provider);
  }
  throw new Error(
    `${context}: must provide one of signer, walletClient, or privateKey`,
  );
}
