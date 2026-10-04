# Robot drivers (proposed)

**Status:** proposed, not scheduled. Do it before the SDK's first npm release, while breaking changes are free.
**Written:** 2026-10-04

## Context

`OperatorNode` (`sdk/src/operator/node.ts`) is meant to run any robot, but it is written for the Go2:

- It constructs `Go2Connection` directly and runs commands with `sportCommandAndWait`, so a step is done when Unitree's sport service replies.
- It reads durations and exit moves only from `GO2_SPORT_SCHEMAS` (`SCHEMA_BY_API_ID`).
- It special-cases `SportCommand.Move`, which the Go2 holds for about a second, by resending it every 500ms and ending with `StopMove`.
- It learns the robot is alive, and its battery level, from Unitree's `rt/lf/lowstate` topic and its `bms_state.soc` field.

Most of the operator is not robot-specific, and that part has grown: nonce-ordered queueing, the move allowlist, expiry, recovering pending commands after a restart, receipts, status reporting, reconnecting with backoff while the queue waits, and resuming an interrupted command at the first step the robot didn't finish (#18, #21). Adding a G1, or any non-Unitree robot, today means editing that logic for each robot.

## Goals and non-goals

Goals:
- One `OperatorNode` that runs any robot through a driver, with the queue, retries, reconnects, status and receipts written once.
- Adding a robot family means writing a driver and its command schemas, nothing in the operator.
- Keep the guarantees #18 and #21 established: a lost link pauses the queue, a step counts as done only when the robot confirms it, and a retry resumes at the first unfinished step.

Non-goals:
- A universal command vocabulary. Each robot type keeps its own schemas (`SCHEMAS_BY_ROBOT_TYPE`), and the on-chain command stays an opaque `apiId` plus JSON `parameters` that only the robot type's driver interprets.
- Drivers for robots we haven't measured. The interface should fit a G1 and a ROS 2 robot on paper; implementations come when there's hardware to test against.
- Moving the dashboard's direct control onto drivers. It's a local developer tool and can follow later.

## Design

### The interface

```ts
/** One unit of work the robot confirms on its own, e.g. Sit, then RiseSit */
interface RobotStep {
  apiId: number;
  params?: Record<string, unknown>;
  /** Fallback when the robot never confirms, in ms */
  timeoutMs: number;
}

interface RobotDriver extends EventEmitter<{
  /** Any sign of life from the robot: a state message, a reply */
  alive: () => void;
  /** Battery charge 0-100 */
  battery: (percent: number) => void;
  /** The transport says the link is gone (channel closed, socket error) */
  lost: (reason: string) => void;
}> {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** The steps a command runs as, in order. A plain move is one step. */
  plan(apiId: number, params?: Record<string, unknown>): RobotStep[];
  /**
   * Resolve when the robot confirms the step is done. Throw `RobotLinkLost`
   * if the link drops first, or `RobotRefused` if the robot rejects it.
   * Resolve `"unconfirmed"` if the timeout passes with the link still alive.
   */
  runStep(step: RobotStep): Promise<"done" | "unconfirmed">;
}
```

`OperatorNode` takes a driver instead of a `RobotConfig`:

```ts
new OperatorNode(new Go2Driver(robotConfig), chainConfig, robotId, options);
```

### What moves where

| Today in `OperatorNode` | Moves to |
|---|---|
| `new Go2Connection`, WebRTC signaling | `Go2Driver.connect` |
| `sportCommandAndWait` and reply codes | `Go2Driver.runStep` |
| Exit moves from `GO2_SPORT_SCHEMAS` (Sit → RiseSit) | `Go2Driver.plan`, from the schema's `exitApiId` |
| `Move` with `duration_ms`: resend every 500ms, then `StopMove` | `Go2Driver.runStep` for a Move step |
| `rt/lf/lowstate` subscription and `bms_state.soc` | `Go2Driver`, emitting `alive` and `battery` |
| Queue, allowlist, expiry, recovery, receipts | stays in `OperatorNode` |
| Silence watchdog, reconnect with backoff, queue pause | stays, driven by `alive` and `lost` |
| Resume at the first unfinished step (`stepsDone`) | stays, over `plan()`'s steps |
| Status reporting (`StatusPublisher`) | stays, fed by `battery` and the link state |

