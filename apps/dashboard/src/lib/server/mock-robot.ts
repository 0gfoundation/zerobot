import { env } from '$env/dynamic/private';

/**
 * Port for this dev server's mock robot (dry-run mode). Override with
 * `MOCK_ROBOT_PORT` so a second dev server, e.g. a PR preview, can run its
 * own mock next to the main one.
 */
export const MOCK_ROBOT_PORT = Number(env.MOCK_ROBOT_PORT ?? 9991);

/** Dry run connects to a loopback address, which is never a real robot */
export function isMockRobotIp(ip: string): boolean {
	return ip === '127.0.0.1' || ip === 'localhost' || ip === '::1';
}
