import type { CommandSchema } from "../../types/commands.js";
import { GO2_SPORT_SCHEMAS } from "./go2.js";

export { GO2_SPORT_SCHEMAS } from "./go2.js";

/**
 * Map of robot type → available command schemas. The Go2 family (Pro, Air,
 * Edu) shares the sport-mode command set. Other robot types (e.g. G1) get
 * their own entries when their schemas are validated.
 *
 * Mutable: consumers supporting additional robot types can register
 * schemas here before calling `getSchemasForRobotType`:
 *
 * ```ts
 * import { SCHEMAS_BY_ROBOT_TYPE } from "@0g-foundation/zerobot-sdk";
 * SCHEMAS_BY_ROBOT_TYPE.my_robot = [...];
 * ```
 */
export const SCHEMAS_BY_ROBOT_TYPE: Record<string, CommandSchema[]> = {
  go2_pro: GO2_SPORT_SCHEMAS,
  go2_air: GO2_SPORT_SCHEMAS,
  go2_edu: GO2_SPORT_SCHEMAS,
  // g1: G1_*_SCHEMAS — added when G1 schemas are validated.
};

/**
 * Return the command schemas available for a given robot type. Returns
 * an empty array for unknown types — pair with `ChainClient.getRobot`
 * to discover what commands a particular robotId supports:
 *
 * ```ts
 * const robot = await chainClient.getRobot(robotId);
 * const schemas = getSchemasForRobotType(robot.robotType);
 * ```
 */
export function getSchemasForRobotType(robotType: string): CommandSchema[] {
  return SCHEMAS_BY_ROBOT_TYPE[robotType] ?? [];
}
