import { getAddress, isHex, verifyMessage } from 'viem';
import { faucetMessage, MAX_SIGNATURE_AGE_MS } from '@/lib/faucet';
import { faucetEnabled, faucetRequest } from '@/lib/server/faucet';

/** Whether this server can send 0G, so the page knows to offer it */
export function GET() {
	return Response.json({ enabled: faucetEnabled });
}

/**
 * Ask the faucet to send 0.5 0G to a wallet. It gives tokens to whatever
 * address it's handed, so the caller signs `faucetMessage` to show it owns
 * the wallet. One grant per wallet, ever: the faucet treats a repeated
 * `request_id` as the same request.
 */
export async function POST(request: Request) {
	if (!faucetEnabled) return Response.json({ error: 'Faucet not configured' }, { status: 404 });
	const { address, issuedAt, signature } = (await request.json().catch(() => ({}))) as {
		address?: string;
		issuedAt?: number;
		signature?: string;
	};

	let wallet: `0x${string}`;
	try {
		wallet = getAddress(address ?? '');
	} catch {
		return Response.json({ error: 'Invalid address' }, { status: 400 });
	}
	const age = Date.now() - Number(issuedAt);
	if (!Number.isFinite(age) || age < -60_000 || age > MAX_SIGNATURE_AGE_MS || !isHex(signature)) {
		return Response.json({ error: 'Invalid or expired signature' }, { status: 401 });
	}
	const valid = await verifyMessage({
		address: wallet,
		message: faucetMessage(wallet, Number(issuedAt)),
		signature
	}).catch(() => false);
	if (!valid) return Response.json({ error: 'Invalid or expired signature' }, { status: 401 });

	const id = `zerobot:${wallet.toLowerCase()}`;
	return faucetRequest('/v1/transfers', {
		method: 'POST',
		body: JSON.stringify({
			request_id: id,
			wallet,
			user_id: id,
			reason: 'zerobot onboarding',
			metadata: { source: 'zerobot-dashboard' }
		})
	});
}
