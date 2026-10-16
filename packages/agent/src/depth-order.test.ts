import { expect, it } from "vitest";
import { ACTIVITY_MILESTONES, DEPTH_ORDER, MILESTONE_ORDER, deeperMilestone } from "./milestones.js";

it("ranks depth without the optional activities, keeping every other milestone in story order", () => {
  expect([...ACTIVITY_MILESTONES]).toEqual(["FIRST_POKEMON_CAUGHT", "FIRST_EVOLUTION", "FIRST_POKECENTER_HEAL"]);
  expect(DEPTH_ORDER).toEqual(MILESTONE_ORDER.filter((name) => !ACTIVITY_MILESTONES.has(name)));
  expect(DEPTH_ORDER.indexOf("RUNNING_SHOES_RECEIVED")).toBeLessThan(DEPTH_ORDER.indexOf("ROUTE_102"));
});

it("never lets an early heal, catch or evolution outrank the story", () => {
  const furthest = (names: readonly string[]) => names.reduce<string | null>(deeperMilestone, null);
  expect(furthest(["ROUTE_103", "FIRST_POKECENTER_HEAL"])).toBe("ROUTE_103");
  expect(furthest(["FIRST_POKECENTER_HEAL", "RIVAL_BATTLE_WON", "FIRST_POKEMON_CAUGHT", "RUNNING_SHOES_RECEIVED", "FIRST_EVOLUTION"])).toBe("RUNNING_SHOES_RECEIVED");
  expect(furthest(["FIRST_POKECENTER_HEAL"])).toBeNull();
  expect(furthest(["ROUTE_102", "RUNNING_SHOES_RECEIVED"])).toBe("ROUTE_102");
  expect(furthest(["RIVAL_MET", "RIVAL_MET"])).toBe("RIVAL_MET");
  expect(furthest(["RIVAL_MET", "NOT_A_MILESTONE"])).toBe("RIVAL_MET");
});
