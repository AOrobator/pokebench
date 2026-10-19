import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { FEATURES, dependencyProblems, featureInfo, featuresOf, playHarnessFeatures, type FeatureSet} from "./features.js";
import { ALL_TOOL_SWITCHES, gameTools } from "./game-tools.js";
import { parseGameState, type GameStateSnapshot } from "./game-state.js";
import type { Button } from "./events.js";
import { toolSwitches } from "./play-config.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { ALL_PRESS_FACTS, pressResult, type PressFacts } from "./press-result.js";

const ID = "blocked-batch-result-v1";
const OLD = "unchanged world position/facing (batch or non-direction input; intermediate effects unknown)";

// 2026-10-15T23-47-41_qwen36-gpu0_2919: every pure direction batch that left the player on its tile.
// before = button_press.before_state_seq, after = tool_result.state_seq; recorded = the delivered Press result.
interface Case { readonly tool_result_seq: number; readonly turn: number; readonly buttons: Button[]; readonly recorded: string; readonly before: unknown; readonly after: unknown }
const replay = JSON.parse(readFileSync(new URL("../test-support/blocked-batch-2919.json", import.meta.url), "utf8")) as { run: string; harness_features: string[]; cases: Case[] };
const recordedFeatures = featuresOf(replay.harness_features);
const at = (seq: number): { before: GameStateSnapshot; after: GameStateSnapshot; buttons: Button[]; recorded: string } => {
  const found = replay.cases.find(c => c.tool_result_seq === seq);
  if (found === undefined) throw new Error(`no case ${String(seq)}`);
  return { before: parseGameState(found.before), after: parseGameState(found.after), buttons: found.buttons, recorded: found.recorded };
};
const on = (features: FeatureSet): FeatureSet => ({ ...features, [ID]: true });

describe("2919 replay: the recorded blocked batches", () => {
  it("covers the forensics seqs", () => {
    expect(replay.run).toBe("2026-10-15T23-47-41_qwen36-gpu0_2919");
    expect(replay.cases.map(c => c.tool_result_seq)).toEqual([2061, 2101, 2160, 2416, 2432, 2448, 2464, 2504, 2529, 2804, 2822, 2840]);
  });
  it.each(replay.cases.map(c => c.tool_result_seq))("seq %i: OFF reproduces the delivered text byte for byte", (seq) => {
    const { before, after, buttons, recorded } = at(seq);
    expect(recordedFeatures[ID]).toBe(false);
    expect(pressResult(before, after, buttons, toolSwitches(recordedFeatures))).toBe(recorded);
  });
  it("seq 2432: LEFT ×3 into the lab wall says blocked, where, facing, and the collision tile", () => {
    const { before, after, buttons } = at(2432);
    expect(pressResult(before, after, buttons, toolSwitches(on(recordedFeatures)))).toBe(
      "blocked: LEFT ×3 did not move you; you are still at (10,16) facing left. The tile to the left, (9,16), is a collision tile (# on the local map), so LEFT cannot move you from here.");
  });
  it("seq 2822: a two-press batch counts its presses", () => {
    const { before, after, buttons } = at(2822);
    expect(pressResult(before, after, buttons, toolSwitches(on(recordedFeatures)))).toBe(
      "blocked: LEFT ×2 did not move you; you are still at (10,16) facing left. The tile to the left, (9,16), is a collision tile (# on the local map), so LEFT cannot move you from here.");
  });
  it("seq 2061: DOWN ×3 into the house row names the tile below", () => {
    const { before, after, buttons } = at(2061);
    expect(pressResult(before, after, buttons, toolSwitches(on(recordedFeatures)))).toBe(
      "blocked: DOWN ×3 did not move you; you are still at (5,12) facing down. The tile below, (5,13), is a collision tile (# on the local map), so DOWN cannot move you from here.");
  });
  it("seq 2416: a batch that only turned says it turned and was then blocked", () => {
    const { before, after, buttons } = at(2416);
    expect(pressResult(before, after, buttons, toolSwitches(on(recordedFeatures)))).toBe(
      "turned down -> left but did not move: LEFT ×3 left you at (10,16), now facing left. The tile to the left, (9,16), is a collision tile (# on the local map), so LEFT cannot move you from here.");
  });
  it("every recorded case changes under ON, and transition results compose with it", () => {
    for (const c of replay.cases) {
      const { before, after, buttons } = at(c.tool_result_seq);
      const text = pressResult(before, after, buttons, toolSwitches(on({ ...recordedFeatures, "transition-press-result-v1": true })));
      expect(text).not.toBe(c.recorded);
      expect(text).toMatch(/^(blocked|turned down -> left but did not move): /);
    }
  });
});

