'use client';

import { useCallback, useEffect, useState } from 'react';
import { CommandStatus } from '@0g-foundation/zerobot-sdk';
import type { QueueEntry } from './use-queue';

/** Receipts outlive a reload for this long, the hub's rule for its swap receipts */
const KEEP_MS = 30 * 60_000;
/** No signature after this long, and the receipt offers to open the wallet again */
export const WALLET_STALL_MS = 45_000;

/** Where a payment is before it shows up in the robot's queue */
export type ReceiptStage = 'signing' | 'sent' | 'rejected' | 'failed';

/** One payment for a move, as this device saw it */
export interface MoveReceipt {
	id: string;
	apiId: number;
	note: string;
	sender: string;
	/** The robot's nonce before sending, so the command is at or after it */
	fromNonce: string;
	startedAt: number;
	stage: ReceiptStage;
	txHash?: string;
	error?: string;
	/** The command's nonce, once it shows up in the queue */
	nonce?: string;
}

export type Tone = 'pending' | 'ok' | 'warn';

/** What a receipt shows, from its own stage and the robot's queue */
export interface ReceiptView {
	tone: Tone;
	/** One line for the card's header */
	status: string;
	/** The body's message */
	title: string;
	detail?: string;
	/** Nothing left to wait for */
	terminal: boolean;
	/** Offer to send the payment again */
	retry?: 'stalled' | 'failed';
}

function storageKey(robotId: string) {
	return `zerobot:receipts:${robotId}`;
}

function load(robotId: string): MoveReceipt[] {
	try {
		const all = JSON.parse(localStorage.getItem(storageKey(robotId)) ?? '[]') as MoveReceipt[];
		return all.filter((r) => Date.now() - r.startedAt < KEEP_MS);
	} catch {
		return [];
	}
}

/**
 * This device's payments for a robot, newest first, matched to their
 * commands in the queue and kept across a reload for 30 minutes. iOS can
 * reload the tab while the user is in their wallet app.
 */
export function useMoveReceipts(robotId: string | undefined, entries: QueueEntry[]) {
	const [receipts, setReceipts] = useState<MoveReceipt[]>([]);
	// Which robot's receipts are loaded, so saving can't overwrite them first
	const [loadedFor, setLoadedFor] = useState<string>();

	useEffect(() => {
		if (!robotId) return;
		setReceipts(load(robotId));
		setLoadedFor(robotId);
	}, [robotId]);

	useEffect(() => {
		if (!robotId || loadedFor !== robotId) return;
		try {
			localStorage.setItem(storageKey(robotId), JSON.stringify(receipts));
		} catch {
			// Private windows, quota: receipts just won't survive a reload
		}
	}, [robotId, loadedFor, receipts]);

	useEffect(() => {
		setReceipts((prev) => matchReceipts(prev, entries));
	}, [entries, receipts]);

	const add = useCallback((r: MoveReceipt) => setReceipts((prev) => [r, ...prev]), []);
	const update = useCallback(
		(id: string, patch: Partial<MoveReceipt>) =>
			setReceipts((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))),
		[]
	);
	const remove = useCallback((id: string) => setReceipts((prev) => prev.filter((r) => r.id !== id)), []);

	return { receipts, setReceipts, add, update, remove };
}

/**
 * Match each unmatched payment to its command: same sender, move and name,
 * at or after the nonce it was sent from, and not claimed by another
 * receipt. Oldest first, so two identical payments get their commands in
 * order. A matched command also proves the payment was signed. Returns
 * `receipts` itself when nothing changed.
 */
export function matchReceipts(receipts: MoveReceipt[], entries: QueueEntry[]): MoveReceipt[] {
	const claimed = new Set(receipts.map((r) => r.nonce).filter(Boolean));
	let changed = false;
	const next = [...receipts]
		.sort((a, b) => a.startedAt - b.startedAt)
		.map((r) => {
			if (r.nonce || r.stage === 'rejected') return r;
			const match = entries.find(
				(e) =>
					!claimed.has(String(e.command.nonce)) &&
					e.command.nonce >= BigInt(r.fromNonce) &&
					e.command.sender.toLowerCase() === r.sender.toLowerCase() &&
					e.command.apiId === r.apiId &&
					e.command.note === r.note
			);
			if (!match) return r;
			changed = true;
			claimed.add(String(match.command.nonce));
			return { ...r, nonce: String(match.command.nonce), stage: 'sent' as const, error: undefined };
		})
		.sort((a, b) => b.startedAt - a.startedAt);
	return changed ? next : receipts;
}

/** What a receipt shows right now */
export function receiptView(
	r: MoveReceipt,
	entries: QueueEntry[],
	now: number,
	displayName: string,
	/** The queue is paused, so nothing is running */
	queuePaused = false
): ReceiptView {
	const entry = r.nonce ? entries.find((e) => String(e.command.nonce) === r.nonce) : undefined;
	if (entry) {
		const status = entry.command.status;
		if (status === CommandStatus.Executed) {
			return { tone: 'ok', status: 'Done', title: 'Done!', detail: `Thanks for playing with ${displayName}.`, terminal: true };
		}
		if (status !== CommandStatus.Pending) {
			return {
				tone: 'warn',
				status: 'Didn’t run',
				title: 'That one didn’t run',
				detail:
					status === CommandStatus.Expired
						? 'It waited too long in the queue.'
						: `${displayName} couldn’t do this move.`,
				terminal: true
			};
		}
		const pending = entries.filter((e) => e.command.status === CommandStatus.Pending);
		const ahead = pending.findIndex((e) => e.command.nonce === entry.command.nonce);
		if (ahead <= 0 && queuePaused) {
			return {
				tone: 'pending',
				status: 'Next',
				title: 'You’re next',
				detail: `${displayName} is taking a short break. Your move runs when it’s back.`,
				terminal: false
			};
		}
		if (ahead <= 0) {
			return { tone: 'pending', status: 'Now', title: `${displayName} is doing your move`, detail: 'Look at the stage!', terminal: false };
		}
		return {
			tone: 'pending',
			status: `#${ahead + 1} in the queue`,
			title: `You’re #${ahead + 1} in the queue`,
			detail: `${ahead} ${ahead === 1 ? 'move' : 'moves'} ahead of you.`,
			terminal: false
		};
	}
	// Matched once, but the command has scrolled out of the queue's window
	if (r.nonce) return { tone: 'ok', status: 'Finished', title: 'Finished', terminal: true };

	switch (r.stage) {
		case 'signing':
			if (now - r.startedAt > WALLET_STALL_MS) {
				return {
					tone: 'warn',
					status: 'Waiting for your wallet',
					title: 'Your wallet hasn’t confirmed yet',
					detail:
						'If you didn’t see a request, open your wallet again. If your wallet shows two requests, confirm only one, or you’ll pay twice.',
					terminal: false,
					retry: 'stalled'
				};
			}
			return { tone: 'pending', status: 'Confirm in your wallet', title: 'Confirm in your wallet', detail: 'Approve the payment in your wallet app.', terminal: false };
		case 'sent':
			return { tone: 'pending', status: 'Sent', title: 'Payment sent', detail: `It takes a few seconds to reach ${displayName}’s queue.`, terminal: false };
		case 'rejected':
			return { tone: 'warn', status: 'Cancelled', title: 'You cancelled in your wallet', detail: 'Nothing was paid.', terminal: true, retry: 'failed' };
		case 'failed':
			return { tone: 'warn', status: 'Didn’t go through', title: 'That payment didn’t go through', detail: r.error, terminal: true, retry: 'failed' };
	}
}
