import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import { describe, expect, it, vi } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { type FeatureSet } from "./features.js";
import { ALL_TOOL_SWITCHES, gameTools, observeTool, pressTool } from "./game-tools.js";
import type { GameStateSnapshot } from "./game-state.js";
import { objectiveGameTools } from "./objective-tools.js";
import { ObjectiveTracker } from "./objectives.js";
import { toolSwitches } from "./play-config.js";
import { ALL_PRESS_FACTS, ShownStates, ordinal, pressResult } from "./press-result.js";

const ON = { ...ALL_PRESS_FACTS, transitions: true };
const field: GameStateSnapshot = { ...IN_GAME, screen: "overworld", field_controls_locked: false };
// 2026-10-15T01-12-21_think-fast_258d seq 683 (shown), 690 (before), 697 (after).
const upstairs: GameStateSnapshot = { ...field, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", map_id: [1, 1], position: { x: 7, y: 1 }, facing: "up", field_controls_locked: true };
const downstairs: GameStateSnapshot = { ...field, location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", map_id: [1, 0], position: { x: 8, y: 3 }, facing: "down" };
const stepped: GameStateSnapshot = { ...downstairs, position: { x: 8, y: 2 }, facing: "up", field_controls_locked: true };
// 2026-10-15T11-08-31_think-fast_504f seq 1506 (before) and 1511 (after).
const lockedTown: GameStateSnapshot = { ...field, location: "LITTLEROOT TOWN", map_id: [0, 9], position: { x: 5, y: 9 }, facing: "up", field_controls_locked: true };
const scripted: GameStateSnapshot = { ...lockedTown, position: { x: 5, y: 8 } };
const talk = (dialogue: string | null): GameStateSnapshot => ({ ...field, position: { x: 4, y: 4 }, facing: "left", world_context: { objects: [], triggers: [], dialogue } });
const MOM = "MOM: Oh! AAA, there you are. Go set the clock in your room.";

function shownAfter(...states: GameStateSnapshot[]): ShownStates {
  const shown = new ShownStates();
  for (const state of states) shown.record(state);
  return shown;
}

describe("warps carried over from the previous action (258d turn 52)", () => {
  it("names the floor change the model was never shown, then this press's own move", () => {
    expect(pressResult(downstairs, stepped, ["UP"], ON, shownAfter(upstairs))).toBe(
      "warped before this press (carried over from your previous action; your last result still showed the old map): LITTLEROOT TOWN BRENDANS HOUSE 2F [map 1/1] (7,1) -> LITTLEROOT TOWN BRENDANS HOUSE 1F [map 1/0] (8,3); this press: moved (8,3) -> (8,2)",
    );
  });
  it("is byte-identical to today's result when off", () => {
    expect(pressResult(downstairs, stepped, ["UP"], ALL_PRESS_FACTS, shownAfter(upstairs))).toBe("moved (8,3) -> (8,2)");
    expect(pressResult(downstairs, stepped, ["UP"], { ...ON, transitions: false }, shownAfter(upstairs))).toBe("moved (8,3) -> (8,2)");
    expect(pressResult(downstairs, stepped, ["UP"], ON)).toBe("moved (8,3) -> (8,2)");
  });
  it("adds nothing when the model already saw the new map", () => {
    expect(pressResult(downstairs, stepped, ["UP"], ON, shownAfter(upstairs, downstairs))).toBe("moved (8,3) -> (8,2)");
    expect(pressResult(downstairs, stepped, ["UP"], ON, new ShownStates())).toBe("moved (8,3) -> (8,2)");
    expect(pressResult(downstairs, stepped, ["UP"], ON, shownAfter({ ...upstairs, map_id: null }))).toBe("moved (8,3) -> (8,2)");
    expect(pressResult(downstairs, stepped, ["UP"], ON, shownAfter({ ...upstairs, position: null }))).toBe("moved (8,3) -> (8,2)");
    expect(pressResult(downstairs, stepped, ["UP"], ON, shownAfter({ ...upstairs, started: false }))).toBe("moved (8,3) -> (8,2)");
    expect(pressResult({ ...downstairs, map_id: null }, stepped, ["UP"], ON, shownAfter(upstairs))).toBe("unavailable/transitioning (world position unavailable)");
  });
  it("hides coordinates when the position switch is off and names unknown locations", () => {
    expect(pressResult({ ...downstairs, location: null }, stepped, ["UP"], { ...ON, position: false }, shownAfter(upstairs))).toBe(
      "warped before this press (carried over from your previous action; your last result still showed the old map): LITTLEROOT TOWN BRENDANS HOUSE 2F [map 1/1] -> unknown location [map 1/0]; this press: moved",
    );
  });
  it("chains a carried-over warp with a warp during this press", () => {
    const outside: GameStateSnapshot = { ...field, location: "LITTLEROOT TOWN", map_id: [0, 9], position: { x: 5, y: 8 }, facing: "down" };
    expect(pressResult(downstairs, outside, ["DOWN"], ON, shownAfter(upstairs))).toBe(
      "warped before this press (carried over from your previous action; your last result still showed the old map): LITTLEROOT TOWN BRENDANS HOUSE 2F [map 1/1] (7,1) -> LITTLEROOT TOWN BRENDANS HOUSE 1F [map 1/0] (8,3); warped during this press: LITTLEROOT TOWN BRENDANS HOUSE 1F [map 1/0] (8,3) -> LITTLEROOT TOWN [map 0/9] (5,8)",
    );
  });
});

describe("warps during this press", () => {
  it("names both maps and tiles instead of a bare transition", () => {
    expect(pressResult(upstairs, downstairs, ["UP"], ON, shownAfter(upstairs))).toBe(
      "warped during this press: LITTLEROOT TOWN BRENDANS HOUSE 2F [map 1/1] (7,1) -> LITTLEROOT TOWN BRENDANS HOUSE 1F [map 1/0] (8,3)",
    );
    expect(pressResult(upstairs, downstairs, ["UP"], ALL_PRESS_FACTS)).toBe("transitioned (map or screen changed)");
  });
  it("keeps a same-map screen change as today's transition", () => {
    expect(pressResult(field, { ...field, screen: "menu" }, ["START"], ON, shownAfter(field))).toBe("transitioned (map or screen changed)");
  });
});

describe("scripted movement (504f s1512)", () => {
  it("says a script moved the player while field controls were locked", () => {
    expect(pressResult(lockedTown, scripted, ["UP"], ON, shownAfter(lockedTown))).toBe(
      "moved by a script while field controls were locked (not by your press): (5,9) -> (5,8)",
    );
    expect(pressResult(lockedTown, scripted, ["UP"], ALL_PRESS_FACTS)).toBe("moved (5,9) -> (5,8)");
  });
  it("says a press with no direction did not move the player", () => {
    const free = { ...lockedTown, field_controls_locked: false };
    expect(pressResult(free, { ...scripted, field_controls_locked: true }, ["A"], ON)).toBe(
      "moved by a script while field controls were locked (not by your press): (5,9) -> (5,8)",
    );
    expect(pressResult(free, { ...scripted, field_controls_locked: false }, ["A"], ON)).toBe(
      "moved by a script (not by your press; no direction was pressed): (5,9) -> (5,8)",
    );
    expect(pressResult(free, { ...scripted, field_controls_locked: false }, ["A"], ALL_PRESS_FACTS)).toBe("moved (5,9) -> (5,8)");
  });
  it("does not deny a held direction moved the player when the lock ended during the press", () => {
    // The button is held for PRESS_TIMING.hold_frames (10) frames; a script can unlock mid-hold.
    const unlocked = { ...scripted, field_controls_locked: false };
    expect(pressResult(lockedTown, unlocked, ["UP"], ON, shownAfter(lockedTown))).toBe(
      "moved (5,9) -> (5,8); field controls were locked when the press began",
    );
    expect(pressResult(lockedTown, unlocked, ["UP"], { ...ON, position: false })).toBe("moved; field controls were locked when the press began");
    expect(pressResult(lockedTown, { ...scripted, field_controls_locked: null }, ["UP"], ON)).toBe(
      "moved (5,9) -> (5,8); field controls were locked when the press began",
    );
    expect(pressResult(lockedTown, unlocked, ["UP"], ALL_PRESS_FACTS)).toBe("moved (5,9) -> (5,8)");
  });
  it("keeps a free direction press as an ordinary move", () => {
    const free = { ...lockedTown, field_controls_locked: false };
    expect(pressResult(free, { ...scripted, field_controls_locked: false }, ["UP"], ON)).toBe("moved (5,9) -> (5,8)");
  });
  it("respects hidden position and lock facts", () => {
    expect(pressResult(lockedTown, scripted, ["UP"], { ...ON, position: false })).toBe("moved by a script while field controls were locked (not by your press)");
    expect(pressResult(lockedTown, scripted, ["UP"], { ...ON, fieldLock: false })).toBe("moved (5,9) -> (5,8)");
    expect(pressResult(lockedTown, scripted, ["A"], { ...ON, fieldLock: false })).toBe("moved by a script (not by your press; no direction was pressed): (5,9) -> (5,8)");
  });
});

// 2026-10-15 finals. dc0e INSIDE OF TRUCK T216–T615: A at the MOVING_BOX opened, paged and closed the sign box, 399 results all "locked".
// 6684 LITTLEROOT TOWN T494–T788: each A×8 began at the page end (cursor 50) and ended with the same text printing again (45–49).
describe("message boxes the press itself opened, paged, closed or restarted (finals dc0e, 6684)", () => {
  const BOX = "The box is printed with a POKéMON logo. | It's a POKéMON brand moving and delivery service.";
  const truck = (dialogue: string | null, cursor: number | null = null): GameStateSnapshot => ({ ...field, location: "INSIDE OF TRUCK", map_id: [25, 40], position: { x: 3, y: 3 }, facing: "left", field_controls_locked: dialogue !== null, world_context: { objects: [], triggers: [], dialogue, message: cursor === null ? null : { phase: "printing", cursor, ready: false } } });
  const PC = "If you use a PC, you can store items and POKéMON. | The power of science is staggering!";
  const town = (phase: "printing" | "page_wait", cursor: number): GameStateSnapshot => ({ ...field, location: "LITTLEROOT TOWN", map_id: [0, 9], position: { x: 13, y: 14 }, facing: "right", field_controls_locked: true, world_context: { objects: [], triggers: [], dialogue: PC, message: { phase, cursor, ready: phase === "page_wait" } } });
  it("was 'locked' for every one of the truck presses when off", () => {
    expect(pressResult(truck(null), truck(BOX, 9), ["A"], ALL_PRESS_FACTS)).toBe("locked (field controls locked in a snapshot; no net movement)");
    expect(pressResult(truck(BOX, 40), truck(null), ["A"], ALL_PRESS_FACTS)).toBe("locked (field controls locked in a snapshot; no net movement)");
    expect(pressResult(town("page_wait", 50), town("printing", 47), Array(8).fill("A"), ALL_PRESS_FACTS)).toBe("locked (field controls locked in a snapshot; no net movement)");
  });
  it("names the box as the lock, and says controls are free once it closes", () => {
    expect(pressResult(truck(null), truck(BOX, 9), ["A"], ON)).toBe("dialogue opened (the message box locks field controls until it closes)");
    expect(pressResult(truck(BOX, 9), truck(BOX, 40), ["A"], ON)).toBe("dialogue advanced (message box still open; it locks field controls until it closes)");
    expect(pressResult(truck(BOX, 40), truck(null), ["A"], ON)).toBe("dialogue closed; field controls are free now");
    expect(pressResult(truck(BOX, 40), { ...truck(null), field_controls_locked: true }, ["A"], ON)).toBe("dialogue closed; field controls are still locked");
    expect(pressResult(truck(BOX, 40), truck(null), ["A"], { ...ON, fieldLock: false })).toBe("dialogue closed");
    expect(pressResult(truck(null), truck(BOX, 9), ["A"], { ...ON, fieldLock: false })).toBe("dialogue opened");
  });
  it("counts a conversation restarted inside one A batch, each batch once more", () => {
    const shown = shownAfter(town("printing", 47));
    const A8 = Array<"A">(8).fill("A");
    expect(pressResult(town("page_wait", 50), town("printing", 48), A8, ON, shown)).toBe("conversation restarted: this text was already shown (2nd time)");
    shown.record(town("printing", 48), town("page_wait", 50));
    expect(pressResult(town("page_wait", 50), town("printing", 47), A8, ON, shown)).toBe("conversation restarted: this text was already shown (3rd time)");
    shown.record(town("printing", 47), town("printing", 30));
    expect(shown.timesShown(town("printing", 47))).toBe(2);
  });
  it("leaves moves, warps and an unchanged box to the other results", () => {
    expect(pressResult(truck(BOX, 40), truck(BOX, 40), ["A"], ON)).toBe("locked (field controls locked in a snapshot; no net movement)");
    expect(pressResult(truck(null), { ...truck(BOX, 9), position: { x: 3, y: 2 } }, ["UP"], ON)).toBe("moved (3,3) -> (3,2)");
    expect(pressResult(truck(null), { ...truck(BOX, 9), map_id: [0, 9] }, ["RIGHT"], ON)).toContain("warped during this press");
  });
});

describe("restarted conversations", () => {
  it("counts each time the same text was shown after a closed box", () => {
    const shown = shownAfter(talk(MOM), talk(null));
    expect(pressResult(talk(null), talk(MOM), ["A"], ON, shown)).toBe("conversation restarted: this text was already shown (2nd time)");
    shown.record(talk(MOM));
    shown.record(talk(null));
    expect(pressResult(talk(null), talk(MOM), ["A"], ON, shown)).toBe("conversation restarted: this text was already shown (3rd time)");
  });
  it("is off: today's result; new text or a box already open is not a restart", () => {
    const shown = shownAfter(talk(MOM), talk(null));
    const today = pressResult(talk(null), talk(MOM), ["A"], ALL_PRESS_FACTS);
    expect(pressResult(talk(null), talk(MOM), ["A"], ALL_PRESS_FACTS, shown)).toBe(today);
    expect(pressResult(talk(null), talk("MOM: something new"), ["A"], ON, shown)).toBe("dialogue opened");
    expect(pressResult(talk("MOM: page one"), talk(MOM), ["A"], ON, shown)).toBe("dialogue advanced");
    expect(pressResult(talk(null), talk(null), ["A"], ON, shown)).toBe(pressResult(talk(null), talk(null), ["A"], ALL_PRESS_FACTS));
  });
  it("counts a page that stays on screen once, and pages separately", () => {
    const shown = shownAfter(talk(MOM), talk(MOM), talk("MOM: page two"), talk(null));
    expect(shown.timesShown(talk(MOM))).toBe(1);
    expect(shown.timesShown(talk("MOM: page two"))).toBe(1);
    expect(shown.timesShown(talk("never"))).toBe(0);
    expect(shown.timesShown(talk(null))).toBe(0);
    expect(shown.lastShown).toEqual(talk(null));
  });
  it("keys each opening by its text and its place, so the same sign at another tile is not a restart", () => {
    const sign = "LITTLEROOT TOWN: A town that can't be shaded any hue.";
    const at = (x: number, map: [number, number] = [0, 9]): GameStateSnapshot => ({ ...talk(null), map_id: map, position: { x, y: 4 }, world_context: { objects: [], triggers: [], dialogue: null } });
    const reading = (x: number, map: [number, number] = [0, 9]): GameStateSnapshot => ({ ...at(x, map), world_context: { objects: [], triggers: [], dialogue: sign } });
    const shown = shownAfter(reading(4), at(4));
    expect(pressResult(at(9), reading(9), ["A"], ON, shown)).toBe("dialogue opened");
    expect(pressResult(at(4, [1, 0]), reading(4, [1, 0]), ["A"], ON, shown)).not.toContain("conversation restarted");
    expect(pressResult(at(4), reading(4), ["A"], ON, shown)).toBe("conversation restarted: this text was already shown (2nd time)");
    expect(shown.timesShown(reading(9))).toBe(0);
    expect(shown.timesShown(reading(4))).toBe(1);
  });
  it("names ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th"]);
  });
  it("still reports unavailable before snapshots and coverage errors first", () => {
    expect(pressResult(undefined, talk(MOM), ["A"], ON, shownAfter(talk(MOM)))).toBe("unavailable (no verified before snapshot)");
    const broken = { ...talk(null), active_ui: { phase: "x", selected: null, ready: null, controls: "", diagnostic: "unknown owner" } };
    expect(pressResult(broken, talk(MOM), ["A"], ON, shownAfter(talk(MOM)))).toContain("state coverage error");
  });
});

