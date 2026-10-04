'use client';

import { useEffect, useState } from 'react';
import { formatEther } from 'viem';
import { useConnection, useSignMessage } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { Button, ButtonLink } from '@0gfoundation/0g-ui/shell';
import { WalletAddress } from '@/components/wallet-address';
import { FAUCET_AMOUNT, faucetMessage, type FaucetTransfer } from '@/lib/faucet';
import { defaultNetwork } from '@/lib/networks';

const PUBLIC_FAUCET_URL = 'https://faucet.0g.ai';
const POLL_MS = 2000;
/** Waiting longer than this on the wallet or the faucet, and the step offers another way */
const STALL_MS = 45_000;

type State =
	| { kind: 'idle'; note?: string }
	| { kind: 'signing' }
	| { kind: 'requesting' }
	| { kind: 'sending'; transfer: FaucetTransfer }
	| { kind: 'sent'; transfer: FaucetTransfer }
	/** The faucet can't send to this wallet now; the public faucet may not either */
	| { kind: 'refused'; message: string }
	/** Something on our side or the faucet's: fall back to the public faucet */
	| { kind: 'unavailable'; message: string }
	/** The user chose the public faucet */
	| { kind: 'manual' };

function storageKey(address: string) {
	return `zerobot:faucet:${address.toLowerCase()}`;
}

/**
 * Tell the server's log what went wrong in the wallet, since a phone's
 * console is out of reach. Best-effort, and carries no address.
 */
function report(stage: string, connector: string | undefined, err?: unknown) {
	const e = err as { name?: string; code?: unknown; shortMessage?: string; message?: string } | undefined;
	const body = JSON.stringify({
		stage,
		connector,
		name: e?.name,
		code: e?.code,
		message: (e?.shortMessage ?? e?.message ?? '').slice(0, 300)
	});
	try {
		navigator.sendBeacon('/api/faucet/report', new Blob([body], { type: 'application/json' }));
	} catch {
		// Nowhere to report to
	}
}

function isRejection(err: unknown): boolean {
	const e = err as { name?: string; code?: number; message?: string } | undefined;
	return e?.name === 'UserRejectedRequestError' || e?.code === 4001 || /rejected|denied/i.test(e?.message ?? '');
}

/**
 * Step 2 on the audience page: get the wallet enough testnet 0G. Where the
 * server holds a faucet key, one tap asks the 0G faucet for 0.5 0G after the
 * wallet signs a message to prove it's the owner. Otherwise, or when the
 * faucet can't help, it links to the public faucet.
 */
