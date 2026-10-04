import type { Connector } from 'wagmi';

/**
 * The chains a WalletConnect session covers, and the wallet behind it.
 * A wallet approves the proposed chains it counts as its own and drops the
 * rest in silence, then won't switch to a chain it dropped. Adding the
 * chain in the wallet afterwards doesn't change the session (0g-hub
 * measured this with Trust Wallet, and Rabby ignored our add and switch).
 * After 0g-hub's `session-chains.ts`.
 */
export interface SessionChains {
	chainIds: number[];
	/** The wallet app's own name, e.g. "Rabby Wallet", since the connector's is "WalletConnect" */
	wallet?: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;
}

function strings(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
}

/** `eip155:16602` or `eip155:16602:0xabc…` to 16602 */
function chainIdOf(caip: string): number | undefined {
	const [namespace, reference] = caip.split(':');
	if (namespace !== 'eip155' || reference === undefined) return undefined;
	const id = Number(reference);
	return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

/**
 * The session's approved chains for a WalletConnect connection. Undefined
 * for any other connector, or with no session to read: those wallets are
 * asked with a switch request instead.
 */
export async function sessionChains(connector: Connector | undefined): Promise<SessionChains | undefined> {
	if (connector?.type !== 'walletConnect') return undefined;
	const provider = record(await connector.getProvider().catch(() => undefined));
	const session = record(provider?.session);
	const eip155 = record(record(session?.namespaces)?.eip155);
	if (!eip155) return undefined;
	// `chains` is optional in a session namespace; each account carries its chain
	const caips = [...strings(eip155.chains), ...strings(eip155.accounts)];
	const chainIds = [...new Set(caips.map(chainIdOf).filter((id) => id !== undefined))];
	const name = record(record(session?.peer)?.metadata)?.name;
	return { chainIds, wallet: typeof name === 'string' && name ? name : undefined };
}
