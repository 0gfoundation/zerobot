import { Go2Signaling } from '@0g-foundation/zerobot-sdk/robot';
import { LOCAL_MODE } from '@/lib/mode';
import { MOCK_ROBOT_PORT, isMockRobotIp } from '@/lib/server/mock-robot';

/**
 * Proxies the SDP exchange to the robot, which the browser can't reach
 * cross-origin. Local mode only: a hosted server can't reach the robot's LAN.
 */
export async function POST(request: Request) {
	if (!LOCAL_MODE) return Response.json({ error: 'Direct control needs local mode' }, { status: 404 });
	const { robotIp, sdpOffer, token, deviceKey } = await request.json();
	try {
		// Dry run goes to this server's own mock robot
		const port = isMockRobotIp(robotIp) ? MOCK_ROBOT_PORT : undefined;
		const signaling = new Go2Signaling(robotIp, { deviceKey, port });
		const sdp = await signaling.negotiate(sdpOffer, token);
		return Response.json({ sdp });
	} catch (err) {
		return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
	}
}