// Synthetic states on a 5x5 window around (2,2) at elevation 3.
type Tile = { x: number; y: number; collision: number; behavior: number; elevation: number };
const grid = (overrides: readonly Tile[] = [], extra: { objects?: { x: number; y: number }[]; warps?: { x: number; y: number }[] } = {}): NonNullable<GameStateSnapshot["navigation_grid"]> => {
  const tiles: Tile[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) tiles.push(overrides.find(t => t.x === x && t.y === y) ?? { x, y, collision: 0, behavior: 0, elevation: 3 });
  return { elevation: 3, tiles, objects: extra.objects ?? [], warps: extra.warps ?? [] };
};
const field = (facing: string, navigation_grid: GameStateSnapshot["navigation_grid"] = grid(), more: Partial<GameStateSnapshot> = {}): GameStateSnapshot =>
  ({ ...IN_GAME, screen: "overworld", field_controls_locked: false, position: { x: 2, y: 2 }, facing, navigation_grid, ...more });
const ON: PressFacts = { ...ALL_PRESS_FACTS, blockedBatch: true, liveMap: true, ledges: true, edgeWalls: true, counters: true, topology: true };
// pokeemerald PLAYER_AVATAR_FLAG_ON_FOOT (1 << 0) and PLAYER_AVATAR_FLAG_SURFING (1 << 3).
const avatar = (avatar_flags: number | null): Partial<GameStateSnapshot> => ({ running: { permitted: false, controllable: true, reason: "test", shoes: false, allow_running: false, avatar_flags, metatile: null, elevation: null, map_type: null, callback1: null, callback2: null, diagnostic: null, raw_hex: null } });
const still = (state: GameStateSnapshot, buttons: Button[], show: PressFacts = ON): string => pressResult(state, state, buttons, show);
const wall = (x: number, y: number, behavior = 0): Tile => ({ x, y, collision: 1, behavior, elevation: 0 });

