import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Button } from "./events.js";
import { featureInfo, featuresOf, SERVER_FEATURES, SWITCHABLE_FEATURES, type FeatureSet } from "./features.js";
import { parseGameState, type GameStateSnapshot } from "./game-state.js";
import { toolSwitches } from "./play-config.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { pressResult } from "./press-result.js";
import { planNavigation, withNavigation } from "./navigation.js";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";

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

// State 127085 (turn 1098, ROUTE110): the player at (17,69) on elevation 3 under the road; the
// CYCLING_TRIATHLETE_F (object 8) rides at (16,71) on elevation 4 (its interaction candidate's
// elevation; the recorded state predates object elevations in navigation_grid).
describe("elevation-aware-map-v1: an object on another level does not occupy the walker's tile", () => {
  const recorded = at(127086).after;
  const grid = recorded.navigation_grid;
  if (grid == null) throw new Error("no grid");
  const layered: GameStateSnapshot = { ...recorded, navigation_grid: { ...grid, objects: grid.objects.map(o => ({ ...o, elevation: o.x === 16 && o.y === 71 ? 4 : 3 })) } };
  const goal = { x: 16, y: 71 };
  const options = { ledges: true, oneWay: true, floor: true, elevation: "game" as const };
  it("plans DOWN DOWN LEFT under the cyclist with the switch, and refuses as before without it", () => {
    expect(planNavigation(layered, goal, { ...options, actorElevation: true })).toEqual(["DOWN", "DOWN", "LEFT"]);
    expect(planNavigation(layered, goal, options)).toBeNull();
    expect(planNavigation(recorded, goal, { ...options, actorElevation: true })).toBeNull();
  });
  it("an object at elevation 0 or at the walker's elevation still blocks", () => {
    for (const elevation of [0, 3]) {
      const same: GameStateSnapshot = { ...layered, navigation_grid: { ...grid, objects: grid.objects.map(o => ({ ...o, elevation })) } };
      expect(planNavigation(same, goal, { ...options, actorElevation: true })).toBeNull();
    }
  });
  it("a stack of objects at elevations 3 and 4 on one tile blocks a walker at 3, in either order", () => {
    for (const levels of [[3, 4], [4, 3]]) {
      const stacked: GameStateSnapshot = { ...layered, navigation_grid: { ...grid, objects: [...grid.objects.filter(o => o.x !== 16 || o.y !== 71), ...levels.map(elevation => ({ x: 16, y: 71, elevation }))] } };
      expect(planNavigation(stacked, goal, { ...options, actorElevation: true })).toBeNull();
    }
  });
  it("withNavigation hands the switch to navigate_to, which walks under the cyclist", async () => {
    const walk = async (features: FeatureSet): Promise<{ presses: string[][]; status: string }> => {
      let current = layered; const presses: string[][] = [];
      const step = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] } as const;
      const press = (_id: string, params: { buttons: string[] }, _signal?: AbortSignal, check?: (s: GameStateSnapshot | undefined) => void): Promise<AgentToolResult<unknown>> => {
        check?.(current); presses.push(params.buttons);
        const [dx, dy] = step[params.buttons[0] as keyof typeof step];
        const p = current.position;
        if (p !== null) current = { ...current, position: { x: p.x + dx, y: p.y + dy }, facing: (params.buttons[0] ?? "down").toLowerCase() };
        return Promise.resolve({ content: [{ type: "text", text: "observed" }], details: { state: current } });
      };
      const observe = { name: "observe", label: "observe", description: "observe", parameters: {}, execute: () => Promise.resolve({ content: [{ type: "text", text: "observed" }], details: { state: current } }) } as unknown as AgentTool;
      const pressTool = { name: "press", label: "press", description: "press", parameters: {}, execute: press, executeChecked: press } as unknown as AgentTool;
      const nav = withNavigation([observe, pressTool], features, { read: () => Promise.resolve(current) }).find(t => t.name === "navigate_to");
      if (nav === undefined) throw new Error("no navigate_to");
      const out = await nav.execute("nav", { ...goal, map_id: [0, 25], walking: true });
      return { presses, status: (out.details as { navigation: { status: string } }).navigation.status };
    };
    const base: FeatureSet = { ...recordedFeatures, "trainer-sight-check-v1": false, "story-battle-heal-gate-v1": false, "safe-navigation-strides-v1": false };
    const onWalk = await walk(on(base));
    expect(onWalk.presses.map(b => b[0])).toEqual(["DOWN", "DOWN", "LEFT"]);
    expect(onWalk.status).toBe("arrived at requested coordinate");
    const offWalk = await walk(base);
    expect(offWalk.presses).toEqual([]);
  });
});
