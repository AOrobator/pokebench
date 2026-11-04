import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Log, START, state } from "../test-support/events.js";
import { rivalRam, writeArchive } from "../test-support/raw-ram.js";
import { StateMilestones } from "../../agent/src/milestones.js";
import { RunView } from "./model.js";
import { loadRecoveredRival, recoveredAttacher, recoveredSignature, withRecovered } from "./recovered-fields.js";


const ram = (n: number) => ({ v: 1 as const, sequence: n, frame: n, path: `raw-ram/${String(n).padStart(8, "0")}.json.gz`, sha256: "a".repeat(64) });
const entry = (n: number, rival = { battle_active: true, defeated: false, oldale_stage: 0 }) => ({ rival, raw_ram: ram(n).path, sha256: ram(n).sha256 });
it("attaches a recovered value only to the state it was decoded from, on Route 103 or in Oldale, when the field is missing", () => {
  const log = new Log();
  const start = log.add(0, START);
  const plain = log.add(1, state({ location: "ROUTE103", raw_ram: ram(1) }));
  const native = log.add(2, state({ location: "ROUTE103", raw_ram: ram(2), route103_rival: { battle_active: false, defeated: false, oldale_stage: 0 } }));
  const otherArchive = log.add(3, state({ location: "ROUTE103", raw_ram: { ...ram(3), sha256: "b".repeat(64) } }));
  const elsewhere = log.add(4, state({ location: "LITTLEROOT TOWN", raw_ram: ram(4) }));
  const unarchived = log.add(5, state({ location: "OLDALE TOWN" }));
  const recovered = new Map([plain, native, otherArchive, elsewhere, unarchived].map((e, i) => [e.seq, entry(i + 1)]));
  expect(withRecovered(plain, recovered)).toMatchObject({ route103_rival: { battle_active: true } });
  for (const kept of [native, otherArchive, elsewhere, unarchived, start]) expect(withRecovered(kept, recovered)).toBe(kept);
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

// One run on disk: states 1..n on Route 103 with their own archives, and a side file of claims.

it("derives exactly what the agent's tracker records for the same states", () => {
  const states = trip().events.filter((e) => e.type === "state" && "started" in e);
  const tracker = new StateMilestones({ read: () => Promise.reject(new Error("unused")) });
  tracker.initialize("save_state");
  const native = states.flatMap((s) => ("started" in s ? tracker.observe(s, s.seq) : [])).filter((m) => ["RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_OLDALE_SEND_OFF"].includes(m.name)).map((m) => [m.name, m.evidence]);
  const view = new RunView();
  for (const event of trip().events) view.apply(event);
  expect(view.milestones.filter((m) => m.derived === true && m.name.startsWith("RIVAL_")).map((m) => [m.name, m.evidence])).toEqual(native);
});
