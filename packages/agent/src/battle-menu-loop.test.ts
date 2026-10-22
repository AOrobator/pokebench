import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import {dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES} from "./features.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {checkEvent} from "./events.js";
import {BATTLE_MENU_LOOP_MESSAGE,LOOP_POLICY,LoopDetector,type LoopKind,type LoopNotice} from "./loop-detection.js";
import type {GameStateSnapshot} from "./game-state.js";

const ID = "battle-menu-loop-v1";

function battle(cursor: number, opts: {hp?: number; turn?: number | null; screen?: string; species?: string; battlers?: null | []} = {}): GameStateSnapshot {
  const screen = opts.screen ?? "battle";
  const labels = ["FIGHT", "BAG", "POKEMON", "RUN"];
  return {
    in_battle: true,
    screen,
    started: true,
    party: [],
    badges: [],
    location: null,
    map_id: null,
    active_ui: null,
    battle: {
      diagnostic: null,
      turn: opts.turn === undefined ? 1 : opts.turn,
      battlers: opts.battlers !== undefined
        ? opts.battlers
        : [
            {battler: 1, species: opts.species ?? "WINGULL", hp: opts.hp ?? 17},
            {battler: 0, species: "TORCHIC", hp: 34},
          ],
      player_inputs: screen === "battle"
        ? [{ready: true, phase: "action", action_cursor: cursor, selected: labels[cursor] ?? null}]
        : [],
    },
  } as unknown as GameStateSnapshot;
}

const party = (screen = "party_menu"): GameStateSnapshot => battle(2, {screen});

function detector(on: boolean, supervisor?: (kind: LoopKind, calls: number) => string) {
  const notices: LoopNotice[] = [];
  const d = new LoopDetector(
    (n) => notices.push(n),
    LOOP_POLICY,
    "enforced",
    false,
    supervisor,
    false,
    false,
    false,
    false,
    false,
    on,
  );
  let seq = 1;
  const press = (state: GameStateSnapshot) => {
    d.complete({name: "press", args: {buttons: ["A"]}, isError: false, text: "ok", state, seq});
    seq += 1;
  };
  return {d, notices, press, seq: () => seq};
}

// Open the POKéMON screen, then come back to the same battle-menu cursor.
function trip(t: ReturnType<typeof detector>, cursor = 2, opts: {hp?: number; turn?: number | null; screen?: string; species?: string; battlers?: null | []} = {}): void {
  const shared: {hp?: number; turn?: number | null; species?: string; battlers?: null | []} = {};
  if (opts.hp !== undefined) shared.hp = opts.hp;
  if (opts.turn !== undefined) shared.turn = opts.turn;
  if (opts.species !== undefined) shared.species = opts.species;
  if (opts.battlers !== undefined) shared.battlers = opts.battlers;
  t.press(battle(cursor, {...shared, screen: opts.screen ?? "party_menu"}));
  t.press(battle(cursor, shared));
}

