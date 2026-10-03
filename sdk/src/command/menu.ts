import type { CommandSchema } from "../types/commands.js";
import { getSchemasForRobotType } from "./schemas/index.js";

/**
 * The moves an owner offers to the public on one robot, with display text
 * on top of the command schemas. Kept as plain JSON so it can live in a file
 * today and in 0G Storage under the robot's `storageRoot` later.
 */
export interface RobotMenu {
  /** What the public calls the robot, e.g. "Larry". */
  displayName?: string;
  items: RobotMenuItem[];
}

export interface RobotMenuItem {
  /** Schema `name` of the command, e.g. `"Hello"`. */
  command: string;
  /** Overrides the schema's `label`. */
  label?: string;
  /** Overrides the schema's `description`. */
  description?: string;
  emoji?: string;
}

/** A menu item joined with its command schema. */
export interface ResolvedMenuItem {
  apiId: number;
  command: string;
  label: string;
  description: string;
  emoji?: string;
  schema: CommandSchema;
}

/**
 * Join each menu item with its schema for `robotType`, in menu order.
 *
 * @throws If an item names a command the robot type doesn't have, or one
 *   that takes parameters. Menu items are fixed moves, so a buyer never
 *   picks parameters.
 */
export function resolveMenu(
  menu: RobotMenu,
  robotType: string,
): ResolvedMenuItem[] {
  const schemas = new Map(
    getSchemasForRobotType(robotType).map((s) => [s.name, s]),
  );
  return menu.items.map((item) => {
    const schema = schemas.get(item.command);
    if (!schema) {
      throw new Error(`Menu: no "${item.command}" command for ${robotType}`);
    }
    if (schema.params) {
      throw new Error(`Menu: "${item.command}" takes parameters`);
    }
    return {
      apiId: schema.apiId,
      command: schema.name,
      label: item.label ?? schema.label ?? schema.name,
      description: item.description ?? schema.description,
      emoji: item.emoji,
      schema,
    };
  });
}
