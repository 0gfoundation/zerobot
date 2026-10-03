import fs from 'node:fs/promises';
import path from 'node:path';
import { LOCAL_MODE } from '@/lib/mode';
import { recordingsDir, type RecordingListing } from '@/lib/server/recordings';

export const dynamic = 'force-dynamic';

/** Lists recordings, most recently modified first. Cheap enough to poll. Local mode only. */
export async function GET() {
	if (!LOCAL_MODE) return new Response('Not found', { status: 404 });
	const dir = recordingsDir();
	const recordings: RecordingListing[] = [];

	let robots: string[];
	try {
		robots = (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
	} catch {
		return Response.json({ dir, recordings });
	}

	for (const robot of robots) {
		for (const file of await fs.readdir(path.join(dir, robot))) {
			if (!file.endsWith('.json')) continue;
			const { mtimeMs } = await fs.stat(path.join(dir, robot, file));
			recordings.push({ robot, name: file.slice(0, -'.json'.length), mtimeMs });
		}
	}

	recordings.sort((a, b) => b.mtimeMs - a.mtimeMs);
	return Response.json({ dir, recordings }, { headers: { 'cache-control': 'no-store' } });
}
