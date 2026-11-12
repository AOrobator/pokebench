import { describe, expect, it } from "vitest";
import { isMilestone, levelOf, type Milestone } from "./milestones.js";

const times = (entries: readonly (readonly [Milestone, number])[]): ReadonlyMap<Milestone, number> => new Map(entries);

describe("levelOf", () => {
  it("counts the badges earned up to the furthest one, in the order earned", () => {
    expect(levelOf(times([["KNUCKLE_BADGE", 10], ["STONE_BADGE", 20]]), "STONE_BADGE", 20)).toBe(2);
    expect(levelOf(times([["KNUCKLE_BADGE", 10], ["STONE_BADGE", 20]]), "KNUCKLE_BADGE", 10)).toBe(1);
  });

  it("gives the Elite Four, the Champion and the game clear fixed levels", () => {
    expect(levelOf(times([["ELITE_FOUR_SIDNEY_DEFEATED", 5]]), "ELITE_FOUR_SIDNEY_DEFEATED", 5)).toBe(9);
    expect(levelOf(times([["WALLACE_DEFEATED", 5]]), "WALLACE_DEFEATED", 5)).toBe(13);
    expect(levelOf(times([["GAME_CLEAR_CONFIRMED", 5]]), "GAME_CLEAR_CONFIRMED", 5)).toBe(14);
  });
});

describe("isMilestone", () => {
  it("knows the plotted milestones only", () => {
    expect(isMilestone("RAIN_BADGE")).toBe(true);
    expect(isMilestone("rain_badge")).toBe(false);
  });
});
