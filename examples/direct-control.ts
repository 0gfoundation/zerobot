/**
 * Direct control example — connect to a Go2 Pro via WebRTC and send commands.
 *
 * Usage:
 *   ROBOT_IP=192.168.123.18 npx tsx direct-control.ts
 */
import "dotenv/config";
import { Go2Connection, SportCommand } from "@0g-foundation/zerobot-sdk";

const ROBOT_IP = process.env.ROBOT_IP || "192.168.123.18";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  console.log(`Connecting to Go2 Pro at ${ROBOT_IP}...`);

  const conn = new Go2Connection({ ip: ROBOT_IP });

  conn.on("status", (status) => console.log(`Status: ${status}`));
  conn.on("error", (err) => console.error("Error:", err.message));
  conn.on("message", (msg) => {
    if ((msg as Record<string, unknown>).type !== "heartbeat") {
      console.log("Message:", JSON.stringify(msg).slice(0, 200));
    }
  });

  try {
    await conn.connect();
    console.log("Connected!");

    // Stand up
    console.log("Standing up...");
    conn.sportCommand(SportCommand.RecoveryStand);
    await sleep(3000);

    // Wave hello
    console.log("Saying hello...");
    conn.sportCommand(SportCommand.Hello);
    await sleep(4000);

    // Walk forward briefly
    console.log("Walking forward...");
    conn.sportCommand(SportCommand.Move, { x: 0.3, y: 0, z: 0 });
    await sleep(2000);

    // Stop
    console.log("Stopping...");
    conn.sportCommand(SportCommand.StopMove);
    await sleep(1000);

    // Stand balanced
    conn.sportCommand(SportCommand.BalanceStand);
    await sleep(1000);

    console.log("Done! Disconnecting...");
    await conn.disconnect();
  } catch (err) {
    console.error("Failed:", err);
    await conn.disconnect();
    process.exit(1);
  }
}

main();
