import { describe, expect, it } from "vitest";
import type { GameStateSnapshot } from "./game-state.js";
import { REQUIRED_FRONTIER_MILESTONES } from "./milestones.js";
import { OPTIONAL_PROGRESS_NAMES, progressReached } from "./story-progress.js";

const FLAG_ITEM_AQUA_HIDEOUT_B1F_MASTER_BALL = 0x464;
const flags = (on: boolean): string => {
  const bytes = new Uint8Array(0x12c);
  const flag = FLAG_ITEM_AQUA_HIDEOUT_B1F_MASTER_BALL;
  if (on) bytes[flag >> 3] = 1 << (flag & 7);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const state = (on: boolean): GameStateSnapshot => ({ started: true, screen: "overworld", story_progress: { flags: flags(on), rustboro_stage: 0, devon_stage: 0, letter: false } }) as unknown as GameStateSnapshot;

describe("MASTER_BALL_OBTAINED", () => {
  it("follows the game's own item flag", () => {
    expect(progressReached("MASTER_BALL_OBTAINED", state(false))).toBe(false);
    expect(progressReached("MASTER_BALL_OBTAINED", state(true))).toBe(true);
  });

  it("is optional, so required frontier order and story totals do not move", () => {
    expect(OPTIONAL_PROGRESS_NAMES.has("MASTER_BALL_OBTAINED")).toBe(true);
    expect(REQUIRED_FRONTIER_MILESTONES).not.toContain("MASTER_BALL_OBTAINED");
  });
});
