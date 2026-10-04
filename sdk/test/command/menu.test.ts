import { describe, it, expect } from "vitest";
import { resolveMenu } from "../../src/command/menu.js";
import { SportCommand } from "../../src/types/commands.js";

describe("resolveMenu", () => {
  it("joins items with their schemas in menu order", () => {
    const items = resolveMenu(
      { items: [{ command: "Sit" }, { command: "Hello", emoji: "👋" }] },
      "go2_pro",
    );
    expect(items.map((i) => i.apiId)).toEqual([
      SportCommand.Sit,
      SportCommand.Hello,
    ]);
    expect(items[1]).toMatchObject({
      command: "Hello",
      label: "Wave hello",
      description: "Wave greeting gesture",
      emoji: "👋",
    });
  });

  it("lets items override the schema's label and description", () => {
    const [item] = resolveMenu(
      { items: [{ command: "Hello", label: "Say hi", description: "Waves" }] },
      "go2_pro",
    );
    expect(item.label).toBe("Say hi");
    expect(item.description).toBe("Waves");
  });

  it("takes the schema's emoji unless the item sets one", () => {
    const [sit, hello] = resolveMenu(
      { items: [{ command: "Sit" }, { command: "Hello", emoji: "🙌" }] },
      "go2_pro",
    );
    expect(sit.emoji).toBe("🪑");
    expect(hello.emoji).toBe("🙌");
  });

  it("falls back to the schema name when there is no label", () => {
    const [item] = resolveMenu({ items: [{ command: "Dance1" }] }, "go2_pro");
    expect(item.label).toBe("Dance1");
  });

  it("rejects unknown commands", () => {
    expect(() =>
      resolveMenu({ items: [{ command: "Backflip9000" }] }, "go2_pro"),
    ).toThrow('no "Backflip9000" command for go2_pro');
    expect(() => resolveMenu({ items: [{ command: "Hello" }] }, "g1")).toThrow();
  });

  it("rejects commands that take parameters", () => {
    expect(() =>
      resolveMenu({ items: [{ command: "Move" }] }, "go2_pro"),
    ).toThrow('"Move" takes parameters');
  });
});
