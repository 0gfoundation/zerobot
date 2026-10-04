import { CommandStatus, type CommandSchema } from '@0g-foundation/zerobot-sdk';
import type { QueueEntry } from './use-queue';

/** Matches `OperatorNodeOptions.settleMs`'s default */
export const SETTLE_MS = 1000;

/** A stretch when the operator starts nothing new: the robot is away or the queue paused. `to` is Infinity while it lasts. */
export interface Hold {
	from: number;
	to: number;
}

export interface Slot {
	entry: QueueEntry;
	schema: CommandSchema;
	exit?: CommandSchema;
	/** When the robot starts the move, in ms since epoch */
	start: number;
	/** When the next move can start */
	end: number;
}

/**
 * Predict when the operator runs each queued command, so the stage can
 * animate in step with the robot instead of waiting for receipts, which
 * land 4-5s after each move. Mirrors OperatorNode: commands run in nonce
 * order, each for its duration, then its exit move after a settle (RiseSit
 * after Sit), then a settle before the next. Commands outside the menu are
 * rejected without running, so they take no time.
 *
 * Only commands this page saw while pending get a slot. Ones already done
 * when the page loaded have no start time to replay. Nothing starts during a
 * hold, while the robot is away or the queue is paused: a move due then
 * starts when the hold ends, and one already running plays out. Holds are
 * absolute times kept by the page, so moves before a hold keep their slots.
 */
export function schedule(
	entries: QueueEntry[],
	schemas: Map<number, CommandSchema>,
	menu: Set<number>,
	holds: Hold[] = []
): Slot[] {
	const slots: Slot[] = [];
	let free = 0;
	for (const entry of entries) {
		const schema = schemas.get(entry.command.apiId);
		if (!entry.seenPending || !schema || !menu.has(schema.apiId)) continue;
		if (entry.command.status === CommandStatus.Failed || entry.command.status === CommandStatus.Expired) {
			continue;
		}
		const exit = schema.exitApiId !== undefined ? schemas.get(schema.exitApiId) : undefined;
		const start = afterHolds(Math.max(entry.seenAt, free), holds);
		// Held with no end yet: neither this nor anything after it has a time
		if (start === Infinity) break;
		const run = schema.estimatedDurationMs + (exit ? SETTLE_MS + exit.estimatedDurationMs : 0);
		free = start + run + SETTLE_MS;
		slots.push({ entry, schema, exit, start, end: free });
	}
	return slots;
}

/** The first time at or after `t` outside every hold */
function afterHolds(t: number, holds: Hold[]): number {
	let moved = true;
	while (moved) {
		moved = false;
		for (const h of holds) {
			if (t >= h.from && t < h.to) {
				t = h.to;
				moved = true;
			}
		}
	}
	return t;
}

/**
 * Where to sample a command's recording `elapsed` ms into its slot. The
 * recording plays forward, then for an exit move it plays backwards over
 * the exit's duration, so Sit's recording reversed stands the model back
 * up for RiseSit.
 */
export function recordingTime(slot: Slot, elapsed: number): number {
	const duration = slot.schema.estimatedDurationMs;
	if (!slot.exit) return elapsed;
	const exitStart = duration + SETTLE_MS;
	if (elapsed < exitStart) return Math.min(elapsed, duration);
	const progress = Math.min(1, (elapsed - exitStart) / slot.exit.estimatedDurationMs);
	return duration * (1 - progress);
}
