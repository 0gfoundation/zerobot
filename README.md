# Zerobot

**On-chain robot control on 0G.** Anyone can send commands to a registered robot by calling a smart contract; the robot's owner runs a local agent that watches the chain and executes those commands over WebRTC. Commands can come from a person, an AI (via 0G Compute), or any program with a wallet.

> **Status:** Early-stage, testnet only ([0G Galileo](https://chainscan-galileo.0g.ai)). Currently controls Unitree Go2 Pro; G1 Basic support in progress. Expect API changes.

## How it works

```
  Sender ─── dispatchCommand() ──►  RobotCommandDispatcher  ──► event
  (wallet)                            (on 0G chain)              │
                                                                 ▼
                                                          OperatorNode
                                                          (Node-side bridge)
                                                                 │
                                                                 ▼
                                                          Robot over WebRTC
                                                                 │
                                                        submitReceipt() ◄┘
```

Two contracts (`RobotRegistry`, `RobotCommandDispatcher`) handle robot identity, owner/controller permissions, the command queue, and payments. The SDK provides everything off-chain.

## Try the dashboard

```bash
pnpm install
pnpm --filter @0g-foundation/zerobot-sdk build
pnpm --filter @0g-foundation/zerobot-dashboard dev
```

Open `http://localhost:5173`, connect a wallet on the **0G Galileo Testnet**, and register a robot. You can run against a real Go2 Pro on your local network or use the built-in mock (dry-run mode).

## Build with the SDK

```ts
import { Commander, SportCommand } from '@0g-foundation/zerobot-sdk';

// Accepts a viem WalletClient, an ethers Signer, or a privateKey + rpcUrl.
const commander = new Commander({
  rpcUrl: 'https://evmrpc-testnet.0g.ai',
  registryAddress: '0x2312cE812E35a9cBb65Fa692e566Df4C61D9Ba74',
  dispatcherAddress: '0xddc4C76Ea5bE99EC754a8de3FC470364aa29c0b8',
  walletClient,  // from wagmi / viem
});

await commander.sendCommand(robotId, {
  command: 'Hello',
  apiId: SportCommand.Hello,
});
```

The SDK has four entry points:

- **`@0g-foundation/zerobot-sdk`** — chain, commands, AI (browser-bundleable)
- **`@0g-foundation/zerobot-sdk/robot`** — WebRTC robot transport (browser or Node)
- **`@0g-foundation/zerobot-sdk/operator`** — `OperatorNode`, the chain↔robot bridge
- **`@0g-foundation/zerobot-sdk/mock`** — in-process mock robot for testing (Node)

Runnable end-to-end scripts in [`examples/`](./examples), including the operator-node side and AI-driven command resolution via 0G Compute.

## API surface

For browsing without an IDE. Method semantics — parameter units, throw conditions, wait-or-not contracts — live in JSDoc, surfaced via IntelliSense after `import`.

**`@0g-foundation/zerobot-sdk`** (root)
- **`ChainClient`** — `registerRobot` · `updateRobot` · `addController` · `removeController` · `setCommandPrice` · `dispatchCommand` · `dispatchBatch` · `submitReceipt` · `withdrawBalance` · `getRobotNonce` · `getCommand` · `isAuthorized` · `getRobot` · `getCommandPrice` · `listRobotsByOwner`
- **`Commander`** — `sendCommand` · `sendBatch`
- **`ChainListener`** — `start` · `stop`; events: `command`, `error`
- **`AIBroker`** — `initialize` · `resolvePrompt`
- Per-robot-type command vocabulary: `GO2_SPORT_SCHEMAS`, `SCHEMAS_BY_ROBOT_TYPE`, `getSchemasForRobotType(robotType)`
- Other helpers: `walletClientToSigner`, `buildSystemPrompt`, `parseLLMResponse`

Listing the commands available for a particular robot is a one-liner composing two primitives — no dedicated method needed on `Commander`:

```ts
const robot = await chainClient.getRobot(robotId);
const schemas = getSchemasForRobotType(robot.robotType); // [] for unknown types
```

**`@0g-foundation/zerobot-sdk/robot`**
- **`Go2Connection`** — `connect` · `disconnect` · `sportCommand` · `vuiCommand` · `motionSwitcherCommand` · `subscribe` · `unsubscribe` · `setVideo` · `setAudio` · `sendMessage`; events: `connected`, `disconnected`, `error`, `message`, `status`
- **`Go2Signaling`** — `negotiate`
- **`Heartbeat`** — `start` · `stop`
- Enums: `DataChannelType`, `RtcTopic`. Message builders: `buildSportCommandMessage` and siblings (vui / motionSwitcher / subscribe / unsubscribe / videoToggle / audioToggle). Crypto helpers: `generateAesKey`, `aesEcbEncrypt`/`Decrypt`, `aesGcmDecrypt`, `rsaEncrypt`, `computeValidationResponse`.

**`@0g-foundation/zerobot-sdk/operator`**
- **`OperatorNode`** — `start` · `stop`; events: `started`, `stopped`, `commandReceived`, `commandExecuted`, `error`

**`@0g-foundation/zerobot-sdk/mock`**
- `startMockRobot(port?: number)`

## Project structure

```
sdk/              TypeScript SDK (@0g-foundation/zerobot-sdk)
contracts/        Solidity smart contracts (Hardhat)
apps/dashboard/   SvelteKit web UI
examples/         CLI examples (npx tsx)
```

## Development

```bash
pnpm install
pnpm --filter @0g-foundation/zerobot-sdk build       # tsc
pnpm --filter @0g-foundation/zerobot-sdk test        # vitest
pnpm --filter @0g-foundation/zerobot-contracts compile
pnpm --filter @0g-foundation/zerobot-dashboard dev
```

The dashboard imports the SDK's compiled output — rebuild the SDK after chain-layer changes. For architecture and key technical details, see [AGENTS.md](./AGENTS.md).

## License

Apache 2.0 — see [LICENSE](./LICENSE).