const SERVER = "http://127.0.0.1:8000";
function png(): string {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(240, 16);
  bytes.writeUInt32BE(160, 20);
  return bytes.toString("base64");
}
function server(script: { observe: GameStateSnapshot; before: GameStateSnapshot; after: GameStateSnapshot }): typeof fetch {
  let observed = 0;
  return vi.fn<typeof fetch>().mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.slice(SERVER.length);
    const state = path === "/pokebench/observation" ? (observed++ === 0 ? script.observe : script.after) : script.before;
    const body = path === "/action" ? { status: "success" } : path === "/queue_status" ? { queue_empty: true } : path === "/pokebench/observation" ? { state_text: "", screenshot_base64: png(), state } : state;
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}
const noHooks = { beforePress: () => undefined, afterPress: () => Promise.resolve() };
const instant = { sleep: () => Promise.resolve(), now: () => 0 };
const features = (on: boolean): FeatureSet => ({ ...ALL_ON, "transition-press-result-v1": on });
const text = (result: { content: readonly { type: string }[] }): string => { const item = result.content[1]; return item !== undefined && "text" in item && typeof item.text === "string" ? item.text : ""; };

describe("production factory", () => {
  it("threads the switch from a FeatureSet through toolSwitches into the press tool", () => {
    expect(toolSwitches(features(true)).transitions).toBe(true);
    expect(toolSwitches(features(false)).transitions).toBe(false);
    expect(ALL_TOOL_SWITCHES.transitions).toBe(false);
  });
  it.each([true, false])("observe then press: the shared tracker sees what observe showed (switch %s)", async (on) => {
    const [observe, press] = gameTools(SERVER, noHooks, server({ observe: upstairs, before: downstairs, after: stepped }), toolSwitches(features(on)), instant);
    await observe.execute("o", {});
    const result = await press.execute("p", { buttons: ["UP"] });
    expect(text(result)).toBe(on
      ? "pressed UP\nPress result: warped before this press (carried over from your previous action; your last result still showed the old map): LITTLEROOT TOWN BRENDANS HOUSE 2F [map 1/1] (7,1) -> LITTLEROOT TOWN BRENDANS HOUSE 1F [map 1/0] (8,3); this press: moved (8,3) -> (8,2)\n\n"
      : "pressed UP\nPress result: moved (8,3) -> (8,2)\n\n");
  });
  it("a press tool remembers its own previous result without observe", async () => {
    let call = 0;
    const states = [upstairs, upstairs, downstairs, stepped];
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.slice(SERVER.length);
      const body = path === "/action" ? { status: "success" } : path === "/queue_status" ? { queue_empty: true } : path === "/pokebench/observation" ? { state_text: "", screenshot_base64: png(), state: states[call++] } : states[call++];
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    const press = pressTool(SERVER, noHooks, fetchFn, instant, toolSwitches(features(true)));
    await press.execute("first", { buttons: ["UP"] });
    expect(text(await press.execute("second", { buttons: ["UP"] }))).toContain("warped before this press");
  });
  it("observe records into a tracker it is given", async () => {
    const shown = new ShownStates();
    await observeTool(SERVER, server({ observe: upstairs, before: upstairs, after: upstairs }), ALL_TOOL_SWITCHES, shown).execute("o", {});
    expect(shown.lastShown).toEqual(upstairs);
  });
  it("objective game tools share one tracker between observe and press", async () => {
    let seq = 0;
    const tracker = new ObjectiveTracker("Reach gym", () => undefined);
    const recorder = {
      recordState: (state: GameStateSnapshot) => { const event = { v: 1 as const, run: "transition", t: "2026-10-15T00:00:00.000-04:00", turn: 1, seq: seq++, type: "state" as const, ...state }; tracker.observe(event); return event; },
      buttonPress: () => undefined,
      afterPress: () => Promise.resolve(),
    };
    recorder.recordState(upstairs);
    tracker.set({ title: "Go downstairs", supports_goal: "Reach gym", evidence: [0], completion: { kind: "state", field: "party_count", value: 1 }, obstacle: "", next_decision: "Walk" });
    const tools = objectiveGameTools(tracker, recorder, SERVER, server({ observe: upstairs, before: downstairs, after: stepped }), toolSwitches(features(true)));
    const observe = tools.find((tool) => tool.name === "observe"), press = tools.find((tool) => tool.name === "press");
    if (observe === undefined || press === undefined) throw new Error("missing tools");
    await observe.execute("o", {});
    expect(text(await press.execute("p", { buttons: ["UP"] }))).toContain("warped before this press");
  });
});
