/**
 * Operator node example — watches the 0G chain for commands and executes them on the robot.
 *
 * Usage:
 *   cp ../.env.example .env  # fill in values
 *   npx tsx operator-node.ts
 *   npx tsx operator-node.ts menus/go2-pro-larry.json  # only run the menu's moves
 *   ROBOT_IP=127.0.0.1 ROBOT_PORT=9993 npx tsx operator-node.ts menus/go2-pro-larry.json  # against mock-robot.ts --port 9993
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { ChainClient, resolveMenu, type RobotMenu } from "@0g-foundation/zerobot-sdk";
import { OperatorNode } from "@0g-foundation/zerobot-sdk/operator";

const {
  ROBOT_IP = "192.168.123.18",
  ROBOT_DEVICE_KEY,
  // Set with ROBOT_IP=127.0.0.1 to drive a mock robot (mock-robot.ts --port <n>)
  ROBOT_PORT,
  RPC_URL = "https://evmrpc-testnet.0g.ai",
  OPERATOR_PRIVATE_KEY,
  REGISTRY_ADDRESS,
  DISPATCHER_ADDRESS,
  ROBOT_ID,
} = process.env;

if (!OPERATOR_PRIVATE_KEY || !REGISTRY_ADDRESS || !DISPATCHER_ADDRESS || !ROBOT_ID) {
  console.error(
    "Missing env vars: OPERATOR_PRIVATE_KEY, REGISTRY_ADDRESS, DISPATCHER_ADDRESS, ROBOT_ID",
  );
  process.exit(1);
}

const chainConfig = {
  rpcUrl: RPC_URL,
  registryAddress: REGISTRY_ADDRESS!,
  dispatcherAddress: DISPATCHER_ADDRESS!,
  privateKey: OPERATOR_PRIVATE_KEY,
  // Galileo makes a block about every 0.5s, so poll at that rate
  pollingIntervalMs: 500,
};

async function main(): Promise<void> {
  const menuPath = process.argv[2];
  let allowedApiIds: number[] | undefined;
  let labels = new Map<number, string>();
  if (menuPath) {
    const menu = JSON.parse(readFileSync(menuPath, "utf8")) as RobotMenu;
    const robot = await new ChainClient(chainConfig).getRobot(ROBOT_ID!);
    const items = resolveMenu(menu, robot.robotType);
    allowedApiIds = items.map((i) => i.apiId);
    labels = new Map(items.map((i) => [i.apiId, i.label]));
    console.log(`Menu: ${items.map((i) => i.label).join(", ")}`);
  }
  const describe = (apiId: number) => labels.get(apiId) ?? `apiId=${apiId}`;

  const operator = new OperatorNode(
    { ip: ROBOT_IP, deviceKey: ROBOT_DEVICE_KEY, port: ROBOT_PORT ? Number(ROBOT_PORT) : undefined },
    chainConfig,
    ROBOT_ID!,
    { allowedApiIds },
  );

  operator.on("started", () => {
    console.log("Operator node started. Listening for on-chain commands...");
  });

  operator.on("queuePaused", (paused) => {
    console.log(paused ? "Queue paused: finishing the current move, then holding" : "Queue resumed");
  });

  operator.on("chainRecovered", () => {
    console.log("Chain reachable again");
  });

  operator.on("status", (s) => {
    const battery = s.battery === undefined ? "" : `, battery ${s.battery}%`;
    console.log(`Robot ${s.robotConnected ? "connected" : "disconnected, queue paused"}${battery}`);
  });

  operator.on("commandReceived", (cmd) => {
    console.log(
      `#${cmd.nonce} queued: ${describe(cmd.apiId)} from ${cmd.note || cmd.sender}`,
    );
  });

  operator.on("commandStarted", (cmd) => {
    console.log(`#${cmd.nonce} running: ${describe(cmd.apiId)}`);
  });

  operator.on("commandExecuted", (cmd, success, resultData) => {
    console.log(
      `#${cmd.nonce} ${success ? "done" : `failed: ${resultData}`}`,
    );
  });

  operator.on("error", (err) => {
    console.error("Error:", err.message);
  });

  // A long-running operator shouldn't die on a stray network error in a
  // library; log it and keep serving the queue
  process.on("unhandledRejection", (err) => {
    console.error("Unexpected error (still running):", err instanceof Error ? err.message : err);
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
