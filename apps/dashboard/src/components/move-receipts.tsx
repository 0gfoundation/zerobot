'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@0gfoundation/0g-ui/shell';
import { defaultNetwork } from '@/lib/networks';
import type { MoveReceipt, ReceiptView, Tone } from '@/lib/move-receipts';

/** The user minimised the open card: nothing is open */
const NONE = '__none';

const DOT: Record<Tone, string> = {
	pending: 'bg-warning animate-pulse',
	ok: 'bg-success',
	warn: 'bg-danger'
};

export interface ReceiptCard {
	receipt: MoveReceipt;
	view: ReceiptView;
	emoji?: string;
	label: string;
}

/**
 * This device's payments as an accordion, newest first, after 0g-hub's swap
 * receipt stack. At most one card is open. By default that's the newest
 * still in progress, else the newest; a new payment opens and the rest
 * minimise; a card that finishes while open stays open; the user can open
 * or minimise any card.
 */
export function MoveReceipts({
	cards,
	onRetry,
	onClose,
	onClearCompleted
}: {
	cards: ReceiptCard[];
	onRetry: (id: string) => void;
	onClose: (id: string) => void;
	onClearCompleted: () => void;
}) {
	// null follows the default rule; NONE means all minimised
	const [openKey, setOpenKey] = useState<string | null>(null);
	const newest = cards[0]?.receipt.id;
	const defaultKey = (cards.find((c) => !c.view.terminal) ?? cards[0])?.receipt.id;
	const openId = openKey === null ? defaultKey : openKey;

	// A new payment brings back the default rule
	useEffect(() => {
		setOpenKey(null);
	}, [newest]);

	// A card that finishes while open by default stays open
	const prev = useRef<{ id?: string; terminal?: boolean }>({});
	const open = cards.find((c) => c.receipt.id === openId);
	useEffect(() => {
		const before = prev.current;
		prev.current = { id: open?.receipt.id, terminal: open?.view.terminal };
		if (openKey !== null || !open) return;
		if (before.id === open.receipt.id && !before.terminal && open.view.terminal) setOpenKey(open.receipt.id);
	}, [openKey, open]);

	if (cards.length === 0) return null;
	const anyTerminal = cards.some((c) => c.view.terminal);

	return (
		<section className="mt-6 flex flex-col gap-2" aria-label="Your moves">
			{cards.map(({ receipt, view, emoji, label }) => {
				const isOpen = receipt.id === openId;
				return (
					<div key={receipt.id} className="rounded-2xl border border-hairline">
						<button
							type="button"
							aria-expanded={isOpen}
							onClick={() => setOpenKey(isOpen ? NONE : receipt.id)}
							className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
						>
							<span aria-hidden className={`size-2 shrink-0 rounded-full ${DOT[view.tone]}`} />
							<span className="min-w-0 flex-1 truncate font-medium">
								{emoji} {label}
							</span>
							<span className="shrink-0 text-sm text-ink-soft">{view.status}</span>
							<span aria-hidden className={`shrink-0 text-ink-muted transition ${isOpen ? 'rotate-180' : ''}`}>
								⌄
							</span>
						</button>
						{isOpen && (
							<div className="border-t border-hairline px-4 pt-3 pb-4">
								<p className="text-lg font-semibold">{view.title}</p>
								{view.detail && <p className="mt-1 text-sm text-ink-soft">{view.detail}</p>}
								<p className="mt-2 text-xs text-ink-muted">
									For “{receipt.note}”
									{receipt.txHash && (
										<>
											{' · '}
											<a
												href={`${defaultNetwork.chain.blockExplorers?.default.url}/tx/${receipt.txHash}`}
												target="_blank"
												rel="noopener noreferrer"
												className="underline"
											>
												Transaction
											</a>
										</>
									)}
								</p>
								{(view.retry || view.terminal) && (
									<div className="mt-3 flex flex-wrap gap-2">
										{view.retry && (
											<Button size="small" onClick={() => onRetry(receipt.id)}>
												{view.retry === 'stalled' ? 'Open wallet again' : 'Try again'}
											</Button>
										)}
										{view.terminal && (
											<Button size="small" variant="secondary" onClick={() => onClose(receipt.id)}>
												Close
											</Button>
										)}
									</div>
								)}
							</div>
						)}
					</div>
				);
			})}
			{anyTerminal && (
				<button
					type="button"
					onClick={onClearCompleted}
					className="self-center pt-1 text-xs text-ink-muted underline hover:text-ink"
				>
					Clear completed
				</button>
			)}
		</section>
	);
}
