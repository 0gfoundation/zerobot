# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## What This Project Is

Zerobot is a platform for on-chain control of robots via the 0G blockchain. Robot operators run a local agent that watches the chain for commands and executes them on the robot via WebRTC. Anyone can send commands (direct or AI-generated) by calling the smart contracts.

Currently supports Unitree Go2 Pro. Designed for future extensibility to other robot types.

## SDK Status: Experimental

The SDK has not been published to npm. The only consumers today are workspace siblings (`apps/dashboard`, `examples/`) which can be updated in the same change as any SDK edit. **Breaking changes — renames, type tightening or loosening, file restructures, exported-symbol changes — are fine and expected when they produce cleaner designs.** Don't preserve API names or add deprecation shims for hypothetical external consumers; favour the shape the SDK will have post-release over a backward-compatible compromise of today's shape.

The corollary: the extensibility work going in *now* (per-robot-type schema registry, wallet-resolution union, subpath exports) exists specifically so that *future* extensions won't *need* breaking changes once the SDK is released. Pre-release shape changes are open game; post-release shape changes will need the normal deprecation discipline.

When the SDK is published to npm, remove or update this section.

## Repository Structure

pnpm monorepo with four workspaces:

- **`sdk/`** (`@0g-foundation/zerobot-sdk`) — TypeScript SDK: WebRTC robot control, chain interaction, AI command resolution
- **`contracts/`** (`@0g-foundation/zerobot-contracts`) — Solidity smart contracts (Hardhat): robot registry, command dispatcher with payments/receipts
- **`apps/dashboard/`** (`@0g-foundation/zerobot-dashboard`) — Next.js web app: the owners' dashboard, the public pay-to-move page and stage screen, and WebRTC robot control in local mode
- **`examples/`** (`@0g-foundation/zerobot-examples`) — CLI usage examples (run with `npx tsx`)

## Build & Test Commands

```bash
# Install all dependencies
pnpm install

# SDK
cd sdk
pnpm build              # tsc
pnpm test               # vitest run
pnpm test:watch         # vitest watch

# Contracts
cd contracts
pnpm compile            # hardhat compile
pnpm test               # hardhat test
pnpm deploy:testnet     # deploy both contracts behind new UUPS proxies
pnpm upgrade:testnet    # upgrade the proxies in .env to the compiled code (upgrade admin only)

# Dashboard
cd apps/dashboard
pnpm dev                # vite dev server
pnpm build              # production build

# Run a single SDK test file
cd sdk && npx vitest run test/robot/crypto.test.ts
```

