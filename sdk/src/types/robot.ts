export interface RobotConfig {
  /** Robot IP address (e.g. "192.168.123.18") */
  ip: string;
  /** Optional auth token for multi-client connections */
  token?: string;
  /** Optional proxy URL for browser SDP exchange */
  signalingProxyUrl?: string;
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
