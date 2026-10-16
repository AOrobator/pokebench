import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { Log, START, state } from "../test-support/events.js";
import { StateMilestones } from "../../agent/src/milestones.js";
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
  expect([...loadRecoveredRival(runDir([header(), row(3, true, false, 0)]))]).toEqual([[3, { rival: { battle_active: true, defeated: false, oldale_stage: 0 }, raw_ram: "raw-ram/00000001.json.gz", sha256: "a".repeat(64) }]]);
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

// A raw-RAM archive in the recorder's format with the given EWRAM/IWRAM bytes set.
function archive(dir: string, n: number, set: readonly (readonly [number, readonly number[]])[]): { path: string; sha256: string } {
  const ewram = Buffer.alloc(0x40000), iwram = Buffer.alloc(0x8000);
  for (const [address, bytes] of set) (address >= 0x03000000 ? iwram : ewram).set(bytes, address - (address >= 0x03000000 ? 0x03000000 : 0x02000000));
  const region = (name: string, address: number, data: Buffer) => ({ name, address, size: data.length, data_base64: data.toString("base64"), sha256: createHash("sha256").update(data).digest("hex") });
  const body = gzipSync(JSON.stringify({ v: 1, sequence: n, frame: n, regions: [region("ewram", 0x02000000, ewram), region("iwram", 0x03000000, iwram)] }));
  const path = `raw-ram/${String(n).padStart(8, "0")}.json.gz`;
  mkdirSync(join(dir, "raw-ram"), { recursive: true });
  writeFileSync(join(dir, path), body);
  return { path, sha256: createHash("sha256").update(body).digest("hex") };
}
const SAVE1 = 0x02025a18;
const u16 = (v: number) => [v & 255, v >> 8];
const memory = (fight: boolean, won: boolean): (readonly [number, readonly number[]])[] => [
  [0x03005d8c, [0x18, 0x5a, 0x02, 0x02]],
  [0x02038bca, u16(fight ? 535 : 0)],
  [0x02022fec, [fight ? 8 : 0, 0, 0, 0]],
  [SAVE1 + 0x1270 + (0x717 >> 3), [won ? 1 << (0x717 & 7) : 0]],
];
it("re-decodes the snapshot behind every row that changes a value, and voids a file whose values the RAM does not support", () => {
  const dir = runDir([header()]);
  const calm = archive(dir, 1, memory(false, false)), fight = archive(dir, 2, memory(true, false)), won = archive(dir, 3, memory(false, true));
  const rows = (claims: readonly (readonly [number, { path: string; sha256: string }, boolean, boolean])[]) => [header(), ...claims.map(([seq, a, battle_active, defeated]) => ({ seq, raw_ram: a.path, sha256: a.sha256, route103_rival: { battle_active, defeated, oldale_stage: 0 } }))];
  const write = (lines: readonly unknown[]) => { writeFileSync(join(dir, "derived", "route103_rival.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n"); return loadRecoveredRival(dir); };
  expect(write(rows([[1, calm, false, false], [2, fight, true, false], [3, won, false, true]])).size).toBe(3);
  expect(write(rows([[1, calm, false, false], [2, calm, true, false]])).size).toBe(0);
  expect(write(rows([[1, calm, false, false], [3, calm, false, true]])).size).toBe(0);
  expect(write(rows([[1, { ...calm, sha256: "b".repeat(64) }, false, false]])).size).toBe(0);
  const log = new Log();
  log.add(0, START);
  const notInBattle = log.add(1000, state({ location: "ROUTE103", in_battle: false, raw_ram: { v: 1, sequence: 2, frame: 2, path: fight.path, sha256: fight.sha256 } }));
  const recovered = write(rows([[notInBattle.seq, fight, true, false]]));
  expect(recovered.size).toBe(1);
  expect(withRecovered(notInBattle, recovered)).toBe(notInBattle);
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
  const native = states.flatMap((s) => (s.type === "state" && "started" in s ? tracker.observe(s, s.seq) : [])).filter((m) => ["RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_OLDALE_SEND_OFF"].includes(m.name)).map((m) => [m.name, m.evidence]);
  const view = new RunView();
  for (const event of trip().events) view.apply(event);
  expect(view.milestones.filter((m) => m.derived === true && m.name.startsWith("RIVAL_")).map((m) => [m.name, m.evidence])).toEqual(native);
});