describe("blockers named only from the readout's own grid and objects", () => {
  it("a person or object on the tile, by its map-local id, without claiming it blocked (its elevation is not read)", () => {
    const state = field("left", grid([], { objects: [{ x: 1, y: 2 }] }), { world_context: { objects: [{ local_id: 4, map_id: IN_GAME.map_id as [number, number], graphics_id: 9, sprite_kind: "BOY_2", x: 1, y: 2 }, { local_id: 7, map_id: [9, 9], graphics_id: 9, sprite_kind: null, x: 2, y: 1 }], triggers: [], dialogue: null } });
    expect(still(state, ["LEFT", "LEFT"])).toBe("no movement: LEFT ×2 did not move you; you are still at (2,2) facing left. The tile to the left, (1,2), has a person or object on it (object id 4).");
    // An object of another map at the tile above is not this map's object.
    expect(still({ ...state, facing: "up" }, ["UP", "UP"])).toBe("no movement: UP ×2 did not move you; you are still at (2,2) facing up. The readout shows nothing blocking the tile above, (2,1); what stopped you is not known.");
  });
  it("an object the grid lists without a world-context id", () => {
    expect(still(field("right", grid([], { objects: [{ x: 3, y: 2 }] })), ["RIGHT", "RIGHT"])).toBe("no movement: RIGHT ×2 did not move you; you are still at (2,2) facing right. The tile to the right, (3,2), has a person or object on it.");
  });
  it("a warp that did not activate from this side", () => {
    expect(still(field("down", grid([wall(2, 3, 0x69)], { warps: [{ x: 2, y: 3 }] })), ["DOWN", "DOWN"])).toBe("no movement: DOWN ×2 did not move you; you are still at (2,2) facing down. The tile below, (2,3), is a warp (W on the local map) that did not activate from this side.");
  });
  it("a ledge entered against its arrow; a ledge in the pressed direction is not a known cause", () => {
    expect(still(field("up", grid([{ x: 2, y: 1, collision: 1, behavior: 0x3b, elevation: 3 }])), ["UP", "UP"])).toBe("blocked: UP ×2 did not move you; you are still at (2,2) facing up. The tile above, (2,1), is a ledge you can only hop over moving DOWN, so UP cannot move you from here.");
    expect(still(field("down", grid([{ x: 2, y: 3, collision: 1, behavior: 0x3b, elevation: 3 }])), ["DOWN", "DOWN"])).toBe("no movement: DOWN ×2 did not move you; you are still at (2,2) facing down. The tile below, (2,3), is a ledge you can hop over moving DOWN; what stopped you is not known.");
  });
  it("with ledge hops off the map draws the ledge as #, and the result says the same", () => {
    expect(still(field("up", grid([{ x: 2, y: 1, collision: 1, behavior: 0x3b, elevation: 3 }])), ["UP", "UP"], { ...ON, ledges: false })).toBe("blocked: UP ×2 did not move you; you are still at (2,2) facing up. The tile above, (2,1), is a collision tile (# on the local map), so UP cannot move you from here.");
  });
  it("with ledge hops off a ledge pressed in its own direction is not claimed as a wall (the game hops it)", () => {
    expect(still(field("down", grid([{ x: 2, y: 3, collision: 1, behavior: 0x3b, elevation: 3 }])), ["DOWN", "DOWN"], { ...ON, ledges: false })).toBe("no movement: DOWN ×2 did not move you; you are still at (2,2) facing down. The tile below, (2,3), is drawn as # on the local map; what stopped you is not known.");
  });
  it("with counter talk off a counter is the # it is drawn as", () => {
    expect(still(field("left", grid([wall(1, 2, 0x80)])), ["LEFT", "LEFT"], { ...ON, counters: false })).toBe("blocked: LEFT ×2 did not move you; you are still at (2,2) facing left. The tile to the left, (1,2), is a collision tile (# on the local map), so LEFT cannot move you from here.");
  });
  it("a counter", () => {
    expect(still(field("left", grid([wall(1, 2, 0x80)])), ["LEFT", "LEFT"])).toBe("blocked: LEFT ×2 did not move you; you are still at (2,2) facing left. The tile to the left, (1,2), is a counter (collision), so LEFT cannot move you from here.");
  });
  it("water (~ on the map) only when the player is verified on foot", () => {
    const pond = grid([{ x: 1, y: 2, collision: 0, behavior: 0x10, elevation: 1 }]);
    expect(still(field("left", pond, avatar(1)), ["LEFT", "LEFT", "LEFT"])).toBe("blocked: LEFT ×3 did not move you; you are still at (2,2) facing left. The tile to the left, (1,2), is water (~ on the local map); you cannot walk onto it, so LEFT cannot move you from here.");
    const unknown = "no movement: LEFT ×3 did not move you; you are still at (2,2) facing left. The tile to the left, (1,2), is water (~ on the local map); what stopped you is not known.";
    expect(still(field("left", pond, avatar(1 | 8)), ["LEFT", "LEFT", "LEFT"])).toBe(unknown);
    expect(still(field("left", pond, avatar(8)), ["LEFT", "LEFT", "LEFT"])).toBe(unknown);
    expect(still(field("left", pond, avatar(null)), ["LEFT", "LEFT", "LEFT"])).toBe(unknown);
    expect(still(field("left", pond), ["LEFT", "LEFT", "LEFT"])).toBe(unknown);
    // Surfable behaviors the map does not draw as ~ are not named water.
    expect(still(field("left", grid([{ x: 1, y: 2, collision: 0, behavior: 0x19, elevation: 1 }]), avatar(1)), ["LEFT", "LEFT", "LEFT"])).toBe("no movement: LEFT ×3 did not move you; you are still at (2,2) facing left. The readout shows nothing blocking the tile to the left, (1,2); what stopped you is not known.");
  });
  it("edge walls on the player's own tile or on the next tile's facing side", () => {
    expect(still(field("left", grid([{ x: 2, y: 2, collision: 0, behavior: 0x31, elevation: 3 }])), ["LEFT", "LEFT"])).toBe("blocked: LEFT ×2 did not move you; you are still at (2,2) facing left. Your tile, (2,2), has an edge wall on its left side, so LEFT cannot move you from here.");
    expect(still(field("left", grid([{ x: 1, y: 2, collision: 0, behavior: 0x30, elevation: 3 }])), ["LEFT", "LEFT"])).toBe("blocked: LEFT ×2 did not move you; you are still at (2,2) facing left. The tile to the left, (1,2), has an edge wall on its right side, so LEFT cannot move you from here.");
    // With one-way tiles off the map draws these as ., so no wall is named.
    for (const t of [{ x: 2, y: 2, collision: 0, behavior: 0x31, elevation: 3 }, { x: 1, y: 2, collision: 0, behavior: 0x30, elevation: 3 }]) expect(still(field("left", grid([t])), ["LEFT", "LEFT"], { ...ON, edgeWalls: false })).toMatch(/^no movement: .*what stopped you is not known\.$/);
  });
  it("elevation is not shown to the model, so a height difference is never named", () => {
    for (const elevation of [0, 4, 15]) expect(still(field("right", grid([{ x: 3, y: 2, collision: 0, behavior: 0, elevation }])), ["RIGHT", "RIGHT"])).toBe("no movement: RIGHT ×2 did not move you; you are still at (2,2) facing right. The readout shows nothing blocking the tile to the right, (3,2); what stopped you is not known.");
  });
  it("the map edge with no connection that way; with a connection the cause is not known", () => {
    const edge = (connections: NonNullable<GameStateSnapshot["topology"]>["connections"]): GameStateSnapshot => field("left", grid(), { position: { x: 0, y: 2 }, topology: { width: 5, height: 5, connections } });
    expect(still(edge([]), ["LEFT", "LEFT"])).toBe("blocked: LEFT ×2 did not move you; you are still at (0,2) facing left. You are at the west edge of this map and it has no connection to the west, so LEFT cannot move you from here.");
    // Topology is in the readout only with world destinations on.
    expect(still(edge([]), ["LEFT", "LEFT"], { ...ON, topology: false })).toBe("no movement: LEFT ×2 did not move you; you are still at (0,2) facing left. The tile to the left, (-1,2), is outside the readout's map window; what stopped you is not known.");
    expect(still(edge([{ direction: "WEST", offset: 0, destination: [0, 1], destination_name: "ROUTE 101" }]), ["LEFT", "LEFT"])).toBe("no movement: LEFT ×2 did not move you; you are still at (0,2) facing left. The tile to the left, (-1,2), is outside the readout's map window; what stopped you is not known.");
  });
  it("a tile outside the window, or no grid at all, is not guessed", () => {
    expect(still(field("left", grid(), { position: { x: 0, y: 2 } }), ["LEFT", "LEFT"])).toBe("no movement: LEFT ×2 did not move you; you are still at (0,2) facing left. The tile to the left, (-1,2), is outside the readout's map window; what stopped you is not known.");
    expect(still(field("left", null), ["LEFT", "LEFT"])).toBe("no movement: LEFT ×2 did not move you; you are still at (2,2) facing left. The readout has no map of the tile to the left; what stopped you is not known.");
  });
  it("live map off: no tile is named, because the model was not shown the map", () => {
    expect(still(field("left", grid([wall(1, 2)])), ["LEFT", "LEFT"], { ...ON, liveMap: false })).toBe("no movement: LEFT ×2 did not move you; you are still at (2,2) facing left.");
  });
  it("position off: no coordinates and no facing", () => {
    const hidden = { ...ON, position: false };
    expect(still(field("left", grid([wall(1, 2)])), ["LEFT", "LEFT"], hidden)).toBe("blocked: LEFT ×2 did not move you; you are still on the same tile. The tile to the left is a collision tile (# on the local map), so LEFT cannot move you from here.");
    expect(still(field("left", grid([{ x: 2, y: 2, collision: 0, behavior: 0x31, elevation: 3 }])), ["LEFT", "LEFT"], hidden)).toBe("blocked: LEFT ×2 did not move you; you are still on the same tile. Your tile has an edge wall on its left side, so LEFT cannot move you from here.");
    expect(still(field("left", grid()), ["LEFT", "LEFT"], hidden)).toBe("no movement: LEFT ×2 did not move you; you are still on the same tile. The readout shows nothing blocking the tile to the left; what stopped you is not known.");
    expect(pressResult(field("down", grid([wall(1, 2)])), field("left", grid([wall(1, 2)])), ["LEFT", "LEFT"], hidden)).toBe("turned but did not move: LEFT ×2 left you on the same tile. The tile to the left is a collision tile (# on the local map), so LEFT cannot move you from here.");
  });
});

