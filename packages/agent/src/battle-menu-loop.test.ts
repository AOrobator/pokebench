import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES} from "./features.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {BATTLE_MENU_LOOP_MESSAGE,LOOP_POLICY,LoopDetector,type LoopKind,type LoopNotice} from "./loop-detection.js";
import type {GameStateSnapshot} from "./game-state.js";

const ID = "battle-menu-loop-v1";

function battle(cursor: number, opts: {hp?: number; turn?: number; screen?: string; species?: string} = {}): GameStateSnapshot {
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
      turn: opts.turn ?? 1,
      battlers: [
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
function trip(t: ReturnType<typeof detector>, cursor = 2, opts: {hp?: number; turn?: number; screen?: string} = {}): void {
  const shared: {hp?: number; turn?: number} = {};
  if (opts.hp !== undefined) shared.hp = opts.hp;
  if (opts.turn !== undefined) shared.turn = opts.turn;
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
  });

  it("passes the switch as attachLoopGuard's last argument from live and the decision probe", () => {
    for (const file of ["live.ts", "decision-probe.ts"]) {
      const source = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
      const call = source.slice(source.indexOf("attachLoopGuard("));
      expect(call.slice(0, call.indexOf(");")).trimEnd().endsWith(`features["${ID}"]`), file).toBe(true);
    }
  });
});

describe("battle-menu-loop-v1 registry", () => {
  it("is a default-off guard with no dependency, recorded last", () => {
    expect(featureInfo(ID)).toMatchObject({group: "guard", needs: null, switchable: true});
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
    expect(playHarnessFeatures(ALL_ON, null).at(-1)).toBe(ID);
    expect(playHarnessFeatures({...ALL_ON, [ID]: false}, null)).not.toContain(ID);
    expect(flagFeatures({loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true})[ID]).toBe(false);
    const raw = JSON.parse(readFileSync(fileURLToPath(new URL("../../../experiments/battle-menu-loop.json", import.meta.url)), "utf8")) as {incumbent: {features: Record<string, boolean>}};
    expect(Object.keys(raw.incumbent.features)).toEqual([...SWITCHABLE_FEATURES]);
    const entry = parseExperiment(raw);
    expect(entry.queuePosition).toBeUndefined();
    expect(entry.changedFeature).toBe(ID);
    const {incumbent, candidate} = experimentArms(entry);
    expect(SWITCHABLE_FEATURES.filter((id) => incumbent.features[id] !== candidate.features[id])).toEqual([ID]);
    expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
  });
});
