import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Go2Signaling } from '@0g-foundation/zerobot-sdk/robot';

export const POST: RequestHandler = async ({ request }) => {
	const { robotIp, sdpOffer, token, deviceKey } = await request.json();

	try {
		const signaling = new Go2Signaling(robotIp, { deviceKey });
		const sdpAnswer = await signaling.negotiate(sdpOffer, token);
		return json({ sdp: sdpAnswer });
	} catch (err: any) {
		return json({ error: err.message }, { status: 500 });
	}
};
