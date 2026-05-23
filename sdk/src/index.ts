// Control plane — browser-bundle-safe surface for dApps issuing commands on-chain.
// Robot transport lives in "./robot", the operator bridge in "./operator", the
// test mock in "./mock". Those entries pull in Node-only code and must not be
// re-exported here, or this barrel stops being safe to bundle for the browser.

// Chain integration
export { ChainClient, ChainListener } from "./chain/index.js";
export type { ChainListenerEvents } from "./chain/index.js";

// Wallet-library interop — consumers may pass `ChainConfig.walletClient`
// directly, or convert a viem WalletClient to an ethers Signer explicitly.
export { walletClientToSigner } from "./chain/adapter.js";

// Commands — origination + vocabulary
export {
  Commander,
  COMMAND_SCHEMAS,
  COMMAND_SCHEMA_MAP,
  COMMAND_NAME_MAP,
} from "./command/index.js";

// AI integration (AIBroker requires a Node runtime + the optional
// @0glabs/0g-serving-broker peer dependency at call time)
export { AIBroker, buildSystemPrompt, parseLLMResponse } from "./ai/index.js";

// Types
export * from "./types/index.js";
