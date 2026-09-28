export interface RobotConfig {
  /** Robot IP address (e.g. "192.168.123.18") */
  ip: string;
  /** Optional auth token for multi-client connections */
  token?: string;
  /** Optional proxy URL for browser SDP exchange */
  signalingProxyUrl?: string;
  /**
   * Per-device AES-128 key, 32 hex chars. Required by firmware that protects
   * signaling with a per-device key (Go2 >= 1.1.15, G1 >= 1.5.1) and ignored
   * by older firmware. Unitree serves it from the account the robot is bound
   * to. With `signalingProxyUrl`, it is sent to the proxy in the request body.
   */
  deviceKey?: string;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "validating"
  | "connected"
  | "error";

export interface RobotState {
  status: ConnectionStatus;
  lastHeartbeat?: number;
}
