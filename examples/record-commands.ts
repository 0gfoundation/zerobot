/**
 * Record robot state from Unitree robots while performing each command.
 * Supports Go2 Pro and G1 Basic.
 *
 * Connects via WebRTC, subscribes to the robot's state topics, triggers each
 * command sequentially, and saves one JSON file per command holding the raw
 * state payloads, the commands sent and the robot's responses. The run stops
 * if joint data isn't arriving, rather than saving empty recordings.
 *
 * Joint state only arrives at ~1 Hz over WebRTC, so `--repeat N` records a
 * command N times, each run sent at a different delay after a joint sample.
 * Merged by send time, the runs sample the motion at ~N Hz. Each run waits
 * for Enter so the robot's position can be reset, and the file is saved
 * after every run.
 *
 * Usage:
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot go2
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot g1
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot go2 --commands Hello,Dance1
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot go2 --commands Hello --repeat 10
 *   ROBOT_IP=192.168.123.18 npx tsx record-commands.ts --robot g1 --commands Walk,Handshake
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import {
  Go2Connection,
  RtcTopic,
  DataChannelType,
} from "@0g-foundation/zerobot-sdk/robot";
import {
  SportCommand,
  GO2_SPORT_SCHEMAS,
} from "@0g-foundation/zerobot-sdk";

// Build per-name and per-apiId lookups locally. In a multi-robot
// setting, replace `GO2_SPORT_SCHEMAS` with the result of
// `getSchemasForRobotType(robot.robotType)`.
const COMMAND_SCHEMAS = GO2_SPORT_SCHEMAS;
const COMMAND_NAME_MAP = new Map(GO2_SPORT_SCHEMAS.map((s) => [s.name, s]));

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
const REPEAT = parseInt(getArg("repeat", "1"));
const CONFIRM = !args.includes("--yes");

if (!ROBOT_TYPE || !["go2", "g1"].includes(ROBOT_TYPE) || !(REPEAT >= 1)) {
  console.log("Usage: npx tsx record-commands.ts --robot <go2|g1> [options]");
  console.log("");
  console.log("Options:");
  console.log("  --robot <go2|g1>        Robot type (required)");
  console.log("  --commands <name,...>    Record specific commands only");
  console.log("  --repeat <n>            Runs per command, staggered against the ~1 Hz joint samples (default: 1)");
  console.log("  --yes                   Don't wait for Enter before each run");
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

// ---- Recording ----

/**
 * State topics captured per robot. No data on a `required` topic stops the
 * run; no data on an `optional` topic only warns.
 */
const STATE_TOPICS: Record<string, { required: string[]; optional: string[] }> = {
  go2: {
    required: [RtcTopic.LOW_STATE, RtcTopic.LF_SPORT_MOD_STATE],
    optional: [RtcTopic.ROBOT_POSE],
  },
  g1: { required: [RtcTopic.LOW_STATE], optional: [] },
};

/** How long to wait for the first message on each state topic after subscribing */
const STREAM_TIMEOUT_MS = 5000;

/** Joint state arrives about once a second, so runs are staggered across this period */
const JOINT_SAMPLE_PERIOD_MS = 1000;

interface RecordedMessage {
  /**
   * Milliseconds since the command was sent. Each stream starts with the
   * last message received before the command, at a negative `t`.
   */
  t: number;
  /** Payload exactly as the robot sent it */
  data: unknown;
}

type RecordingEvent =
  | { t: number; kind: "sent"; name: string }
  | { t: number; kind: "response"; topic: string; data: unknown };

interface RecordingRun {
  recordedAt: string;
  /** Delay between a joint sample arriving and the command being sent */
  offsetMs: number;
  durationMs: number;
  /** Raw payloads per state topic, in arrival order */
  streams: Record<string, RecordedMessage[]>;
  /** Commands sent and robot responses received while recording */
  events: RecordingEvent[];
}

interface CommandRecording {
  robot: string;
  command: string;
  estimatedDurationMs: number;
  /** Leading entries of lowstate `motor_state` that are real joints; the rest are unused slots */
  motorCount: number;
  /** One entry per repetition, each timed from its own command send */
  runs: RecordingRun[];
}

