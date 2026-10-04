import { SportCommand, type CommandSchema } from "../../types/commands.js";

/** Sport-mode command schemas for the Unitree Go2 family (Pro, Air, Edu). */
export const GO2_SPORT_SCHEMAS: CommandSchema[] = [
  { apiId: SportCommand.Damp, name: "Damp", emoji: "💤", description: "Zero-torque relaxed state (soft e-stop)", estimatedDurationMs: 500 },
  { apiId: SportCommand.BalanceStand, name: "BalanceStand", emoji: "⚖️", description: "Active balanced standing", estimatedDurationMs: 1000 },
  { apiId: SportCommand.StopMove, name: "StopMove", emoji: "🛑", description: "Halt all movement", estimatedDurationMs: 500 },
  { apiId: SportCommand.StandUp, name: "StandUp", emoji: "🧍", description: "Rise from lying position", estimatedDurationMs: 2000 },
  { apiId: SportCommand.StandDown, name: "StandDown", label: "Lie down", emoji: "🛌", description: "Lower body / lie down", exitApiId: SportCommand.StandUp, estimatedDurationMs: 2000 },
  { apiId: SportCommand.RecoveryStand, name: "RecoveryStand", emoji: "🩹", description: "Recovery to standing after fall", estimatedDurationMs: 3000 },
  {
    apiId: SportCommand.Euler, name: "Euler", emoji: "📐", description: "Set body orientation (roll, pitch, yaw in radians)", estimatedDurationMs: 1000,
    params: {
      x: { type: "number", description: "Roll angle in radians", required: true },
      y: { type: "number", description: "Pitch angle in radians", required: true },
      z: { type: "number", description: "Yaw angle in radians", required: true },
    },
  },
  {
    apiId: SportCommand.Move, name: "Move", emoji: "🕹️", description: "Continuous velocity movement", estimatedDurationMs: 0,
    params: {
      x: { type: "number", description: "Forward/backward velocity (m/s, positive=forward)", required: true },
      y: { type: "number", description: "Left/right velocity (m/s, positive=left)", required: true },
      z: { type: "number", description: "Rotational velocity (rad/s, positive=counterclockwise)", required: true },
    },
  },
  { apiId: SportCommand.Sit, name: "Sit", label: "Sit", emoji: "🪑", description: "Sit from standing", exitApiId: SportCommand.RiseSit, estimatedDurationMs: 1200 },
  { apiId: SportCommand.RiseSit, name: "RiseSit", emoji: "⬆️", description: "Rise from sitting", estimatedDurationMs: 2000 },
  {
    apiId: SportCommand.SpeedLevel, name: "SpeedLevel", emoji: "⚡", description: "Adjust movement speed level", estimatedDurationMs: 500,
    params: { data: { type: "number", description: "Speed level", required: true } },
  },
  { apiId: SportCommand.Hello, name: "Hello", label: "Wave hello", emoji: "👋", description: "Wave greeting gesture", estimatedDurationMs: 4700 },
  { apiId: SportCommand.Stretch, name: "Stretch", label: "Stretch", emoji: "🙆", description: "Stretching motion", estimatedDurationMs: 3900 },
  { apiId: SportCommand.ContinuousGait, name: "ContinuousGait", emoji: "🔁", description: "Continuous gait mode", estimatedDurationMs: 500 },
  { apiId: SportCommand.Content, name: "Content", emoji: "😌", description: "Contentment gesture", estimatedDurationMs: 4500 },
  { apiId: SportCommand.Dance1, name: "Dance1", emoji: "🕺", description: "Dance routine 1", estimatedDurationMs: 17300 },
  { apiId: SportCommand.Dance2, name: "Dance2", emoji: "🪩", description: "Dance routine 2", estimatedDurationMs: 37100 },
  { apiId: SportCommand.Scrape, name: "Scrape", emoji: "🙇", description: "Bow, scraping the front paws (Unitree's New Year greeting)", estimatedDurationMs: 3000 },
  { apiId: SportCommand.FrontFlip, name: "FrontFlip", emoji: "🤸", description: "Front flip (ensure soft surface)", estimatedDurationMs: 3000 },
  { apiId: SportCommand.FrontJump, name: "FrontJump", emoji: "🦘", description: "Jump forward", estimatedDurationMs: 2000 },
  { apiId: SportCommand.FrontPounce, name: "FrontPounce", emoji: "🐆", description: "Pounce forward", estimatedDurationMs: 2000 },
  { apiId: SportCommand.FingerHeart, name: "FingerHeart", emoji: "❤️", description: "Heart gesture with front paws", estimatedDurationMs: 6000 },
  { apiId: SportCommand.LeftFlip, name: "LeftFlip", emoji: "↩️", description: "Flip to the left (ensure soft surface)", estimatedDurationMs: 3000 },
  {
    apiId: SportCommand.BackFlip, name: "BackFlip", emoji: "🔄", description: "Back flip (ensure soft surface)", estimatedDurationMs: 3000,
    params: { data: { type: "boolean", description: "Enable", required: true } },
  },
  { apiId: SportCommand.Handstand, name: "Handstand", emoji: "🙃", description: "Handstand (ensure soft surface)", estimatedDurationMs: 4000 },
  { apiId: SportCommand.CrossStep, name: "CrossStep", emoji: "👣", description: "Cross-stepping motion", estimatedDurationMs: 3000 },
];
