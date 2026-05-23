import { getWalletClient } from '@wagmi/core';
import { ChainClient } from '@0g-foundation/zerobot-sdk';
import { getConfig } from '$lib/wagmi';
import { network } from '$lib/stores/network.svelte';

/**
 * Build a fresh ChainClient bound to the currently-connected wallet and
 * selected network. Async because wagmi's `getWalletClient` is async, and
 * built fresh each call so that wallet/network changes are picked up
 * immediately without memoization staleness.
 *
 * The SDK accepts viem's `WalletClient` directly via its `walletClient`
 * config option (see `walletClientToSigner` in the SDK), so the dashboard
 * never touches ethers itself.
 */
export async function getChainClient(): Promise<ChainClient> {
	const walletClient = await getWalletClient(getConfig(), { chainId: network.chainId });
	if (!walletClient) {
		throw new Error('Wallet not connected — connect a wallet before chain operations.');
	}
	return new ChainClient({
		rpcUrl: network.chain.rpcUrls.default.http[0],
		chainId: network.chainId,
		registryAddress: network.contracts.registry,
		dispatcherAddress: network.contracts.dispatcher,
		walletClient
	});
}
