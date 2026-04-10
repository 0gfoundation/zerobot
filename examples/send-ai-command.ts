/**
 * Send a natural language command that gets resolved via 0G Compute AI.
 *
 * Usage:
 *   npx tsx send-ai-command.ts "make the robot dance and then wave hello"
 *
 * Requires: 0G Compute funds deposited via @0glabs/0g-serving-broker
 */
import "dotenv/config";
import { ethers } from "ethers";
import {
  AIBroker,
  Commander,
  parseLLMResponse,
  buildSystemPrompt,
} from "@0g-foundation/zerobot-sdk";

const {
  RPC_URL = "https://evmrpc-testnet.0g.ai",
  PRIVATE_KEY,
  REGISTRY_ADDRESS,
  DISPATCHER_ADDRESS,
  ROBOT_ID,
} = process.env;

if (!PRIVATE_KEY || !REGISTRY_ADDRESS || !DISPATCHER_ADDRESS || !ROBOT_ID) {
  console.error(
    "Missing env vars: PRIVATE_KEY, REGISTRY_ADDRESS, DISPATCHER_ADDRESS, ROBOT_ID",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const prompt = process.argv.slice(2).join(" ");
  if (!prompt) {
    console.log(
      'Usage: npx tsx send-ai-command.ts "your natural language command"',
    );
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY!, provider);

  console.log("Initializing 0G Compute AI broker...");
  const aiBroker = new AIBroker(signer);
  await aiBroker.initialize();

  console.log(`Resolving prompt: "${prompt}"`);
  const commands = await aiBroker.resolvePrompt(prompt);

  console.log("Resolved commands:");
  for (const cmd of commands) {
    console.log(
      `  ${cmd.command} (apiId: ${cmd.apiId})${cmd.params ? ` params: ${JSON.stringify(cmd.params)}` : ""}${cmd.duration_ms ? ` wait: ${cmd.duration_ms}ms` : ""}`,
    );
  }

  const commander = new Commander({
    rpcUrl: RPC_URL,
    registryAddress: REGISTRY_ADDRESS!,
    dispatcherAddress: DISPATCHER_ADDRESS!,
    privateKey: PRIVATE_KEY,
  });

  console.log("Dispatching command batch on-chain...");
  const receipt = await commander.sendBatch(ROBOT_ID!, commands);
  console.log(`Transaction hash: ${receipt?.hash}`);
  console.log("Commands dispatched!");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
