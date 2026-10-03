import path from 'node:path';

/**
 * Where `examples/record-commands.ts` writes recordings. Defaults to the
 * repo's `examples/recordings` when the dashboard runs from `apps/dashboard`;
 * override with `RECORDINGS_DIR`.
 */
export function recordingsDir(): string {
	// Local mode only, so no need to trace these files into a deployment
	return path.resolve(
		/*turbopackIgnore: true*/ process.env.RECORDINGS_DIR ?? path.join(process.cwd(), '../../examples/recordings')
	);
}

const SAFE_NAME = /^[a-z0-9_-]+$/i;

/** Path to a recording file, or null if either name could escape the recordings directory */
export function recordingPath(robot: string, name: string): string | null {
	if (!SAFE_NAME.test(robot) || !SAFE_NAME.test(name)) return null;
	return path.join(recordingsDir(), robot, `${name}.json`);
}

export interface RecordingListing {
	robot: string;
	name: string;
	mtimeMs: number;
}
