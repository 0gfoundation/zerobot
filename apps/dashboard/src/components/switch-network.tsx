'use client';

import { useEffect, useState } from 'react';
import { numberToHex } from 'viem';
import { useConnection, useDisconnect, useSwitchChain } from 'wagmi';
import { Button } from '@0gfoundation/0g-ui/shell';
import { Notice } from '@/components/notice';
import { useWalletModal } from '@/components/wallet/wallet-modal';
import { defaultNetwork } from '@/lib/networks';

/** No answer from the wallet after this long, and the step offers the manual route */
const NO_ANSWER_MS = 20_000;

const chain = defaultNetwork.chain;

/** What a wallet needs to add the network, for `wallet_addEthereumChain` and by hand */
const addParams = {
	chainId: numberToHex(chain.id),
	chainName: chain.name,
	nativeCurrency: chain.nativeCurrency,
	rpcUrls: [...chain.rpcUrls.default.http],
	blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : []
};

/**
 * Moves the wallet onto the network the dashboard uses. Over WalletConnect
 * the network is added first: a wallet that doesn't know it may drop a bare
 * switch without answering (Rabby on a phone did), and wagmi only sends the
 * add after the switch fails. A wallet that still doesn't answer gets the
 * details to add it by hand, or the option to use another wallet.
 */
export function SwitchNetwork() {
	const { connector } = useConnection();
	const switchChain = useSwitchChain();
	const disconnect = useDisconnect();
	const walletModal = useWalletModal();
	const [asking, setAsking] = useState(false);
	const [noAnswer, setNoAnswer] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!asking) return;
		const timer = setTimeout(() => setNoAnswer(true), NO_ANSWER_MS);
		return () => clearTimeout(timer);
	}, [asking]);

	async function ask() {
		setError(null);
		setNoAnswer(false);
		setAsking(true);
		try {
			if (connector?.type === 'walletConnect') {
				const provider = (await connector.getProvider()) as {
					request: (args: { method: string; params: unknown[] }) => Promise<unknown>;
				};
				// A wallet that already has the network may refuse the add; the switch still follows
				await provider.request({ method: 'wallet_addEthereumChain', params: [addParams] }).catch(() => {});
			}
			await switchChain.mutateAsync({ chainId: chain.id });
		} catch (err) {
			const e = err as { shortMessage?: string; message?: string };
			setError(e.shortMessage ?? e.message ?? String(err));
		} finally {
			setAsking(false);
		}
	}

	return (
		<>
			<Button onClick={ask} disabled={asking && !noAnswer}>
				{asking && !noAnswer ? 'Check your wallet…' : `Switch to ${chain.name}`}
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
						<Detail label="RPC URL" value={addParams.rpcUrls[0]} />
						<Detail label="Chain ID" value={String(chain.id)} />
						<Detail label="Symbol" value={chain.nativeCurrency.symbol} />
						{addParams.blockExplorerUrls[0] && <Detail label="Explorer" value={addParams.blockExplorerUrls[0]} />}
					</dl>
					<p className="mt-3">Or use another wallet. MetaMask adds networks reliably.</p>
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
				</Notice>
			)}
		</>
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
