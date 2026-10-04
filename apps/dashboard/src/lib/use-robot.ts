'use client';

import { useQuery } from '@tanstack/react-query';
import { resolveMenu, type ResolvedMenuItem, type Robot } from '@0g-foundation/zerobot-sdk';
import { readClient } from './chain';
import { menuFor, robotIdFor } from './robots';

export interface PublicRobot {
	robotId: `0x${string}`;
	robot: Robot;
	/** Wei per command */
	price: bigint;
	/** The moves offered, empty without a menu */
	menu: ResolvedMenuItem[];
	/** What the public calls the robot, e.g. "Larry" */
	displayName: string;
}

/** How often a page that follows a robot live rereads its settings, so a pause shows within seconds */
const LIVE_REFETCH_MS = 10_000;

/**
 * A robot by name, with its price and menu. `data` is null if no robot has
 * that name. `live` rereads it every few seconds, for pages open for hours.
 */
export function useRobot(name: string, { live = false }: { live?: boolean } = {}) {
	return useQuery({
		queryKey: ['robot', name],
		queryFn: async (): Promise<PublicRobot | null> => {
			const robotId = robotIdFor(name);
			const client = readClient();
			const robot = await client.getRobot(robotId);
			if (robot.owner === '0x0000000000000000000000000000000000000000') return null;
			const price = await client.getCommandPrice(robotId);
			const menu = menuFor(name);
			return {
				robotId,
				robot,
				price,
				menu: menu ? resolveMenu(menu, robot.robotType) : [],
				displayName: menu?.displayName ?? robot.name
			};
		},
		staleTime: 30_000,
		refetchInterval: live ? LIVE_REFETCH_MS : false
	});
}
