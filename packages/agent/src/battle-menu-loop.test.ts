import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import {featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures} from "./play-preset.js";
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
    expect(SWITCHABLE_FEATURES.at(-133)).toBe(ID);
    expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON), null).at(-24)).toBe(ID);
    expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false, [ID]: false}, null)).not.toContain(ID);
    expect(flagFeatures({loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true})[ID]).toBe(false);
  });
});
