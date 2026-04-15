/**
 * Record joint state data from Unitree robots while performing each command.
 * Supports Go2 Pro and G1 Basic.
 *
 * Connects via WebRTC, subscribes to low-level state, triggers each command
 * sequentially, and saves joint angle data as JSON files.
 *
 * Usage:
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot go2
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot g1
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot go2 --commands Hello,Dance1
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot g1 --commands Walk,Handshake
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Go2Connection,
  SportCommand,
  COMMAND_SCHEMAS,
  COMMAND_NAME_MAP,
  RtcTopic,
  DataChannelType,
} from "@0g-foundation/zerobot-sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROBOT_IP = process.env.ROBOT_IP || "192.168.123.18";

// ---- CLI Args ----

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const ROBOT_TYPE = getArg("robot", "");
const SETTLE_TIME = parseInt(getArg("settle", "2000"));
const EXTRA_TIME = parseInt(getArg("extra", "1500"));
const COMMANDS_FILTER = getArg("commands", "all");

if (!ROBOT_TYPE || !["go2", "g1"].includes(ROBOT_TYPE)) {
  console.log("Usage: npx tsx record-commands.ts --robot <go2|g1> [options]");
  console.log("");
  console.log("Options:");
  console.log("  --robot <go2|g1>        Robot type (required)");
  console.log("  --commands <name,...>    Record specific commands only");
  console.log("  --settle <ms>           Wait time before each command (default: 2000)");
  console.log("  --extra <ms>            Extra recording time after command (default: 1500)");
  process.exit(1);
}

const RECORDINGS_DIR = path.join(__dirname, "recordings", ROBOT_TYPE);

// ---- Robot-Specific Command Definitions ----

interface RobotCommand {
  name: string;
  estimatedDurationMs: number;
  /** If true, trigger is called repeatedly every 500ms and StopMove is sent after */
  continuous?: boolean;
  /** How to trigger this command on the robot */
  trigger: (conn: Go2Connection) => void;
}

const MOVE_SPEED = 0.3;
const MOVE_DURATION = 3000;
const ROTATE_SPEED = 1.0;

/** Go2 Pro movement commands — continuous velocity commands */
const GO2_MOVEMENT_COMMANDS: RobotCommand[] = [
  {
    name: "MoveForward",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => conn.sportCommand(SportCommand.Move, { x: MOVE_SPEED, y: 0, z: 0 }),
  },
  {
    name: "MoveBackward",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => conn.sportCommand(SportCommand.Move, { x: -MOVE_SPEED, y: 0, z: 0 }),
  },
  {
    name: "MoveLeft",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => conn.sportCommand(SportCommand.Move, { x: 0, y: MOVE_SPEED, z: 0 }),
  },
  {
    name: "MoveRight",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => conn.sportCommand(SportCommand.Move, { x: 0, y: -MOVE_SPEED, z: 0 }),
  },
  {
    name: "RotateLeft",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => conn.sportCommand(SportCommand.Move, { x: 0, y: 0, z: ROTATE_SPEED }),
  },
  {
    name: "RotateRight",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => conn.sportCommand(SportCommand.Move, { x: 0, y: 0, z: -ROTATE_SPEED }),
  },
];

/** Go2 Pro action commands — single-fire sport commands */
const GO2_ACTION_COMMANDS: RobotCommand[] = COMMAND_SCHEMAS
  .filter((s) => s.estimatedDurationMs > 0)
  .map((s) => ({
    name: s.name,
    estimatedDurationMs: s.estimatedDurationMs,
    trigger: (conn) => {
      const params = s.params
        ? Object.fromEntries(
            Object.entries(s.params).map(([k, v]) => {
              if (v.type === "boolean") return [k, true];
              if (v.type === "number") return [k, 0];
              return [k, null];
            }),
          )
        : undefined;
      conn.sportCommand(s.apiId as SportCommand, params);
    },
  }));

const GO2_COMMANDS: RobotCommand[] = [...GO2_MOVEMENT_COMMANDS, ...GO2_ACTION_COMMANDS];

/** G1 Basic loco mode commands — sent to rt/api/sport/request with different api_ids */
const G1_LOCO_COMMANDS: RobotCommand[] = [
  {
    name: "Start",
    estimatedDurationMs: 2000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 500 }),
  },
  {
    name: "Squat",
    estimatedDurationMs: 2000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 2 }),
  },
  {
    name: "StandUp",
    estimatedDurationMs: 2000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 4 }),
  },
  {
    name: "Damping",
    estimatedDurationMs: 1000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 1 }),
  },
  {
    name: "Walk",
    estimatedDurationMs: 3000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 500 }),
  },
  {
    name: "WalkWaist",
    estimatedDurationMs: 3000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 501 }),
  },
  {
    name: "Run",
    estimatedDurationMs: 3000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 801 }),
  },
  {
    name: "LieDown",
    estimatedDurationMs: 3000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 702 }),
  },
  {
    name: "BalanceSquat",
    estimatedDurationMs: 2000,
    trigger: (conn) => sendG1SportCommand(conn, 7101, { data: 706 }),
  },
];

