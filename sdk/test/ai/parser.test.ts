import { describe, it, expect } from "vitest";
import { parseLLMResponse } from "../../src/ai/parser.js";
import { SportCommand } from "../../src/types/commands.js";

describe("parseLLMResponse", () => {
  it("should parse a simple command array", () => {
    const response = '[{"command": "Hello"}]';
    const result = parseLLMResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].command).toBe("Hello");
    expect(result[0].apiId).toBe(SportCommand.Hello);
  });

  it("should parse commands with parameters", () => {
    const response = JSON.stringify([
      { command: "RecoveryStand" },
      { command: "Move", params: { x: 0.5, y: 0, z: 0 }, duration_ms: 3000 },
      { command: "StopMove" },
    ]);
    const result = parseLLMResponse(response);
    expect(result).toHaveLength(3);
    expect(result[1].apiId).toBe(SportCommand.Move);
    expect(result[1].params).toEqual({ x: 0.5, y: 0, z: 0 });
    expect(result[1].duration_ms).toBe(3000);
  });

  it("should strip markdown code fences", () => {
    const response = '```json\n[{"command": "Dance1"}]\n```';
    const result = parseLLMResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].apiId).toBe(SportCommand.Dance1);
  });

  it("should handle code fences without language tag", () => {
    const response = '```\n[{"command": "Sit"}]\n```';
    const result = parseLLMResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].apiId).toBe(SportCommand.Sit);
  });

  it("should wrap single object in array", () => {
    const response = '{"command": "StandUp"}';
    const result = parseLLMResponse(response);
    expect(result).toHaveLength(1);
    expect(result[0].apiId).toBe(SportCommand.StandUp);
  });

  it("should use schema duration when not specified", () => {
    const response = '[{"command": "Hello"}]';
    const result = parseLLMResponse(response);
    expect(result[0].duration_ms).toBe(3000); // Hello's estimated duration
  });

  it("should reject unknown commands", () => {
    const response = '[{"command": "FlyToMoon"}]';
    expect(() => parseLLMResponse(response)).toThrow("Unknown command");
  });

  it("should reject invalid JSON", () => {
    expect(() => parseLLMResponse("not json")).toThrow("not valid JSON");
  });

  it("should reject empty arrays", () => {
    expect(() => parseLLMResponse("[]")).toThrow("empty command list");
  });

  it("should reject entries without command field", () => {
    const response = '[{"apiId": 1016}]';
    expect(() => parseLLMResponse(response)).toThrow('missing "command"');
  });
});
