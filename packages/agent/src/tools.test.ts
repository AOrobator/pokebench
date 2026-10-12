import { describe, expect, it } from "vitest";
import type { GameClient } from "./game.js";
import { screenshotTool, stateTool } from "./tools.js";

const game: GameClient = {
  screenshot: () => Promise.resolve({ pngBase64: "AAAA", step: 4 }),
  state: () =>
    Promise.resolve({ location: "ROUTE 101", x: 1, y: 2, inBattle: true, badges: 0, money: 10, step: 4 }),
};

describe("screenshotTool", () => {
  it("returns the frame as image content the model can see", async () => {
    const tool = screenshotTool(game);
    expect(tool.name).toBe("screenshot");
    const result = await tool.execute("call-1", {});
    expect(result.content).toEqual([
      { type: "text", text: "Game frame at step 4 (240x160)." },
      { type: "image", data: "AAAA", mimeType: "image/png" },
    ]);
    expect(result.details).toEqual({ step: 4 });
  });
});

describe("stateTool", () => {
  it("returns the parsed game state as JSON text", async () => {
    const tool = stateTool(game);
    expect(tool.name).toBe("get_state");
    const result = await tool.execute("call-2", {});
    expect(result.content).toEqual([
      {
        type: "text",
        text: JSON.stringify({ location: "ROUTE 101", x: 1, y: 2, inBattle: true, badges: 0, money: 10, step: 4 }),
      },
    ]);
    expect(result.details.location).toBe("ROUTE 101");
  });
});
