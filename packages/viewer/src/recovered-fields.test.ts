import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Log, START, state } from "../test-support/events.js";
import { rivalRam, writeArchive } from "../test-support/raw-ram.js";
import { StateMilestones } from "../../agent/src/milestones.js";
import { RunView } from "./model.js";
import { loadRecoveredRival, recoveredAttacher, withRecovered } from "./recovered-fields.js";

const runDir = (rows: readonly unknown[], name = "run-a"): string => {
  const dir = join(mkdtempSync(join(tmpdir(), "pokebench-recovered-")), name);
  mkdirSync(join(dir, "derived"), { recursive: true });
  writeFileSync(join(dir, "derived", "route103_rival.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return dir;
};
const header = (run = "run-a") => ({ v: 1, run, source: "raw-ram-route103-v1" });
const row = (seq: number, battle_active: boolean, defeated: boolean, oldale_stage: number) => ({ seq, raw_ram: "raw-ram/00000001.json.gz", sha256: "a".repeat(64), route103_rival: { battle_active, defeated, oldale_stage } });

it("loads recovered route103_rival rows only from a well-formed side file for this run", () => {
  const dir = runDir([header()]);
  const fight = writeArchive(dir, 1, rivalRam(true, false));
  writeFileSync(join(dir, "derived", "route103_rival.jsonl"), [header(), { seq: 3, raw_ram: fight.path, sha256: fight.sha256, route103_rival: { battle_active: true, defeated: false, oldale_stage: 0 } }].map((l) => JSON.stringify(l)).join("\n") + "\n");
  expect([...loadRecoveredRival(dir)]).toEqual([[3, { rival: { battle_active: true, defeated: false, oldale_stage: 0 }, raw_ram: fight.path, sha256: fight.sha256 }]]);
  expect(loadRecoveredRival(join(tmpdir(), "no-such-run")).size).toBe(0);
  expect(loadRecoveredRival(runDir([header("other-run"), row(3, true, false, 0)])).size).toBe(0);
  expect(loadRecoveredRival(runDir([header(), { ...row(3, true, false, 0), route103_rival: { battle_active: "yes" } }])).size).toBe(0);
  expect(loadRecoveredRival(runDir([{ ...header(), source: "guess" }, row(3, true, false, 0)])).size).toBe(0);
});

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

it("voids the whole side file on a duplicate row", () => {
  expect(loadRecoveredRival(runDir([header(), row(3, true, false, 0), row(3, false, false, 0)])).size).toBe(0);
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
function forgedRun(ram: readonly { fight: boolean; won: boolean; inBattle: boolean }[], claims: readonly (readonly [seq: number, archive: number, battle_active: boolean, defeated: boolean])[]) {
  const dir = runDir([header()]);
  const archives = ram.map((m, i) => writeArchive(dir, i + 1, rivalRam(m.fight, m.won)));
  const log = new Log();
  log.add(0, START);
  const states = ram.map((m, i) => log.add(1000 * (i + 1), state({ location: "ROUTE103", in_battle: m.inBattle, raw_ram: archives[i] })));
  const lines = [header(), ...claims.map(([seq, n, battle_active, defeated]) => ({ seq, raw_ram: archives[n - 1]?.path, sha256: archives[n - 1]?.sha256, route103_rival: { battle_active, defeated, oldale_stage: 0 } }))];
  writeFileSync(join(dir, "derived", "route103_rival.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  const attach = recoveredAttacher(dir);
  return states.map((event) => { const out = attach(event); return out.type === "state" && "started" in out ? out.route103_rival ?? null : null; });
}
const calmRam = { fight: false, won: false, inBattle: false }, fightRam = { fight: true, won: false, inBattle: true }, wonRam = { fight: false, won: true, inBattle: false };
it("attaches honest values, re-decoding the state's own snapshot whenever the attached value changes", () => {
  expect(forgedRun([calmRam, fightRam, wonRam], [[1, 1, false, false], [2, 2, true, false], [3, 3, false, true]])).toEqual([r(false, false, 0), r(true, false, 0), r(false, true, 0)]);
});
it("stops attaching for the run once a changed value disagrees with the state's own snapshot", () => {
  expect(forgedRun([calmRam, calmRam, wonRam], [[1, 1, false, false], [2, 2, true, false], [3, 3, false, true]])).toEqual([r(false, false, 0), null, null]);
  expect(forgedRun([calmRam, { ...fightRam, inBattle: false }], [[1, 1, false, false], [2, 2, true, false]])).toEqual([r(false, false, 0), null]);
});
it("is not fooled by a decoy row that matches no state, or by rows out of order", () => {
  // The decoy (seq 99) carries a genuine post-win receipt; the later claims would be unchecked repeats.
  expect(forgedRun([calmRam, calmRam, calmRam, wonRam], [[1, 1, false, false], [99, 4, false, true], [2, 2, false, true], [3, 3, false, true]])).toEqual([r(false, false, 0), null, null, null]);
  expect(forgedRun([calmRam, calmRam, wonRam], [[3, 3, false, true], [1, 1, false, true], [2, 2, false, true]])).toEqual([null, null, null]);
});

it("refuses a symlinked side file", () => {
  const dir = runDir([header(), row(3, true, false, 0)]);
  const real = join(dir, "derived", "route103_rival.jsonl"), moved = join(dir, "elsewhere.jsonl");
  renameSync(real, moved);
  symlinkSync(moved, real);
  expect(loadRecoveredRival(dir).size).toBe(0);
});

it("derives exactly what the agent's tracker records for the same states", () => {
  const states = trip().events.filter((e) => e.type === "state" && "started" in e);
  const tracker = new StateMilestones({ read: () => Promise.reject(new Error("unused")) });
  tracker.initialize("save_state");
  const native = states.flatMap((s) => ("started" in s ? tracker.observe(s, s.seq) : [])).filter((m) => ["RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_OLDALE_SEND_OFF"].includes(m.name)).map((m) => [m.name, m.evidence]);
  const view = new RunView();
  for (const event of trip().events) view.apply(event);
  expect(view.milestones.filter((m) => m.derived === true && m.name.startsWith("RIVAL_")).map((m) => [m.name, m.evidence])).toEqual(native);
});