describe("ON leaves every other press result as it was", () => {
  const state = field("left", grid([wall(1, 2)]));
  const OFF: PressFacts = { ...ON, blockedBatch: false };
  it.each<[string, Button[], GameStateSnapshot, GameStateSnapshot]>([
    ["a single press", ["LEFT"], state, state],
    ["a mixed-direction batch", ["LEFT", "UP"], state, state],
    ["a non-direction batch", ["A", "A"], state, state],
    ["an empty batch", [], state, state],
    ["a batch facing another way at the end", ["LEFT", "LEFT"], field("up", grid([wall(1, 2)])), field("up", grid([wall(1, 2)]))],
    ["a batch with facing unknown", ["LEFT", "LEFT"], field("left", grid([wall(1, 2)]), { facing: null }), field("left", grid([wall(1, 2)]), { facing: null })],
    ["a locked snapshot", ["LEFT", "LEFT"], state, { ...state, field_controls_locked: true }],
    ["a turn while locked", ["LEFT", "LEFT"], field("down", grid(), { field_controls_locked: true }), field("left", grid(), { field_controls_locked: true })],
    ["a turn to another direction", ["LEFT", "LEFT"], field("down"), field("up")],
    ["a turn in battle", ["LEFT", "LEFT"], field("down", grid(), { in_battle: true }), field("left", grid(), { in_battle: true })],
    ["a move", ["LEFT", "LEFT"], state, { ...state, position: { x: 0, y: 2 } }],
    ["a map change", ["LEFT", "LEFT"], state, { ...state, map_id: [0, 10] }],
  ])("%s", (_name, buttons, before, after) => {
    expect(pressResult(before, after, buttons, ON)).toBe(pressResult(before, after, buttons, OFF));
  });
  it("field lock hidden: the cause stays unreported", () => {
    expect(still(state, ["LEFT", "LEFT"], { ...ON, fieldLock: false })).toBe("no movement or turn observed (cause not reported)");
  });
  it("OFF and the default facts keep today's batch text", () => {
    expect(still(state, ["LEFT", "LEFT"], OFF)).toBe(OLD);
    expect(still(state, ["LEFT", "LEFT"], ALL_PRESS_FACTS)).toBe(OLD);
  });
});

