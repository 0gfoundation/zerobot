import { describe, it, expect } from "vitest";
import {
  buildSportCommandMessage,
  buildSubscribeMessage,
  buildVideoToggleMessage,
} from "../../src/robot/commands.js";
import { SportCommand } from "../../src/types/commands.js";

describe("commands", () => {
  describe("buildSportCommandMessage", () => {
    it("should build a valid sport command with no parameters", () => {
      const msg = JSON.parse(buildSportCommandMessage(SportCommand.Hello));
      expect(msg.type).toBe("req");
      expect(msg.topic).toBe("rt/api/sport/request");
      expect(msg.data.header.identity.api_id).toBe(1016);
      expect(msg.data.header.identity.id).toBeTypeOf("number");
      expect(msg.data.parameter).toBe("");
    });

    it("should build a Move command with parameters", () => {
      const msg = JSON.parse(
        buildSportCommandMessage(SportCommand.Move, {
          x: 0.5,
          y: 0,
          z: 0.3,
        }),
      );
      expect(msg.data.header.identity.api_id).toBe(1008);
      // parameter should be a JSON string (double-serialized)
      expect(msg.data.parameter).toBeTypeOf("string");
      const params = JSON.parse(msg.data.parameter);
      expect(params.x).toBe(0.5);
      expect(params.y).toBe(0);
      expect(params.z).toBe(0.3);
    });

    it("should generate unique message IDs", () => {
      const msg1 = JSON.parse(
        buildSportCommandMessage(SportCommand.StandUp),
      );
      const msg2 = JSON.parse(
        buildSportCommandMessage(SportCommand.StandUp),
      );
      // IDs have a random component, so they should be different
      // (extremely unlikely to collide)
      expect(msg1.data.header.identity.id).not.toBe(
        msg2.data.header.identity.id,
      );
    });
  });

  describe("buildSubscribeMessage", () => {
    it("should build a subscribe message", () => {
      const msg = JSON.parse(
        buildSubscribeMessage("rt/lf/sportmodestate"),
      );
      expect(msg.type).toBe("subscribe");
      expect(msg.topic).toBe("rt/lf/sportmodestate");
    });
  });

  describe("buildVideoToggleMessage", () => {
    it("should build video on message", () => {
      const msg = JSON.parse(buildVideoToggleMessage(true));
      expect(msg.type).toBe("vid");
      expect(msg.data).toBe("on");
    });

    it("should build video off message", () => {
      const msg = JSON.parse(buildVideoToggleMessage(false));
      expect(msg.type).toBe("vid");
      expect(msg.data).toBe("off");
    });
  });
});
