import { keccak256, toBytes } from 'viem';
import type { RobotMenu } from '@0g-foundation/zerobot-sdk';
import larry from '../../../../examples/menus/go2-pro-larry.json';

/**
 * Menus of the moves each robot offers the public, by robot name. Files in
 * the repo for now; they move to 0G Storage under the robot's
 * `storageRoot` so owners can edit them without a deploy.
 */
const MENUS: Record<string, RobotMenu> = {
	'go2-pro-larry': larry
};

export function menuFor(name: string): RobotMenu | undefined {
	return MENUS[name];
}

/** What the public calls a robot, e.g. "Larry", from its menu, else its registered name */
export function displayNameFor(name: string): string {
	return MENUS[name]?.displayName ?? name;
}

/** Robot ids are the keccak256 of the name chosen at registration. */
export function robotIdFor(name: string): `0x${string}` {
	return keccak256(toBytes(name));
}

export const ROBOT_TYPE_LABELS: Record<string, string> = {
	go2_pro: 'Go2 Pro',
	go2_air: 'Go2 Air',
	go2_edu: 'Go2 Edu',
	g1: 'G1'
};

/** The model and recordings folder for a robot type. */
export function robotFamily(robotType: string): 'go2' | 'g1' {
	return robotType.startsWith('g1') ? 'g1' : 'go2';
}

/**
 * Renders of the robot mid-move, by family and command, from the 3D model
 * posed by the move's recording. A move without one shows its emoji.
 */
const POSE_IMAGES: Record<'go2' | 'g1', ReadonlySet<string>> = {
	go2: new Set(['hello', 'sit', 'standdown', 'stretch', 'fingerheart', 'content', 'dance1', 'dance2']),
	g1: new Set()
};

export function poseImageFor(robotType: string, command: string): string | undefined {
	const family = robotFamily(robotType);
	const name = command.toLowerCase();
	return POSE_IMAGES[family].has(name) ? `/images/moves/${family}/${name}.webp` : undefined;
}