describe("registry, presets and production wiring", () => {
  it("is a registered guidance switch that needs press results, second to last in the run record", () => {
    expect(featureInfo(ID)).toMatchObject({ group: "guidance", needs: "press-result-v1", switchable: true });
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(FEATURES.filter(f => f.switchable).at(-81)?.id).toBe(ID);
    expect(playHarnessFeatures(ALL_ON, null).at(-76)).toBe(ID);
    expect(playHarnessFeatures({ ...ALL_ON,"battle-decision-ready-v1":false, [ID]: false }, null)).not.toContain(ID);
    expect(dependencyProblems({ ...ALL_ON,"battle-decision-ready-v1":false, "press-result-v1": false })).toContain(`${ID} needs press-result-v1`);
  });
  it("defaults OFF in presets that omit it and in legacy flag presets", () => {
    const rest = Object.fromEntries(Object.entries(ALL_ON).filter(([id]) => id !== ID)) as Omit<FeatureSet, typeof ID>;
    expect(normalizeFeatures(rest)[ID]).toBe(false);
    expect(normalizeFeatures({ ...rest, [ID]: true })[ID]).toBe(true);
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
    expect(ALL_TOOL_SWITCHES.blockedBatch).toBeUndefined();
  });
  it("toolSwitches threads the switch and the live-map visibility", () => {
    expect(toolSwitches({ ...ALL_ON,"battle-decision-ready-v1":false,[ID]: true })).toMatchObject({ blockedBatch: true, liveMap: true });
    expect(toolSwitches({ ...ALL_ON,"battle-decision-ready-v1":false,[ID]: false, "live-map-v1": false })).toMatchObject({ blockedBatch: false, liveMap: false });
    expect(toolSwitches({ ...ALL_ON,"battle-decision-ready-v1":false,[ID]: true })).toMatchObject({ ledges: true, edgeWalls: true, counters: true, topology: true });
    expect(toolSwitches({ ...ALL_ON,"battle-decision-ready-v1":false,[ID]: true, "ledge-hops-v1": false, "one-way-tiles-v1": false, "counter-talk-v1": false, "world-destinations-v1": false })).toMatchObject({ ledges: false, edgeWalls: false, counters: false, topology: false });
  });
  const SERVER = "http://game.test";
  function png(): string {
    const bytes = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
    bytes.writeUInt32BE(13, 8);
    bytes.write("IHDR", 12, "ascii");
    bytes.writeUInt32BE(240, 16);
    bytes.writeUInt32BE(160, 20);
    return bytes.toString("base64");
  }
  it.each([true, false])("the press tool built from a FeatureSet honors the switch (%s)", async (enabled) => {
    const { before, after } = at(2432);
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.slice(SERVER.length);
      const body = path === "/action" ? { status: "success" } : path === "/queue_status" ? { queue_empty: true } : path === "/pokebench/observation" ? { state_text: "", screenshot_base64: png(), state: after } : before;
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    const [, press] = gameTools(SERVER, { beforePress: () => undefined, afterPress: () => Promise.resolve() }, fetchFn, toolSwitches({ ...recordedFeatures, [ID]: enabled }), { sleep: () => Promise.resolve(), now: () => 0 });
    const result = await press.execute("p", { buttons: ["LEFT", "LEFT", "LEFT"] });
    const item = result.content[1];
    const text = item !== undefined && "text" in item ? item.text : "";
    expect(text).toBe(enabled
      ? "pressed LEFT, LEFT, LEFT\nPress result: blocked: LEFT ×3 did not move you; you are still at (10,16) facing left. The tile to the left, (9,16), is a collision tile (# on the local map), so LEFT cannot move you from here.\n\n"
      : `pressed LEFT, LEFT, LEFT\nPress result: ${OLD}\n\n`);
  });
});