interface ResponsePayload {
  header?: { identity?: { api_id?: number }; status?: { code?: number } };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Main ----

async function main(): Promise<void> {
  const allCommands = ALL_COMMANDS[ROBOT_TYPE];
  const motorCount = MOTOR_COUNT[ROBOT_TYPE];
  const resetCommand = RESET_COMMAND[ROBOT_TYPE];
  const { required, optional } = STATE_TOPICS[ROBOT_TYPE];
  const stateTopics = [...required, ...optional];
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
  const conn = new Go2Connection({ ip: ROBOT_IP, deviceKey: process.env.ROBOT_DEVICE_KEY });
  conn.on("error", (err) => console.error("Connection error:", err.message));
  await conn.connect();
  console.log("Connected!\n");

  let streams: Record<string, RecordedMessage[]> = {};
  let events: RecordingEvent[] = [];
  let recording = false;
  let recordingStart = 0;
  const lastMessage = new Map<string, { at: number; data: unknown }>();
  const elapsed = (at = performance.now()) => Math.round((at - recordingStart) * 10) / 10;

  // Resolvers waiting for the next joint sample
  let jointSampleWaiters: Array<() => void> = [];
  const nextJointSample = () => new Promise<void>((resolve) => jointSampleWaiters.push(resolve));

  conn.on("message", (msg: Record<string, unknown>) => {
    const topic = msg.topic as string;
    if (msg.type === DataChannelType.MSG && stateTopics.includes(topic)) {
      const at = performance.now();
      lastMessage.set(topic, { at, data: msg.data });
      if (recording) streams[topic].push({ t: elapsed(at), data: msg.data });
      if (topic === RtcTopic.LOW_STATE) {
        const waiters = jointSampleWaiters;
        jointSampleWaiters = [];
        for (const resolve of waiters) resolve();
      }
    } else if (msg.type === DataChannelType.RESPONSE && recording) {
      events.push({ t: elapsed(), kind: "response", topic, data: msg.data });
      const header = (msg.data as ResponsePayload | undefined)?.header;
      const code = header?.status?.code;
      if (code !== undefined && code !== 0) {
        console.warn(`  Robot returned status ${code} for api_id ${header?.identity?.api_id}`);
      }
    }
  });

  /** Runs a send and, while recording, logs it on the timeline */
  const send = (name: string, fn: () => void) => {
    fn();
    if (recording) events.push({ t: elapsed(), kind: "sent", name });
  };

  const rl = CONFIRM ? readline.createInterface({ input: process.stdin, output: process.stdout }) : null;
  // Ctrl-C or end of input quits at the next prompt, so the robot still gets reset and disconnected
  rl?.on("SIGINT", () => rl.close());
  let inputOpen = rl !== null;
  const inputClosed = new Promise<null>((resolve) =>
    rl?.once("close", () => {
      inputOpen = false;
      resolve(null);
    }),
  );
  /** Resolves to the typed line, or null once input has closed */
  const ask = async (prompt: string): Promise<string | null> =>
    inputOpen ? Promise.race([rl!.question(prompt).catch(() => null), inputClosed]) : null;

  try {
    // Wait for data on every state topic before moving the robot
    for (const topic of stateTopics) conn.subscribe(topic);
    const deadline = Date.now() + STREAM_TIMEOUT_MS;
    while (Date.now() < deadline && !stateTopics.every((t) => lastMessage.has(t))) {
      await sleep(100);
    }
    const missingRequired = required.filter((t) => !lastMessage.has(t));
    if (missingRequired.length > 0) {
      throw new Error(
        `No data on ${missingRequired.join(", ")} within ${STREAM_TIMEOUT_MS}ms of subscribing. Nothing was recorded.`,
      );
    }
    for (const topic of optional.filter((t) => !lastMessage.has(t))) {
      console.warn(`Warning: no data on ${topic}; recordings will not include it.\n`);
    }

    // Record each command
    let quit = false;
    for (const cmd of commandsToRecord) {
      if (quit) break;
      const outFile = path.join(
        RECORDINGS_DIR,
        `${cmd.name.toLowerCase()}.json`,
      );

      if (COMMANDS_FILTER === "all" && fs.existsSync(outFile)) {
        console.log(`Skipping ${cmd.name} (already recorded)`);
        continue;
      }

      console.log(`Recording ${cmd.name} (estimated ${cmd.estimatedDurationMs}ms, ${REPEAT} run${REPEAT > 1 ? "s" : ""})...`);

      const result: CommandRecording = {
        robot: ROBOT_TYPE,
        command: cmd.name,
        estimatedDurationMs: cmd.estimatedDurationMs,
        motorCount,
        runs: [],
      };

      for (let run = 0; run < REPEAT; run++) {
        const offsetMs = Math.round((run * JOINT_SAMPLE_PERIOD_MS) / REPEAT);
        const label = REPEAT > 1 ? `Run ${run + 1}/${REPEAT} (offset ${offsetMs}ms)` : cmd.name;

        if (rl) {
          const answer = await ask(`  ${label}: reset the robot's position, then press Enter (q to quit) `);
          if (answer === null || answer.trim().toLowerCase() === "q") {
            quit = true;
            break;
          }
        }

        // Reset to standing position
        resetCommand(conn);
        await sleep(SETTLE_TIME);

        // Stagger the send against the joint samples
        await nextJointSample();
        await sleep(offsetMs);

        // Start recording, seeded with the latest message on each topic
        recordingStart = performance.now();
        streams = Object.fromEntries(
          stateTopics.map((t) => {
            const last = lastMessage.get(t);
            return [t, last ? [{ t: elapsed(last.at), data: last.data }] : []];
          }),
        );
        events = [];
        recording = true;

        // Trigger the command
        if (cmd.continuous) {
          // Continuous command: send repeatedly every 500ms, then stop
          const endTime = Date.now() + cmd.estimatedDurationMs;
          while (Date.now() < endTime) {
            send(cmd.name, () => cmd.trigger(conn));
            await sleep(500);
          }
          // Send StopMove for Go2, or zero joystick for G1
          if (ROBOT_TYPE === "go2") {
            send("StopMove", () => conn.sportCommand(SportCommand.StopMove));
          } else {
            send("JoystickZero", () => sendG1Joystick(conn, 0, 0, 0, 0));
          }
          await sleep(EXTRA_TIME);
        } else {
          send(cmd.name, () => cmd.trigger(conn));
          await sleep(cmd.estimatedDurationMs + EXTRA_TIME);
        }

        // Stop recording
        recording = false;
        const durationMs = Math.round(performance.now() - recordingStart);

        // The seeded pre-command message doesn't count as data from this run
        const recorded = (t: string) => streams[t].filter((m) => m.t >= 0).length;
        const missing = required.filter((t) => recorded(t) === 0);
        if (missing.length > 0) {
          throw new Error(
            `No data on ${missing.join(", ")} while recording ${label} of ${cmd.name}, so it was not saved. The stream stopped mid-run.`,
          );
        }

        result.runs.push({
          recordedAt: new Date().toISOString(),
          offsetMs,
          durationMs,
          streams,
          events,
        });
        fs.writeFileSync(outFile, JSON.stringify(result));

        const counts = stateTopics
          .map((t) => `${t} ${recorded(t)} (${Math.round(recorded(t) / (durationMs / 1000))} Hz)`)
          .join(", ");
        const responses = events.filter((e) => e.kind === "response").length;
        console.log(`  Saved ${ROBOT_TYPE}/${path.basename(outFile)}: ${counts}, ${responses} responses`);
      }
    }

    console.log(quit ? "\nStopped." : "\nAll recordings complete!");
    console.log(`Output directory: ${RECORDINGS_DIR}`);
  } finally {
    rl?.close();
    // Return to stand, including when a recording failed partway
    resetCommand(conn);
    await sleep(2000);
    await conn.disconnect();
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
