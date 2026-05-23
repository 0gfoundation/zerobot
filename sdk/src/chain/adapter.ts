import { BrowserProvider, JsonRpcSigner } from "ethers";
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
