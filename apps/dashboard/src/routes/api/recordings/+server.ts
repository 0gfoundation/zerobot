import { json } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { recordingsDir } from '$lib/server/recordings';

export interface RecordingListing {
	robot: string;
	name: string;
	mtimeMs: number;
}

/** Lists recordings, most recently modified first. Cheap enough to poll. */
export const GET: RequestHandler = async () => {
	const dir = recordingsDir();
	const recordings: RecordingListing[] = [];

	let robots: string[];
	try {
		robots = (await fs.readdir(dir, { withFileTypes: true }))
			.filter((d) => d.isDirectory())
			.map((d) => d.name);
	} catch {
		return json({ dir, recordings });
	}

	for (const robot of robots) {
		for (const file of await fs.readdir(path.join(dir, robot))) {
			if (!file.endsWith('.json')) continue;
			const { mtimeMs } = await fs.stat(path.join(dir, robot, file));
			recordings.push({ robot, name: file.slice(0, -'.json'.length), mtimeMs });
		}
	}

	recordings.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return json({ dir, recordings }, { headers: { 'cache-control': 'no-store' } });
};