/** G1 Basic arm actions — sent to rt/api/arm/request with api_id 7106 */
const G1_ARM_COMMANDS: RobotCommand[] = [
  { name: "Handshake", action: 27 },
  { name: "HighFive", action: 18 },
  { name: "Hug", action: 19 },
  { name: "WaveHigh", action: 26 },
  { name: "Applause", action: 17 },
  { name: "WaveChest", action: 25 },
  { name: "FlyingKiss", action: 12 },
  { name: "DoubleHeart", action: 20 },
  { name: "SingleHeart", action: 21 },
  { name: "ArmsHorizontal", action: 15 },
  { name: "Cross", action: 22 },
  { name: "RightHandUp", action: 23 },
  { name: "LightWave", action: 24 },
  { name: "ArmRecover", action: 99 },
].map((a) => ({
  name: a.name,
  estimatedDurationMs: 3000,
  trigger: (conn) => sendG1ArmAction(conn, a.action),
}));

/** G1 Basic movement commands — continuous via joystick input */
const G1_MOVEMENT_COMMANDS: RobotCommand[] = [
  {
    name: "MoveForward",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => sendG1Joystick(conn, MOVE_SPEED, 0, 0, 0),
  },
  {
    name: "MoveBackward",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => sendG1Joystick(conn, -MOVE_SPEED, 0, 0, 0),
  },
  {
    name: "MoveLeft",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => sendG1Joystick(conn, 0, MOVE_SPEED, 0, 0),
  },
  {
    name: "MoveRight",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => sendG1Joystick(conn, 0, -MOVE_SPEED, 0, 0),
  },
  {
    name: "RotateLeft",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => sendG1Joystick(conn, 0, 0, ROTATE_SPEED, 0),
  },
  {
    name: "RotateRight",
    estimatedDurationMs: MOVE_DURATION,
    continuous: true,
    trigger: (conn) => sendG1Joystick(conn, 0, 0, -ROTATE_SPEED, 0),
  },
];

const G1_COMMANDS: RobotCommand[] = [...G1_MOVEMENT_COMMANDS, ...G1_LOCO_COMMANDS, ...G1_ARM_COMMANDS];

const ALL_COMMANDS: Record<string, RobotCommand[]> = {
  go2: GO2_COMMANDS,
  g1: G1_COMMANDS,
};

// Number of motors per robot type
const MOTOR_COUNT: Record<string, number> = {
  go2: 12, // 4 legs × 3 joints
  g1: 23,  // minimum DOF config
};

// Reset command per robot type
const RESET_COMMAND: Record<string, (conn: Go2Connection) => void> = {
  go2: (conn) => conn.sportCommand(SportCommand.RecoveryStand),
  g1: (conn) => sendG1SportCommand(conn, 7101, { data: 4 }), // LockStanding
};

// ---- G1 Command Helpers ----

function sendG1SportCommand(
  conn: Go2Connection,
  apiId: number,
  params?: Record<string, unknown>,
): void {
  // G1 uses the same data channel but different api_ids on rt/api/sport/request
  const msg = JSON.stringify({
    type: DataChannelType.REQUEST,
    topic: RtcTopic.SPORT_REQUEST,
    data: {
      header: {
        identity: {
          id: (Date.now() % 2147483648) + Math.floor(Math.random() * 1000),
          api_id: apiId,
        },
      },
      parameter: params ? JSON.stringify(params) : "",
    },
  });
  // Access sendRaw via sportCommand's underlying mechanism
  // We use the connection's internal send by building and sending directly
  (conn as any).sendRaw(msg);
}

function sendG1ArmAction(conn: Go2Connection, actionId: number): void {
  const msg = JSON.stringify({
    type: DataChannelType.REQUEST,
    topic: "rt/api/arm/request",
    data: {
      header: {
        identity: {
          id: (Date.now() % 2147483648) + Math.floor(Math.random() * 1000),
          api_id: 7106,
        },
      },
      parameter: JSON.stringify({ data: actionId }),
    },
  });
  (conn as any).sendRaw(msg);
}

function sendG1Joystick(conn: Go2Connection, lx: number, ly: number, rx: number, ry: number): void {
  const msg = JSON.stringify({
    type: "msg",
    topic: "rt/wirelesscontroller",
    data: { lx, ly, rx, ry, keys: 0 },
  });
  (conn as any).sendRaw(msg);
}

// ---- Recording Types ----

interface JointFrame {
  /** Milliseconds since recording started */
  t: number;
  /** Motor positions */
  q: number[];
  /** Motor velocities */
  dq: number[];
  /** IMU quaternion [w, x, y, z] */
  imu_quat?: number[];
  /** IMU angular velocity [x, y, z] */
  imu_gyro?: number[];
}

