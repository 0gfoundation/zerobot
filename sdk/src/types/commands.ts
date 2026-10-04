/** Go2 Pro sport command API IDs */
/**
 * Go2 sport API ids, as firmware 1.1.7+ accepts them (Unitree's sport_api.hpp).
 * Older ids for removed commands (WiggleHips, Wallow, ...) return status 3203.
 */
export enum SportCommand {
  Damp = 1001,
  BalanceStand = 1002,
  StopMove = 1003,
  StandUp = 1004,
  StandDown = 1005,
  RecoveryStand = 1006,
  Euler = 1007,
  Move = 1008,
  Sit = 1009,
  RiseSit = 1010,
  SpeedLevel = 1015,
  Hello = 1016,
  Stretch = 1017,
  ContinuousGait = 1019,
  Content = 1020,
  Dance1 = 1022,
  Dance2 = 1023,
  Scrape = 1029,
  FrontFlip = 1030,
  FrontJump = 1031,
  FrontPounce = 1032,
  FingerHeart = 1036,
  LeftFlip = 2041,
  BackFlip = 2043,
  Handstand = 2044,
  CrossStep = 2051,
}

/** VUI command API IDs (LED, volume, brightness) */
export enum VuiCommand {
  SetVolume = 1003,
  GetVolume = 1004,
  SetBrightness = 1005,
  GetBrightness = 1006,
  SetLedColor = 1007,
}

/** Motion switcher API IDs */
export enum MotionSwitcherCommand {
  GetMode = 1001,
  SetMode = 1002,
}

export interface CommandPayload {
  command: string;
  /**
   * Numeric command id. For Go2 this is a `SportCommand` enum value; for
   * other robot types it's an api id from a different range (e.g. G1 loco
   * `7101`). Typed as `number` so payloads can target any robot type.
   */
  apiId: number;
  params?: Record<string, unknown>;
  duration_ms?: number;
}

export interface CommandSchema {
  /**
   * Numeric command id sent over the wire. For Go2 this is a `SportCommand`
   * enum value; for G1 it's a loco/arm/etc. api id from a different range.
   * Typed as `number` so schemas can describe any robot type.
   */
  apiId: number;
  name: string;
  /** Short name for end users, e.g. "Wave hello". Falls back to `name`. */
  label?: string;
  /** Shown after the label wherever the move is listed, e.g. "Wave hello 👋". */
  emoji?: string;
  description: string;
  /**
   * Command that returns the robot to standing once this one finishes, e.g.
   * `RiseSit` after `Sit`. Operators send it straight after, so the next
   * command always starts from the same pose.
   */
  exitApiId?: number;
  params?: {
    [key: string]: {
      type: string;
      description: string;
      required?: boolean;
    };
  };
  /**
   * How long the move takes. For Go2 actions this is when the robot replies
   * to the command, which it does once the move is done. Hello, Stretch and
   * Sit are measured from 10-run recordings (Go2 Pro, firmware 1.1.15), the
   * rest are estimates.
   */
  estimatedDurationMs: number;
}
