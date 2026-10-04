'use client';

import { useQuery } from '@tanstack/react-query';
import { readClient } from './chain';

/** The operator checks every 2s while paused, so the stage keeps close to it */
const POLL_MS = 3000;

/**
 * Whether the robot's queue is paused on-chain. Paused, the operator finishes
 * the move it's running and starts no others, while payments still come in.
 */
export function useQueuePaused(robotId: string | undefined) {
	return useQuery({
		queryKey: ['queue-paused', robotId],
		enabled: Boolean(robotId),
		refetchInterval: POLL_MS,
		queryFn: () => readClient().isQueuePaused(robotId!)
	});
}
