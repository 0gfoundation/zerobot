/**
 * The 0G faucet's service API (issue #32): sends a fixed 0.5 0G on Galileo to
 * a wallet, at most once per wallet per 24h, a limit shared with the public
 * faucet. The key stays on the server. Without it the page links to the
 * public faucet instead.
 */
const API_URL = process.env.FAUCET_API_URL ?? 'https://faucet-api.udhaykumarbala.dev';
const API_KEY = process.env.FAUCET_API_KEY;

export const faucetEnabled = Boolean(API_KEY);

/** Call the faucet and pass its answer through with its status code */
export async function faucetRequest(path: string, init?: RequestInit): Promise<Response> {
	try {
		const res = await fetch(`${API_URL}${path}`, {
			...init,
			headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
			cache: 'no-store'
		});
		const body = await res.json().catch(() => ({}));
		if (res.status >= 400 && res.status !== 429) {
			// 400 is a bug here, 401/403 a bad key or scope
			console.error(`Faucet ${init?.method ?? 'GET'} ${path}: ${res.status}`, body);
		}
		return Response.json(body, { status: res.status });
	} catch (err) {
		console.error(`Faucet ${init?.method ?? 'GET'} ${path} unreachable`, err);
		return Response.json({ error: 'Faucet unreachable' }, { status: 502 });
	}
}
