/** Go2 Pro sport command API IDs */
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
  SwitchGait = 1011,
  Trigger = 1012,
  BodyHeight = 1013,
  FootRaiseHeight = 1014,
  SpeedLevel = 1015,
  Hello = 1016,
  Stretch = 1017,
  TrajectoryFollow = 1018,
  ContinuousGait = 1019,
  Content = 1020,
  Wallow = 1021,
  Dance1 = 1022,
  Dance2 = 1023,
  FrontFlip = 1030,
  FrontJump = 1031,
  FrontPounce = 1032,
  WiggleHips = 1033,
  FingerHeart = 1036,
  StandOut = 1039,
  LeftFlip = 1042,
  RightFlip = 1043,
  BackFlip = 1044,
  Standup2 = 1050,
  CrossWalk = 1051,
  Handstand = 1301,
  CrossStep = 1302,
  OnesidedStep = 1303,
  Bound = 1304,
  MoonWalk = 1305,
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
  apiId: SportCommand;
  params?: Record<string, unknown>;
  duration_ms?: number;
}

export interface CommandSchema {
  apiId: SportCommand;
  name: string;
  description: string;
  params?: {
    [key: string]: {
      type: string;
      description: string;
      required?: boolean;
    };
  };
  estimatedDurationMs: number;
}
