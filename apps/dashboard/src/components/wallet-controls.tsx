'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnect, useConnection, useConnectors, useDisconnect } from 'wagmi';
import { Button } from '@0gfoundation/0g-ui/shell';
import { defaultNetwork } from '@/lib/networks';
import { errorMessage } from '@/lib/chain';
import { WalletAddress } from './wallet-address';

/**
 * Link that reopens this page inside the MetaMask app's browser, for a
 * phone with no wallet in its own browser.
 */
export function metamaskDeepLink(): string {
	const { host, pathname, search } = window.location;
	return `https://metamask.app.link/dapp/${host}${pathname}${search}`;
}

/** Connect button, or the connected address with a disconnect menu */
export function WalletControls() {
	const { address, status } = useConnection();
	const connectors = useConnectors();
	const connect = useConnect();
	const disconnect = useDisconnect();
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [clicked, setClicked] = useState(false);
	const menu = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (!menu.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener('pointerdown', onDown);
		return () => window.removeEventListener('pointerdown', onDown);
	}, [open]);

	async function connectWallet() {
		setError(null);
		const injected = connectors.find((c) => c.type === 'injected');
		if (!injected || !(await injected.getProvider().catch(() => null))) {
			window.location.href = metamaskDeepLink();
			return;
		}
		setClicked(true);
		try {
			await connect.mutateAsync({ connector: injected, chainId: defaultNetwork.chain.id });
		} catch (err) {
			setError(errorMessage(err));
		} finally {
			setClicked(false);
		}
	}

	if (status === 'reconnecting') return null;

	if (!address) {
		return (
			<div className="relative">
				<Button size="small" onClick={connectWallet}>
					{clicked ? 'Connecting…' : 'Connect wallet'}
				</Button>
				{error && (
					<p className="absolute right-0 mt-2 w-64 rounded-xl bg-bg p-3 text-sm text-red-600 shadow-lg">{error}</p>
				)}
			</div>
		);
	}

	return (
		<div className="relative" ref={menu}>
			<Button size="small" variant="secondary" onClick={() => setOpen(!open)}>
				<span className="mr-2 inline-block h-2 w-2 rounded-full bg-green-500" />
				<WalletAddress address={address} />
			</Button>
			{open && (
				<div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-hairline bg-bg p-4 shadow-lg">
					<div className="text-xs font-medium uppercase tracking-wider text-ink-muted">Connected</div>
					<WalletAddress address={address} full copyable className="mt-1 text-sm" />
					<div className="mt-1 text-xs text-ink-muted">{defaultNetwork.chain.name}</div>
					<div className="mt-3">
						<Button
							variant="secondary"
							size="small"
							fullWidth
							onClick={() => {
								disconnect.mutate();
								setOpen(false);
							}}
						>
							Disconnect
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
