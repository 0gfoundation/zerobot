import { SportCommand, type CommandSchema } from "../types/commands.js";

/** Command schemas for all supported sport commands */
export const COMMAND_SCHEMAS: CommandSchema[] = [
  { apiId: SportCommand.Damp, name: "Damp", description: "Zero-torque relaxed state (soft e-stop)", estimatedDurationMs: 500 },
  { apiId: SportCommand.BalanceStand, name: "BalanceStand", description: "Active balanced standing", estimatedDurationMs: 1000 },
  { apiId: SportCommand.StopMove, name: "StopMove", description: "Halt all movement", estimatedDurationMs: 500 },
  { apiId: SportCommand.StandUp, name: "StandUp", description: "Rise from lying position", estimatedDurationMs: 2000 },
  { apiId: SportCommand.StandDown, name: "StandDown", description: "Lower body / lie down", estimatedDurationMs: 2000 },
  { apiId: SportCommand.RecoveryStand, name: "RecoveryStand", description: "Recovery to standing after fall", estimatedDurationMs: 3000 },
  {
    apiId: SportCommand.Euler, name: "Euler", description: "Set body orientation (roll, pitch, yaw in radians)", estimatedDurationMs: 1000,
    params: {
      x: { type: "number", description: "Roll angle in radians", required: true },
      y: { type: "number", description: "Pitch angle in radians", required: true },
      z: { type: "number", description: "Yaw angle in radians", required: true },
    },
  },
  {
    apiId: SportCommand.Move, name: "Move", description: "Continuous velocity movement", estimatedDurationMs: 0,
    params: {
      x: { type: "number", description: "Forward/backward velocity (m/s, positive=forward)", required: true },
      y: { type: "number", description: "Left/right velocity (m/s, positive=left)", required: true },
      z: { type: "number", description: "Rotational velocity (rad/s, positive=counterclockwise)", required: true },
    },
  },
  { apiId: SportCommand.Sit, name: "Sit", description: "Sit from standing", estimatedDurationMs: 2000 },
  { apiId: SportCommand.RiseSit, name: "RiseSit", description: "Rise from sitting", estimatedDurationMs: 2000 },
  { apiId: SportCommand.SwitchGait, name: "SwitchGait", description: "Switch gait type", estimatedDurationMs: 500 },
  { apiId: SportCommand.Trigger, name: "Trigger", description: "Trigger action", estimatedDurationMs: 500 },
  {
    apiId: SportCommand.BodyHeight, name: "BodyHeight", description: "Set body height", estimatedDurationMs: 1000,
    params: { data: { type: "number", description: "Height value", required: true } },
  },
  {
    apiId: SportCommand.FootRaiseHeight, name: "FootRaiseHeight", description: "Set foot raise height", estimatedDurationMs: 1000,
    params: { data: { type: "number", description: "Height value", required: true } },
  },
  {
    apiId: SportCommand.SpeedLevel, name: "SpeedLevel", description: "Adjust movement speed level", estimatedDurationMs: 500,
    params: { data: { type: "number", description: "Speed level", required: true } },
  },
  { apiId: SportCommand.Hello, name: "Hello", description: "Wave greeting gesture", estimatedDurationMs: 3000 },
  { apiId: SportCommand.Stretch, name: "Stretch", description: "Stretching motion", estimatedDurationMs: 4000 },
  { apiId: SportCommand.TrajectoryFollow, name: "TrajectoryFollow", description: "Follow a trajectory", estimatedDurationMs: 0 },
  { apiId: SportCommand.ContinuousGait, name: "ContinuousGait", description: "Continuous gait mode", estimatedDurationMs: 500 },
  { apiId: SportCommand.Content, name: "Content", description: "Contentment gesture", estimatedDurationMs: 3000 },
  { apiId: SportCommand.Wallow, name: "Wallow", description: "Wallow animation", estimatedDurationMs: 4000 },
  { apiId: SportCommand.Dance1, name: "Dance1", description: "Dance routine 1", estimatedDurationMs: 8000 },
  { apiId: SportCommand.Dance2, name: "Dance2", description: "Dance routine 2", estimatedDurationMs: 8000 },
  { apiId: SportCommand.FrontFlip, name: "FrontFlip", description: "Front flip (ensure soft surface)", estimatedDurationMs: 3000 },
  { apiId: SportCommand.FrontJump, name: "FrontJump", description: "Jump forward", estimatedDurationMs: 2000 },
  { apiId: SportCommand.FrontPounce, name: "FrontPounce", description: "Pounce forward", estimatedDurationMs: 2000 },
  { apiId: SportCommand.WiggleHips, name: "WiggleHips", description: "Hip wiggle", estimatedDurationMs: 3000 },
  { apiId: SportCommand.FingerHeart, name: "FingerHeart", description: "Heart gesture with front paws", estimatedDurationMs: 3000 },
  {
    apiId: SportCommand.StandOut, name: "StandOut", description: "Stand out pose", estimatedDurationMs: 2000,
    params: { data: { type: "boolean", description: "Enable/disable", required: true } },
  },
  { apiId: SportCommand.LeftFlip, name: "LeftFlip", description: "Flip to the left (ensure soft surface)", estimatedDurationMs: 3000 },
  { apiId: SportCommand.RightFlip, name: "RightFlip", description: "Flip to the right (ensure soft surface)", estimatedDurationMs: 3000 },
  {
    apiId: SportCommand.BackFlip, name: "BackFlip", description: "Back flip (ensure soft surface)", estimatedDurationMs: 3000,
    params: { data: { type: "boolean", description: "Enable", required: true } },
  },
  { apiId: SportCommand.Standup2, name: "Standup2", description: "Alternative stand up", estimatedDurationMs: 2000 },
  { apiId: SportCommand.CrossWalk, name: "CrossWalk", description: "Cross-walking gait", estimatedDurationMs: 3000 },
  { apiId: SportCommand.Handstand, name: "Handstand", description: "Handstand (ensure soft surface)", estimatedDurationMs: 4000 },
  { apiId: SportCommand.CrossStep, name: "CrossStep", description: "Cross-stepping motion", estimatedDurationMs: 3000 },
  { apiId: SportCommand.OnesidedStep, name: "OnesidedStep", description: "One-sided stepping", estimatedDurationMs: 3000 },
  { apiId: SportCommand.Bound, name: "Bound", description: "Bounding gait", estimatedDurationMs: 3000 },
  { apiId: SportCommand.MoonWalk, name: "MoonWalk", description: "Moonwalk dance move", estimatedDurationMs: 5000 },
];

/** Lookup command schema by apiId */
export const COMMAND_SCHEMA_MAP = new Map(
  COMMAND_SCHEMAS.map((s) => [s.apiId, s]),
);

/** Lookup command schema by name */
export const COMMAND_NAME_MAP = new Map(
  COMMAND_SCHEMAS.map((s) => [s.name, s]),
);
