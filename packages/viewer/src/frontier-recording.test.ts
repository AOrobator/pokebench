import { expect, it } from "vitest";
import { RunView } from "./model.js";
import { Log, START, state } from "../test-support/events.js";
const clocked = { name_confirmed: true, intro_stage: 7 as const, rival_stage: 0 as const, birch_lab_stage: 0 as const, petalburg_gym_stage: 0 as const, woods_stage: 0 as const, clock_set: true, rival_battle_won: false, pokedex_received: false, running_shoes_received: false, starter_tutorial_complete: false, rustboro_gym_complete: false, stone_badge: false, rock_tomb_received: false };
const quiet = { badges: [] as string[], party: [] as { species: string; level: number; hp: number; max_hp: number }[] };
const atLab = (lab: number) => ({ ...clocked, rival_stage: 4 as const, birch_lab_stage: lab as 0 });
it("does not recover a post-handoff Route 101 entry without a return, a pre-handoff witness, or a connected map", () => {
  const cases: [string, number][][] = [
    [["LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 2], ["LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 3], ["LITTLEROOT TOWN", 3], ["LITTLEROOT TOWN BRENDANS HOUSE 1F", 3], ["LITTLEROOT TOWN", 3]],
    [["ROUTE101", 3], ["LITTLEROOT TOWN", 3], ["ROUTE101", 3]],
    [["LITTLEROOT TOWN", 2], ["LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 3], ["ROUTE101", 3]],
  ];
  for (const rows of cases) {
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) } });
    rows.forEach(([location, lab], i) => log.add(1000 * (i + 1), state({ ...quiet, location, story: atLab(lab) })));
    const view = new RunView();
    for (const event of log.events) view.apply(event);
    expect(view.milestones.some(m => m.name === "ROUTE_101_AFTER_HANDOFF")).toBe(false);
  }
});
const justSet = { ...clocked, intro_stage: 6 as const };
it("does not recover a bedroom exit after Mom's rival instruction, from the rival's bedroom, or for a run that records the split natively", () => {
  const cases: [string, typeof clocked | typeof justSet, string[]][][] = [
    [["LITTLEROOT TOWN BRENDANS HOUSE 2F", clocked, []], ["LITTLEROOT TOWN BRENDANS HOUSE 1F", clocked, []]],
    [["LITTLEROOT TOWN MAYS HOUSE 2F", justSet, []], ["LITTLEROOT TOWN BRENDANS HOUSE 1F", justSet, []]],
    [["LITTLEROOT TOWN BRENDANS HOUSE 2F", justSet, ["bedroom-exit-v1"]], ["LITTLEROOT TOWN BRENDANS HOUSE 1F", justSet, []]],
  ];
  for (const rows of cases) {
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) }, harness_features: rows[0]?.[2] ?? [] });
    rows.forEach(([location, story], i) => log.add(1000 * (i + 1), state({ ...quiet, location, story })));
    const view = new RunView();
    for (const event of log.events) view.apply(event);
    expect(view.milestones.some(m => m.name === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK")).toBe(false);
  }
});
it("does not recover leave-home for a save inside home after the rival bedroom visit", () => {
  for (const rival_stage of [2, 3, 4] as const) {
    const later = { ...clocked, rival_stage: rival_stage as 0 };
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/LATER.state", sha1: "a".repeat(40) }, harness_features: ["post-clock-navigation-milestones-v1"] });
    log.add(1000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 2F", story: later }));
    log.add(2000, state({ ...quiet, location: "LITTLEROOT TOWN BRENDANS HOUSE 1F", story: later }));
    log.add(3000, state({ ...quiet, location: "LITTLEROOT TOWN", story: later }));
    const view = new RunView();
    for (const event of log.events) view.apply(event);
    expect(view.milestones.some(m => m.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK")).toBe(false);
  }
});
it("does not recover the return trip without a pre-battle witness or for a run that records the splits natively", () => {
  for (const features of [[], ["route103-rival-splits-v1"]]) {
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/LATER.state", sha1: "a".repeat(40) }, harness_features: features });
    if (features.length > 0) log.add(500, state({ ...quiet, location: "ROUTE103", story: atLab(3) }));
    for (const [i, location] of ["OLDALE TOWN", "ROUTE101", "LITTLEROOT TOWN"].entries()) log.add(1000 * (i + 1), state({ ...quiet, location, story: atLab(4) }));
    const view = new RunView();
    for (const event of log.events) view.apply(event);
    expect(view.milestones.some(m => m.name === "ROUTE_101_AFTER_RIVAL_BATTLE" || m.name === "LITTLEROOT_AFTER_RIVAL_BATTLE")).toBe(false);
  }
});
it("does not derive the return trip from a witness that already shows the rival beaten", () => {
  const log = new Log();
  log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/LATER.state", sha1: "a".repeat(40) }, harness_features: [] });
  log.add(500, state({ ...quiet, location: "ROUTE103", story: atLab(3), route103_rival: { battle_active: false, defeated: true, oldale_stage: 0 } }));
  for (const [i, location] of ["OLDALE TOWN", "ROUTE101", "LITTLEROOT TOWN"].entries()) log.add(1000 * (i + 1), state({ ...quiet, location, story: atLab(4) }));
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  expect(view.milestones.some(m => m.name.endsWith("AFTER_RIVAL_BATTLE"))).toBe(false);
});
it("does not derive the return trip from a legacy Route 103 state, in or after the battle, with no reader field", () => {
  for (const extra of [{ in_battle: true }, {}]) {
    const log = new Log();
    log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/LATER.state", sha1: "a".repeat(40) }, harness_features: [] });
    log.add(500, state({ ...quiet, location: "ROUTE103", story: atLab(3), ...extra }));
    for (const [i, location] of ["OLDALE TOWN", "ROUTE101", "LITTLEROOT TOWN"].entries()) log.add(1000 * (i + 1), state({ ...quiet, location, story: atLab(4) }));
    const view = new RunView();
    for (const event of log.events) view.apply(event);
    expect(view.milestones.some(m => m.name.endsWith("AFTER_RIVAL_BATTLE"))).toBe(false);
  }
});
