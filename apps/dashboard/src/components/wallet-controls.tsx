'use client';

import { useEffect, useRef, useState } from 'react';
import { useConnection, useDisconnect } from 'wagmi';
import { Button } from '@0gfoundation/0g-ui/shell';
import { defaultNetwork } from '@/lib/networks';
import { useWalletModal } from './wallet/wallet-modal';
import { WalletAddress } from './wallet-address';

/** Connect button, or the connected address with a disconnect menu */
export function WalletControls() {
	const { address, status } = useConnection();
	const disconnect = useDisconnect();
	const walletModal = useWalletModal();
	const [open, setOpen] = useState(false);
	const menu = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: PointerEvent) => {
			if (!menu.current?.contains(e.target as Node)) setOpen(false);
		};
		window.addEventListener('pointerdown', onDown);
		return () => window.removeEventListener('pointerdown', onDown);
	}, [open]);

	if (status === 'reconnecting') return null;

	if (!address) {
		return (
			<Button size="small" onClick={walletModal.open}>
				Connect wallet
			</Button>
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
