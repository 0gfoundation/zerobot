import { error } from '@sveltejs/kit';
import fs from 'node:fs/promises';
import type { RequestHandler } from './$types';
import { recordingPath } from '$lib/server/recordings';

export const GET: RequestHandler = async ({ params }) => {
	const file = recordingPath(params.robot, params.name);
	if (!file) error(400, 'Invalid recording name');

	try {
		const body = await fs.readFile(file);
		return new Response(body, {
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
	} catch {
		error(404, 'Recording not found');
	}
};
