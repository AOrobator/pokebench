import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Log, START, state } from "../test-support/events.js";
import { RunView } from "./model.js";
import { loadRecoveredRival, withRecovered } from "./recovered-fields.js";

const runDir = (rows: readonly unknown[], name = "run-a"): string => {
  const dir = join(mkdtempSync(join(tmpdir(), "pokebench-recovered-")), name);
  mkdirSync(join(dir, "derived"), { recursive: true });
  writeFileSync(join(dir, "derived", "route103_rival.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return dir;
};
const header = (run = "run-a") => ({ v: 1, run, source: "raw-ram-route103-v1" });
const row = (seq: number, battle_active: boolean, defeated: boolean, oldale_stage: number) => ({ seq, raw_ram: "raw-ram/00000001.json.gz", sha256: "a".repeat(64), route103_rival: { battle_active, defeated, oldale_stage } });

it("loads recovered route103_rival rows only from a well-formed side file for this run", () => {
  expect([...loadRecoveredRival(runDir([header(), row(3, true, false, 0)]))]).toEqual([[3, { battle_active: true, defeated: false, oldale_stage: 0 }]]);
  expect(loadRecoveredRival(join(tmpdir(), "no-such-run")).size).toBe(0);
  expect(loadRecoveredRival(runDir([header("other-run"), row(3, true, false, 0)])).size).toBe(0);
  expect(loadRecoveredRival(runDir([header(), { ...row(3, true, false, 0), route103_rival: { battle_active: "yes" } }])).size).toBe(0);
  expect(loadRecoveredRival(runDir([{ ...header(), source: "guess" }, row(3, true, false, 0)])).size).toBe(0);
});

it("attaches a recovered value only to a state event that lacks the field", () => {
  const log = new Log();
  const start = log.add(0, START);
  const plain = log.add(1, state({ location: "ROUTE103" }));
  const native = log.add(2, state({ location: "ROUTE103", route103_rival: { battle_active: false, defeated: false, oldale_stage: 0 } }));
  const recovered = new Map([[plain.seq, { battle_active: true, defeated: false, oldale_stage: 0 }], [native.seq, { battle_active: true, defeated: true, oldale_stage: 2 }]]);
  expect(withRecovered(plain, recovered)).toMatchObject({ route103_rival: { battle_active: true } });
  expect(withRecovered(native, recovered)).toBe(native);
  expect(withRecovered(start, recovered)).toBe(start);
});

const atLab = (lab: number) => ({ name_confirmed: true, intro_stage: 7 as const, rival_stage: 4 as const, birch_lab_stage: lab as 0, petalburg_gym_stage: 0 as const, woods_stage: 0 as const, clock_set: true, rival_battle_won: lab >= 4, pokedex_received: false, running_shoes_received: false, starter_tutorial_complete: false, rustboro_gym_complete: false, stone_badge: false, rock_tomb_received: false });
const r = (battle_active: boolean, defeated: boolean, oldale_stage: number) => ({ battle_active, defeated, oldale_stage });
const trip = (features: string[] = []) => {
  const log = new Log();
  log.add(0, { ...START, start_state: { kind: "save_state", path: "/saves/CLOCK_SET.state", sha1: "a".repeat(40) }, harness_features: features });
  log.add(1000, state({ location: "ROUTE103", story: atLab(3), route103_rival: r(false, false, 0) }));
  log.add(2000, state({ location: "ROUTE103", in_battle: true, screen: "battle", story: atLab(3), route103_rival: r(true, false, 0) }));
  log.add(3000, state({ location: "ROUTE103", story: atLab(3), route103_rival: r(false, true, 0) }));
  log.add(4000, state({ location: "OLDALE TOWN", story: atLab(4), route103_rival: r(false, true, 1) }));
  log.add(5000, state({ location: "OLDALE TOWN", story: atLab(4), route103_rival: r(false, true, 2) }));
  log.add(6000, state({ location: "ROUTE103", in_battle: true, screen: "battle", story: atLab(4), route103_rival: r(true, true, 2) }));
  return log;
};

it("derives the battle start, win and Oldale send-off for a run that predates the splits, once each", () => {
  const view = new RunView();
  for (const event of trip().events) view.apply(event);
  expect(view.milestones.filter((m) => m.derived === true && m.name.startsWith("RIVAL_")).map((m) => [m.name, m.origin, m.evidence])).toEqual([
    ["RIVAL_BATTLE_STARTED", "observed", [2]],
    ["RIVAL_BATTLE_DEFEATED", "observed", [3]],
    ["RIVAL_OLDALE_SEND_OFF", "observed", [4, 5]],
  ]);
});

it("derives nothing for a run that records the splits natively, or without a false value first", () => {
  const native = new RunView();
  for (const event of trip(["route103-rival-splits-v1"]).events) native.apply(event);
  expect(native.milestones.some((m) => m.derived === true && m.name.startsWith("RIVAL_"))).toBe(false);
  const late = new Log();
  late.add(0, { ...START, harness_features: [] });
  late.add(1000, state({ location: "ROUTE103", story: atLab(3), route103_rival: r(true, true, 2) }));
  late.add(2000, state({ location: "OLDALE TOWN", story: atLab(4), route103_rival: r(false, true, 2) }));
  const view = new RunView();
  for (const event of late.events) view.apply(event);
  expect(view.milestones.some((m) => m.name.startsWith("RIVAL_BATTLE_") || m.name === "RIVAL_OLDALE_SEND_OFF")).toBe(false);
});
