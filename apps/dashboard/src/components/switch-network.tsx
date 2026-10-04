'use client';

import { useEffect, useState } from 'react';
import { numberToHex } from 'viem';
import { useConnection, useDisconnect, useSwitchChain } from 'wagmi';
import { Button } from '@0gfoundation/0g-ui/shell';
import { Notice } from '@/components/notice';
import { useWalletModal } from '@/components/wallet/wallet-modal';
import { defaultNetwork } from '@/lib/networks';
import { sessionChains, type SessionChains } from '@/lib/session-chains';

/** No answer from the wallet after this long, and the step offers the manual route */
const NO_ANSWER_MS = 20_000;

const chain = defaultNetwork.chain;
const recommended = defaultNetwork.metaMaskOnly ? 'MetaMask' : null;

/** What a wallet needs to add the network */
const addChainParams = {
	chainId: numberToHex(chain.id),
	chainName: chain.name,
	nativeCurrency: chain.nativeCurrency,
	rpcUrls: [...chain.rpcUrls.default.http],
	blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : []
};

/**
 * Moves the wallet onto the network the dashboard uses. A WalletConnect
 * wallet only switches to networks it approved when it connected, so the
 * session is read first: one that left this network out is told so at
 * once, with no request sent, and offered another wallet. Others get the
 * switch, and the details to add the network by hand if it goes unanswered.
 */
export function SwitchNetwork() {
	const { connector } = useConnection();
	const switchChain = useSwitchChain();
	const [session, setSession] = useState<SessionChains | undefined | null>(null);
	const [asking, setAsking] = useState(false);
	const [noAnswer, setNoAnswer] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// On a phone this opens the wallet app, most often to add the network
	const [isTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);

	useEffect(() => {
		let cancelled = false;
		sessionChains(connector).then((s) => {
			if (!cancelled) setSession(s);
		});
		return () => {
			cancelled = true;
		};
	}, [connector]);

	useEffect(() => {
		if (!asking) return;
		const timer = setTimeout(() => setNoAnswer(true), NO_ANSWER_MS);
		return () => clearTimeout(timer);
	}, [asking]);

	// Still reading the session
	if (session === null) return null;

	if (session && !session.chainIds.includes(chain.id)) {
		const wallet = session.wallet ?? 'Your wallet';
		return (
			<Notice tone="warning" title={`${wallet} left out ${chain.name}`}>
				<p>
					When it connected, {wallet} didn&apos;t include {chain.name}, and it won&apos;t switch to a network it
					left out. Adding the network in the wallet doesn&apos;t change that. Connect with a wallet that supports{' '}
					{chain.name} instead{recommended ? `, such as ${recommended}` : ''}.
				</p>
				<UseAnotherWallet />
			</Notice>
		);
	}

	async function ask() {
		setError(null);
		setNoAnswer(false);
		setAsking(true);
		try {
			if (connector?.type === 'metaMask' && isTouch) {
				// wagmi's switch tries wallet_switchEthereumChain first, which fails
				// in the app for a network it lacks ("Request failed"), then sends
				// the add, whose own deep link fires while the user is away and
				// waits in the browser as a stray "open MetaMask" prompt. The add
				// alone adds and switches in one prompt, or only switches if the
				// network is there. MetaMask's SDK reports the new chain to wagmi.
				const provider = (await connector.getProvider()) as {
					request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
				};
				await provider.request({ method: 'wallet_addEthereumChain', params: [addChainParams] });
			} else {
				await switchChain.mutateAsync({ chainId: chain.id });
			}
		} catch (err) {
			const e = err as { shortMessage?: string; message?: string };
			setError(e.shortMessage ?? e.message ?? String(err));
		} finally {
			setAsking(false);
		}
	}

	return (
		<>
			{isTouch && (
				<p className="mb-3 text-sm text-ink-soft">
					Your wallet opens to add {chain.name} and switch to it. Approve it, then come back here.
				</p>
			)}
			<Button onClick={ask} disabled={asking && !noAnswer}>
				{asking && !noAnswer
					? 'Check your wallet…'
					: isTouch
						? `Add ${chain.name} to your wallet`
						: `Switch to ${chain.name}`}
			</Button>
			{error && !noAnswer && <p className="mt-2 text-sm text-danger">{error}</p>}
			{noAnswer && (
				<Notice tone="warning" title="Your wallet hasn’t answered" className="mt-3">
					<p>
						Some wallets don&apos;t show a prompt for a network they don&apos;t know. Add it in your
						wallet&apos;s network settings, and this page moves on by itself:
					</p>
					<dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
						<Detail label="Network name" value={chain.name} />
						<Detail label="RPC URL" value={chain.rpcUrls.default.http[0]} />
						<Detail label="Chain ID" value={String(chain.id)} />
						<Detail label="Symbol" value={chain.nativeCurrency.symbol} />
						{chain.blockExplorers && <Detail label="Explorer" value={chain.blockExplorers.default.url} />}
					</dl>
					<p className="mt-3">Or use another wallet{recommended ? `, such as ${recommended}` : ''}.</p>
					<UseAnotherWallet />
				</Notice>
			)}
		</>
	);
}

function UseAnotherWallet() {
	const disconnect = useDisconnect();
	const walletModal = useWalletModal();
	return (
		<div className="mt-2">
			<Button
				size="small"
				variant="secondary"
				onClick={async () => {
					await disconnect.mutateAsync().catch(() => {});
					walletModal.open();
				}}
			>
				Use another wallet
			</Button>
		</div>
	);
}

function Detail({ label, value }: { label: string; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<>
			<dt className="text-ink-muted">{label}</dt>
			<dd className="min-w-0">
				<button
					type="button"
					title="Copy"
					onClick={async () => {
						try {
							await navigator.clipboard.writeText(value);
							setCopied(true);
							setTimeout(() => setCopied(false), 1500);
						} catch {
							// Clipboard blocked: the value is still on screen to copy by hand
						}
					}}
					className="cursor-pointer break-all text-left font-mono underline decoration-dotted"
				>
					{value}
				</button>
				{copied && <span className="ml-2 text-xs text-success">Copied</span>}
			</dd>
		</>
	);
}
