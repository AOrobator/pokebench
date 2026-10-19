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
      // Enumerate this facade's explicit exports; tsc checks their target types separately.
      noResolve: true,
      noLib: true,
      types: [],
      target: ts.ScriptTarget.ESNext,
    });
    const source = program.getSourceFile(facadePath);
    // A star export would require resolving another module and could hide a new type-only export.
    expect(source?.statements.filter(ts.isExportDeclaration).every((declaration) => declaration.exportClause !== undefined)).toBe(true);
    const facadeSymbol = source === undefined ? undefined : program.getTypeChecker().getSymbolAtLocation(source);
    expect(facadeSymbol).toBeDefined();
    const allExports = facadeSymbol === undefined
      ? []
      : program.getTypeChecker().getExportsOfModule(facadeSymbol).map((symbol) => symbol.name).sort();
    // Export enumeration must not build the harness dependency graph or ambient libraries.
    expect(program.getSourceFiles().map((file) => file.fileName)).toEqual([facadePath]);
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
});
