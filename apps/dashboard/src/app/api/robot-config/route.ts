import { LOCAL_MODE } from '@/lib/mode';
import { robotConfig } from '@/lib/server/robot-config';

export const dynamic = 'force-dynamic';

/**
 * The robot's IP and device key, to pre-fill direct control. Local mode only:
 * a hosted deployment would serve the device key to anyone who asked.
 */
export function GET() {
	if (!LOCAL_MODE) return new Response('Not found', { status: 404 });
	return Response.json(robotConfig());
}