**Build order matters:** SDK must be built before dashboard (dashboard imports from SDK's compiled output). Contracts are standalone.

## Architecture

### Command Execution Pipeline

```
User/Controller → Smart Contract (dispatchCommand) → CommandDispatched event
    → OperatorNode (watches chain) → Go2Connection (WebRTC) → Robot
    → OperatorNode submits execution receipt back on-chain
```

### SDK Public Entry Points

The SDK exposes four entry points (see `exports` in `sdk/package.json`), split along the chain / robot / bridge seam so the root entry stays safe to bundle for the browser:

- **`.` (root)** — control plane for dApps issuing commands on-chain: `ChainClient`, `ChainListener`, `Commander`, `AIBroker`, command schemas, all types. **Browser-bundle-safe** — no static `node:` imports.
- **`./robot`** — robot transport: `Go2Connection`, `Go2Signaling`, `Heartbeat`, command message builders, crypto, `DataChannelType`, `RtcTopic`. Browser-bundleable — `platform.ts` has no static `node:` imports; the WebRTC provider prefers native `RTCPeerConnection` at runtime, and falls back to `@roamhq/wrtc` (optional peer dep) loaded lazily via a dynamic import of `node:module` only in Node.
- **`./operator`** — `OperatorNode`, the chain↔robot bridge. Node-only.
- **`./mock`** — `startMockRobot`, an in-process mock Go2 server for dry-run/testing. Node-only (`node:http`).

**Seam invariant:** the root barrel (`sdk/src/index.ts`) must never import the `robot`/`operator`/`mock` barrels or any `node:`-importing module, even transitively — it imports `Commander` and the command schemas from `./command` *directly*, not via the `robot` or `controller`-style barrels. Re-exporting Node-only code from root would silently break browser bundling. When adding a module, classify its runtime, wire it to the right entry, and add any new public entry to the `exports` map.

### SDK Modules (`sdk/src/`)

- **`chain/`** — Ethers.js wrappers for RobotRegistry and RobotCommandDispatcher contracts. `ChainListener` polls the robot's command nonce and reads new commands by nonce. Log subscriptions delivered nothing on the Galileo public RPC. Isomorphic.
- **`recording/`** — playback of `examples/record-commands.ts` output: `buildTimeline` merges a command's staggered runs into one joint timeline, since joint state arrives at ~1 Hz over WebRTC, and `samplePose` reads a pose from it. Isomorphic.
- **`command/`** — command-abstraction layer: `Commander` (sends commands to chain) plus the per-robot-type command vocabulary in `command/schemas/` (`GO2_SPORT_SCHEMAS`, `SCHEMAS_BY_ROBOT_TYPE`, `getSchemasForRobotType`). Adding a new robot type = drop a `*_SCHEMAS` constant in `command/schemas/` and add one line to the registry. Isomorphic. Backs the root entry.
- **`robot/`** — WebRTC connection to Go2 Pro. Key flow: SDP signaling (with AES-ECB/RSA crypto) → data channel → MD5 validation handshake → 2s heartbeat. Commands are JSON over the data channel with double-serialized `parameter` field. Robot-protocol constants (`DataChannelType`, `RtcTopic`, AES keys) live in `robot/constants.ts`.
- **`operator/`** — `OperatorNode` orchestrates chain→robot (the only module that imports from both the chain and robot planes). Runs commands one at a time in nonce order, sends a schema's `exitApiId` after it (`RiseSit` after `Sit`), and rejects commands outside `allowedApiIds`. On start it recovers commands still pending from before a restart. Receipts are broadcast without waiting for the previous one to confirm, because the Galileo public RPC takes ~10s to return a receipt. It subscribes to the robot's `rt/lf/lowstate` (about 1 Hz, with battery) and treats 5s of silence or a closed channel as a lost link: it reconnects with backoff, the queue waits, and a command the drop interrupted runs again rather than failing. It reports `{ online, robotConnected, battery }` through a `StatusPublisher`, by default the registry's `reportStatus`, on every change and every 60s. That on-chain status is a stand-in until status moves to an off-chain network; pages read it only through `useRobotStatus`.
- **Menus** — `resolveMenu` joins a robot's public moves (`examples/menus/*.json`) with the command schemas, adding labels and emoji. The same JSON shape is meant to move into 0G Storage under the robot's `storageRoot`.
- **`ai/`** — Resolves natural language prompts to command sequences via 0G Compute (OpenAI-compatible API). System prompt is built dynamically from `GO2_SPORT_SCHEMAS` (currently Go2-only; will be parameterized by schemas when other robot types gain AI support). `AIBroker` is bundle-safe (dynamic import) but needs a Node runtime plus the optional `@0gfoundation/0g-compute-ts-sdk` peer dep at call time. Takes the same wallet-resolution union as `ChainConfig` (signer / walletClient / privateKey + rpcUrl).
- **`mock/`** — in-process mock Go2 server emulating the signaling, validation, and command-ack flow.

### Dashboard (`apps/dashboard/src/`)

- **Stack:** Next.js 16 (App Router, Turbopack), React 19, wagmi 3 + viem, Tailwind CSS 4, and the shared 0G site shell `@0gfoundation/0g-ui`, pinned to a release tag. Its `prepare` script needs the `allowBuilds` entry in `pnpm-workspace.yaml`. Its `pnpm-lock.yaml` entry must have a git resolution (`{commit, path: packages/0g-ui, repo, type: git}`). Since 0g-ui went public, pnpm resolves a repin to a codeload tarball without the `path`, and a fresh `--frozen-lockfile` install (Vercel) then unpacks the whole 0g-ui repo and the shell's imports fail. Check the lockfile after every repin.
- **Hosted vs local mode** — `ZEROBOT_MODE` (`hosted` on Vercel, `local` otherwise; see `next.config.ts`, read as `LOCAL_MODE` from `lib/mode.ts`). Hosted only talks to the chain. Local adds what needs the robot's network: direct control through `/api/negotiate` (the browser can't reach the robot's signaling cross-origin), the mock robot, and live recordings. Local-only API routes return 404 when hosted.
- **Routes:** `(site)/robots` is the owner page (register, activate, open to the public, set price, direct control in local mode), and `/` redirects there (`next.config.ts`). `(site)/robots/[name]` is the audience page the QR code opens, and `(site)/robots/[name]/console` the owner's live view and pause controls. `(stage)/robots/[name]/stage` is the full-screen venue screen. Pages are client components, so each route's tab title ("Larry console - Zerobot") comes from a small server `layout.tsx` beside it. `(site)/recordings` plays back `examples/record-commands.ts` output and follows new runs live, in local mode.
- **`lib/use-queue.ts`** polls a robot's nonce and commands; the nonce is the queue order. **`lib/use-robot-status.ts`** reads the operator's status report and counts it stale after 3 minutes; the stage shows offline or reconnecting from it, and the audience page only takes payment while the robot is online. **`lib/schedule.ts`** predicts when the operator runs each command, mirroring `OperatorNode`'s timing, so the stage animates in step with the robot instead of waiting for receipts, which land 4-5s after each move.
- **`lib/robots.ts`** — robot menus by name, imported from `examples/menus/`. `scripts/copy-recordings.mjs` copies `examples/recordings` (or `RECORDINGS_DIR`) into `public/recordings` before `dev` and `build`, for stage playback. Recording playback itself is the SDK's `buildTimeline` / `samplePose`.
- **`lib/networks.ts`** — Network definitions with per-network contract addresses. Adding a network = adding an entry here.
- **`lib/chain.ts`** — `readClient()` for reads without a wallet, `walletClient(wallet)` for writes with the connected wallet. The dashboard performs all on-chain operations through the SDK; there are no duplicate ABIs or contract wrappers in the dashboard.
- **Mock robot (dry run)** — `instrumentation.ts` starts one per server in local mode on `MOCK_ROBOT_PORT` (default 9991). To run a second dev server alongside the first: `MOCK_ROBOT_PORT=9992 RECORDINGS_DIR=<main checkout>/examples/recordings pnpm dev --port 3100`.
- **Click-outside handlers:** Use `pointerdown` (not `click` or `mousedown`) — it fires on both desktop and touch devices, where the others have inconsistent behavior across modalities.

### Smart Contracts

- **RobotRegistry** — Robot identity, owner/controller/operator permissions (table in `README.md`), command pricing. `msg.sender` becomes owner on registration (permissionless). `multicall` batches an owner's calls, e.g. register plus settings, into one transaction. `setPublicCommands` lets anyone dispatch to a robot, still paying its command price.
- **RobotCommandDispatcher** — Command queue with monotonic nonces, 5-minute expiry, payment enforcement, execution receipts. References Registry for authorization. Each command carries a free-text `note` (max 64 bytes), e.g. the sender's name. The nonce is the queue order.

- **Upgrades** — Both contracts are UUPS proxies (OpenZeppelin upgradeable, `Ownable2Step`). The addresses below are the proxies and never change. Upgrade with `pnpm upgrade:testnet` from the upgrade admin (`DEPLOYER_PRIVATE_KEY`). Rules for upgradeable code: keep `initialize` in place of a constructor, only append new state variables after the existing ones, and commit `contracts/.openzeppelin/`, the plugin's record of each deployment's storage layout, which it checks every upgrade against. To move to a multisig and timelock: deploy a `TimelockController` with the Safe as proposer, then `transferOwnership(timelock)` on both proxies, and accept it through the timelock.

## Robot Compatibility

- **Official Unitree SDK (`unitree_sdk2`) is EDU-only** — uses CycloneDDS over wired Ethernet. Go2 Pro and G1 Basic do not support it.
- **WebRTC is the only viable interface for Go2 Pro and G1 Basic** — the `webrtc_bridge` service runs on all variants and is the same pathway the official Unitree app uses.
- **What works via WebRTC (all variants):** High-level sport commands, video/audio, LiDAR, motion state, VUI, motion switcher.
- **What does NOT work via WebRTC (EDU-only):** Low-level joint control, SLAM/Navigation, ROS2, GST streaming.
- **Supported firmware:** 1.0.19 through 1.1.15. Firmware 1.1.8+ adds an AES-GCM encryption layer to SDP exchange, and 1.1.15+ needs the robot's per-device key (`RobotConfig.deviceKey`).
- **State rates over WebRTC** (Go2 Pro, firmware 1.1.15): `rt/lf/sportmodestate` ~20 Hz (body position, velocity, height, full IMU), `rt/utlidar/robot_pose` ~19 Hz, `rt/lf/lowstate` ~1 Hz with joint `q` only (no `dq`, IMU `rpy` only). `rt/lowstate` and `rt/sportmodestate` send nothing, so full-rate joint state isn't available over WebRTC.

### Go2 Pro Command Parameter Ranges

| Command | Parameter | Range |
|---------|-----------|-------|
| Move | vx (forward) | -2.5 to 3.8 m/s |
| Move | vy (lateral) | -1.0 to 1.0 m/s |
| Move | vyaw (rotation) | -4 to 4 rad/s |
| Euler | roll, pitch | -0.75 to 0.75 rad |
| Euler | yaw | -0.6 to 0.6 rad |
| SpeedLevel | level | -1 (slow), 0 (normal), 1 (fast) |

Move command is maintained for 1 second. Send `Move(0,0,0)` or `StopMove()` to halt.

### G1 Basic (future support)

G1 uses `LocoClient` (not `SportClient`) with different API IDs and topics (`rt/api/loco/request`). Movement via `rt/wirelesscontroller` with joystick format `{lx, ly, rx, ry, keys}`. Has arm action service at `rt/api/arm/request` with ~15 preset gestures. WebRTC connection infrastructure is shared.

## Key Technical Details

- **WebRTC crypto:** Robot requires AES-256-ECB and RSA PKCS1-V1.5 (not available in SubtleCrypto). SDK uses `node-forge` (pure JS, works in Node + browser).
- **`con_notify` encryption:** The robot's RSA public key arrives in `data1`, and `data2` says how it is protected: `1` plaintext, `2` AES-GCM under a hardcoded key (Go2 1.1.8–1.1.14, G1 < 1.5.1), `3` AES-GCM under a per-device AES-128 key (Go2 >= 1.1.15, G1 >= 1.5.1). The robot sends `data2` as a number. The per-device key is fixed per robot and served by Unitree's cloud to the account the robot is bound to (`device/bind/list`, `dev.key`). The community `unitree-fetch-aes-key` CLI from `legion1581/unitree_webrtc_connect` fetches it. Signaling only falls back to the legacy port 8081 method when 9991 is unreachable, so a key problem surfaces as its own error.
- **`@roamhq/wrtc`:** Only working Node.js WebRTC implementation. Optional peer dep — not needed in browser. `sdk/src/robot/platform.ts` loads it lazily via `createRequire` — both the `node:module` import and the `@roamhq/wrtc` specifier are assembled at runtime (string-concat) so browser bundlers leave them unresolved and the `./robot` entry stays bundleable. Adding a static `node:` import to any module reachable from `./robot` would re-break browser bundling — keep node-only loads dynamic.
- **Wallet-library interop:** Every SDK entry point that needs a wallet — `ChainConfig` for `ChainClient`/`Commander`, `AIConfig` for `AIBroker` — accepts the same union: an ethers `Signer`, a viem `WalletClient` (e.g. from wagmi), or a `privateKey` + `rpcUrl`. Resolution is centralized in `resolveSigner` (`sdk/src/chain/adapter.ts`); errors are context-prefixed (`"ChainConfig: ..."`, `"AIConfig: ..."`) so misconfigured callers see which entry point complained. The SDK uses ethers internally (required by `@0gfoundation/0g-compute-ts-sdk`), and viem is a **type-only** import — `walletClientToSigner` reads `account`/`chain`/`transport` structurally and never calls into viem at runtime, so viem stays an optional peer dep that is never bundled and is not required for ethers-only consumers. **Any new entry point that needs a wallet must route through `resolveSigner` rather than reimplement the union** — `AIBroker` was the lone exception and it caused real friction (see `499bcea`).
- **Contract ABIs:** Live only in `sdk/src/chain/abis.ts` (auto-generated from contract artifacts — header line says so; do not edit by hand). The dashboard consumes contracts via the SDK's `ChainClient`, so there is no second copy of the ABIs to keep in sync. When contract interfaces change: regenerate `sdk/src/chain/abis.ts`, then update the corresponding TypeScript wrappers in `sdk/src/chain/client.ts` (and add a `types/chain.ts` entry if a new struct is involved). Struct returns must use `tuple` with `components`. Drift between the ABI and the TS wrappers is a real bug class — see `80d8a67`.
- **SDK JSDoc:** Document **non-obvious semantics only** — things a consumer can't see from the TypeScript signature. Worth documenting: parameter units (wei, m/s, ms), encoding constraints (`bytes32` hex, JSON-stringified `parameters`), wait-or-not contracts on writes, required call order (`initialize()` before `resolvePrompt()`), idempotency, and the well-defined throw paths (e.g. `getRobot` reverts when missing). Skip generic descriptions that just restate the method name — TypeScript already conveys those, and they're the kind of doc that goes stale silently. When changing a public method's behavior or signature, update its JSDoc in the same edit; when adding a new public method with any of the above semantics, write the JSDoc as part of adding it.
- **Wallet error handling:** MetaMask errors can be plain objects `{code, message}` (not `Error` instances) or deeply nested via `cause`. `getFullErrorText()` in wallet store recursively extracts error text.

## Deployed Contracts (Galileo Testnet)

- Registry: `0x291162e93D7A80Eb8F738882a28a7a8A5FBA73bb`
- Dispatcher: `0x418bA7C231dac8Ef58b534BeE6adC50E703AA753`
- Chain ID: 16602, RPC: `https://evmrpc-testnet.0g.ai`
