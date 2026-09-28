import path from 'node:path';
import { env } from '$env/dynamic/private';

/**
 * Where `examples/record-commands.ts` writes recordings. Defaults to the
 * repo's `examples/recordings` when the dashboard runs from `apps/dashboard`;
 * override with `RECORDINGS_DIR`.
 */
export function recordingsDir(): string {
	return path.resolve(env.RECORDINGS_DIR ?? path.join(process.cwd(), '../../examples/recordings'));
}

const SAFE_NAME = /^[a-z0-9_-]+$/i;

/** Path to a recording file, or null if either name could escape the recordings directory */
export function recordingPath(robot: string, name: string): string | null {
	if (!SAFE_NAME.test(robot) || !SAFE_NAME.test(name)) return null;
	return path.join(recordingsDir(), robot, `${name}.json`);
}
