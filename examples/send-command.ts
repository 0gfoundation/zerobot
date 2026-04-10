/**
 * Send a command to a robot on-chain.
 *
 * Usage:
 *   npx tsx send-command.ts Hello
 *   npx tsx send-command.ts Move '{"x":0.3,"y":0,"z":0}'
 */
import "dotenv/config";
import { Commander, COMMAND_NAME_MAP, SportCommand } from "@0g-foundation/zerobot-sdk";

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
  const commandName = process.argv[2];
  const paramsJson = process.argv[3];

  if (!commandName) {
    console.log("Available commands:");
    for (const [name, schema] of COMMAND_NAME_MAP) {
      console.log(`  ${name} (apiId: ${schema.apiId}) — ${schema.description}`);
    }
    console.log("\nUsage: npx tsx send-command.ts <CommandName> [params_json]");
    return;
  }

  const schema = COMMAND_NAME_MAP.get(commandName);
  if (!schema) {
    console.error(`Unknown command: ${commandName}`);
    process.exit(1);
  }

  const commander = new Commander({
    rpcUrl: RPC_URL,
    registryAddress: REGISTRY_ADDRESS!,
    dispatcherAddress: DISPATCHER_ADDRESS!,
    privateKey: PRIVATE_KEY,
  });

  const params = paramsJson ? JSON.parse(paramsJson) : undefined;

  console.log(
    `Dispatching ${commandName} (apiId=${schema.apiId}) to robot ${ROBOT_ID}...`,
  );

  const receipt = await commander.sendCommand(ROBOT_ID!, {
    command: commandName,
    apiId: schema.apiId as SportCommand,
    params,
  });

  console.log(`Transaction hash: ${receipt?.hash}`);
  console.log(`Block: ${receipt?.blockNumber}`);
  console.log("Command dispatched on-chain!");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