describe("battle-menu-loop-v1", () => {
  it("OFF: four returns to the same menu after the POKéMON screen do not warn", () => {
    const off = detector(false);
    off.press(battle(2));
    for (let i = 0; i < 4; i++) trip(off);
    expect(off.notices).toEqual([]);
  });

  it("ON: one return is a look; the fourth raises the cycle warning", () => {
    const on = detector(true);
    on.press(battle(2));
    trip(on);
    expect(on.notices).toEqual([]);
    trip(on);
    trip(on);
    expect(on.notices).toEqual([]);
    trip(on);
    expect(on.notices.map((n) => [n.kind, n.phase])).toEqual([["cycle", "warning"]]);
    expect(on.notices[0]?.message).toBe(BATTLE_MENU_LOOP_MESSAGE);
    const warning = on.notices[0];
    if (warning === undefined) throw new Error("missing warning");
    expect(checkEvent({
      v: 1, run: "r", seq: 9, t: "2026-10-17T21:19:13.883-04:00", turn: 970, type: "loop_guard",
      ...warning, evidence: [...warning.evidence],
    }).type).toBe("loop_guard");
  });

  it("ON: the BAG screen counts the same way as the POKéMON screen", () => {
    const on = detector(true);
    on.press(battle(1));
    for (let i = 0; i < 3; i++) trip(on, 1, {screen: "bag_menu"});
    expect(on.notices).toEqual([]);
    trip(on, 1, {screen: "bag_menu"});
    expect(on.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: a foe HP change clears the count", () => {
    const on = detector(true);
    on.press(battle(2));
    for (let i = 0; i < 3; i++) trip(on, 2, {hp: 17});
    on.press(battle(2, {hp: 16}));
    for (let i = 0; i < 3; i++) trip(on, 2, {hp: 16});
    expect(on.notices).toEqual([]);
    trip(on, 2, {hp: 16});
    expect(on.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: a new battle turn clears the count", () => {
    const on = detector(true);
    on.press(battle(2, {turn: 1}));
    for (let i = 0; i < 3; i++) trip(on, 2, {turn: 1});
    on.press(battle(2, {turn: 2}));
    for (let i = 0; i < 3; i++) trip(on, 2, {turn: 2});
    expect(on.notices).toEqual([]);
    trip(on, 2, {turn: 2});
    expect(on.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: a species change clears the count", () => {
    const on = detector(true);
    on.press(battle(2, {species: "WINGULL"}));
    for (let i = 0; i < 3; i++) trip(on, 2, {species: "WINGULL"});
    on.press(battle(2, {species: "POOCHYENA"}));
    for (let i = 0; i < 3; i++) trip(on, 2, {species: "POOCHYENA"});
    expect(on.notices).toEqual([]);
    trip(on, 2, {species: "POOCHYENA"});
    expect(on.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: a missing battler list or battle turn does not count as the same menu", () => {
    const missing = detector(true);
    missing.press(battle(2, {battlers: null}));
    for (let i = 0; i < 4; i++) trip(missing, 2, {battlers: null});
    expect(missing.notices).toEqual([]);
    const unread = detector(true);
    unread.press(battle(2, {turn: null}));
    for (let i = 0; i < 4; i++) trip(unread, 2, {turn: null});
    expect(unread.notices).toEqual([]);
    const kept = detector(true);
    kept.press(battle(2));
    for (let i = 0; i < 3; i++) trip(kept);
    for (let i = 0; i < 4; i++) trip(kept, 2, {battlers: null});
    expect(kept.notices).toEqual([]);
    trip(kept);
    expect(kept.notices.map((n) => n.phase)).toEqual(["warning"]);
    const empty = detector(true);
    empty.press(battle(2, {battlers: []}));
    for (let i = 0; i < 4; i++) trip(empty, 2, {battlers: []});
    expect(empty.notices).toEqual([]);
    const keptEmpty = detector(true);
    keptEmpty.press(battle(2));
    for (let i = 0; i < 3; i++) trip(keptEmpty);
    for (let i = 0; i < 4; i++) trip(keptEmpty, 2, {battlers: []});
    expect(keptEmpty.notices).toEqual([]);
    trip(keptEmpty);
    expect(keptEmpty.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: a state event that leaves the battle clears the count", () => {
    const on = detector(true);
    on.press(battle(2));
    for (let i = 0; i < 3; i++) trip(on);
    on.d.observe({
      v: 1, run: "r", seq: 40, t: "2026-10-17T21:19:13.883-04:00", turn: 970, type: "state",
      ...({in_battle: false, screen: "overworld", started: true, party: [], badges: [], location: null, map_id: null} as unknown as GameStateSnapshot),
    });
    trip(on);
    expect(on.notices).toEqual([]);
    for (let i = 0; i < 2; i++) trip(on);
    expect(on.notices).toEqual([]);
    trip(on);
    expect(on.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: moving the cursor from POKéMON to FIGHT starts the count over", () => {
    const on = detector(true);
    on.press(battle(2));
    for (let i = 0; i < 3; i++) trip(on, 2);
    on.press(battle(0));
    for (let i = 0; i < 3; i++) trip(on, 0);
    expect(on.notices).toEqual([]);
    trip(on, 0);
    expect(on.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: a party screen opened during the press still counts when the call ends on the menu", () => {
    const on = detector(true);
    on.press(battle(2));
    for (let i = 0; i < 4; i++) {
      on.d.observe({
        v: 1, run: "r", seq: i + 1, t: "2026-10-17T21:19:13.883-04:00", turn: 961, type: "state", ...party(),
      });
      on.press(battle(2));
    }
    expect(on.notices.map((n) => n.phase)).toEqual(["warning"]);
  });

  it("ON: the supervisor briefing keeps the menu sentence, and leaving the battle ends the episode", () => {
    const on = detector(true, (kind, calls) => `SUPERVISOR: ${kind} at ${String(calls)} calls`);
    on.press(battle(2));
    for (let i = 0; i < 4; i++) trip(on);
    expect(on.notices.find((n) => n.phase === "supervisor")?.message).toContain(BATTLE_MENU_LOOP_MESSAGE);
    expect(on.d.context()).toContain("UP from POKéMON moves to FIGHT");
    expect(on.d.context()).toContain("LEFT from POKéMON does not move");
    on.press({in_battle: false, screen: "overworld"} as GameStateSnapshot);
    expect(on.notices.map((n) => n.phase)).toEqual(["warning", "supervisor", "recovered"]);
    const again = detector(true, (kind, calls) => `SUPERVISOR: ${kind} at ${String(calls)} calls`);
    again.press(battle(2));
    for (let i = 0; i < 4; i++) trip(again);
    again.d.observe({
      v: 1, run: "r", seq: 80, t: "2026-10-17T21:19:13.883-04:00", turn: 971, type: "state",
      ...({in_battle: false, screen: "overworld", started: true, party: [], badges: [], location: null, map_id: null} as unknown as GameStateSnapshot),
    });
    expect(again.notices.map((n) => n.phase)).toEqual(["warning", "supervisor", "recovered"]);
    expect(again.d.context()).toBeNull();
  });

  it("passes the switch to attachLoopGuard from live and the decision probe", () => {
    for (const file of ["live.ts", "decision-probe.ts"]) {
      const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
      const call = source.slice(source.indexOf("attachLoopGuard("));
      expect(call.slice(0, call.indexOf(");")).includes(`features["${ID}"]`), file).toBe(true);
    }
  });
});

describe("battle-menu-loop-v1 registry", () => {
  it("is a default-off guard with no dependency, recorded third to last", () => {
    expect(featureInfo(ID)).toMatchObject({group: "guard", needs: null, switchable: true});
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(SWITCHABLE_FEATURES.at(-106)).toBe(ID);
    expect(playHarnessFeatures(ALL_ON, null).at(-24)).toBe(ID);
    expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false, [ID]: false}, null)).not.toContain(ID);
    expect(flagFeatures({loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true})[ID]).toBe(false);
    const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../../../experiments/battle-menu-loop.json", import.meta.url)), "utf8")) as {incumbent: {features: Record<string, boolean>}};
    expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="birch-intro-pages-v1"&&id!=="shop-interface-v1"&&id!=="progress-aware-cycles-v1"&&id!=="mart-stock-readout-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="yes-no-answer-readout-v1"&&id!=="same-target-no-progress-v1"&&id!=="story-progress-clock-v1"&&id!=="story-battle-heal-gate-v1"&&id!=="duplicate-turn-collapse-v1"&&id!=="auto-talk-v1"&&id!=="positive-supervisor-v1"&&id!=="fixed-point-breaker-v1"&&id!=="story-character-stall-gate-v1"&&id!=="unfinished-activity-v1"&&id!=="exit-labels-v2"&&id!=="heal-before-trainers-v2"&&id!=="gym-heal-warning-v1"&&id!=="respawn-readout-v1"&&id!=="trainer-sight-check-v1"&&id!=="caught-nickname-prompt-v1"&&id!=="fail-open-input-v1"&&id!=="whiteout-healed-v1"&&id!=="field-move-gates-v1"&&id!=="gym-readiness-readout-v1"&&id!=="context-token-budget-v1"&&id!=="briefing-repeat-count-v1"&&id!=="navigate-already-here-v1"&&id!=="original-speed-pacing-v1"&&id!=="semantic-navigation-v2"&&id!=="evolution-decision-v1"&&id!=="observed-instructions-v1"&&id!=="starter-decision-salience-v1"&&id!=="safe-navigation-strides-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="battle-decision-ready-v1"&&id!=="battle-refusal-loop-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"&&id!=="stale-story-goal-v2"&&id!=="visited-terrain-navigation-v1"&&id!=="exp-next-level-v1"&&id!=="pokedex-own-v1"&&id!=="exp-earned-ledger-v1"&&id!=="leader-attempt-ledger-v1"&&id!=="seen-trainers-ledger-v1"&&id!=="party-coverage-v1"&&id!=="said-type-matches-v1"&&id!=="story-goal-player-name-v1"&&id!=="cut-off-reply-feedback-v1"&&id!=="trainer-sight-check-v2"&&id!=="auto-talk-v2"&&id!=="map-wide-triggers-v1"&&id!=="drought-battle-heal-hold-v1"&&id!=="tool-prompt-docs-v1"&&id!=="field-ownership-feedback-v1"&&id!=="move-learn-loop-fingerprint-v1"&&id!=="stale-plan-fact-v1"&&id!=="post-battle-readout-v1"&&id!=="move-learn-tool-v1"&&id!=="move-learn-early-comparison-v1"));
    const entry = parseExperiment(raw);
    expect(entry.queuePosition).toBeUndefined();
    expect(entry.changedFeature).toBe(ID);
    const {incumbent, candidate} = experimentArms(entry);
    expect(SWITCHABLE_FEATURES.filter((id) => incumbent.features[id] !== candidate.features[id])).toEqual([ID]);
    expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
  });
});
