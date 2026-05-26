import { describe, it, expect } from "vitest";
import {
  GO2_SPORT_SCHEMAS,
  SCHEMAS_BY_ROBOT_TYPE,
  getSchemasForRobotType,
} from "../../src/command/schemas/index.js";
import { SportCommand } from "../../src/types/commands.js";

describe("schemas registry", () => {
  it("exposes the Go2 sport schemas as a non-empty array", () => {
    expect(Array.isArray(GO2_SPORT_SCHEMAS)).toBe(true);
    expect(GO2_SPORT_SCHEMAS.length).toBeGreaterThan(0);
    const move = GO2_SPORT_SCHEMAS.find((s) => s.apiId === SportCommand.Move);
    expect(move?.name).toBe("Move");
  });

  it("maps the Go2 family to the same schema set", () => {
    expect(SCHEMAS_BY_ROBOT_TYPE.go2_pro).toBe(GO2_SPORT_SCHEMAS);
    expect(SCHEMAS_BY_ROBOT_TYPE.go2_air).toBe(GO2_SPORT_SCHEMAS);
    expect(SCHEMAS_BY_ROBOT_TYPE.go2_edu).toBe(GO2_SPORT_SCHEMAS);
  });

  describe("getSchemasForRobotType", () => {
    it("returns the schemas for a known robot type", () => {
      expect(getSchemasForRobotType("go2_pro")).toBe(GO2_SPORT_SCHEMAS);
    });

    it("returns an empty array for unknown types", () => {
      expect(getSchemasForRobotType("g1")).toEqual([]);
      expect(getSchemasForRobotType("unknown_robot")).toEqual([]);
      expect(getSchemasForRobotType("")).toEqual([]);
    });

    it("reflects runtime registration on the registry", () => {
      const fakeSchema = [
        {
          apiId: 9999,
          name: "TestCommand",
          description: "test",
          estimatedDurationMs: 100,
        },
      ];
      SCHEMAS_BY_ROBOT_TYPE.test_robot = fakeSchema;
      try {
        expect(getSchemasForRobotType("test_robot")).toBe(fakeSchema);
      } finally {
        delete SCHEMAS_BY_ROBOT_TYPE.test_robot;
      }
    });
  });
});
