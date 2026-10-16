import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Log, START, fullRun, state } from "../test-support/events.js";
import { rivalRam, writeArchive } from "../test-support/raw-ram.js";
import { RunsError, baselineOf, createBaselineReader, listRuns, liveScreenPort, readFrom, runDir } from "./runs.js";

function root(): string {
  return mkdtempSync(join(tmpdir(), "pokebench-viewer-runs-"));
}

function writeRun(runsRoot: string, id: string, log: Log): string {
  const dir = join(runsRoot, id);
  mkdirSync(dir, { recursive: true });
  const lines = log.events.map((event) => JSON.stringify({ ...event, run: id }));
  writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`);
  return join(dir, "events.jsonl");
}

function liveLog(): Log {
  const log = new Log();
  log.add(0, START);
  return log;
}

describe("listRuns", () => {
  it("lists runs newest first with their model and end state", () => {
    const runsRoot = root();
    writeRun(runsRoot, "2026-10-11T22-00-00_a", fullRun());
    writeRun(runsRoot, "2026-10-11T23-00-00_b", liveLog());
    mkdirSync(join(runsRoot, "smoke_no_events"));
    writeFileSync(join(runsRoot, "frames-evictions.jsonl"), "");
    mkdirSync(join(runsRoot, "2026-10-11T21-00-00_bad"));
    writeFileSync(join(runsRoot, "2026-10-11T21-00-00_bad", "events.jsonl"), "{not json\n");
    mkdirSync(join(runsRoot, "2026-10-11T20-00-00_empty"));
    writeFileSync(join(runsRoot, "2026-10-11T20-00-00_empty", "events.jsonl"), "");
    expect(listRuns(runsRoot)).toEqual([
      { id: "2026-10-11T23-00-00_b", model: "think-swarm", started: "2026-10-11T22:00:00.000-04:00", ended: false, reason: null, problem: null },
      { id: "2026-10-11T22-00-00_a", model: "think-swarm", started: "2026-10-11T22:00:00.000-04:00", ended: true, reason: "budget", problem: null },
      { id: "2026-10-11T21-00-00_bad", model: null, started: null, ended: false, reason: null, problem: expect.stringContaining("not JSON") as string },
      { id: "2026-10-11T20-00-00_empty", model: null, started: null, ended: false, reason: null, problem: "no run_start yet" },
    ]);
  });

  it("returns nothing when there is no runs directory", () => {
    expect(listRuns(join(root(), "missing"))).toEqual([]);
  });
});

describe("runDir", () => {
  it("rejects a run id that is not one safe path component", () => {
    expect(() => runDir("/r", "../etc")).toThrow(RunsError);
    expect(() => runDir("/r", "a/b")).toThrow(RunsError);
    expect(runDir("/r", "ok_1")).toBe(join("/r", "ok_1"));
  });
});

describe("readFrom", () => {
  it("reads complete lines from an offset and validates each", () => {
    const runsRoot = root();
    const path = writeRun(runsRoot, "r1", liveLog());
    appendFileSync(path, '{"v":1}\n{"partial":');
    const first = readFrom(path, 0, 0);
    expect(first.results.map((result) => result.ok)).toEqual([true, false]);
    expect(first.results[1]).toMatchObject({ ok: false, line: 2 });
    appendFileSync(path, '"rest"}\n');
    const second = readFrom(path, first.offset, first.lineNo);
    expect(second.results).toHaveLength(1);
    expect(second.results[0]).toMatchObject({ ok: false, line: 3 });
    expect(readFrom(path, second.offset, second.lineNo).results).toEqual([]);
  });

  it("handles multi-byte characters split across reads", () => {
    const runsRoot = root();
    const log = new Log();
    log.add(0, { ...START, system_prompt: "Pokémon ".repeat(3000) });
    const path = writeRun(runsRoot, "r2", log);
    const read = readFrom(path, 0, 0);
    expect(read.results[0]).toMatchObject({ ok: true });
  });

  it("reads nothing from a file that does not exist yet", () => {
    expect(readFrom(join(root(), "nope.jsonl"), 0, 0)).toEqual({ results: [], offset: 0, lineNo: 0 });
  });
});

describe("baselineOf", () => {
  it("returns milestone offsets from the run start", () => {
    const runsRoot = root();
    writeRun(runsRoot, "base", fullRun());
    expect(baselineOf(runsRoot, "base")).toEqual({
      run: "base",
      milestones: [
        { name: "GAME_RUNNING", offsetMs: 10 },
        { name: "PLAYER_NAME_SET", offsetMs: 3100 },
      ],
    });
  });

  it("refuses a baseline with an invalid line or another run's events", () => {
    const runsRoot = root();
    const path = writeRun(runsRoot, "torn", fullRun());
    appendFileSync(path, "{broken\n");
    expect(() => baselineOf(runsRoot, "torn")).toThrow(/line 15/);
    const foreign = fullRun();
    const runsRoot2 = root();
    const dir = join(runsRoot2, "mixed");
    mkdirSync(dir);
    const lines = foreign.events.map((event) => JSON.stringify(event.type === "milestone" ? { ...event, run: "someone-else" } : { ...event, run: "mixed" }));
    writeFileSync(join(dir, "events.jsonl"), `${lines.join("\n")}\n`);
    expect(() => baselineOf(runsRoot2, "mixed")).toThrow(/someone-else/);
  });

  it("fails for a run without a readable start", () => {
    const runsRoot = root();
    mkdirSync(join(runsRoot, "x"));
    writeFileSync(join(runsRoot, "x", "events.jsonl"), "");
    expect(() => baselineOf(runsRoot, "x")).toThrow(RunsError);
  });
});

describe("liveScreenPort", () => {
  it("is the run's own game server port only while the run has no run_end", () => {
    const runsRoot = root();
    writeRun(runsRoot, "live", liveLog());
    writeRun(runsRoot, "done", fullRun());
    expect(liveScreenPort(runsRoot, "live")).toBe(8011);
    expect(liveScreenPort(runsRoot, "done")).toBeNull();
    expect(() => liveScreenPort(runsRoot, "missing")).toThrow(RunsError);
  });
});

it("rejects manual probes and legacy vendor states as benchmark baselines", () => {
  const runsRoot = root();
  const probe = new Log(); probe.add(0, { ...START, harness_features: ["probe"] });
  writeRun(runsRoot, "probe", probe);
  expect(() => baselineOf(runsRoot, "probe")).toThrow(/probe sessions/);
  const legacy = liveLog(); legacy.add(1, { type: "state", turn: 1, mode: "overworld", location: "PETALBURG CITY", position: null, facing: null, in_battle: false, party: [], money: 3000, badges: [], play_time_s: 0 });
  writeRun(runsRoot, "legacy", legacy);
  expect(() => baselineOf(runsRoot, "legacy")).toThrow(/unverified historical/);
});

it("selects previous same-model baseline and deepest then fastest best, from valid completed same-start runs", async () => {
  const { comparisonsOf } = await import("./runs.js");
  const r = root();
  const logged = (offset: number, names: string[], model = "think-swarm", start_state = START.start_state) => {
    const log = new Log();
    log.add(offset, { ...START, harness_features: ["ram-state-v1"], model: { ...START.model, id: model }, start_state });
    log.add(offset + 1, { type: "milestone", turn: 0, name: "GAME_RUNNING", server_timestamp: 1 });
    names.forEach((name, i) => log.add(offset + (i + 1) * 1000, { type: "milestone", turn: 1, name, server_timestamp: 2 }));
    const end = fullRun().events.at(-1);
    if (end?.type !== "run_end") throw new Error("fixture end");
    log.add(offset + 10000, { type: end.type, turn: end.turn, reason: end.reason, furthest_milestone: end.furthest_milestone, turns: end.turns, wall_ms: end.wall_ms, tokens: end.tokens, frames: end.frames });
    return log;
  };
  writeRun(r, "current", logged(50000, ["PLAYER_NAME_SET"]));
  writeRun(r, "previous", logged(30000, ["PLAYER_NAME_SET"]));
  writeRun(r, "deepest", logged(0, ["PLAYER_NAME_SET", "PLAYER_BEDROOM"]));
  writeRun(r, "other-model", logged(40000, ["PLAYER_NAME_SET"], "other"));
  writeRun(r, "wrong-start", logged(45000, ["STONE_BADGE"], "think-swarm", {kind:"save_state",path:"a",sha1:"a".repeat(40)}));
  writeRun(r, "probe", logged(46000, ["STONE_BADGE"]));
  const probePath = join(r, "probe", "events.jsonl");
  const fs = await import("node:fs");
  const probeRows = fs.readFileSync(probePath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  const first = probeRows[0];
  if (first === undefined) throw new Error("fixture start");
  first.harness_features = ["probe"];
  fs.writeFileSync(probePath, probeRows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  writeRun(r, "live", liveLog());
  const slower = logged(10000, ["PLAYER_NAME_SET", "PLAYER_BEDROOM"]);
  const milestone = slower.events.find((e) => e.type === "milestone" && e.name === "PLAYER_BEDROOM");
  if (milestone === undefined) throw new Error("fixture split");
  const slowerPath = writeRun(r, "slower-deep", slower);
  fs.writeFileSync(slowerPath, fs.readFileSync(slowerPath, "utf8").replace(milestone.t, "2026-10-11T22:00:19.000-04:00"));
  const corruptPath = writeRun(r, "corrupt", logged(47000, ["STONE_BADGE"]));
  appendFileSync(corruptPath, "invalid\n");
  writeRun(r, "unknown", logged(47000, ["SOME_UNVERIFIED_PROGRESS"]));
  // An early heal is an optional activity, not depth: it must not outrank the bedroom.
  writeRun(r, "healer", logged(5000, ["PLAYER_NAME_SET", "FIRST_POKECENTER_HEAL"]));
  const result = await comparisonsOf(r, "current");
  expect(result.baseline?.run).toBe("previous");
  expect(result.best?.run).toBe("deepest");
  expect(result.candidates.map((c) => c.run).sort()).toEqual(["deepest", "healer", "other-model", "previous", "slower-deep"]);
});


it("rejects progress-only historical logs with no RAM-state provenance", () => {
  const r = root();
  const log = fullRun();
  const statesRemoved = new Log();
  log.events.filter((e) => e.type !== "state").forEach((e) => { statesRemoved.events.push(e); });
  writeRun(r, "unverified", statesRemoved);
  expect(() => baselineOf(r, "unverified")).toThrow(/RAM-state provenance/);
});

it("excludes resumed baseline progress from split catalogs", () => {
  const runsRoot = root();
  const log = new Log();
  log.add(0,{...START,harness_features:["ram-state-v1","story-milestones-v2"],start_state:{kind:"save_state",path:"fixture",sha1:"0".repeat(40)}});
  log.add(0,{type:"milestone",turn:0,name:"GAME_RUNNING",server_timestamp:1,origin:"observed"});
  log.add(1000,{type:"milestone",turn:0,name:"PLAYER_NAME_CONFIRMED",server_timestamp:2,kind:"story",origin:"present_at_start",evidence:[1]});
  log.add(1000,{type:"milestone",turn:0,name:"CLOCK_SET",server_timestamp:2,kind:"story",origin:"present_at_start",evidence:[1]});
  writeRun(runsRoot,"resumed",log);
  expect(baselineOf(runsRoot,"resumed")).toEqual({run:"resumed",milestones:[{name:"GAME_RUNNING",offsetMs:0}]});
});

it("keeps nickname-resume progress out of the actual recorder split catalog", async () => {
  const {StateMilestones} = await import("../../agent/src/milestones.js");
  const {RunRecorder} = await import("../../agent/src/recorder.js");
  const {RunLog} = await import("../../agent/src/run-log.js");
  const {FrameStore} = await import("../../agent/src/frames.js");
  const {parseGameState} = await import("../../agent/src/game-state.js");
  const {comparisonsOf} = await import("./runs.js");
  const r=root();let clock=1000;
  const field=parseGameState(JSON.parse(readFileSync(new URL("../../agent/test-support/existing-story.json",import.meta.url),"utf8")));
  const nickname=parseGameState(JSON.parse(readFileSync(new URL("../../agent/test-support/nickname-story.json",import.meta.url),"utf8")));
  const log=RunLog.create(r,"nickname-resume",()=>new Date(clock));
  const recorder=new RunRecorder({log,frames:new FrameStore(r),gameState:{read:()=>Promise.resolve(nickname)},milestones:new StateMilestones({read:()=>Promise.resolve(nickname)},()=>clock),now:()=>clock});
  await recorder.start({...START,harness_features:["ram-state-v1","story-state-v1","story-milestones-v2"],start_state:{kind:"save_state",path:"fixture",sha1:"0".repeat(40)}});
  clock+=1000;recorder.recordState(field);recorder.end("completed");
  expect(baselineOf(r,"nickname-resume")).toEqual({run:"nickname-resume",milestones:[{name:"GAME_RUNNING",offsetMs:0}]});
  const current=new Log();current.add(2000,{...START,harness_features:["ram-state-v1"],start_state:{kind:"save_state",path:"fixture",sha1:"0".repeat(40)}});
  writeRun(r,"current",current);
  expect((await comparisonsOf(r,"current"))).toEqual({candidates:[],baseline:null,best:null});
});

const HUMAN = { kind: "human", name: "Operator", rom_sha1: "c".repeat(40), input_policy: "frame-held-v1", sample_ms: 100, nominal_fps: 59.7275 } as const;
function humanLog(offset = 0, finished = true, reason: "operator_stop" | "operator_abort" | "crash" = "operator_stop"): Log {
  const log = new Log();
  log.add(offset, { ...START, controller: HUMAN, model: { ...START.model, id: "Human · Operator" }, tools: [], harness_features: ["ram-state-v1"] });
  log.add(offset + 100, { type: "milestone", turn: 0, name: "PLAYER_NAME_CONFIRMED", server_timestamp: 100, kind: "story", origin: "observed" });
  if (finished) log.add(offset + 200, { type: "run_end", turn: 0, reason, furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 0, wall_ms: 200, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
  return log;
}

it("offers finished comparable humans explicitly, never as automatic model best or baseline", async () => {
  const { comparisonsOf } = await import("./runs.js");
  const r = root();
  writeRun(r, "current", humanLog(1000, false));
  writeRun(r, "human", humanLog());
  const result = await comparisonsOf(r, "current");
  expect(result.candidates).toHaveLength(1);
  expect(result.candidates[0]).toMatchObject({ run: "human", model: "Human · Operator", controller: { kind: "human", name: "Operator" } });
  expect(result.baseline).toBeNull();
  expect(result.best).toBeNull();
});

it("excludes incomplete and aborted human references, preserving crash DNF partial splits", () => {
  const r = root();
  writeRun(r, "live-human", humanLog(0, false));
  writeRun(r, "abort-human", humanLog(0, true, "operator_abort"));
  writeRun(r, "crash-human", humanLog(0, true, "crash"));
  expect(() => baselineOf(r, "live-human")).toThrow(/finished human/);
  expect(() => baselineOf(r, "abort-human")).toThrow(/aborted human/);
  expect(baselineOf(r, "crash-human").milestones).toEqual([{ name: "PLAYER_NAME_CONFIRMED", offsetMs: 100 }]);
});

it("matches human references by start and known ROM, rejects probes and invalid log interiors", async () => {
  const { comparisonsOf } = await import("./runs.js");
  const r = root(); writeRun(r, "current", humanLog(1000, false));
  const changeStart = (patch: object) => { const log = humanLog(); const first = log.events[0]; if (first?.type !== "run_start") throw new Error("fixture"); log.events[0] = { ...first, ...patch }; return log; };
  writeRun(r, "wrong-rom", changeStart({ controller: { ...HUMAN, rom_sha1: "d".repeat(40) } }));
  writeRun(r, "wrong-start", changeStart({ start_state: { kind: "save_state", path: "save", sha1: "e".repeat(40) } }));
  writeRun(r, "probe", changeStart({ harness_features: ["ram-state-v1", "probe"] }));
  const path = writeRun(r, "invalid", humanLog());
  writeFileSync(path, readFileSync(path, "utf8").replace('\n', '\ninvalid\n'));
  expect((await comparisonsOf(r, "current"))).toEqual({ candidates: [], baseline: null, best: null });
});

it("keeps a mixed model catalog automatic picks model-only, qualifying legacy ROM proof", async () => {
  const { comparisonsOf } = await import("./runs.js");
  const r = root();
  const model = new Log(); model.add(1000, { ...START, harness_features: ["ram-state-v1"] });
  writeRun(r, "current-model", model);
  writeRun(r, "model-reference", fullRun());
  writeRun(r, "human-fast", humanLog());
  const result = await comparisonsOf(r, "current-model");
  expect(result.candidates.map(c => c.run).sort()).toEqual(["human-fast", "model-reference"]);
  expect(result.candidates.find(c => c.run === "human-fast")).toMatchObject({ romIdentity: "unverified" });
  expect(result.baseline?.run).toBe("model-reference");
  expect(result.best?.run).toBe("model-reference");
  const first = model.events[0]; if (first?.type !== "run_start") throw new Error("fixture");
  model.events[0] = { ...first, rom_sha1: "d".repeat(40) };
  writeRun(r, "current-model", model);
  expect((await comparisonsOf(r, "current-model")).candidates.map(c => c.run)).toEqual(["model-reference"]);
});

it("rejects matching-start human references with a different vendor pin", async () => {
  const { comparisonsOf } = await import("./runs.js"); const r = root();
  writeRun(r, "current", humanLog(1000, false)); const candidate = humanLog();
  const first = candidate.events[0]; if (first?.type !== "run_start") throw new Error("fixture");
  candidate.events[0] = { ...first, vendor_pin: "d".repeat(40) };
  writeRun(r, "different-vendor", candidate);
  expect((await comparisonsOf(r, "current")).candidates).toEqual([]);
});

it("uses active pause-adjusted human splits and omits progress present at the start", () => {
  const r = root(); const log = new Log();
  log.add(0, { ...START, controller: HUMAN, harness_features: ["ram-state-v1"] });
  log.add(0, { type: "milestone", turn: 0, name: "NEW_GAME_CREATED", server_timestamp: 0, kind: "story", origin: "present_at_start" });
  log.add(10, { type: "operator_control", turn: 0, action: "pause", status: "applied", request: 1, emulator_frozen: true });
  log.add(50, { type: "operator_control", turn: 0, action: "resume", status: "applied", request: 2, paused_ms: 40 });
  log.add(100, { type: "milestone", turn: 0, name: "CLOCK_SET", server_timestamp: 100, kind: "story", origin: "observed" });
  log.add(200, { type: "run_end", turn: 0, reason: "operator_stop", furthest_milestone: "CLOCK_SET", turns: 0, wall_ms: 200, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
  writeRun(r, "paused", log);
  expect(baselineOf(r, "paused").milestones).toEqual([{ name: "CLOCK_SET", offsetMs: 60 }]);
});

it("rejects human logs with duplicated starts, sequence gaps, or duplicated terminal receipts", () => {
  const r = root();
  for (const mode of ["duplicate-start", "sequence-gap", "duplicate-end"] as const) {
    const log = humanLog();
    const first = log.events[0], last = log.events.at(-1);
    if (first === undefined || last === undefined) throw new Error("fixture");
    if (mode === "duplicate-start") log.events.splice(1, 0, { ...first, seq: 1 });
    if (mode === "sequence-gap") log.events[0] = { ...first, seq: 9 };
    if (mode === "duplicate-end") log.events.push({ ...last, seq: log.events.length });
    writeRun(r, mode, log);
    expect(() => baselineOf(r, mode)).toThrow(/human event order/);
  }
});

it("requires the human terminal receipt to be a durable complete line", () => {
  const r = root(); const path = writeRun(r, "truncated", humanLog());
  writeFileSync(path, readFileSync(path, "utf8").trimEnd());
  expect(() => baselineOf(r, "truncated")).toThrow(/finished human/);
});

it("catalogs isolated nested human recordings beside model runs and resolves their replay frames", async () => {
  const { comparisonsOf, readStart } = await import("./runs.js");
  const r = root();
  writeRun(r, "model", fullRun());
  writeRun(join(r, "human"), "human-recording", humanLog());
  const current = new Log(); current.add(1000, { ...START, harness_features: ["ram-state-v1"] });
  writeRun(r, "current", current);
  const humanDir = join(r, "human", "human-recording"); mkdirSync(join(humanDir, "frames"));
  writeFileSync(join(humanDir, "frames", "000001_1.png"), "human frame fixture");
  expect(listRuns(r).map(s => s.id)).toEqual(["model", "human-recording", "current"]);
  expect(runDir(r, "human-recording")).toBe(humanDir);
  expect(readFileSync(join(runDir(r, "human-recording"), "frames", "000001_1.png"), "utf8")).toBe("human frame fixture");
  expect(readStart(r, "human-recording")).toMatchObject({ controller: { kind: "human", name: "Operator" } });
  expect(baselineOf(r, "human-recording").milestones).toEqual([{ name: "PLAYER_NAME_CONFIRMED", offsetMs: 100 }]);
  expect((await comparisonsOf(r, "current")).candidates.map(c => c.run).sort()).toEqual(["human-recording", "model"]);
});

it("surfaces malformed nested human logs and duplicate ids without selecting ambiguous storage", () => {
  const r = root(); writeRun(r, "duplicate", fullRun()); writeRun(join(r, "human"), "duplicate", humanLog());
  mkdirSync(join(r, "human", "malformed")); writeFileSync(join(r, "human", "malformed", "events.jsonl"), "not JSON\n");
  const catalog = listRuns(r);
  expect(catalog).toHaveLength(2);
  expect(catalog.find(s => s.id === "duplicate")).toMatchObject({ model: null, ended: false, problem: expect.any(String) as string });
  expect(catalog.find(s => s.id === "malformed")?.problem).toContain("not JSON");
  expect(() => runDir(r, "duplicate")).toThrow(RunsError);
  expect(() => baselineOf(r, "duplicate")).toThrow(RunsError);
  expect(() => runDir(r, "../human/duplicate")).toThrow(RunsError);
});

it("names a run's experiment, arm and trial, or its preset, in the run list",()=>{
 const runsRoot=root();
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 const write=(id:string,evaluation:NonNullable<typeof START["evaluation"]>)=>{const log=new Log();log.add(0,{...START,evaluation});writeRun(runsRoot,id,log);};
 write("2026-10-14T18-00-00_e",{preset_id:"p",target:null,failure_limit:3,flags,experiment:{id:"factorial-2x2-think-fast",arm:"both",trial:5,of:32}});
 write("2026-10-14T17-00-00_p",{preset_id:"checkpoint-clock-set",target:"CLOCK_SET",failure_limit:3,flags});
 const listed=listRuns(runsRoot);
 expect(listed.find(r=>r.id.endsWith("_e"))?.experiment).toBe("factorial-2x2-think-fast · both · 5/32");
 expect(listed.find(r=>r.id.endsWith("_p"))?.experiment).toBe("preset checkpoint-clock-set");
});

it("carries the experiment, arm and trial as structured fields so the phone header can lead with them",()=>{
 const runsRoot=root();
 const flags={loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false};
 const write=(id:string,evaluation:NonNullable<typeof START["evaluation"]>)=>{const log=new Log();log.add(0,{...START,evaluation});writeRun(runsRoot,id,log);};
 write("2026-10-14T18-00-00_e",{preset_id:"p",target:null,failure_limit:3,flags,experiment:{id:"bundle-v-control-dryrun-cook",arm:"bundle",trial:2,of:4}});
 write("2026-10-14T17-00-00_p",{preset_id:"checkpoint-clock-set",target:"CLOCK_SET",failure_limit:3,flags});
 const listed=listRuns(runsRoot);
 expect(listed.find(r=>r.id.endsWith("_e"))?.cohort).toEqual({id:"bundle-v-control-dryrun-cook",arm:"bundle",trial:2,of:4});
 expect(listed.find(r=>r.id.endsWith("_p"))?.cohort).toBeUndefined();
});

it("folds rival splits recovered from raw RAM into a comparison baseline, and re-reads it when the side file changes", async () => {
  const r = root();
  const scratch = mkdtempSync(join(tmpdir(), "ram-"));
  const ram = (n: 1 | 2 | 3) => writeArchive(scratch, n, [rivalRam(false, false), rivalRam(true, false), rivalRam(false, true)][n - 1] ?? []);
  const copyRam = (dir: string) => { cpSync(join(scratch, "raw-ram"), join(dir, "raw-ram"), { recursive: true }); };
  const log = new Log();
  log.add(0, { ...START, harness_features: ["ram-state-v1"] });
  log.add(1000, state({ location: "ROUTE103", raw_ram: ram(1) }));
  log.add(2000, state({ location: "ROUTE103", in_battle: true, raw_ram: ram(2) }));
  writeRun(r, "rv", log);
  const reader = createBaselineReader(r);
  expect((await reader("rv")).milestones.map((m) => m.name)).not.toContain("RIVAL_BATTLE_STARTED");
  mkdirSync(join(r, "rv", "derived"));
  copyRam(join(r, "rv"));
  writeFileSync(join(r, "rv", "derived", "route103_rival.jsonl"), [{ v: 1, run: "rv", source: "raw-ram-route103-v1" }, ...([[1, false], [2, true]] as const).map(([n, active]) => ({ seq: n, raw_ram: ram(n).path, sha256: ram(n).sha256, route103_rival: { battle_active: active, defeated: false, oldale_stage: 0 } }))].map((row) => JSON.stringify(row)).join("\n") + "\n");
  expect((await reader("rv")).milestones).toContainEqual({ name: "RIVAL_BATTLE_STARTED", offsetMs: 2000, derived: true });
});
