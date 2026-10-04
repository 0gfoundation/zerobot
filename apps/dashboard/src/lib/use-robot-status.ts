'use client';

import { useQuery } from '@tanstack/react-query';
import { readClient } from './chain';

/** The operator reports every 60s, so three missed reports means it's gone */
const STALE_MS = 3 * 60_000;
const POLL_MS = 10_000;

export interface LiveStatus {
	/** The operator is running */
	operatorOnline: boolean;
	/** The operator is running and connected to the robot */
	robotOnline: boolean;
	/** Battery charge 0-100, if the robot has reported it */
	battery?: number;
	/** When the operator last reported, in ms since the epoch, or 0 */
	lastSeen: number;
}

/**
 * Whether a robot can take moves right now, from its operator's reports.
 * The only place pages read status, so moving status off-chain changes
 * this hook and nothing that uses it.
 */
export function useRobotStatus(robotId: string | undefined) {
	return useQuery({
		queryKey: ['robot-status', robotId],
		enabled: Boolean(robotId),
		refetchInterval: POLL_MS,
		queryFn: async (): Promise<LiveStatus> => {
			const status = await readClient().getStatus(robotId!);
			const fresh = status.updatedAt > 0 && Date.now() - status.updatedAt < STALE_MS;
			const operatorOnline = fresh && status.online;
			return {
				operatorOnline,
				robotOnline: operatorOnline && status.robotConnected,
				battery: status.battery,
				lastSeen: status.updatedAt
			};
		}
	});
}
