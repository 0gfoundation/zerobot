export interface AIConfig {
  /** 0G Compute provider address (discovered automatically if not set) */
  providerAddress?: string;
  /** Model name to use for inference */
  model?: string;
}

export interface AICommandResult {
  command: string;
  params?: Record<string, unknown>;
  duration_ms?: number;
}
