# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## What This Project Is

Zerobot is a platform for on-chain control of robots via the 0G blockchain. Robot operators run a local agent that watches the chain for commands and executes them on the robot via WebRTC. Anyone can send commands (direct or AI-generated) by calling the smart contracts.

Currently supports Unitree Go2 Pro. Designed for future extensibility to other robot types.

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

### SDK Modules (`sdk/src/`)

- **`robot/`** — WebRTC connection to Go2 Pro. Key flow: SDP signaling (with AES-ECB/RSA crypto) → data channel → MD5 validation handshake → 2s heartbeat. Commands are JSON over the data channel with double-serialized `parameter` field.
- **`chain/`** — Ethers.js wrappers for RobotRegistry and RobotCommandDispatcher contracts. `ChainListener` watches for events via subscription with polling fallback.
- **`ai/`** — Resolves natural language prompts to command sequences via 0G Compute (OpenAI-compatible API). System prompt is built dynamically from `COMMAND_SCHEMAS`.
- **`controller/`** — `OperatorNode` orchestrates chain→robot. `Commander` sends commands to chain.

### Dashboard (`apps/dashboard/src/`)

- **Stack:** Svelte 5 (runes: `$state`, `$derived`, `$effect`), SvelteKit 2, Tailwind CSS 4 (`@tailwindcss/vite`), Wagmi Core v3 + viem
- **`lib/stores/`** — Class-based reactive state: `wallet.svelte.ts` (wagmi wallet), `robot.svelte.ts` (WebRTC connection), `network.svelte.ts` (chain selection)
- **`lib/networks.ts`** — Network definitions with per-network contract addresses. Adding a network = adding an entry here.
- **`routes/api/negotiate/`** — SvelteKit server endpoint proxying SDP exchange to robot (browser can't reach robot directly due to CORS)
- **`lib/contracts/abis.ts`** — Hand-maintained ABIs. `getRobot` returns a struct (ABI `tuple` with `components`), not flat outputs.

### Smart Contracts

- **RobotRegistry** — Robot identity, owner/controller permissions, command pricing. `msg.sender` becomes owner on registration (permissionless, no admin).
- **RobotCommandDispatcher** — Command queue with monotonic nonces, 5-minute expiry, payment enforcement, execution receipts. References Registry for authorization.

## Key Technical Details

- **WebRTC crypto:** Robot requires AES-256-ECB and RSA PKCS1-V1.5 (not available in SubtleCrypto). SDK uses `node-forge` (pure JS, works in Node + browser).
- **Firmware >=1.1.8:** `con_notify` response is AES-GCM encrypted with a hardcoded key before the RSA public key can be extracted.
- **`@roamhq/wrtc`:** Only working Node.js WebRTC implementation. Optional peer dep — not needed in browser.
- **Contract ABIs in dashboard:** Hand-written in `abis.ts`, not auto-generated. When contract interfaces change, update manually. Struct returns must use `tuple` with `components`.
- **Wallet error handling:** MetaMask errors can be plain objects `{code, message}` (not `Error` instances) or deeply nested via `cause`. `getFullErrorText()` in wallet store recursively extracts error text.

## Deployed Contracts (Galileo Testnet)

- Registry: `0x005E35a7bFcc98d2036EeBba1B5cC02E8d5523DC`
- Dispatcher: `0x049d7D31E95a7BEdE2ce7D71E32fa0eA8819c0c3`
- Chain ID: 16602, RPC: `https://evmrpc-testnet.0g.ai`