export function FaucetStep({ address, needed }: { address: `0x${string}`; needed: bigint }) {
	const enabled = useQuery({
		queryKey: ['faucet-enabled'],
		queryFn: async () => ((await (await fetch('/api/faucet')).json()) as { enabled: boolean }).enabled,
		staleTime: Infinity
	});
	const signMessage = useSignMessage();
	const { connector } = useConnection();
	const [state, setState] = useState<State>({ kind: 'idle' });
	// Waiting on the wallet's signature or the faucet's transfer for too long
	const [stalled, setStalled] = useState(false);
	// Bumped by each request, so a retry restarts the stall timer
	const [attempt, setAttempt] = useState(0);
	const waiting = state.kind === 'signing' || state.kind === 'sending';
	useEffect(() => {
		setStalled(false);
		if (!waiting) return;
		const timer = setTimeout(() => {
			setStalled(true);
			report(state.kind === 'signing' ? 'sign-stalled' : 'transfer-stalled', connector?.type);
		}, STALL_MS);
		return () => clearTimeout(timer);
		// Restart only when the wait starts or ends, not on each poll
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [waiting, state.kind, attempt]);

	// A transfer from before a reload (iOS can reload the tab while the user is in their wallet)
	useEffect(() => {
		try {
			const id = localStorage.getItem(storageKey(address));
			if (id) setState({ kind: 'sending', transfer: { transfer_id: id, status: 'queued' } as FaucetTransfer });
		} catch {
			// No storage: nothing to resume
		}
	}, [address]);

	const transferId = state.kind === 'sending' ? state.transfer.transfer_id : null;
	useEffect(() => {
		if (!transferId) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;
		const poll = async () => {
			try {
				const res = await fetch(`/api/faucet/${transferId}`);
				if (res.ok) {
					const transfer = (await res.json()) as FaucetTransfer;
					if (stopped) return;
					if (transfer.status === 'completed') {
						forget(address);
						return setState({ kind: 'sent', transfer });
					}
					if (transfer.status === 'failed') {
						forget(address);
						return setState({ kind: 'unavailable', message: transfer.failure_reason ?? 'The faucet couldn’t send it.' });
					}
					setState({ kind: 'sending', transfer });
				} else if (res.status === 404 || res.status === 400) {
					forget(address);
					return setState({ kind: 'idle' });
				}
			} catch {
				// Try again next time
			}
			if (!stopped) timer = setTimeout(poll, POLL_MS);
		};
		void poll();
		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, [transferId, address]);

	async function request() {
		setAttempt((a) => a + 1);
		setState({ kind: 'signing' });
		const issuedAt = Date.now();
		let signature: `0x${string}`;
		try {
			signature = await signMessage.mutateAsync({ message: faucetMessage(address, issuedAt) });
		} catch (err) {
			if (isRejection(err)) return setState({ kind: 'idle', note: 'You cancelled in your wallet. Nothing was sent.' });
			report('sign-failed', connector?.type, err);
			return setState({ kind: 'idle', note: 'Your wallet couldn’t sign. Try again, or use the public faucet.' });
		}
		setState({ kind: 'requesting' });
		try {
			const res = await fetch('/api/faucet', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ address, issuedAt, signature })
			});
			const body = await res.json().catch(() => ({}));
			if (res.status === 202 || res.status === 200) {
				const transfer = body as FaucetTransfer;
				if (res.status === 200 && transfer.status === 'completed') {
					// Sent before: this wallet has had its grant
					return setState({
						kind: 'refused',
						message: `Zerobot already sent this wallet its ${FAUCET_AMOUNT} 0G.`
					});
				}
				try {
					localStorage.setItem(storageKey(address), transfer.transfer_id);
				} catch {
					// Polling still works without it
				}
				return setState({ kind: 'sending', transfer });
			}
			if (res.status === 429) {
				const after = (body as { available_after?: string }).available_after;
				const when = after ? new Date(after).toLocaleString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }) : null;
				return setState({
					kind: 'refused',
					message: `This wallet got testnet 0G in the last 24 hours${when ? `, so it can get more after ${when}` : ''}.`
				});
			}
			setState({ kind: 'unavailable', message: 'The faucet isn’t answering right now.' });
		} catch {
			setState({ kind: 'unavailable', message: 'The faucet isn’t answering right now.' });
		}
	}

	const explorer = defaultNetwork.chain.blockExplorers?.default.url;

	if (enabled.isPending) return null;
	if (!enabled.data || state.kind === 'unavailable' || state.kind === 'refused' || state.kind === 'manual') {
		return (
			<>
				{state.kind === 'unavailable' && <p className="mb-2 text-sm text-ink-soft">{state.message}</p>}
				{state.kind === 'refused' && <p className="mb-2 text-sm text-ink-soft">{state.message}</p>}
				<ManualFaucet address={address} needed={needed} />
			</>
		);
	}

	if (state.kind === 'sending' || state.kind === 'sent') {
		const tx = state.transfer.tx_hash;
		return (
			<p className="text-sm text-ink-soft">
				{state.kind === 'sent'
					? `${FAUCET_AMOUNT} 0G sent. Your balance updates in a moment.`
					: `Sending ${FAUCET_AMOUNT} 0G to your wallet. It takes a few seconds.`}
				{tx && explorer && (
					<>
						{' '}
						<a href={`${explorer}/tx/${tx}`} target="_blank" rel="noopener noreferrer" className="underline">
							Transaction
						</a>
					</>
				)}
				{state.kind === 'sending' && stalled && (
					<>
						{' '}
						It&apos;s taking longer than usual.{' '}
						<PublicFaucetLink onClick={() => setState({ kind: 'manual' })} />
					</>
				)}
			</p>
		);
	}

	return (
		<>
			<p className="text-sm text-ink-soft">
				Get {FAUCET_AMOUNT} free testnet 0G, enough for several moves. Your wallet asks you to sign a message to
				show it&apos;s yours. Signing is free.
			</p>
			<div className="mt-3">
				<Button
					size="small"
					onClick={request}
					disabled={state.kind === 'requesting' || (state.kind === 'signing' && !stalled)}
				>
					{state.kind === 'signing' && !stalled
						? 'Sign in your wallet…'
						: state.kind === 'signing'
							? 'Try again'
							: state.kind === 'requesting'
								? 'Asking the faucet…'
								: `Get ${FAUCET_AMOUNT} testnet 0G`}
				</Button>
			</div>
			{state.kind === 'signing' && stalled && (
				<p className="mt-2 text-sm text-ink-soft">
					Your wallet hasn&apos;t sent the signature back. Open it to check for the request, or try again.
				</p>
			)}
			{state.kind === 'idle' && state.note && <p className="mt-2 text-sm text-ink-soft">{state.note}</p>}
			<p className="mt-2 text-sm text-ink-soft">
				<PublicFaucetLink onClick={() => setState({ kind: 'manual' })} />
			</p>
		</>
	);
}

function forget(address: string) {
	try {
		localStorage.removeItem(storageKey(address));
	} catch {
		// Nothing stored
	}
}

/** Opens the public faucet in a new tab, and switches the step to show the address to paste there */
function PublicFaucetLink({ onClick }: { onClick: () => void }) {
	return (
		<a href={PUBLIC_FAUCET_URL} target="_blank" rel="noopener noreferrer" onClick={onClick} className="underline">
			Or use the public faucet
			<span aria-hidden> ↗</span>
		</a>
	);
}

/** The public faucet, for when this server can't send 0G itself */
function ManualFaucet({ address, needed }: { address: `0x${string}`; needed: bigint }) {
	return (
		<>
			<p className="text-sm text-ink-soft">
				You need at least {formatEther(needed)} 0G. Paste your address into the faucet, then come back. This
				updates by itself.
			</p>
			<WalletAddress address={address} full copyable className="mt-2 text-sm" />
			<div className="mt-3">
				<ButtonLink href={PUBLIC_FAUCET_URL} external variant="secondary" size="small">
					Open the faucet
					<span aria-hidden> ↗</span>
				</ButtonLink>
			</div>
		</>
	);
}
