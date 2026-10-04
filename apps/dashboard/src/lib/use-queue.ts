'use client';

import { useEffect, useState } from 'react';
import { CommandStatus, toOnChainCommand, type OnChainCommand } from '@0g-foundation/zerobot-sdk';
import { readClient } from './chain';

/** How often to check for new commands, unless the page asks for faster */
const POLL_MS = 1000;
/** How often to recheck the status of pending commands */
const STATUS_POLL_MS = 1000;

export interface QueueEntry {
	command: OnChainCommand;
	/** When this page first saw the command, in ms since epoch */
	seenAt: number;
	/** Whether the command was still pending when first seen */
	seenPending: boolean;
}

export interface QueueOptions {
	/** Keep the last this many commands, plus everything still pending. Default 20. */
	history?: number;
	/**
	 * How often to check for new commands, in ms. Default 1000. The stage
	 * matches the operator's 500 so it sees each command when the operator
	 * does, since it times the robot model from that moment.
	 */
	pollMs?: number;
}

/**
 * A robot's recent commands in nonce order, kept current by polling. The
 * nonce is the queue order, and the operator runs pending commands oldest
 * first. New commands and status changes poll on separate loops, so
 * rechecking a long queue never delays seeing a new command.
 */
export function useQueue(robotId: string | undefined, { history = 20, pollMs = POLL_MS }: QueueOptions = {}) {
	const [entries, setEntries] = useState<QueueEntry[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!robotId) return;
		const client = readClient();
		const known = new Map<bigint, QueueEntry>();
		let next: bigint | null = null;
		let stopped = false;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const errors = { commands: null as string | null, status: null as string | null };

		function publish() {
			// Keep the last `history` plus anything pending
			const sorted = [...known.values()].sort((a, b) => Number(a.command.nonce - b.command.nonce));
			for (const entry of sorted.slice(0, Math.max(0, sorted.length - history))) {
				if (entry.command.status !== CommandStatus.Pending) known.delete(entry.command.nonce);
			}
			setEntries([...known.values()].sort((a, b) => Number(a.command.nonce - b.command.nonce)));
		}

		async function pollCommands() {
			const nonce = await client.getRobotNonce(robotId!);
			if (next === null) next = nonce > BigInt(history) ? nonce - BigInt(history) : 0n;

			// New commands, in order. A load-balanced RPC can answer from a node
			// that hasn't seen a command yet (an empty struct), so stop there.
			let added = false;
			while (next < nonce) {
				const command = toOnChainCommand(await client.getCommand(robotId!, next));
				if (command.timestamp === 0n) break;
				const pending = command.status === CommandStatus.Pending;
				known.set(next, { command, seenAt: Date.now(), seenPending: pending });
				next++;
				added = true;
			}
			if (added) publish();
		}

		async function pollStatus() {
			const pending = [...known.values()].filter((e) => e.command.status === CommandStatus.Pending);
			if (pending.length === 0 || next === null) return;
			const from = pending[0].command.nonce;
			const stillPending = new Set(
				(await client.getPendingCommands(robotId!, from, Number(next - from))).map((c) => c.nonce)
			);
			let changed = false;
			for (const entry of pending) {
				if (stillPending.has(entry.command.nonce)) continue;
				const command = toOnChainCommand(await client.getCommand(robotId!, entry.command.nonce));
				if (command.status === CommandStatus.Pending) continue;
				// Keep when it was first seen: that's what the stage timed it from
				const current = known.get(command.nonce);
				if (current) known.set(command.nonce, { ...current, command });
				changed = true;
			}
			if (changed) publish();
		}

		function loop(key: keyof typeof errors, poll: () => Promise<void>, intervalMs: number) {
			const run = async () => {
				try {
					await poll();
					errors[key] = null;
				} catch (err) {
					errors[key] = err instanceof Error ? err.message : String(err);
				}
				setError(errors.commands ?? errors.status);
				if (!stopped) timers.push(setTimeout(run, intervalMs));
			};
			void run();
		}
		loop('commands', pollCommands, pollMs);
		loop('status', pollStatus, STATUS_POLL_MS);

		return () => {
			stopped = true;
			for (const timer of timers) clearTimeout(timer);
		};
	}, [robotId, history, pollMs]);

	return { entries, error };
}
