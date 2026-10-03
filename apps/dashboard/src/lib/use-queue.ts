'use client';

import { useEffect, useState } from 'react';
import { CommandStatus, toOnChainCommand, type OnChainCommand } from '@0g-foundation/zerobot-sdk';
import { readClient } from './chain';

const POLL_MS = 1000;

export interface QueueEntry {
	command: OnChainCommand;
	/** When this page first saw the command, in ms since epoch */
	seenAt: number;
	/** Whether the command was still pending when first seen */
	seenPending: boolean;
}

/**
 * A robot's recent commands in nonce order, kept current by polling. The
 * nonce is the queue order, and the operator runs pending commands oldest
 * first. Keeps the last `history` commands plus everything still pending.
 */
export function useQueue(robotId: string | undefined, history = 20) {
	const [entries, setEntries] = useState<QueueEntry[]>([]);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!robotId) return;
		const client = readClient();
		const known = new Map<bigint, QueueEntry>();
		let next: bigint | null = null;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout>;

		async function poll() {
			const nonce = await client.getRobotNonce(robotId!);
			if (next === null) next = nonce > BigInt(history) ? nonce - BigInt(history) : 0n;

			// New commands, in order. A load-balanced RPC can answer from a node
			// that hasn't seen a command yet (an empty struct), so stop there.
			while (next < nonce) {
				const command = toOnChainCommand(await client.getCommand(robotId!, next));
				if (command.timestamp === 0n) break;
				const pending = command.status === CommandStatus.Pending;
				known.set(next, { command, seenAt: Date.now(), seenPending: pending });
				next++;
			}

			// Status changes for commands still pending
			const pending = [...known.values()].filter((e) => e.command.status === CommandStatus.Pending);
			if (pending.length > 0) {
				const from = pending[0].command.nonce;
				const stillPending = new Set(
					(await client.getPendingCommands(robotId!, from, Number(next - from))).map((c) => c.nonce)
				);
				for (const entry of pending) {
					if (stillPending.has(entry.command.nonce)) continue;
					const command = toOnChainCommand(await client.getCommand(robotId!, entry.command.nonce));
					if (command.status !== CommandStatus.Pending) known.set(command.nonce, { ...entry, command });
				}
			}

			// Keep the last `history` plus anything pending
			const sorted = [...known.values()].sort((a, b) => Number(a.command.nonce - b.command.nonce));
			for (const entry of sorted.slice(0, Math.max(0, sorted.length - history))) {
				if (entry.command.status !== CommandStatus.Pending) known.delete(entry.command.nonce);
			}
			setEntries([...known.values()].sort((a, b) => Number(a.command.nonce - b.command.nonce)));
		}

		async function loop() {
			try {
				await poll();
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			}
			if (!stopped) timer = setTimeout(loop, POLL_MS);
		}
		loop();

		return () => {
			stopped = true;
			clearTimeout(timer);
		};
	}, [robotId, history]);

	return { entries, error };
}
