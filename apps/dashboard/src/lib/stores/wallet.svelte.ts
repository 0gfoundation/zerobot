import { browser } from '$app/environment';
import {
	watchAccount,
	watchConnectors,
	getConnectors,
	hydrate,
	connect as wagmiConnect,
	disconnect as wagmiDisconnect,
	type Connector
} from '@wagmi/core';
import { UserRejectedRequestError } from 'viem';
import { getConfig } from '$lib/wagmi';
import { network } from '$lib/stores/network.svelte';

export function isRejection(err: unknown): boolean {
	if (err instanceof UserRejectedRequestError) return true;
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		return msg.includes('rejected') || msg.includes('denied') || msg.includes('plugin closed');
	}
	return false;
}

function getFullErrorText(err: unknown): string {
	if (!err) return '';
	const parts: string[] = [];
	if (typeof err === 'object') {
		const e = err as any;
		if (e.message) parts.push(String(e.message));
		if (e.shortMessage) parts.push(String(e.shortMessage));
		if (e.details) parts.push(String(e.details));
		if (e.cause) parts.push(getFullErrorText(e.cause));
	} else {
		parts.push(String(err));
	}
	return parts.join(' ');
}

function friendlyConnectError(err: unknown, walletName: string): string {
	const full = getFullErrorText(err).toLowerCase();
	if (full.includes('already pending')) {
		return `A connection request is already pending. Check ${walletName} for an open prompt.`;
	}
	const raw = err instanceof Error ? err.message : '';
	if (!raw || raw === 'Unexpected error' || raw === 'An unexpected error occurred') {
		return `Could not connect to ${walletName}. Make sure your wallet is unlocked and has no pending connection requests.`;
	}
	return raw;
}

class WalletState {
	address = $state<`0x${string}` | undefined>(undefined);
	chainId = $state<number | undefined>(undefined);
	status = $state<'connected' | 'connecting' | 'reconnecting' | 'disconnected'>('disconnected');
	connectors = $state<readonly Connector[]>([]);
	error = $state<string | null>(null);
	ready = $state(false);
	// Snapshot of whether wagmi has a persisted connector at page load — captured
	// synchronously before hydration races so consumers can render an optimistic
	// shell for returning users instead of flashing the Connect CTA.
	hasCachedSession = false;
	private connectGeneration = 0;
	private userInitiatedConnect = $state(false);

	connected = $derived(this.status === 'connected');
	connecting = $derived(this.userInitiatedConnect && !this.connected);
	// True once wagmi has reached a terminal status. Use to gate signer-dependent
	// effects and decide between "still hydrating" and "definitely disconnected".
	settled = $derived(this.ready && this.status !== 'reconnecting');

	constructor() {
		if (!browser) return;

		this.hasCachedSession = localStorage.getItem('wagmi.recentConnectorId') !== null;

		const config = getConfig();

		watchAccount(config, {
			onChange: (account) => {
				this.address = account.address;
				this.chainId = account.chainId;
				this.status = account.status;
			}
		});

		this.connectors = getConnectors(config);

		watchConnectors(config, {
			onChange: (connectors) => {
				this.connectors = connectors;
				// Mark ready as soon as connectors are discovered
				if (!this.ready && connectors.length > 0) this.ready = true;
			}
		});

		const { onMount } = hydrate(config, { reconnectOnMount: true });
		onMount();

		// If connectors are already available (e.g. MetaMask loaded before us), ready immediately.
		// Otherwise, a short timeout ensures we don't show "Loading…" forever if no wallet is installed.
		if (this.connectors.length > 0) {
			this.ready = true;
		} else {
			setTimeout(() => {
				this.ready = true;
			}, 200);
		}
	}

	async connect(connector: Connector) {
		this.error = null;
		this.userInitiatedConnect = true;
		const generation = ++this.connectGeneration;
		try {
			const config = getConfig();
			await wagmiConnect(config, { connector, chainId: network.chainId });
			if (generation !== this.connectGeneration) {
				wagmiDisconnect(getConfig()).catch(() => {});
				return;
			}
		} catch (err) {
			if (generation !== this.connectGeneration) return;
			if (err instanceof Error && err.message.includes('already connected')) return;
			if (isRejection(err)) {
				this.error = 'Connection request was declined.';
			} else {
				this.error = friendlyConnectError(err, connector.name);
			}
		} finally {
			if (generation === this.connectGeneration) this.userInitiatedConnect = false;
		}
	}

	cancel() {
		this.connectGeneration++;
		this.userInitiatedConnect = false;
		this.error = null;
		this.status = 'disconnected';
		wagmiDisconnect(getConfig()).catch(() => {});
	}

	async disconnect() {
		try {
			await wagmiDisconnect(getConfig());
		} catch (err) {
			this.error = err instanceof Error ? err.message : 'Failed to disconnect';
		}
	}

}

export const wallet = new WalletState();
