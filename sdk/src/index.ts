// Control plane — browser-bundle-safe surface for dApps issuing commands on-chain.
// Robot transport lives in "./robot", the operator bridge in "./operator", the
// test mock in "./mock". Those entries pull in Node-only code and must not be
// re-exported here, or this barrel stops being safe to bundle for the browser.

// Chain integration
export { ChainClient, ChainListener, toOnChainCommand } from "./chain/index.js";
export type { ChainListenerEvents } from "./chain/index.js";

// Wallet-library interop — consumers may pass `ChainConfig.walletClient`
// directly, or convert a viem WalletClient to an ethers Signer explicitly.
export { walletClientToSigner } from "./chain/adapter.js";

// Commands — origination + per-robot-type vocabulary
export {
  Commander,
  GO2_SPORT_SCHEMAS,
  SCHEMAS_BY_ROBOT_TYPE,
  getSchemasForRobotType,
  resolveMenu,
} from "./command/index.js";
export type {
  RobotMenu,
  RobotMenuItem,
  ResolvedMenuItem,
} from "./command/index.js";

// Recording playback — merges a command's recorded runs into one timeline
// and samples a pose from it, for animating a robot model
export { GO2_JOINT_NAMES, buildTimeline, samplePose } from "./recording/index.js";
export type {
  RecordingFile,
  JointSample,
  Timeline,
  Pose,
} from "./recording/index.js";

// AI integration (AIBroker requires a Node runtime + the optional
// @0glabs/0g-serving-broker peer dependency at call time)
export { AIBroker, buildSystemPrompt, parseLLMResponse } from "./ai/index.js";

// Types
export * from "./types/index.js";
