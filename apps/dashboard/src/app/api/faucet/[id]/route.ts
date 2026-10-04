import { faucetEnabled, faucetRequest } from '@/lib/server/faucet';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A faucet transfer's status, for the page to poll */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
	if (!faucetEnabled) return Response.json({ error: 'Faucet not configured' }, { status: 404 });
	const { id } = await params;
	if (!UUID.test(id)) return Response.json({ error: 'Invalid transfer id' }, { status: 400 });
	return faucetRequest(`/v1/transfers/${id}`);
}
