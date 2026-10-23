import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Button } from "./events.js";
import { featureInfo, featuresOf, SERVER_FEATURES, SWITCHABLE_FEATURES, type FeatureSet } from "./features.js";
import { parseGameState, type GameStateSnapshot } from "./game-state.js";
import { toolSwitches } from "./play-config.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { pressResult } from "./press-result.js";

const ID = "elevation-aware-map-v1";

// 2026-10-22T20-40-54_glm53-mac_0d5d: ROUTE110 under the Seaside Cycling Road (turns 1098 and 1104)
// and GRANITE CAVE B1F's muddy slope (turn 890). before = button_press.before_state_seq,
// after = tool_result.state_seq; recorded = the delivered Press result.
interface Case { readonly tool_result_seq: number; readonly buttons: Button[]; readonly recorded: string; readonly before: unknown; readonly after: unknown }
const replay = JSON.parse(readFileSync(new URL("../test-support/elevation-route110-0d5d.json", import.meta.url), "utf8")) as { run: string; harness_features: string[]; cases: Case[] };
const recordedFeatures = featuresOf(replay.harness_features);
const at = (seq: number): { before: GameStateSnapshot; after: GameStateSnapshot; buttons: Button[]; recorded: string } => {
  const found = replay.cases.find(c => c.tool_result_seq === seq);
  if (found === undefined) throw new Error(`no case ${String(seq)}`);
  return { before: parseGameState(found.before), after: parseGameState(found.after), buttons: found.buttons, recorded: found.recorded };
};
const on = (features: FeatureSet): FeatureSet => ({ ...features, [ID]: true });
const result = (seq: number, features: FeatureSet): string => { const { before, after, buttons } = at(seq); return pressResult(before, after, buttons, toolSwitches(features)); };

describe("0d5d replay: refused presses name the elevation and the slope", () => {
  it.each([127086, 129030, 96996])("seq %i: OFF reproduces the delivered text byte for byte", seq => {
    expect(recordedFeatures[ID]).toBe(false);
    expect(result(seq, recordedFeatures)).toBe(at(seq).recorded);
  });
  it("seq 127086: UP ×3 from the ground onto the raised road names both elevations", () => {
    expect(result(127086, on(recordedFeatures))).toBe(
      "turned right -> up but did not move: UP ×3 left you at (17,69), now facing up. The tile above, (17,68), is at elevation 4 while you are at elevation 3 (L on the local map), and the game refuses a step onto a tile at another elevation, so UP cannot move you from here.");
  });
  it("seq 129030: a single UP already facing up names the same refusal", () => {
    expect(result(129030, on(recordedFeatures))).toBe(
      "blocked: UP did not move you; you are still at (16,69) facing up. The tile above, (16,68), is at elevation 4 while you are at elevation 3 (L on the local map), and the game refuses a step onto a tile at another elevation, so UP cannot move you from here.");
  });
  it("seq 96996: UP ×2 onto GRANITE CAVE B1F's muddy slope names the slope", () => {
    expect(result(96996, on(recordedFeatures))).toBe(
      "blocked: UP ×2 did not move you; you are still at (9,11) facing up. The tile above, (9,10), is a muddy slope, which slides a walker back down, so UP cannot move you from here.");
  });
  it("a single press with no known terrain cause keeps the old text", () => {
    const { before, after } = at(129030);
    const grid = before.navigation_grid;
    if (grid == null) throw new Error("no grid");
    const flat: GameStateSnapshot = { ...before, navigation_grid: { ...grid, tiles: grid.tiles.map(t => ({ ...t, elevation: 3 })) } };
    expect(pressResult(flat, after, ["UP"], toolSwitches(on(recordedFeatures)))).toBe(at(129030).recorded);
  });
});

describe("elevation-aware-map-v1 registry and wiring", () => {
  it("is a registered server switch, default off in presets, with OFF copy", () => {
    expect(SWITCHABLE_FEATURES).toContain(ID);
    expect(SERVER_FEATURES).toContain(ID);
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
    expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  });
  it("the production tool switches carry it", () => {
    expect(toolSwitches(on(recordedFeatures)).elevation).toBe(true);
    expect(toolSwitches(recordedFeatures).elevation).toBe(false);
  });
});
