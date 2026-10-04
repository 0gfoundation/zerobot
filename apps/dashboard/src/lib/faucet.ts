/** The 0G faucet's fixed drip, set on its side */
export const FAUCET_AMOUNT = '0.5';

/** A signed faucet request is good for this long */
export const MAX_SIGNATURE_AGE_MS = 5 * 60_000;

/**
 * What the wallet signs to ask the faucet for 0G, so only its owner can.
 * The page and the server build it the same way, and the server compares it
 * whole.
 */
export function faucetMessage(address: string, issuedAt: number): string {
	return `Zerobot: request testnet 0G for ${address}\nIssued At: ${issuedAt}`;
}

/** A faucet transfer, as the faucet API returns it */
export interface FaucetTransfer {
	transfer_id: string;
	status: 'queued' | 'executing' | 'completed' | 'failed';
	amount: string;
	tx_hash: string | null;
	failure_reason: string | null;
}
