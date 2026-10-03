import type { ContractTransactionReceipt, ContractTransactionResponse } from "ethers";

const RECEIPT_RETRIES = 20;
const RECEIPT_RETRY_MS = 1000;

/**
 * `tx.wait()`, retrying when the RPC answers from a node that has the block
 * but not its receipts yet. The Galileo public RPC load-balances across
 * nodes and returns "no matching receipts found" in that window, which
 * ethers treats as fatal.
 */
export async function waitForReceipt(
  tx: ContractTransactionResponse,
): Promise<ContractTransactionReceipt | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await tx.wait();
    } catch (err) {
      if (attempt >= RECEIPT_RETRIES || !isMissingReceipt(err)) throw err;
      await new Promise((r) => setTimeout(r, RECEIPT_RETRY_MS));
    }
  }
}

function isMissingReceipt(err: unknown): boolean {
  const message = (err as { error?: { message?: string } })?.error?.message;
  return typeof message === "string" && message.includes("no matching receipts found");
}