The silence check stays generic because every driver reports `alive`. A robot without a steady state stream sends its own keep-alive and emits `alive` on the reply, or the driver lowers the watchdog's expectation through an option. That's for the driver to decide, not the operator.

### Picking a driver

The registry stores each robot's `robotType` (`go2_pro`, `g1`, ...). A driver registry mirrors the schema registry:

```ts
const DRIVERS_BY_ROBOT_TYPE: Record<string, (config: RobotConfig) => RobotDriver> = {
  go2_pro: (c) => new Go2Driver(c),
  go2_air: (c) => new Go2Driver(c),
  go2_edu: (c) => new Go2Driver(c),
};
```

The operator example would read the robot's type from the chain and pick the driver, so one command line runs any robot. `RobotConfig` becomes per driver: Go2 needs an IP and a device key, a ROS 2 robot needs a bridge URL.

### Where it lives

- `sdk/src/robot/go2/`: `Go2Connection` and the rest of today's `robot/` module, plus `Go2Driver`. `./robot` keeps exporting them, and stays browser-bundleable.
- `sdk/src/robot/driver.ts`: the `RobotDriver` interface, `RobotStep`, `RobotLinkLost` and `RobotRefused`. Isomorphic, exported from the root.
- `sdk/src/operator/`: unchanged in shape, minus everything in the "moves" rows above.

### Fit with other robots

- **Unitree G1 Basic.** Same WebRTC transport and signaling as the Go2, different API (`LocoClient` ids on `rt/api/loco/request`, arm actions on `rt/api/arm/request`, joystick on `rt/wirelesscontroller`). A `G1Driver` can share the transport with `Go2Driver` and differ in `plan` and `runStep`. Whether its replies mean "done" the way the Go2's do needs measuring, the same way the Go2's reply timing was measured from recordings.
- **A ROS 2 robot from another vendor.** The driver talks to a rosbridge WebSocket or a small local bridge. A step is an action goal, and an action's result is a natural "done". Liveness can come from any state topic, and battery from `sensor_msgs/BatteryState`.
- **A robot with no completion signal.** `runStep` waits the schema's duration and resolves `"unconfirmed"`, and the operator receipts it as it does today for a missed reply on a live link. Such a driver should say so in its docs, since its retries are weaker.

## Dashboard

The display side is already split by robot type but assumes Unitree models:

- `RobotViewer` has per-type configs (`go2`, `g1`) with URDF paths and stand poses.
- Recording playback (`sdk/src/recording/playback.ts`) maps Go2 `motor_state` to `GO2_JOINT_NAMES`.

A new robot needs its model, its joint mapping and its recordings. A small per-type "display profile" next to the driver registry would cover that. It's a smaller job than the operator and can follow it.

## Phases

1. Define `RobotDriver` and move the Go2 code into `Go2Driver`, with no behaviour change. The mock robot, the reconnect test (#18) and the resume test (#21) must pass unchanged.
2. Pick the driver from the robot's on-chain type in `examples/operator-node.ts`.
3. Write `G1Driver` once a G1 is available to measure against.
4. Add display profiles to the dashboard when the first non-Go2 robot goes on stage.

## Open questions

- Should `plan` be driver-only, or can a robot's menu add steps, e.g. an owner-defined sequence of moves sold as one item?
- Should drivers report more than battery in status (temperature, errors such as the Go2's `error_code`), and in what shared shape?
- Does the operator need a per-step settle time from the driver, rather than one `settleMs` for every robot?
