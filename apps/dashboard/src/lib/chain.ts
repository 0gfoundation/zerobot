import { ChainClient } from '@0g-foundation/zerobot-sdk';
import type { WalletClient } from 'viem';
import { defaultNetwork, type NetworkConfig } from './networks';

// Galileo makes a block about every 0.5s, but its public RPC lags the head
// by 0.5-7s, so polling faster than this buys nothing
const POLLING_INTERVAL_MS = 1000;

function config(network: NetworkConfig) {
	return {
		rpcUrl: network.chain.rpcUrls.default.http[0],
		chainId: network.chain.id,
		registryAddress: network.contracts.registry,
		dispatcherAddress: network.contracts.dispatcher,
		pollingIntervalMs: POLLING_INTERVAL_MS
	};
}

const readClients = new Map<number, ChainClient>();

/** A read-only client, for pages that show chain state before or without a wallet. */
export function readClient(network: NetworkConfig = defaultNetwork): ChainClient {
	let client = readClients.get(network.chain.id);
	if (!client) {
		client = new ChainClient(config(network));
		readClients.set(network.chain.id, client);
	}
	return client;
}

/**
 * A client that signs with the connected wallet. The SDK takes viem's
 * `WalletClient` directly (see `walletClientToSigner`), so the dashboard
 * never touches ethers itself.
 */
export function walletClient(wallet: WalletClient, network: NetworkConfig = defaultNetwork): ChainClient {
	return new ChainClient({ ...config(network), walletClient: wallet });
}

/** The message to show for a failed wallet or chain call. */
export function errorMessage(err: unknown): string {
	const e = err as { shortMessage?: string; reason?: string; message?: string; code?: unknown };
	if (e?.code === 'ACTION_REJECTED' || e?.code === 4001) return 'You rejected the request in your wallet.';
	return e?.shortMessage ?? e?.reason ?? e?.message ?? String(err);
}
