/**
 * Operator node example — watches the 0G chain for commands and executes them on the robot.
 *
 * Usage:
 *   cp ../.env.example .env  # fill in values
 *   npx tsx operator-node.ts
 */
import "dotenv/config";
import { OperatorNode } from "@0g-foundation/zerobot-sdk/operator";

const {
  ROBOT_IP = "192.168.123.18",
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
  const operator = new OperatorNode(
    { ip: ROBOT_IP },
    {
      rpcUrl: RPC_URL,
      registryAddress: REGISTRY_ADDRESS!,
      dispatcherAddress: DISPATCHER_ADDRESS!,
      privateKey: PRIVATE_KEY,
    },
    ROBOT_ID!,
  );

  operator.on("started", () => {
    console.log("Operator node started. Listening for on-chain commands...");
  });

  operator.on("commandReceived", (cmd) => {
    console.log(
      `Command received: apiId=${cmd.apiId}, nonce=${cmd.nonce}, sender=${cmd.sender}`,
    );
  });

  operator.on("commandExecuted", (cmd, success) => {
    console.log(
      `Command executed: nonce=${cmd.nonce}, success=${success}`,
    );
  });

  operator.on("error", (err) => {
    console.error("Error:", err.message);
  });

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await operator.stop();
    process.exit(0);
  });

  await operator.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
