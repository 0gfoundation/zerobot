# Physics simulator mode (proposed)

**Status:** proposed, not scheduled. Revisit after the playback simulator is complete.
**Written:** 2026-10-04

## Context

The dashboard's simulator today is playback. `lib/playback.ts` replays Go2 motion recorded over WebRTC by `examples/record-commands.ts`, and `RobotViewer` animates the URDF model. There is no physics. That suits sport commands, because Unitree's firmware decides how the robot moves and we only show it.

Two things playback can't do:

1. **Motor-level control.** Commanding joint positions or torques needs a simulator that works out what happens next: balance, contact, slipping, falling.
2. **Walking at arbitrary speeds.** Joint state arrives at ~1 Hz over WebRTC, and steps aren't timed from the command, so recordings can't capture leg motion while walking. Phase-ordering samples from long walks and a generated gait are the playback-side options. A physics-based walking policy is a third.

## Goals and non-goals

Goals:
- Let developers run motor-level controllers against a simulated Go2 and watch the result in the dashboard.
- Use the same interface as a real EDU robot, so a controller that works in the simulator runs on an EDU unchanged.
- Optionally, drive physically plausible walking from `Move` velocities.

Non-goals:
- Motor-level control of real Go2 Pro or G1 Basic robots. Their WebRTC interface has no low-level commands, and that won't change.
- Putting motor commands on-chain. Low-level control loops run at ~500 Hz, far faster than any chain.
- Simulating Unitree's tricks (`Hello`, `Stretch`, ...). They live in proprietary firmware. Tricks keep coming from recordings.

## Background

[`unitree_mujoco`](https://github.com/unitreerobotics/unitree_mujoco) (BSD-3-Clause) is Unitree's MuJoCo simulator for Go2, Go2w, B2, B2w, H1, H2, G1 and AS2. Its README says the current version "only supports low-level development". It exposes the same DDS topics as a real EDU (`rt/lowcmd`, `rt/lowstate`, `rt/sportmodestate`), configured in `simulate/config.yaml` (C++) or `simulate_python/config.py` (Python) with `robot: "go2"`, `domain_id: 1` and `interface: "lo"`. User programs connect with `ChannelFactoryInitialize(1, "lo")` (`unitree_sdk2_python`) instead of `ChannelFactoryInitialize(0, <nic>)` for hardware. It has no WebRTC endpoint and no sport-mode controller.

[`unitree_rl_gym`](https://github.com/unitreerobotics/unitree_rl_gym) (BSD-3-Clause) trains locomotion policies for Go2, G1, H1 and H1_2, with sim-to-sim checks in MuJoCo. Policies export as PyTorch (`policy_1.pt`). It ships pretrained deployment policies for G1, H1 and H1_2 but not for Go2, so Go2 walking would need a policy trained ourselves (Isaac Gym, GPU).

## Design

Run `unitree_mujoco` natively and bridge its state to the dashboard. This is route 1 of two (route 2 is below).

```
controller (unitree_sdk2, domain 1, lo) ──rt/lowcmd──▶ unitree_mujoco (Python sim)
                                         ◀─rt/lowstate── │
                                                          │ rt/lowstate, rt/sportmodestate
                                                          ▼
                                             tools/sim-bridge (Python)
                                                          │ WebSocket, ~50 Hz JSON
                                                          ▼
                                   dashboard: "Physics sim" mode ─▶ RobotViewer.setPose
```

### `tools/sim-bridge`

A small Python process, a new non-pnpm directory, using `unitree_sdk2_python`:
- Subscribes to `rt/lowstate` and `rt/sportmodestate` on domain 1 over `lo`.
- Publishes frames over a WebSocket at ~50 Hz: `{ t, q: number[12], position: [x, y, z], quaternion: [x, y, z, w] }`. Joint order is lowstate `motor_state` order, which `GO2_JOINT_NAMES` in `lib/playback.ts` already maps to URDF joints. Quaternions convert from Unitree's `[w, x, y, z]` like `bodySamples` does.
- Optionally accepts `{ move: [vx, vy, vyaw] }` messages for the locomotion policy below.

Python rather than Node because there is no maintained Node binding for Unitree's DDS (CycloneDDS) messages.

### Dashboard

- `lib/stores/robot.svelte.ts` gains a third connection mode next to robot and dry run: physics sim, a WebSocket to the bridge (`ws://localhost:<port>`).
- Frames go straight to `RobotViewer.setPose`. Grounding in `setPose` must be skipped in this mode, because physics already resolves contact and a robot that falls over should be shown falling. Add a `ground: false` option to `RobotPose`.
- Sport commands in this mode: `Move` and `StopMove` go to the bridge if the locomotion policy is enabled. Every other sport command is rejected with a clear message, since the simulator has no firmware tricks.

### Optional: locomotion policy

The bridge runs a Go2 walking policy on CPU: read `rt/lowstate` and the `Move` velocity command, run the policy, publish `rt/lowcmd` at the policy's control rate. This gives physically plausible walking for playback's `Move` commands too, by recording simulated walks at any speed instead of real ones.

Cost: Go2 has no pretrained policy in `unitree_rl_gym`, so this needs a training run (Isaac Gym, NVIDIA GPU). The resulting gait won't match the real firmware's.

### Route 2, not chosen first: MuJoCo in the browser

A WebAssembly build of MuJoCo inside the dashboard needs no install and no bridge. It was not chosen first because we'd own the simulator integration (models, actuators, DDS-equivalent interface) instead of reusing Unitree's maintained one, the load is heavy, and controllers written against it would not run unchanged on an EDU. Revisit if install friction blocks adoption.

## On-chain integration

No contract changes. On-chain commands stay high-level intents (`run policy X`, `go to point P`) dispatched by `OperatorNode` as today. A controller running beside the robot, or beside the simulator, turns intents into motor commands. The physics simulator is where those controllers get developed and tested. A later design can add an `OperatorNode` transport that targets the bridge, so on-chain commands can drive the simulated robot end to end.

## Phases

1. **Viewer bridge.** `tools/sim-bridge` streams state, and the dashboard shows the simulated Go2 driven by any `unitree_sdk2` controller (e.g. Unitree's stand-up example). Small: no policy, no training.
2. **Sport-command routing.** `Move`/`StopMove` handled in physics mode, other commands rejected.
3. **Locomotion policy.** Train or source a Go2 policy, run it in the bridge. Largest phase, GPU required.
4. **G1.** Same bridge with `robot: "g1"`, once G1 playback exists. G1 EDU low-level control maps the same way.

## Open questions

- Does `unitree_mujoco`'s Python simulator run reliably on macOS (Apple silicon), including DDS over `lo`? The C++ build targets Linux.
- Is there a community Go2 policy under a usable license, to avoid training our own?
- Should the bridge live in this repo (`tools/sim-bridge`) or in a separate repo, given it adds a Python toolchain to a pnpm monorepo?
- Is the WebSocket at ~50 Hz smooth enough, or does the viewer need interpolation like playback?
