import { GO2_SPORT_SCHEMAS } from "../command/schemas/go2.js";
import type { CommandPayload } from "../types/commands.js";

// Currently Go2-specific. When AI support is added for other robot types
// the parser will be parameterized by schemas.
const SCHEMA_BY_NAME = new Map(GO2_SPORT_SCHEMAS.map((s) => [s.name, s]));

export interface RawAICommand {
  command: string;
  params?: Record<string, unknown>;
  duration_ms?: number;
}

/**
 * Parse and validate LLM response into CommandPayload[].
 *
 * Handles common LLM output quirks:
 * - Markdown code fences (```json ... ```)
 * - Extra whitespace
 * - Single object vs array
 */
export function parseLLMResponse(raw: string): CommandPayload[] {
  let cleaned = raw.trim();

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM response is not valid JSON: ${cleaned.slice(0, 200)}`);
  }

  // Wrap single object in array
  if (!Array.isArray(parsed)) {
    if (typeof parsed === "object" && parsed !== null && "command" in parsed) {
      parsed = [parsed];
    } else {
      throw new Error("LLM response must be a JSON array of commands");
    }
  }

  const commands: CommandPayload[] = [];
  for (const item of parsed as RawAICommand[]) {
    if (!item.command || typeof item.command !== "string") {
      throw new Error(`Invalid command entry: missing "command" field`);
    }

    const schema = SCHEMA_BY_NAME.get(item.command);
    if (!schema) {
      throw new Error(`Unknown command: "${item.command}"`);
    }

    commands.push({
      command: item.command,
      apiId: schema.apiId,
      params: item.params,
      duration_ms: item.duration_ms ?? schema.estimatedDurationMs,
    });
  }

  if (commands.length === 0) {
    throw new Error("LLM returned empty command list");
  }

  return commands;
}
