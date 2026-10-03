import fs from 'node:fs/promises';
import { LOCAL_MODE } from '@/lib/mode';
import { recordingPath } from '@/lib/server/recordings';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ robot: string; name: string }> }) {
	if (!LOCAL_MODE) return new Response('Not found', { status: 404 });
	const { robot, name } = await params;
	const file = recordingPath(robot, name);
	if (!file) return new Response('Invalid recording name', { status: 400 });
	try {
		return new Response(await fs.readFile(file), {
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	} catch {
		return new Response('Recording not found', { status: 404 });
	}
}
