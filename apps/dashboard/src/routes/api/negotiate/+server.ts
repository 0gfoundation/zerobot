import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Go2Signaling } from '@0g-foundation/zerobot-sdk/robot';
import { MOCK_ROBOT_PORT, isMockRobotIp } from '$lib/server/mock-robot';

export const POST: RequestHandler = async ({ request }) => {
	const { robotIp, sdpOffer, token, deviceKey } = await request.json();

	try {
		// Dry run goes to this server's own mock robot
		const port = isMockRobotIp(robotIp) ? MOCK_ROBOT_PORT : undefined;
		const signaling = new Go2Signaling(robotIp, { deviceKey, port });
		const sdpAnswer = await signaling.negotiate(sdpOffer, token);
		return json({ sdp: sdpAnswer });
	} catch (err: any) {
		return json({ error: err.message }, { status: 500 });
	}
};