interface CommandRecording {
  robot: string;
  command: string;
  estimatedDurationMs: number;
  recordedAt: string;
  frameCount: number;
  durationMs: number;
  motorCount: number;
  frames: JointFrame[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Main ----

async function main(): Promise<void> {
  const allCommands = ALL_COMMANDS[ROBOT_TYPE];
  const motorCount = MOTOR_COUNT[ROBOT_TYPE];
  const resetCommand = RESET_COMMAND[ROBOT_TYPE];
  const commandNameMap = new Map(allCommands.map((c) => [c.name, c]));

  // Filter commands
  let commandsToRecord = allCommands;
  if (COMMANDS_FILTER !== "all") {
    const names = COMMANDS_FILTER.split(",").map((s) => s.trim());
    commandsToRecord = names.map((name) => {
      const cmd = commandNameMap.get(name);
      if (!cmd) {
        console.error(`Unknown ${ROBOT_TYPE} command: ${name}`);
        console.log("Available:", allCommands.map((c) => c.name).join(", "));
        process.exit(1);
      }
      return cmd;
    });
  }

  console.log(`Robot: ${ROBOT_TYPE.toUpperCase()} (${motorCount} motors)`);
  console.log(`Commands to record (${commandsToRecord.length}):`);
  for (const cmd of commandsToRecord) {
    console.log(`  ${cmd.name} (${cmd.estimatedDurationMs}ms)`);
  }
  console.log();

  // Create output directory
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  // Connect to robot
  console.log(`Connecting to ${ROBOT_TYPE.toUpperCase()} at ${ROBOT_IP}...`);
  const conn = new Go2Connection({ ip: ROBOT_IP });
  conn.on("error", (err) => console.error("Connection error:", err.message));
  await conn.connect();
  console.log("Connected!\n");

  // Subscribe to low-level state
  let currentFrames: JointFrame[] = [];
  let recording = false;
  let recordingStart = 0;

  conn.on("message", (msg: Record<string, unknown>) => {
    if (!recording) return;
    const topic = msg.topic as string;
    if (topic !== RtcTopic.LOW_STATE) return;

    const data = msg.data as Record<string, unknown>;
    if (!data) return;

    const frame: JointFrame = {
      t: Date.now() - recordingStart,
      q: [],
      dq: [],
    };

    // Extract motor data
    const motorState = data.motor_state as Array<Record<string, number>> | undefined;
    if (motorState && Array.isArray(motorState)) {
      for (let i = 0; i < Math.min(motorState.length, motorCount); i++) {
        frame.q.push(motorState[i]?.q ?? 0);
        frame.dq.push(motorState[i]?.dq ?? 0);
      }
    }

    // Extract IMU data
    const imuState = data.imu_state as Record<string, unknown> | undefined;
    if (imuState) {
      const quat = imuState.quaternion as number[] | undefined;
      if (quat) frame.imu_quat = quat;
      const gyro = imuState.gyroscope as number[] | undefined;
      if (gyro) frame.imu_gyro = gyro;
    }

    if (frame.q.length > 0) {
      currentFrames.push(frame);
    }
  });

  conn.subscribe(RtcTopic.LOW_STATE);
  await sleep(1000);

  // Record each command
  for (const cmd of commandsToRecord) {
    const outFile = path.join(
      RECORDINGS_DIR,
      `${cmd.name.toLowerCase()}.json`,
    );

    if (COMMANDS_FILTER === "all" && fs.existsSync(outFile)) {
      console.log(`Skipping ${cmd.name} (already recorded)`);
      continue;
    }

    console.log(`Recording ${cmd.name} (estimated ${cmd.estimatedDurationMs}ms)...`);

    // Reset to standing position
    resetCommand(conn);
    await sleep(SETTLE_TIME);

    // Start recording
    currentFrames = [];
    recordingStart = Date.now();
    recording = true;

    // Trigger the command
    if (cmd.continuous) {
      // Continuous command: send repeatedly every 500ms, then stop
      const endTime = Date.now() + cmd.estimatedDurationMs;
      while (Date.now() < endTime) {
        cmd.trigger(conn);
        await sleep(500);
      }
      // Send StopMove for Go2, or zero joystick for G1
      if (ROBOT_TYPE === "go2") {
        conn.sportCommand(SportCommand.StopMove);
      } else {
        sendG1Joystick(conn, 0, 0, 0, 0);
      }
      await sleep(EXTRA_TIME);
    } else {
      cmd.trigger(conn);
      await sleep(cmd.estimatedDurationMs + EXTRA_TIME);
    }

    // Stop recording
    recording = false;
    const durationMs = Date.now() - recordingStart;

    const result: CommandRecording = {
      robot: ROBOT_TYPE,
      command: cmd.name,
      estimatedDurationMs: cmd.estimatedDurationMs,
      recordedAt: new Date().toISOString(),
      frameCount: currentFrames.length,
      durationMs,
      motorCount,
      frames: currentFrames,
    };

    fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
    console.log(
      `  Saved ${currentFrames.length} frames (${durationMs}ms) → ${ROBOT_TYPE}/${path.basename(outFile)}`,
    );

    await sleep(1000);
  }

  // Return to stand
  resetCommand(conn);
  await sleep(2000);

  console.log("\nAll recordings complete!");
  console.log(`Output directory: ${RECORDINGS_DIR}`);

  await conn.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
