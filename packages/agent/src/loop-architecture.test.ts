import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as loopFacade from "./loop-detection.js";
import { LOOP_RULE_PRIORITY, buildLoopRules, firstLoopHit } from "./loop/rules/index.js";
import { LOOP_POLICY, type CompletedCall, type LoopHit, type LoopRule, type LoopRuleId } from "./loop/types.js";
import { InterfaceRules } from "./loop/rules/interfaces.js";
import { LoopDetector, type LoopNotice } from "./loop-detection.js";
import type { GameStateSnapshot } from "./game-state.js";
import type { RunEvent } from "./events.js";
import { CallTracker } from "./loop/call-tracker.js";

describe("loop rule architecture", () => {
  it("preserves the compatibility facade's exact runtime and type export surface", () => {
    const runtimeExports = [
      "BATTLE_MENU_LOOP_MESSAGE",
      "BATTLE_MENU_RETURNS",
      "LOOP_POLICY",
      "LoopDetector",
      "NATIVE_PROGRESS_MILESTONES",
      "PUSHBACK_MESSAGE",
      "REVISIT_MESSAGE",
      "TRIGGER_SCRIPT_MESSAGE",
      "WAITING_MESSAGE",
      "battleState",
      "readLoopMode",
      "scriptHeld",
      "semanticState",
      "transientLock",
      "waitingState",
    ];
    expect(Object.keys(loopFacade).sort()).toEqual(runtimeExports);
    const facadePath = fileURLToPath(new URL("./loop-detection.ts", import.meta.url));
    const program = ts.createProgram([facadePath], {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
    });
    const source = program.getSourceFile(facadePath);
    const facadeSymbol = source === undefined ? undefined : program.getTypeChecker().getSymbolAtLocation(source);
    expect(facadeSymbol).toBeDefined();
    const allExports = facadeSymbol === undefined
      ? []
      : program.getTypeChecker().getExportsOfModule(facadeSymbol).map((symbol) => symbol.name).sort();
    expect(allExports).toEqual([
      ...runtimeExports,
      "CompletedCall",
      "LoopKind",
      "LoopMode",
      "LoopNotice",
      "LoopPolicy",
      "StallKind",
    ].sort());
  });

  it("keeps detector priority explicit and stable", () => {
    expect(LOOP_RULE_PRIORITY).toEqual([
      "planning",
      "observation",
      "interaction-message",
      "restarted-dialogue",
      "clock-view",
      "closed-dialogue",
      "ineffective-action",
      "state-cycle",
      "pushback",
      "revisit",
      "transition",
      "battle-menu",
      "trigger-script",
      "rejection",
    ]);
  });

  it("builds one ordered rule for every priority entry", () => {
    const rules: readonly LoopRule[] = buildLoopRules({});
    expect(rules.map((rule) => rule.id)).toEqual(LOOP_RULE_PRIORITY);
    expect(new Set(rules.map((rule) => rule.id)).size).toBe(rules.length);
  });

  it("selects the first candidate in registry order", () => {
    const rules = buildLoopRules({});
    const call: CompletedCall = { name: "observe", args: {}, isError: false, text: "ok", seq: 41 };
    const hit = (kind: LoopHit["kind"]): LoopHit => ({
      kind,
      message: kind,
      evidenceSeqs: [41],
      recovery: "novel-state",
    });
    const candidates = new Map<LoopRuleId, LoopHit>([
      ["rejection", hit("rejection")],
      ["observation", hit("observation")],
      ["planning", hit("planning")],
    ]);
    expect(firstLoopHit(rules, call, { seq: 41, policy: LOOP_POLICY, candidates })?.rule.id).toBe("planning");
  });

  it("uses registry priority through the production coordinator on a real collision", () => {
    const notices: LoopNotice[] = [];
    const detector = new LoopDetector(
      (notice) => notices.push(notice),
      { ...LOOP_POLICY, cycleRepeats: 2, ineffective: 99 },
      "enforced",
      false,
      undefined,
      true,
    );
    const state = (map: [number, number]): GameStateSnapshot => ({
      screen: "overworld",
      started: true,
      name: "RED",
      location: map[1] === 0 ? "MAP A" : "MAP B",
      map_id: map,
      position: { x: 0, y: 0 },
      facing: "up",
      field_controls_locked: false,
      in_battle: false,
      party: [],
      money: 0,
      badges: [],
      play_time_s: 0,
      world_context: { objects: [], triggers: [], dialogue: null, message: null },
    });
    const a = state([0, 0]);
    const b = state([0, 1]);
    const move = (before: GameStateSnapshot, after: GameStateSnapshot, button: string): CompletedCall => ({
      name: "press",
      args: { buttons: [button] },
      isError: false,
      text: "ok",
      beforeState: before,
      state: after,
    });
    detector.complete(move(a, b, "UP"));
    detector.complete(move(b, a, "DOWN"));
    detector.complete(move(a, b, "UP"));
    detector.complete(move(b, a, "DOWN"));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "cycle", phase: "warning" });
    expect(notices[0]?.message).toContain("short state/action pattern");
  });

  it("keeps lifecycle callbacks out of pattern-rule APIs", () => {
    const source = readFileSync(new URL("./loop/rules/interfaces.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/recover/i);
    const rules = new InterfaceRules(3, false, false, true);
    expect(rules.observeState.bind(rules)).toHaveLength(1);
    expect(rules.menuReturn.bind(rules)).toHaveLength(2);
    expectTypeOf<Parameters<InterfaceRules["observeState"]>>().toEqualTypeOf<[state: GameStateSnapshot]>();
    expectTypeOf<Parameters<InterfaceRules["menuReturn"]>>().toEqualTypeOf<[call: CompletedCall, seq: number]>();
    const observeState: (state: GameStateSnapshot) => boolean = (state) => rules.observeState(state);
    const menuReturn: (call: CompletedCall, seq: number) => { readonly evidence: number[] | null; readonly stateReset: boolean } =
      (call, seq) => rules.menuReturn(call, seq);
    const state: GameStateSnapshot = {
      screen: "overworld", started: true, name: "RED", location: "MAP", map_id: [0, 0], position: { x: 0, y: 0 },
      facing: "up", field_controls_locked: false, in_battle: false, party: [], money: 0, badges: [], play_time_s: 0,
    };
    expect(observeState(state)).toBe(true);
    expect(menuReturn({ name: "press", args: {}, isError: false, text: "ok", state }, 9)).toEqual({
      evidence: null,
      stateReset: true,
    });
  });

  it.each(["navigate_to_target", "explore_map"])("tracks %s as a state-changing game tool", (name) => {
    const tracker = new CallTracker();
    const before: GameStateSnapshot = {
      screen: "overworld", started: true, name: "RED", location: "MAP", map_id: [0, 0], position: { x: 0, y: 0 },
      facing: "right", field_controls_locked: false, in_battle: false, party: [], money: 0, badges: [], play_time_s: 0,
    };
    const after = { ...before, position: { x: 1, y: 0 } };
    tracker.state({ ...before, type: "state", seq: 1 } as unknown as Extract<RunEvent, { type: "state" }>);
    tracker.start({ type: "tool_call", seq: 2, id: "call", name, args: {} } as unknown as Extract<RunEvent, { type: "tool_call" }>);
    tracker.button({ type: "button_press", seq: 3, tool_call_id: "call", before_state_seq: 1, buttons: ["RIGHT"] } as unknown as Extract<RunEvent, { type: "button_press" }>, false);
    tracker.state({ ...after, type: "state", seq: 4 } as unknown as Extract<RunEvent, { type: "state" }>);
    const completed = tracker.finish({ type: "tool_result", seq: 5, id: "call", name, args: {}, is_error: false, text: "ok", state_seq: 4 } as unknown as Extract<RunEvent, { type: "tool_result" }>);
    expect(completed).toMatchObject({ name, acted: true, beforeState: before, state: after });

    const notices: LoopNotice[] = [];
    const detector = new LoopDetector((notice) => notices.push(notice), { ...LOOP_POLICY, planning: 2, recovery: 1 }, "enforced");
    detector.complete({ name: "set_objective", args: {}, isError: false, text: "ok" });
    detector.complete({ name: "set_objective", args: {}, isError: false, text: "ok" });
    detector.complete(completed);
    expect(notices.map(({ kind, phase }) => [kind, phase])).toEqual([["planning", "warning"], ["planning", "recovered"]]);
  });
});
