import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@mariozechner/pi-ai";
import type { GameClient, GameState } from "./game.js";

const NoParams = Type.Object({});

export function screenshotTool(game: GameClient): AgentTool<typeof NoParams, { step: number }> {
  return {
    name: "screenshot",
    label: "Screenshot",
    description: "Capture the current 240x160 Game Boy Advance frame.",
    parameters: NoParams,
    async execute() {
      const shot = await game.screenshot();
      return {
        content: [
          { type: "text", text: `Game frame at step ${String(shot.step)} (240x160).` },
          { type: "image", data: shot.pngBase64, mimeType: "image/png" },
        ],
        details: { step: shot.step },
      };
    },
  };
}

export function stateTool(game: GameClient): AgentTool<typeof NoParams, GameState> {
  return {
    name: "get_state",
    label: "Game state",
    description: "Read the parsed game state: location, position, battle flag, badges, money, step.",
    parameters: NoParams,
    async execute() {
      const state = await game.state();
      return { content: [{ type: "text", text: JSON.stringify(state) }], details: state };
    },
  };
}
