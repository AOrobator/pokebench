import { describe, expect, it } from "vitest";
import { createBroadcastReducer, wantedLine } from "./broadcast-reducer.js";

const RUN = "r1";
const at = (s: number): string => new Date(Date.UTC(2026, 10, 6, 12, 0, 0) + s * 1000).toISOString();
const line = (s: number, type: string, rest: Record<string, unknown>): string => JSON.stringify({ v: 1, run: RUN, seq: 1, t: at(s), type, turn: 1, ...rest });
const start = (startState: unknown = { kind: "boot" }): string => line(0, "run_start", { model: { id: "deepseek/deepseek-v4.1-flash" }, start_state: startState });
const reduced = (...lines: string[]) => { const r = createBroadcastReducer(); for (const l of lines) r.add(l); return r; };
const STATE = { location: "FORTREE CITY GYM", in_battle: false, battle: null, trainer_opponent: null, badges: ["STONE"], party: [{ species: "SWAMPERT", level: 45, hp: 24, max_hp: 159 }] };

describe("the broadcast reducer", () => {
  it("names a boot run and a checkpoint run from their start and first place", () => {
    expect(reduced(start()).header).toMatchObject({ run: RUN, model: "deepseek/deepseek-v4.1-flash", kind: "boot", save: null });
    const saved = reduced(start({ kind: "save_state", path: "/x/y.state", sha1: "a".repeat(40) }), line(1, "state", { ...STATE, location: "FORTREE CITY" }), line(2, "state", { ...STATE, location: "ROUTE 120" }));
    expect(saved.header).toMatchObject({ kind: "save", save: "FORTREE" });
  });

  it("times everything from run_start and keeps presses, tool calls and frames", () => {
    const r = reduced(start(),
      line(3, "button_press", { buttons: ["A"], tool_call_id: "c" }),
      line(4, "tool_call", { id: "c", name: "battle_action", args: { action: "fight", move: "ROCK TOMB" } }),
      line(5, "tool_result", { id: "c", name: "battle_action", is_error: false, frames: [{ path: "frames/008208_0.png", sha1: "b" }] }));
    expect(r.items).toEqual([
      { k: "press", t: 3, b: ["A"] },
      { k: "tool", t: 4, turn: 1, name: "battle_action", detail: "FIGHT → ROCK TOMB" },
      { k: "frame", t: 5, f: "008208_0.png" },
    ]);
  });

  it.each([
    ["press", { buttons: ["UP", "A"] }, "UP A"],
    ["navigate_to", { x: 23, y: 10, map_id: [24, 22] }, "to (23,10)"],
    ["navigate_to_target", { map_id: [0, 36], target: { direction: "EAST", kind: "connection" } }, "to EAST exit"],
    ["navigate_to_target", { target: { kind: "warp", x: 5, y: 6 } }, "to warp (5,6)"],
    ["navigate_to_target", { target: { kind: "object", local_id: 1 } }, "to object"],
    ["battle_action", { action: "run" }, "RUN"],
    ["select_menu_option", { phase: "start_menu", option: "BAG" }, "BAG"],
    ["learn_move", { forget: "none" }, "forget none"],
    ["observe", {}, ""],
  ])("describes %s %j", (name, args, detail) => {
    expect(reduced(start(), line(1, "tool_call", { id: "c", name, args })).items).toEqual([{ k: "tool", t: 1, turn: 1, name, detail }]);
  });

  it("streams thinking and adds the whole thought only when the deltas did not carry it", () => {
    const delta = (s: number, thinking: string) => line(s, "assistant_delta", { thinking, text: "" });
    const said = (s: number, thinking: string | undefined, text: string) => line(s, "assistant", { ...(thinking === undefined ? {} : { thinking }), text, tool_calls: [], usage: { input: 10, output: 2, cache_read: 5, cache_write: 0 } });
    const same = reduced(start(), delta(1, "Let "), delta(2, "me"), said(3, "Let me", "ok"));
    expect(same.items).toEqual([{ k: "think", t: 1, turn: 1, d: "Let " }, { k: "think", t: 2, turn: 1, d: "me" }, { k: "use", t: 3, input: 10, output: 2, cacheRead: 5, cacheWrite: 0 }]);
    expect(reduced(start(), said(3, "Whole", "ok")).items[0]).toEqual({ k: "thought", t: 3, turn: 1, d: "Whole" });
    expect(reduced(start(), said(3, undefined, "Only words")).items[0]).toEqual({ k: "thought", t: 3, turn: 1, d: "Only words" });
  });

  it("emits a state only when what the page shows changes", () => {
    const r = reduced(start(), line(1, "state", STATE), line(2, "state", STATE), line(3, "state", { ...STATE, party: [{ species: "SWAMPERT", level: 45, hp: 20, max_hp: 159 }] }));
    expect(r.items).toEqual([
      { k: "state", t: 1, where: "FORTREE CITY GYM", foe: null, badges: ["STONE"], party: [{ name: "SWAMPERT", level: 45, hp: 24, maxHp: 159 }] },
      { k: "state", t: 3, where: "FORTREE CITY GYM", foe: null, badges: ["STONE"], party: [{ name: "SWAMPERT", level: 45, hp: 20, maxHp: 159 }] },
    ]);
  });

  it("names the trainer or wild Pokémon being fought", () => {
    const trainer = reduced(start(), line(1, "state", { ...STATE, in_battle: true, trainer_opponent: { name: "WINONA", battle_active: true } }));
    expect(trainer.items[0]).toMatchObject({ foe: "WINONA" });
    const wild = reduced(start(), line(1, "state", { ...STATE, in_battle: true, trainer_opponent: {}, battle: { battlers: [{ position: 0, species: "SWAMPERT" }, { position: 1, species: "TROPIUS" }] } }));
    expect(wild.items[0]).toMatchObject({ foe: "WILD TROPIUS" });
    const over = reduced(start(), line(1, "state", { ...STATE, in_battle: false, trainer_opponent: { name: "WINONA", battle_active: false } }));
    expect(over.items[0]).toMatchObject({ foe: null });
  });

  it("keeps earned milestones only, and marks the end", () => {
    const r = reduced(start(),
      line(1, "milestone", { name: "GAME_RUNNING", origin: "observed" }),
      line(1, "milestone", { name: "STONE_BADGE", origin: "present_at_start" }),
      line(2, "milestone", { name: "FEATHER_BADGE", origin: "observed" }),
      line(9, "run_end", { reason: "operator_stop" }));
    expect(r.items).toEqual([{ k: "mile", t: 2, name: "FEATHER_BADGE" }, { k: "end", t: 9 }]);
    expect(r.ended).toBe(true);
  });

  it("skips what it cannot read, so a newer build's run still plays", () => {
    const r = reduced(start(), "{not json", line(1, "button_press", { buttons: "A" }), line(2, "button_press", { buttons: [] }), line(3, "button_press", { buttons: ["B"] }));
    expect(r.items).toEqual([{ k: "press", t: 3, b: ["B"] }]);
  });

  it("drops events before run_start and answers wantedLine from a line's head alone", () => {
    expect(reduced(line(1, "button_press", { buttons: ["B"] })).items).toEqual([]);
    expect(wantedLine(line(1, "state", STATE).slice(0, 200))).toBe(true);
    expect(wantedLine(line(1, "native_action", {}).slice(0, 200))).toBe(false);
  });
});
