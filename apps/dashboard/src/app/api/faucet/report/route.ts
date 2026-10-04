/**
 * Where the faucet step reports a wallet that failed or stalled, so it shows
 * in the server log (Vercel's runtime logs) when a phone's console is out of
 * reach. Logs a few short fields and stores nothing.
 */
export async function POST(request: Request) {
	const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const field = (key: string) => String(body[key] ?? '').slice(0, 300);
	console.warn(
		`Faucet step ${field('stage')}: connector=${field('connector')} name=${field('name')} code=${field('code')} message=${field('message')}`
	);
	return new Response(null, { status: 204 });
}
