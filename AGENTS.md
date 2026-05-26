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
- **`apps/dashboard/`** (`@0g-foundation/zerobot-dashboard`) — SvelteKit 2 web UI: wallet connection, robot registration, WebRTC robot control
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
pnpm deploy:testnet     # hardhat run scripts/deploy.ts --network galileo

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

- **`chain/`** — Ethers.js wrappers for RobotRegistry and RobotCommandDispatcher contracts. `ChainListener` watches for events via subscription with polling fallback. Isomorphic.
- **`command/`** — command-abstraction layer: `Commander` (sends commands to chain) plus the command vocabulary (`COMMAND_SCHEMAS`, `COMMAND_SCHEMA_MAP`, `COMMAND_NAME_MAP`). Isomorphic. Backs the root entry.
- **`robot/`** — WebRTC connection to Go2 Pro. Key flow: SDP signaling (with AES-ECB/RSA crypto) → data channel → MD5 validation handshake → 2s heartbeat. Commands are JSON over the data channel with double-serialized `parameter` field. Robot-protocol constants (`DataChannelType`, `RtcTopic`, AES keys) live in `robot/constants.ts`.
- **`operator/`** — `OperatorNode` orchestrates chain→robot (the only module that imports from both the chain and robot planes).
- **`ai/`** — Resolves natural language prompts to command sequences via 0G Compute (OpenAI-compatible API). System prompt is built dynamically from `COMMAND_SCHEMAS`. `AIBroker` is bundle-safe (dynamic import) but needs a Node runtime plus the optional `@0glabs/0g-serving-broker` peer dep at call time. Takes the same wallet-resolution union as `ChainConfig` (signer / walletClient / privateKey + rpcUrl).
- **`mock/`** — in-process mock Go2 server emulating the signaling, validation, and command-ack flow.

### Dashboard (`apps/dashboard/src/`)

- **Stack:** Svelte 5 (runes: `$state`, `$derived`, `$effect`), SvelteKit 2, Tailwind CSS 4 (`@tailwindcss/vite`), Wagmi Core v3 + viem
- **`lib/stores/`** — Class-based reactive state: `wallet.svelte.ts` (wagmi wallet), `robot.svelte.ts` (WebRTC connection), `network.svelte.ts` (chain selection)
- **`lib/networks.ts`** — Network definitions with per-network contract addresses. Adding a network = adding an entry here.
- **`routes/api/negotiate/`** — SvelteKit server endpoint proxying SDP exchange to robot (browser can't reach robot directly due to CORS)
- **`lib/chain.ts`** — `getChainClient()` factory: builds a fresh `ChainClient` from the current wagmi `walletClient` + active network on each call. The dashboard performs all on-chain operations through the SDK; there are no duplicate ABIs or contract wrappers in the dashboard.

### Smart Contracts

- **RobotRegistry** — Robot identity, owner/controller permissions, command pricing. `msg.sender` becomes owner on registration (permissionless, no admin).
- **RobotCommandDispatcher** — Command queue with monotonic nonces, 5-minute expiry, payment enforcement, execution receipts. References Registry for authorization.

## Robot Compatibility

- **Official Unitree SDK (`unitree_sdk2`) is EDU-only** — uses CycloneDDS over wired Ethernet. Go2 Pro and G1 Basic do not support it.
- **WebRTC is the only viable interface for Go2 Pro and G1 Basic** — the `webrtc_bridge` service runs on all variants and is the same pathway the official Unitree app uses.
- **What works via WebRTC (all variants):** High-level sport commands, video/audio, LiDAR, motion state, VUI, motion switcher.
- **What does NOT work via WebRTC (EDU-only):** Low-level joint control, SLAM/Navigation, ROS2, GST streaming.
- **Supported firmware:** 1.0.19 through 1.1.14. Firmware 1.1.8+ adds AES-GCM encryption layer to SDP exchange.

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
- **Firmware >=1.1.8:** `con_notify` response is AES-GCM encrypted with a hardcoded key before the RSA public key can be extracted.
- **`@roamhq/wrtc`:** Only working Node.js WebRTC implementation. Optional peer dep — not needed in browser. `sdk/src/robot/platform.ts` loads it lazily via `createRequire` — both the `node:module` import and the `@roamhq/wrtc` specifier are assembled at runtime (string-concat) so browser bundlers leave them unresolved and the `./robot` entry stays bundleable. Adding a static `node:` import to any module reachable from `./robot` would re-break browser bundling — keep node-only loads dynamic.
- **Wallet-library interop:** Every SDK entry point that needs a wallet — `ChainConfig` for `ChainClient`/`Commander`, `AIConfig` for `AIBroker` — accepts the same union: an ethers `Signer`, a viem `WalletClient` (e.g. from wagmi), or a `privateKey` + `rpcUrl`. Resolution is centralized in `resolveSigner` (`sdk/src/chain/adapter.ts`); errors are context-prefixed (`"ChainConfig: ..."`, `"AIConfig: ..."`) so misconfigured callers see which entry point complained. The SDK uses ethers internally (required by `@0glabs/0g-serving-broker`), and viem is a **type-only** import — `walletClientToSigner` reads `account`/`chain`/`transport` structurally and never calls into viem at runtime, so viem stays an optional peer dep that is never bundled and is not required for ethers-only consumers.
- **Contract ABIs:** Live only in `sdk/src/chain/abis.ts` (auto-generated from contract artifacts — header line says so; do not edit by hand). The dashboard consumes contracts via the SDK's `ChainClient`, so there is no second copy of the ABIs to keep in sync. When contract interfaces change: regenerate `sdk/src/chain/abis.ts`, then update the corresponding TypeScript wrappers in `sdk/src/chain/client.ts` (and add a `types/chain.ts` entry if a new struct is involved). Struct returns must use `tuple` with `components`.
- **Wallet error handling:** MetaMask errors can be plain objects `{code, message}` (not `Error` instances) or deeply nested via `cause`. `getFullErrorText()` in wallet store recursively extracts error text.

## Deployed Contracts (Galileo Testnet)

- Registry: `0x2312cE812E35a9cBb65Fa692e566Df4C61D9Ba74`
- Dispatcher: `0xddc4C76Ea5bE99EC754a8de3FC470364aa29c0b8`
- Chain ID: 16602, RPC: `https://evmrpc-testnet.0g.ai`
