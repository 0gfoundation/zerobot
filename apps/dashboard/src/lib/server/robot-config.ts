import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

export interface RobotConfig {
	ip?: string;
	deviceKey?: string;
}

/**
 * The robot's address and device key for direct control, from the dashboard's
 * own env, else the repo's `.env` (the operator's), else `examples/.env` (the
 * recorder's). Only these two values are read out: the root `.env` also holds
 * the deployer and operator keys. Local mode only, so never served by a
 * hosted deployment.
 */
export function robotConfig(): RobotConfig {
	const root = path.join(/*turbopackIgnore: true*/ process.cwd(), '../..');
	const files = [path.join(root, '.env'), path.join(root, 'examples/.env')].map((file) => {
		try {
			return parseEnv(fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf8'));
		} catch {
			return {};
		}
	});
	const pick = (key: string) =>
		[process.env[key], ...files.map((env) => env[key])].map((v) => v?.trim()).find((v) => v) || undefined;
	return { ip: pick('ROBOT_IP'), deviceKey: pick('ROBOT_DEVICE_KEY') };
}
