import {DEFAULT_NEXT_RUN,parseNextRun} from "./next-run.js";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runFixed, type FixedHost, type FixedLaunch, type ServingReceipt } from "./fixed-runner.js";
import { readLedger, queueState, type FixedLedgerEntry } from "./fixed-ledger.js";
import {checkEvent} from "@pokebench/agent/events";
import {cohortIndex} from "./workbench-store.js";
import {experimentsAudit} from "./experiments-audit.js";
import {fileURLToPath} from "node:url";
import {REQUIRED_FRONTIER_MILESTONES} from "@pokebench/agent/milestones";
import { LEGACY_LEASE, LeaseHeldError, leaseDir, leasePool, readLeaseOwner, takeLease } from "./lease.js";
import { parseFixedStatus, type FixedStatus } from "./fixed-status.js";
import { definition, MODEL_PATH, ROM_SHA1 } from "../test-support/fixed.js";
import { Log, START } from "../test-support/events.js";
import { armFeatures, armFeatureBits, armPreset, parseFixedDefinition, controlBaseProblems, dryRunDefinition, soloDefinition, type FixedDefinition, type FixedLane } from "./fixed-design.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RECEIPT: ServingReceipt = { model: MODEL_PATH, build: "b10236-1464c62d8", contextTokens: 65536, slots: 1, vision: true, fingerprint: "f".repeat(64) };

it("selects the operator's 80 FPS policy equally in future bundle and control runs",()=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8"));
 const id="original-speed-pacing-v1";
 expect(def.onInBoth).toContain(id);
 expect(def.switches).not.toContain(id);
 for(const arm of ["control","bundle"] as const){
  expect(armFeatures(def,arm)[id]).toBe(true);
  expect(armFeatureBits(def,arm)[id]).toBe(true);
  expect(armFeatures(def,arm)["visited-terrain-navigation-v1"]).toBe(false);
 }
});

it("keeps the improved blackout receipt out of control and in the bundle",()=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8"));
 expect(def.switches).toContain("blackout-readout-v1");
 expect(def.onInBoth).not.toContain("blackout-readout-v1");
 expect(armFeatureBits(def,"control")["blackout-readout-v1"]).toBe(false);
 expect(armFeatureBits(def,"bundle")["blackout-readout-v1"]).toBe(true);
});

it("two recovery treatments stay ON in bundle only; the dropped two are OFF in both arms",()=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8"));
 for(const id of ["reachable-story-guidance-v1","text-only-supervisor-v2"]){
  expect(armFeatures(def,"control")[id]).toBe(false);expect(armFeatures(def,"bundle")[id]).toBe(true);
  expect(armFeatureBits(def,"control")[id]).toBe(false);expect(armFeatureBits(def,"bundle")[id]).toBe(true);
 }
 for(const id of ["ineffective-navigation-v2","supervisor-briefing-v2"])for(const arm of ["control","bundle"] as const){
  expect(armFeatures(def,arm)[id]).toBe(false);expect(armFeatureBits(def,arm)[id]).toBe(false);
 }
});

it("the next bundle: control gains the battle tools and exit reachability, the bundle adds stage-bound story goals and semantic exploration, and the cook is two one-hour pairs",()=>{
 for(const file of ["bundle-v-control","bundle-cook-1h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  for(const id of ["battle-move-tool-v1","battle-menu-loop-v1","tutorial-party-owner-v1","context-token-budget-v1","exit-reachability-v1"])for(const arm of ["control","bundle"] as const){
   expect(def.onInBoth).toContain(id);expect(def.switches).not.toContain(id);expect(armFeatureBits(def,arm)[id]).toBe(true);
  }
  for(const id of ["stale-story-goal-v1","stale-story-goal-v2","harness-trust-v1","semantic-navigation-v2","deterministic-exploration-v1","briefing-repeat-count-v1","navigate-already-here-v1","auto-talk-v1","story-character-stall-gate-v1","heal-before-trainers-v1","unfinished-activity-v1","exit-labels-v3"]){
   expect(armFeatureBits(def,"control")[id]).toBe(false);expect(armFeatureBits(def,"bundle")[id]).toBe(true);
  }
  expect(def.offInBoth).toContain("positive-supervisor-v1");expect(armFeatureBits(def,"control")["positive-supervisor-v1"]).toBe(false);expect(armFeatureBits(def,"bundle")["positive-supervisor-v1"]).toBe(false);
  // Operator decision 2026-10-20: the duplicate-turn collapse in both arms, the breaker's note in neither.
  for(const arm of ["control","bundle"] as const){expect(armFeatureBits(def,arm)["duplicate-turn-collapse-v1"]).toBe(true);expect(armFeatureBits(def,arm)["fixed-point-breaker-v1"]).toBe(arm==="bundle");}
  expect(def.onInBoth).toContain("duplicate-turn-collapse-v1");expect(def.switches).toContain("fixed-point-breaker-v1");
  // Operator decision 2026-10-20 10:43 PM ET: the heal-first line in both arms.
  for(const arm of ["control","bundle"] as const)expect(armFeatureBits(def,arm)["story-battle-heal-first-v1"]).toBe(true);
  expect(def.offInBoth).toContain("semantic-navigation-v1");
  for(const arm of ["control","bundle"] as const)expect(armFeatureBits(def,arm)["semantic-navigation-v1"]).toBe(false);
 }
 const {definition:cook}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-cook-1h.json",import.meta.url),"utf8"));
 expect(cook.phases.map(phase=>[phase.perArm,phase.maxWallMs])).toEqual([[2,3_600_000]]);
 expect(controlBaseProblems(cook,readFileSync(new URL(`../../../${cook.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
});

type Ending = "budget" | "model_error" | "never-started" | "milestone";
interface FakeOptions {
  readonly beforeExit?: (launch: FixedLaunch, n: number) => Promise<void>;
  readonly extensionMs?: number;
  readonly ending?: (launch: FixedLaunch, n: number) => Ending;
  readonly serving?: (lane: FixedLane, n: number) => ServingReceipt;
  readonly verifyBuild?: (n: number) => string | null;
  readonly head?: (n: number) => string;
  readonly alive?: (pid: number) => boolean;
  readonly runId?: (lane: FixedLane, n: number) => void;
  readonly log?: (line: string) => void;
}

class Fake implements FixedHost {
  clock = Date.parse("2026-10-16T00:00:00Z");
  readonly launches: FixedLaunch[] = [];
  readonly logs: string[] = [];
  readonly statuses: FixedStatus[] = [];
  running = 0;
  maxRunning = 0;
  sleeps = 0;
  private servingCalls = new Map<string, number>();
  private builds = 0;
  constructor(readonly runsRoot: string, private readonly options: FakeOptions = {}, private readonly id = "bundle-v-control") {}
  now(): Date { return new Date(this.clock); }
  async sleep(ms: number): Promise<void> {
    this.sleeps += 1;
    this.clock += ms;
    this.snapshot();
    await new Promise((r) => setImmediate(r));
  }
  heads = 0;
  head(): string { this.heads += 1; return this.options.head?.(this.heads) ?? COMMIT; }
  sources(): string { return "sources-identity"; }
  verified: string[] = [];
  verifyBuild(commit: string): Promise<string | null> { this.builds += 1; this.verified.push(commit); return Promise.resolve(this.options.verifyBuild?.(this.builds) ?? null); }
  serving(lane: FixedLane): Promise<ServingReceipt> {
    const n = (this.servingCalls.get(lane.id) ?? 0) + 1;
    this.servingCalls.set(lane.id, n);
    try { return Promise.resolve(this.options.serving?.(lane, n) ?? RECEIPT); } catch (error) { return Promise.reject(error instanceof Error ? error : new Error(String(error))); }
  }
  portInUse(): Promise<boolean> { return Promise.resolve(false); }
  runIds = 0;
  runId(lane: FixedLane): string { this.runIds += 1; this.options.runId?.(lane, this.runIds); return `2026-10-16T00-00-00_qwen36-${lane.gpu.toLowerCase()}_${String(this.launches.length).padStart(4, "0")}`; }
  alive(pid: number): boolean { return this.options.alive?.(pid) ?? false; }
  log(line: string): void { this.options.log?.(line); this.logs.push(line); }
  // A throw from the started callback escapes an EventEmitter listener in production and kills the process.
  startedThrows = 0;
  async launch(l: FixedLaunch): Promise<number | null> {
    this.launches.push(l);
    const n = this.launches.length;
    this.running += 1;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    try { l.started(1000 + n); } catch { this.startedThrows += 1; }
    this.snapshot();
    await new Promise((r) => setTimeout(r, 2));
    await this.options.beforeExit?.(l, n);
    this.clock += 60_000 + (this.options.extensionMs ?? 0);
    const ending = this.options.ending?.(l, n) ?? "budget";
    if (ending !== "never-started") writeEvents(this.runsRoot, l, ending, this.options.extensionMs ?? 0);
    this.running -= 1;
    return ending === "never-started" ? 1 : 0;
  }
  snapshot(): void {
    const path = join(this.runsRoot, "experiments", this.id, "status.json");
    if (existsSync(path)) this.statuses.push(parseFixedStatus(JSON.parse(readFileSync(path, "utf8"))));
  }
}

function writeEvents(runsRoot: string, l: FixedLaunch, ending: "budget" | "model_error" | "milestone", extensionMs = 0): void {
  const preset = JSON.parse(readFileSync(l.presetPath, "utf8")) as { id: string; target?:string|null;stopAt?:string;limits: { maxWallMs: number }; features: Record<string, boolean>; start?: { path: string; sha1: string } };
  const port = Number(new URL(l.env["POKEBENCH_GAME_SERVER_URL"] ?? "").port);
  const log = new Log();
  log.add(0, { ...START, rom_sha1: ROM_SHA1, model: { ...START.model, id: l.env["POKEBENCH_MODEL"] ?? "" }, start_state: preset.start === undefined ? { kind: "boot" } : { kind: "save_state", path: preset.start.path, sha1: preset.start.sha1 }, budgets: { max_wall_ms: preset.limits.maxWallMs }, isolation: { ...START.isolation, port }, evaluation: { preset_id: preset.id, target: preset.stopAt??preset.target??null, failure_limit: 3, reply_failures_end_run: false, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false }, features: preset.features } });
  if(ending==="milestone")log.add(20_000,{type:"milestone",turn:4,name:preset.stopAt??preset.target??"RIVAL_MET",kind:"story",origin:"observed",server_timestamp:1});
  if (ending === "model_error") log.add(10, { type: "retry", turn: 1, reason: "model error: HTTP 502", attempt: 3, limit: 3 });
  if (extensionMs > 0) {
    log.add(1000, { type: "operator_control", turn: 1, action: "extend_30m", status: "applied", request: 1, previous_max_wall_ms: preset.limits.maxWallMs, max_wall_ms: preset.limits.maxWallMs + extensionMs });
    log.add(preset.limits.maxWallMs + 1000, { type: "milestone", turn: 4, name: "STONE_BADGE", kind: "story", origin: "observed", server_timestamp: 1 });
  }
  log.add(preset.limits.maxWallMs + extensionMs, { type: "run_end", turn: 5, reason: ending, furthest_milestone: null, turns: 5, wall_ms: ending === "budget" ? preset.limits.maxWallMs + extensionMs : ending==="milestone"?20_000:10, tokens: { input: 1, output: 1 }, frames: { saved: 0, bytes: 0 } });
  mkdirSync(join(runsRoot, l.runId), { recursive: true });
  writeFileSync(join(runsRoot, l.runId, "events.jsonl"), log.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

function setup(def: FixedDefinition = definition()) {
  const runsRoot = mkdtempSync(join(tmpdir(), "fixed-runner-"));
  return { def, runsRoot, dir: join(runsRoot, "experiments", def.id) };
}
const outcomes = (entries: readonly FixedLedgerEntry[]) => entries.filter((e): e is Extract<FixedLedgerEntry, { kind: "outcome" }> => e.kind === "outcome");
const launchesOf = (entries: readonly FixedLedgerEntry[]) => entries.filter((e): e is Extract<FixedLedgerEntry, { kind: "launch" }> => e.kind === "launch");

describe("runFixed", () => {
  it("runs every planned trial on its lane, two at a time, confirmatory before cook, and records each with its configuration", async () => {
    const { def, runsRoot, dir } = setup();
    const host = new Fake(runsRoot);
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 })).toBe("finished");
    const ledger = readLedger(join(dir, "trials.jsonl"));
    expect(outcomes(ledger)).toHaveLength(12);
    expect(outcomes(ledger).every((o) => o.valid)).toBe(true);
    expect(host.maxRunning).toBe(2);
    const order = launchesOf(ledger).map((e) => e.phase);
    expect(order.lastIndexOf("confirmatory")).toBeLessThan(order.indexOf("cook"));
    const firstCook = ledger.findIndex((e) => e.kind === "launch" && e.phase === "cook");
    expect(outcomes(ledger.slice(0, firstCook))).toHaveLength(8);
    for (const l of host.launches) {
      const lane = def.lanes.find((x) => l.env["POKEBENCH_GAME_SERVER_URL"] === `http://127.0.0.1:${String(x.gamePort)}`);
      expect(lane?.id).toBe(l.lane);
      expect(l.env["POKEBENCH_MODEL"]).toBe(MODEL_PATH);
      expect(JSON.parse(readFileSync(l.env["POKEBENCH_ENDPOINT_FILE"] ?? "", "utf8"))).toEqual({ base_url: `${lane?.modelUrl ?? ""}/v1`, api_key: "unused" });
      const label = JSON.parse(l.env["POKEBENCH_EXPERIMENT"] ?? "") as { id: string; arm: string; trial: number; of: number };
      expect(label).toEqual({ id: "bundle-v-control", arm: label.arm, trial: l.slot, of: 12 });
      expect(l.env["POKEBENCH_GATEWAY_URL"]).toBeUndefined();
    }
    const launch = launchesOf(ledger)[0];
    expect(launch).toMatchObject({ commit: COMMIT, sources: "sources-identity", serving: RECEIPT.fingerprint });
    const preset = JSON.parse(readFileSync(join(dir, "presets", "cook-bundle.json"), "utf8")) as { features: Record<string, boolean>; limits: { maxWallMs: number } };
    expect(preset.limits.maxWallMs).toBe(3_600_000);
    expect(preset.features["world-destinations-v1"]).toBe(true);
    expect(launchesOf(ledger).filter((e) => e.phase === "cook").every((e) => e.presetSha256.length === 64)).toBe(true);
    const status = parseFixedStatus(JSON.parse(readFileSync(join(dir, "status.json"), "utf8")));
    expect(status).toMatchObject({ state: "finished", total: 12, valid: 12, invalid: 0, pid: 77, definitionSha256: "d".repeat(64) });
    expect(status.lanes.map((l) => [l.id, l.state, l.valid, l.total])).toEqual([["A", "done", 6, 6], ["B", "done", 6, 6]]);
    expect(host.statuses.some((s) => s.lanes.every((l) => l.state === "running"))).toBe(true);
    expect(existsSync(join(runsRoot, "experiments", "runner.json"))).toBe(false);
    for (const lane of def.lanes) expect(existsSync(leaseDir(runsRoot, lane.modelUrl.replace(/^http:\/\//, "")))).toBe(false);
  });

  it("replaces an invalid trial with the same arm on the same lane at the end of its phase, after a backoff", async () => {
    const { def, runsRoot, dir } = setup();
    const host = new Fake(runsRoot, { ending: (_l, n) => (n === 1 ? "model_error" : "budget") });
    await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    const ledger = readLedger(join(dir, "trials.jsonl"));
    const invalid = outcomes(ledger).filter((o) => !o.valid);
    expect(invalid).toEqual([expect.objectContaining({ reason: "model/gateway error: model error: HTTP 502" })]);
    const first = host.launches[0];
    const replacement = launchesOf(ledger).find((e) => e.replaces !== undefined);
    expect(replacement).toMatchObject({ lane: first?.lane, arm: first?.arm, phase: "confirmatory", replaces: first?.slot, slot: 13 });
    expect(outcomes(ledger)).toHaveLength(13);
    const status = parseFixedStatus(JSON.parse(readFileSync(join(dir, "status.json"), "utf8")));
    expect(status).toMatchObject({ valid: 12, invalid: 1, reserve: { usedMs: 900_000, totalMs: 1_800_000 } });
    expect(status.invalidTrials).toHaveLength(1);
    expect(status.lastError).toMatch(/^lane [AB]: model\/gateway error/);
    expect(host.statuses.some((s) => s.lanes.some((l) => l.state === "paused" && l.reason.startsWith("invalid trial: model/gateway error") && l.retryAt !== null))).toBe(true);
  });

  it("pauses only the lane that cannot serve, says why, and retries it with growing backoff while the other lane plays", async () => {
    const { def, runsRoot, dir } = setup();
    const host = new Fake(runsRoot, { serving: (lane, n) => { if (lane.id === "B" && n <= 3) throw new Error("connect ECONNREFUSED 127.0.0.1:8098"); return RECEIPT; } });
    await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    const paused = host.statuses.filter((s) => s.lanes[1]?.state === "paused");
    expect(paused.length).toBeGreaterThan(0);
    expect(paused[0]?.lanes[1]?.reason).toBe("lane B cannot serve: connect ECONNREFUSED 127.0.0.1:8098");
    expect(paused.some((st) => st.lanes[0]?.state === "running")).toBe(true);
    expect(outcomes(readLedger(join(dir, "trials.jsonl")))).toHaveLength(12);
    const retries = [...new Set(paused.map((s) => s.lanes[1]?.retryAt))];
    expect(retries.length).toBeGreaterThanOrEqual(3);
  });

  it("pauses a lane whose server is not the planned build, model or slot count", async () => {
    const { def, runsRoot } = setup();
    let stop = false;
    const host = new Fake(runsRoot, { serving: (lane) => (lane.id === "A" ? { ...RECEIPT, build: "b1", slots: 2 } : RECEIPT) });
    const done = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => stop, pid: 77 });
    while (!host.statuses.some((s) => s.lanes[1]?.state === "waiting")) await new Promise((r) => setImmediate(r));
    stop = true;
    expect(await done).toBe("stopped");
    const last = parseFixedStatus(JSON.parse(readFileSync(join(runsRoot, "experiments", def.id, "status.json"), "utf8")));
    expect(host.statuses.some((s) => s.lanes[0]?.reason === "lane A serves build b1 (planned b10236-1464c62d8); 2 slots (planned 1)")).toBe(true);
    expect(last.lanes[0]?.state).not.toBe("running");
    expect(host.launches.every((l) => l.lane === "B")).toBe(true);
  });

  it("pauses a lane on an unexpected I/O error and retries it, while the other lane plays on", async () => {
    const { def, runsRoot } = setup();
    let thrown = false;
    const host = new Fake(runsRoot, { runId: (lane) => { if (lane.id === "B" && !thrown) { thrown = true; throw new Error("EIO: i/o error, write"); } } });
    const result = await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    expect(result).toBe("finished");
    expect(host.statuses.some((st) => st.lanes.find((l) => l.id === "B")?.state === "paused" && st.lanes.find((l) => l.id === "B")?.reason.includes("EIO") === true && st.lastError?.includes("EIO") === true)).toBe(true);
    expect(parseFixedStatus(JSON.parse(readFileSync(join(runsRoot, "experiments", def.id, "status.json"), "utf8"))).valid).toBe(def.plan.length);
  });

  it("never throws from the started callback: a runner-file write that fails there keeps the trial and says why", async () => {
    const { def, runsRoot } = setup();
    mkdirSync(join(runsRoot, "experiments", "runner.json"), { recursive: true });
    const host = new Fake(runsRoot);
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 })).toBe("finished");
    expect(host.startedThrows).toBe(0);
    expect(host.statuses.some((st) => st.lastError?.includes("cannot record the started trial") === true)).toBe(true);
    expect(parseFixedStatus(JSON.parse(readFileSync(join(runsRoot, "experiments", def.id, "status.json"), "utf8"))).valid).toBe(def.plan.length);
  });

  it("keeps the runner alive when pausing itself throws: the lane retries, the other lane plays on", async () => {
    const { def, runsRoot } = setup();
    let thrown = false;
    let logThrown = false;
    const host = new Fake(runsRoot, {
      runId: (lane) => { if (lane.id === "B" && !thrown) { thrown = true; throw new Error("EIO: i/o error, write"); } },
      log: (line) => { if (line.includes("paused") && !logThrown) { logThrown = true; throw new Error("EPIPE: broken pipe, write"); } },
    });
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 })).toBe("finished");
    expect(logThrown).toBe(true);
    expect(host.statuses.some((st) => st.lanes.find((l) => l.id === "B")?.state === "paused" && st.lanes.find((l) => l.id === "B")?.reason.includes("EIO") === true)).toBe(true);
    expect(parseFixedStatus(JSON.parse(readFileSync(join(runsRoot, "experiments", def.id, "status.json"), "utf8"))).valid).toBe(def.plan.length);
  });

  it("pins one commit for the whole run: every build check and every launch uses the commit read at start", async () => {
    const { def, runsRoot, dir } = setup();
    const host = new Fake(runsRoot, { head: (n) => (n === 1 ? "a".repeat(40) : "b".repeat(40)) });
    await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    expect(new Set(host.verified)).toEqual(new Set(["a".repeat(40)]));
    expect(new Set(launchesOf(readLedger(join(dir, "trials.jsonl"))).map((l) => l.commit))).toEqual(new Set(["a".repeat(40)]));
  });

  it("pauses both lanes on a build problem until it clears", async () => {
    const { def, runsRoot, dir } = setup();
    const host = new Fake(runsRoot, { verifyBuild: (n) => (n <= 2 ? "the main checkout has uncommitted agent or env changes" : null) });
    await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    expect(host.statuses.some((s) => s.lanes.some((l) => l.reason === "build check: the main checkout has uncommitted agent or env changes"))).toBe(true);
    expect(outcomes(readLedger(join(dir, "trials.jsonl")))).toHaveLength(12);
  });

  it("never exits when the replacement reserve is used up: the lane waits for the operator", async () => {
    const { def, runsRoot } = setup(definition({ replacementReserveMs: 0 }));
    let stop = false;
    const host = new Fake(runsRoot, { ending: (_l, n) => (n === 1 ? "never-started" : "budget") });
    const done = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => stop, pid: 77 });
    while (!host.statuses.some((s) => s.lanes.some((l) => l.reason.startsWith("replacement reserve used up")))) await new Promise((r) => setImmediate(r));
    const sleepsAtBlock = host.sleeps;
    while (host.sleeps < sleepsAtBlock + 5) await new Promise((r) => setImmediate(r));
    stop = true;
    expect(await done).toBe("stopped");
    expect(parseFixedStatus(JSON.parse(readFileSync(join(runsRoot, "experiments", def.id, "status.json"), "utf8"))).state).toBe("stopped");
  });

  it("gives back a lane's lease while it waits on the replacement reserve, so another runner can take that GPU", async () => {
    const { def, runsRoot } = setup(definition({ replacementReserveMs: 0 }));
    const [poolA, poolB] = def.lanes.map((l) => leasePool(l.modelUrl));
    let stop = false, bFailed = false;
    const seen: { a: boolean; b: boolean; other: string | null }[] = [];
    const blocked = (): boolean => {
      const path = join(runsRoot, "experiments", def.id, "status.json");
      return existsSync(path) && parseFixedStatus(JSON.parse(readFileSync(path, "utf8"))).lanes[1]?.reason.startsWith("replacement reserve used up") === true;
    };
    const host = new Fake(runsRoot, {
      ending: (l) => { if (l.lane === "B" && !bFailed) { bFailed = true; return "never-started"; } return "budget"; },
      beforeExit: async (l) => {
        if (l.lane !== "A") return;
        while (!blocked()) await new Promise((r) => setImmediate(r));
        let other: string | null;
        const a = existsSync(leaseDir(runsRoot, poolA ?? "")), b = existsSync(leaseDir(runsRoot, poolB ?? ""));
        try { other = takeLease(runsRoot, poolB ?? "", { pid: 4343, owner: "fixed-run:solo" }, () => false); } catch { other = null; }
        if (other !== null) rmSync(other, { recursive: true, force: true });
        seen.push({ a, b, other });
      },
    });
    const done = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => stop, pid: 77 });
    await vi.waitFor(() => { expect(seen.length).toBeGreaterThan(0); });
    while (!host.statuses.some((s) => s.lanes[0]?.state === "waiting" && s.lanes[1]?.reason.startsWith("replacement reserve used up") === true)) await new Promise((r) => setImmediate(r));
    expect(existsSync(leaseDir(runsRoot, poolA ?? ""))).toBe(false);
    stop = true;
    expect(await done).toBe("stopped");
    expect(seen[0]).toMatchObject({ a: true, b: false });
    expect(seen[0]?.other).toBe(leaseDir(runsRoot, poolB ?? ""));
    for (const pool of [poolA, poolB]) expect(existsSync(leaseDir(runsRoot, pool ?? ""))).toBe(false);
  });

  it("gives back a finished lane's lease while the other lane still plays", async () => {
    const { def, runsRoot } = setup(dryRunDefinition(definition(), 120_000));
    const [poolA, poolB] = def.lanes.map((l) => leasePool(l.modelUrl));
    const laneDone = (id: string): boolean => {
      const path = join(runsRoot, "experiments", def.id, "status.json");
      return existsSync(path) && parseFixedStatus(JSON.parse(readFileSync(path, "utf8"))).lanes.find((l) => l.id === id)?.state === "done";
    };
    const seen: { a: boolean; b: boolean }[] = [];
    let aLaunches = 0;
    const host = new Fake(runsRoot, {
      beforeExit: async (l) => {
        if (l.lane !== "A" || ++aLaunches < 2) return;
        while (!laneDone("B")) await new Promise((r) => setImmediate(r));
        seen.push({ a: existsSync(leaseDir(runsRoot, poolA ?? "")), b: existsSync(leaseDir(runsRoot, poolB ?? "")) });
      },
    }, def.id);
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77, dryRun: true })).toBe("finished");
    expect(seen).toEqual([{ a: true, b: false }]);
  });

  it("names each lane's own trial and pid in that lane's lease while it plays", async () => {
    const { def, runsRoot } = setup();
    const named: boolean[] = [];
    const host = new Fake(runsRoot, {
      beforeExit: (l, n) => {
        const lane = def.lanes.find((x) => x.id === l.lane);
        const owner = readLeaseOwner(runsRoot, leasePool(lane?.modelUrl ?? ""));
        named.push(owner?.run === l.runId && owner.child === 1000 + n && owner.pid === 77 && owner.owner === `fixed-run:${def.id}`);
        return Promise.resolve();
      },
    });
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 })).toBe("finished");
    expect(named).toHaveLength(12);
    expect(named.every(Boolean)).toBe(true);
  });

  it("plays a given commit instead of HEAD when the runner is told to (a rerun at its experiment's pin)", async () => {
    const { def, runsRoot, dir } = setup(dryRunDefinition(definition(), 120_000));
    const host = new Fake(runsRoot, { head: () => "b".repeat(40) }, def.id);
    await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77, dryRun: true, commit: "c".repeat(40) });
    expect(new Set(host.verified)).toEqual(new Set(["c".repeat(40)]));
    expect(new Set(launchesOf(readLedger(join(dir, "trials.jsonl"))).map((l) => l.commit))).toEqual(new Set(["c".repeat(40)]));
  });

  it("plays a single-arm rerun's one trial on its one lane, holding only that lane's lease", async () => {
    const parent = definition();
    const { def, runsRoot, dir } = setup(soloDefinition(parent, "bundle", "B", "cook", 1));
    const other = takeLease(runsRoot, leasePool(parent.lanes[0]?.modelUrl ?? ""), { pid: 999, owner: "fixed-run:bundle-v-control" }, () => true);
    const host = new Fake(runsRoot, { alive: (pid) => pid === 999 }, def.id);
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77, dryRun: true })).toBe("finished");
    expect(host.launches.map((l) => [l.lane, l.arm, l.phase])).toEqual([["B", "bundle", "cook"]]);
    expect(JSON.parse(host.launches[0]?.env["POKEBENCH_EXPERIMENT"] ?? "")).toEqual({ id: "bundle-v-control-solo-bundle-b-1", arm: "bundle", trial: 1, of: 1 });
    expect(outcomes(readLedger(join(dir, "trials.jsonl")))).toEqual([expect.objectContaining({ valid: true })]);
    expect(readLeaseOwner(runsRoot, leasePool(parent.lanes[0]?.modelUrl ?? ""))?.pid).toBe(999);
    expect(existsSync(other)).toBe(true);
  });

  it("stops launching once stop is requested, letting running trials finish", async () => {
    const { def, runsRoot, dir } = setup();
    let stop = false;
    const host = new Fake(runsRoot, { ending: (_l, n) => { if (n === 1) stop = true; return "budget"; } });
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => stop, pid: 77 })).toBe("stopped");
    const ledger = readLedger(join(dir, "trials.jsonl"));
    expect(launchesOf(ledger)).toHaveLength(2);
    expect(outcomes(ledger)).toHaveLength(2);
  });

  it("adopts a trial still running from an earlier runner, then classifies it from its events", async () => {
    const { def, runsRoot, dir } = setup();
    const slot = def.plan.find((s) => s.lane === "A");
    if (slot === undefined) throw new Error("fixture");
    const run = "2026-10-15T23-00-00_qwen36-gpu1_old0";
    mkdirSync(dir, { recursive: true });
    const entries: FixedLedgerEntry[] = [
      { kind: "launch", slot: slot.slot, lane: "A", phase: slot.phase, arm: slot.arm, run, at: "2026-10-15T23:00:00.000Z", commit: COMMIT, sources: "sources-identity", presetSha256: "p", serving: "f" },
      { kind: "started", slot: slot.slot, run, pid: 4242, at: "2026-10-15T23:00:01.000Z" },
    ];
    writeFileSync(join(dir, "trials.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    let checks = 0;
    const host = new Fake(runsRoot, { alive: (pid) => pid === 4242 && ++checks < 3 });
    const presetPath = join(dir, "presets", `${slot.phase}-${slot.arm}.json`);
    const adopt = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    await adopt;
    expect(existsSync(presetPath)).toBe(true);
    const outcome = outcomes(readLedger(join(dir, "trials.jsonl"))).find((o) => o.slot === slot.slot);
    expect(outcome).toMatchObject({ valid: false, reason: "no run_start: the run never began (exit unknown); a server, emulator or checkpoint load failure" });
    expect(host.launches.some((l) => l.slot === slot.slot)).toBe(false);
    expect(checks).toBe(3);
  });

  it("waits for the gameplay lease of a lane's model pool, saying which pool and who holds it", async () => {
    const { def, runsRoot, dir } = setup();
    const pool = def.lanes[1]?.modelUrl.replace(/^http:\/\//, "") ?? "";
    mkdirSync(leaseDir(runsRoot, pool), { recursive: true });
    writeFileSync(join(leaseDir(runsRoot, pool), "owner.json"), JSON.stringify({ pid: 999, owner: "experiment-queue" }));
    const holder = { sleeps: (): number => 0 };
    const host: Fake = new Fake(runsRoot, { alive: (pid: number): boolean => pid === 999 && holder.sleeps() < 3 });
    holder.sleeps = () => host.sleeps;
    await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    const held = host.statuses.filter((s) => s.lanes[1]?.state === "waiting" && s.lanes[1].reason === `waiting for the gameplay lease for ${pool}, held by experiment-queue (pid 999)`);
    expect(held.length).toBeGreaterThan(0);
    // Only the lane whose pool is held waits: the other plays meanwhile.
    expect(held.some((s) => s.lanes[0]?.state === "running")).toBe(true);
    expect(held.every((s) => s.lanes[0]?.reason.startsWith("waiting for the gameplay lease") !== true)).toBe(true);
    expect(outcomes(readLedger(join(dir, "trials.jsonl")))).toHaveLength(12);
  });

  it("adopts an earlier runner's trial only once its lane's lease is free", async () => {
    const { def, runsRoot, dir } = setup();
    const slot = def.plan.find((s) => s.lane === "A");
    if (slot === undefined) throw new Error("fixture");
    const run = "2026-10-15T23-00-00_qwen36-gpu1_old1";
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "trials.jsonl"), [
      { kind: "launch", slot: slot.slot, lane: "A", phase: slot.phase, arm: slot.arm, run, at: "2026-10-15T23:00:00.000Z", commit: COMMIT, sources: "sources-identity", presetSha256: "p", serving: "f" },
      { kind: "started", slot: slot.slot, run, pid: 4242, at: "2026-10-15T23:00:01.000Z" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n");
    const pool = leasePool(def.lanes[0]?.modelUrl ?? "");
    mkdirSync(leaseDir(runsRoot, pool), { recursive: true });
    writeFileSync(join(leaseDir(runsRoot, pool), "owner.json"), JSON.stringify({ pid: 999, owner: "next-run" }));
    let stop = false, ended = false;
    const host: Fake = new Fake(runsRoot, { alive: (pid) => (pid === 999 && host.sleeps < 3) || (pid === 4242 && !ended) });
    const done = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => stop, pid: 77 });
    while (!host.statuses.some((s) => s.lanes[0]?.reason.endsWith("adopted from an earlier runner") === true)) await new Promise((r) => setImmediate(r));
    stop = true;
    expect(host.statuses.some((s) => s.lanes[0]?.state === "waiting" && s.lanes[0].reason === `waiting for the gameplay lease for ${pool}, held by next-run (pid 999)`)).toBe(true);
    expect(readLeaseOwner(runsRoot, pool)).toMatchObject({ pid: 77, run, child: 4242 });
    ended = true;
    expect(await done).toBe("stopped");
  });

  it("keeps a lane's lease through an I/O error while it adopts a trial that still plays", async () => {
    const { def, runsRoot, dir } = setup(soloDefinition(definition(), "bundle", "B", "cook", 1));
    const run = "2026-10-15T23-00-00_qwen36-gpu0_old2";
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "trials.jsonl"), [
      { kind: "launch", slot: 1, lane: "B", phase: "cook", arm: "bundle", run, at: "2026-10-15T23:00:00.000Z", commit: COMMIT, sources: "sources-identity", presetSha256: "p", serving: "f" },
      { kind: "started", slot: 1, run, pid: 4242, at: "2026-10-15T23:00:01.000Z" },
    ].map((e) => JSON.stringify(e)).join("\n") + "\n");
    mkdirSync(join(runsRoot, "experiments", "runner.json"), { recursive: true });
    const pool = leasePool(def.lanes[0]?.modelUrl ?? "");
    let ended = false;
    const host: Fake = new Fake(runsRoot, { alive: (pid) => pid === 4242 && !ended }, def.id);
    const done = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77, dryRun: true });
    while (!host.statuses.some((s) => s.lanes[0]?.reason.includes("EISDIR") === true)) await new Promise((r) => setImmediate(r));
    expect(existsSync(leaseDir(runsRoot, pool))).toBe(true);
    expect(() => takeLease(runsRoot, pool, { pid: 5555, owner: "fixed-run:other" }, (pid) => pid === 4242 || pid === 77)).toThrow(LeaseHeldError);
    ended = true;
    expect(await done).toBe("finished");
    expect(outcomes(readLedger(join(dir, "trials.jsonl")))).toEqual([expect.objectContaining({ slot: 1, run })]);
    expect(host.launches).toHaveLength(0);
    expect(existsSync(leaseDir(runsRoot, pool))).toBe(false);
  });

  it("stops while waiting for the lease of a lane with an earlier runner's trial", async () => {
    const { def, runsRoot, dir } = setup();
    const slot = def.plan.find((s) => s.lane === "A");
    if (slot === undefined) throw new Error("fixture");
    const run = "2026-10-15T23-00-00_qwen36-gpu1_old3";
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "trials.jsonl"), JSON.stringify({ kind: "launch", slot: slot.slot, lane: "A", phase: slot.phase, arm: slot.arm, run, at: "2026-10-15T23:00:00.000Z", commit: COMMIT, sources: "sources-identity", presetSha256: "p", serving: "f" }) + "\n");
    const pool = leasePool(def.lanes[0]?.modelUrl ?? "");
    mkdirSync(leaseDir(runsRoot, pool), { recursive: true });
    writeFileSync(join(leaseDir(runsRoot, pool), "owner.json"), JSON.stringify({ pid: 999, owner: "next-run" }));
    let stop = false;
    const host = new Fake(runsRoot, { alive: (pid) => pid === 999 });
    const done = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => stop, pid: 77 });
    while (!host.statuses.some((s) => s.lanes[0]?.state === "waiting" && s.lanes[0].reason.startsWith("waiting for the gameplay lease"))) await new Promise((r) => setImmediate(r));
    stop = true;
    expect(await done).toBe("stopped");
    expect(parseFixedStatus(JSON.parse(readFileSync(join(dir, "status.json"), "utf8"))).lanes[0]?.state).toBe("stopped");
    expect(readLeaseOwner(runsRoot, pool)?.pid).toBe(999);
  });

  it("runs while another compute pool or the old single lease is held", async () => {
    const { def, runsRoot, dir } = setup();
    mkdirSync(leaseDir(runsRoot, "127.0.0.1:18434"), { recursive: true });
    writeFileSync(join(leaseDir(runsRoot, "127.0.0.1:18434"), "owner.json"), JSON.stringify({ pid: 999, owner: "qwen38-mac" }));
    mkdirSync(join(runsRoot, LEGACY_LEASE), { recursive: true });
    writeFileSync(join(runsRoot, LEGACY_LEASE, "owner.json"), JSON.stringify({ pid: 999, owner: "qwen38-mac" }));
    const host = new Fake(runsRoot, { alive: (pid: number): boolean => pid === 999 });
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 })).toBe("finished");
    expect(host.statuses.some((s) => s.state === "waiting" && s.lanes.some((l) => l.reason.startsWith("waiting for the gameplay lease")))).toBe(false);
    expect(outcomes(readLedger(join(dir, "trials.jsonl")))).toHaveLength(12);
  });

  it("finishes a dry run even when an invalid trial cannot be replaced", async () => {
    const { def, runsRoot } = setup(dryRunDefinition(definition(), 120_000));
    const host = new Fake(runsRoot, { ending: (_l, n) => (n === 1 ? "model_error" : "budget") }, def.id);
    expect(await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77, dryRun: true })).toBe("finished");
  });

  it("refuses a definition with problems before touching anything", async () => {
    const { def, runsRoot } = setup();
    await expect(runFixed({ def: { ...def, plan: [] }, definitionSha256: "d".repeat(64), runsRoot, host: new Fake(runsRoot), stopRequested: () => false, pid: 77 })).rejects.toThrow(/plan does not match seed/);
    expect(existsSync(join(runsRoot, "experiments"))).toBe(false);
  });
});

it.each([[false,"jit-10m","just-in-time-prompt-v1"],[true,"jit-10m","just-in-time-prompt-v1"],[false,"jit-v2-10m","just-in-time-prompt-v2"],[true,"jit-v2-10m","just-in-time-prompt-v2"]] as const)("rehearses the actual JIT definition: 24 outcomes, both GPUs, six of each arm per GPU, no replacement budget (terminal error=%s)",async(retainFailure,id,feature)=>{
 const parsed=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${id}.json`,import.meta.url),"utf8"));
 const def=parsed.definition;
 // These existing experiment definitions retain their original frozen measurement catalog.
 expect(def.progressOrder).toEqual(REQUIRED_FRONTIER_MILESTONES.slice(0,REQUIRED_FRONTIER_MILESTONES.indexOf("ROCK_TOMB_RECEIVED")+1).filter(name=>name!=="ROXANNE_FIRST_INTERACTION"));
 expect(def.terminalErrorsAsOutcomes).toBe(true);
 expect(controlBaseProblems(def,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 const {runsRoot,dir}=setup(def);
 class JitFake extends Fake {
  override async launch(l:FixedLaunch):Promise<number|null>{
   const start=this.clock;this.launches.push(l);const n=this.launches.length;
   this.running++;this.maxRunning=Math.max(this.maxRunning,this.running);l.started(1000+n);this.snapshot();
   await new Promise<void>(resolve=>setImmediate(resolve));
   this.clock=Math.max(this.clock,start+600_000);
   writeEvents(this.runsRoot,l,retainFailure&&n===1?"model_error":"budget");
   const path=join(this.runsRoot,l.runId,"events.jsonl");
   const events=readFileSync(path,"utf8").trim().split("\n").map(line=>{
    const e=checkEvent(JSON.parse(line));
    return {...e,run:l.runId,...(e.type==="run_start"&&e.evaluation!==undefined?{evaluation:{...e.evaluation,experiment:{id:def.id,arm:l.arm,trial:l.slot,of:def.plan.length}}}:{})};
   });
   writeFileSync(path,events.map(e=>JSON.stringify(e)).join("\n")+"\n");this.running--;return 0;
  }
 }
 const host=new JitFake(runsRoot,{serving:()=>({...RECEIPT,model:def.serving.model})},def.id);
 const began=host.clock;
 expect(def.plan).toHaveLength(24);
 for(const lane of def.lanes){
  const slots=def.plan.filter(s=>s.lane===lane.id);
  expect(slots.filter(s=>s.arm==="control")).toHaveLength(6);
  expect(slots.filter(s=>s.arm==="bundle")).toHaveLength(6);
  expect(slots.reduce((n,s)=>n+(def.phases.find(p=>p.id===s.phase)?.maxWallMs??0),0)).toBe(120*60_000);
 }
 expect(def.phases).toMatchObject([{perArm:12,maxWallMs:600_000,primary:false}]);
 expect(def.replacementReserveMs).toBe(0);
 expect(await runFixed({def,definitionSha256:parsed.sha256,runsRoot,host,stopRequested:()=>host.sleeps>100,pid:77})).toBe("finished");
 const rows=readLedger(join(dir,"trials.jsonl"));
 expect(outcomes(rows)).toHaveLength(24);
 expect(outcomes(rows).every(o=>o.valid)).toBe(true);
 expect(outcomes(rows).filter(o=>o.endReason==="model_error")).toHaveLength(retainFailure?1:0);
 expect(host.maxRunning).toBe(2);
 expect(host.clock-began).toBe(120*60_000);
 expect(queueState(def,rows).slots).toHaveLength(24);
 const status=parseFixedStatus(JSON.parse(readFileSync(join(dir,"status.json"),"utf8")));
 expect(status).toMatchObject({state:"finished",valid:24,invalid:0,total:24});
 expect(status.lanes.map(l=>l.valid)).toEqual([12,12]);
 const index=await cohortIndex(runsRoot,fileURLToPath(new URL("../../../experiments",import.meta.url)));
 expect(index.runs).toHaveLength(24);
 expect(index.runs.every(r=>r.cohort===`experiment:${def.id}@${COMMIT.slice(0,12)}`&&r.problem===null)).toBe(true);
 expect(experimentsAudit(runsRoot,index)).toEqual([]);
 for(const launch of host.launches){
  const preset=JSON.parse(readFileSync(launch.presetPath,"utf8")) as {target:null;limits:{maxWallMs:number};features:Record<string,boolean>};
  expect(preset.target).toBeNull();expect(preset.limits.maxWallMs).toBe(600_000);
  expect(preset.features[feature]).toBe(launch.arm==="bundle");
  expect(preset.features["milestone-stall-stop-v1"]).toBe(false);
 }
});

it.each([[false,"jit-v2-cache-20m","just-in-time-prompt-v2"],[true,"jit-v2-cache-20m","just-in-time-prompt-v2"]] as const)("rehearses the actual JIT definition: two concurrent 20-minute outcomes, one per GPU, no replacement budget (terminal error=%s)",async(retainFailure,id,feature)=>{
 const parsed=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${id}.json`,import.meta.url),"utf8"));
 const def=parsed.definition;
 // These existing experiment definitions retain their original frozen measurement catalog.
 expect(def.progressOrder).toEqual(REQUIRED_FRONTIER_MILESTONES.slice(0,REQUIRED_FRONTIER_MILESTONES.indexOf("ROCK_TOMB_RECEIVED")+1).filter(name=>name!=="ROXANNE_FIRST_INTERACTION"));
 expect(def.terminalErrorsAsOutcomes).toBe(true);
 expect(controlBaseProblems(def,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 const {runsRoot,dir}=setup(def);
 class JitFake extends Fake {
  override async launch(l:FixedLaunch):Promise<number|null>{
   const start=this.clock;this.launches.push(l);const n=this.launches.length;
   this.running++;this.maxRunning=Math.max(this.maxRunning,this.running);l.started(1000+n);this.snapshot();
   await new Promise<void>(resolve=>setImmediate(resolve));
   this.clock=Math.max(this.clock,start+1_200_000);
   writeEvents(this.runsRoot,l,retainFailure&&n===1?"model_error":"budget");
   const path=join(this.runsRoot,l.runId,"events.jsonl");
   const events=readFileSync(path,"utf8").trim().split("\n").map(line=>{
    const e=checkEvent(JSON.parse(line));
    return {...e,run:l.runId,...(e.type==="run_start"&&e.evaluation!==undefined?{evaluation:{...e.evaluation,experiment:{id:def.id,arm:l.arm,trial:l.slot,of:def.plan.length}}}:{})};
   });
   writeFileSync(path,events.map(e=>JSON.stringify(e)).join("\n")+"\n");this.running--;return 0;
  }
 }
 const host=new JitFake(runsRoot,{serving:()=>({...RECEIPT,model:def.serving.model})},def.id);
 const began=host.clock;
 expect(def.plan).toHaveLength(2);
 for(const lane of def.lanes){
  const slots=def.plan.filter(s=>s.lane===lane.id);
  expect(slots).toHaveLength(1);
  expect(slots.reduce((n,s)=>n+(def.phases.find(p=>p.id===s.phase)?.maxWallMs??0),0)).toBe(20*60_000);
 }
 expect(def.phases).toMatchObject([{perArm:1,singlePair:true,maxWallMs:1_200_000,primary:false}]);
 expect(def.replacementReserveMs).toBe(0);
 expect(await runFixed({def,definitionSha256:parsed.sha256,runsRoot,host,stopRequested:()=>host.sleeps>100,pid:77})).toBe("finished");
 const rows=readLedger(join(dir,"trials.jsonl"));
 expect(outcomes(rows)).toHaveLength(2);
 expect(outcomes(rows).every(o=>o.valid)).toBe(true);
 expect(outcomes(rows).filter(o=>o.endReason==="model_error")).toHaveLength(retainFailure?1:0);
 expect(host.maxRunning).toBe(2);
 expect(host.clock-began).toBe(20*60_000);
 expect(queueState(def,rows).slots).toHaveLength(2);
 const status=parseFixedStatus(JSON.parse(readFileSync(join(dir,"status.json"),"utf8")));
 expect(status).toMatchObject({state:"finished",valid:2,invalid:0,total:2});
 expect(status.lanes.map(l=>l.valid)).toEqual([1,1]);
 const index=await cohortIndex(runsRoot,fileURLToPath(new URL("../../../experiments",import.meta.url)));
 expect(index.runs).toHaveLength(2);
 expect(index.runs.every(r=>r.cohort===`experiment:${def.id}@${COMMIT.slice(0,12)}`&&r.problem===null)).toBe(true);
 expect(experimentsAudit(runsRoot,index)).toEqual([]);
 for(const launch of host.launches){
  const preset=JSON.parse(readFileSync(launch.presetPath,"utf8")) as {target:null;limits:{maxWallMs:number};features:Record<string,boolean>};
  expect(preset.target).toBeNull();expect(preset.limits.maxWallMs).toBe(1_200_000);
  expect(preset.features[feature]).toBe(launch.arm==="bundle");
  expect(preset.features["jit-guide-reuse-v1"]).toBe(launch.arm==="bundle");
  expect(preset.features["cache-aligned-window-v1"]).toBe(true);
  expect(preset.features["milestone-stall-stop-v1"]).toBe(false);
 }
});

it("holds both GPU lanes through finite extensions, then chains without replacements or post-horizon credit", async () => {
  const { def, runsRoot, dir } = setup();
  const releases: (() => void)[] = [];
  const host = new Fake(runsRoot, { extensionMs: 1800000, beforeExit: (_l, n) => n <= 2 ? new Promise<void>(resolve => releases.push(resolve)) : Promise.resolve() });
  const running = runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
  await vi.waitFor(() => { expect(releases).toHaveLength(2); });
  expect(host.launches).toHaveLength(2);
  // Passing the original horizon cannot start the next slot while either child is alive.
  host.clock += 7200000;
  await new Promise<void>(r => setImmediate(r));
  expect(host.launches).toHaveLength(2);
  for (const release of releases) release();
  expect(await running).toBe("finished");
  const entries = readLedger(join(dir, "trials.jsonl"));
  expect(launchesOf(entries)).toHaveLength(def.plan.length);
  expect(outcomes(entries).every(o => o.valid && o.furthest !== "STONE_BADGE")).toBe(true);
  expect(host.maxRunning).toBe(2);
  expect(parseFixedStatus(JSON.parse(readFileSync(join(dir, "status.json"), "utf8")))).toMatchObject({ state: "finished", invalid: 0, valid: def.plan.length });
});

it("enables battle decision readiness identically in control and bundle, preserving the frozen control base",async()=>{
 const {armPreset}=await import("./fixed-design.js");
 const def=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")).definition;
 const id="battle-decision-ready-v1";
 expect(def.onInBoth).toContain(id);expect(def.switches).not.toContain(id);
 expect(controlBaseProblems(def,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 for(const arm of ["control","bundle"] as const){
  expect(armFeatureBits(def,arm)[id]).toBe(true);
  for(const phase of def.phases)expect(armPreset(def,phase.id,arm).features[id]).toBe(true);
 }
});

 it("keeps visited navigation explicitly registered OFF for approved campaign overrides",async()=>{
 const {armPreset}=await import("./fixed-design.js");
 const {presetFeatures,parsePlayPreset}=await import("@pokebench/agent/play-preset");
 const def=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")).definition;
 const id="visited-terrain-navigation-v1";
 expect(id in def.base.features).toBe(true);expect(def.base.features[id]).toBe(false);
 expect(def.offInBoth).toContain(id);expect(def.switches).not.toContain(id);expect(def.onInBoth).not.toContain(id);
 expect(controlBaseProblems(def,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 const omitted=structuredClone(def);delete omitted.base.features["visited-terrain-navigation-v1"];omitted.offInBoth=omitted.offInBoth.filter(key=>key!==id);
 for(const arm of ["control","bundle"] as const)for(const phase of def.phases){
  const restored=armPreset(def,phase.id,arm),previous=armPreset(omitted,phase.id,arm);
  expect(armFeatureBits(def,arm)[id]).toBe(false);
  expect(presetFeatures(parsePlayPreset(restored))).toEqual(presetFeatures(parsePlayPreset(previous)));
  expect(restored.features["battle-decision-ready-v1"]).toBe(true);
 }
});

it("enables safe navigation strides only in the canonical bundle treatment",async()=>{
 const {armPreset}=await import("./fixed-design.js");
 const {presetFeatures}=await import("@pokebench/agent/play-preset");
 const {playHarnessFeatures,dependencyProblems}=await import("@pokebench/agent/features");
 const def=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")).definition;
 const id="safe-navigation-strides-v1";
 expect(def.base.features[id]).toBe(false);expect(def.switches).toContain(id);
 expect(def.offInBoth).not.toContain(id);expect(def.onInBoth).not.toContain(id);
 expect(controlBaseProblems(def,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url),"utf8"))).toEqual([]);
 for(const phase of def.phases)for(const arm of ["control","bundle"] as const){
  const features=presetFeatures(armPreset(def,phase.id,arm));
  expect(features[id]).toBe(arm==="bundle");expect(dependencyProblems(features)).toEqual([]);
  expect(playHarnessFeatures(features,null).includes(id)).toBe(arm==="bundle");
 }
});

it("enables explicit evolution in both arms through the production arm builder",()=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8"));
 expect(armFeatureBits(def,"control")["evolution-decision-v1"]).toBe(true);
 expect(armFeatureBits(def,"bundle")["evolution-decision-v1"]).toBe(true);
 });
it("rehearses all sixteen starter diagnostic slots with one switch, native early stops and eight choices per arm",async()=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/starter-decision-salience.json",import.meta.url),"utf8"));
 const {runsRoot,dir}=setup(def);const host=new Fake(runsRoot,{ending:()=>"milestone",serving:()=>({...RECEIPT,...def.serving})},def.id);
 expect(await runFixed({def,definitionSha256:"d".repeat(64),runsRoot,host,stopRequested:()=>false,pid:77})).toBe("finished");
 const ledger=readLedger(join(dir,"trials.jsonl")),finished=outcomes(ledger);
 expect(finished).toHaveLength(16);expect(finished.every(e=>e.valid&&e.endReason==="milestone"&&e.primaryReached&&e.primaryMs===20_000)).toBe(true);
 for(const lane of def.lanes)for(const arm of ["control","bundle"]){
  const launches=host.launches.filter(l=>l.lane===lane.id&&l.arm===arm);expect(launches).toHaveLength(4);
  for(const launch of launches){const p=JSON.parse(readFileSync(launch.presetPath,"utf8")) as {target:null;stopAt:string;features:Record<string,boolean>;limits:{maxWallMs:number}};expect(p.target).toBeNull();expect(p.stopAt).toBe("STARTER_CHOSEN");expect(p.limits.maxWallMs).toBe(300_000);expect(p.features["starter-decision-salience-v1"]).toBe(arm==="bundle");}
 }
 expect(host.maxRunning).toBe(2);expect(def.replacementReserveMs).toBe(0);expect(def.terminalErrorsAsOutcomes).toBe(true);
});

it("enables native party-item confirmation only in the bundle of both current bundle definitions",()=>{
 const id="party-item-confirmation-v1";
 for(const file of ["bundle-v-control","bundle-cook-1h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  expect(def.switches.filter(s=>s===id)).toEqual([id]);
  expect(def.onInBoth).not.toContain(id);
  expect(armFeatures(def,"control")[id]).toBe(false);
  expect(armFeatures(def,"bundle")[id]).toBe(true);
  expect(armFeatureBits(def,"control")[id]).toBe(false);
  expect(armFeatureBits(def,"bundle")[id]).toBe(true);
 }
});

it("enables the YES/NO answer readout only in the bundle of the three current bundle definitions",()=>{
 const id="yes-no-answer-readout-v1";
 for(const file of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  expect(def.switches.filter(s=>s===id)).toEqual([id]);
  expect(def.onInBoth).not.toContain(id);
  expect(def.base.features[id]).toBe(false);
  expect(armFeatures(def,"control")[id]).toBe(false);
  expect(armFeatures(def,"bundle")[id]).toBe(true);
  expect(armFeatureBits(def,"control")[id]).toBe(false);
  expect(armFeatureBits(def,"bundle")[id]).toBe(true);
 }
});

it("enables the five move-learn switches only in the bundle of the three current bundle definitions, and keeps them OFF in the next-run default",()=>{
 for(const id of ["move-learn-settle-v1","move-learn-question-v1","move-learn-comparison-v1","effectiveness-heard-v1","game-said-goals-v1"] as const){
  expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
  for(const file of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h"]){
   const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
   expect(def.switches.filter(s=>s===id)).toEqual([id]);
   expect(def.onInBoth).not.toContain(id);
   expect(def.base.features[id]).toBe(false);
   expect(armFeatures(def,"control")[id]).toBe(false);
   expect(armFeatures(def,"bundle")[id]).toBe(true);
   expect(armFeatureBits(def,"control")[id]).toBe(false);
   expect(armFeatureBits(def,"bundle")[id]).toBe(true);
  }
 }
});

it("enables the mart stock readout only in the bundle of the four current bundle definitions, and keeps it OFF in the next-run default",()=>{
 const id="mart-stock-readout-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const file of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  expect(def.switches.filter(s=>s===id)).toEqual([id]);
  expect(def.onInBoth).not.toContain(id);
  expect(def.base.features[id]).toBe(false);
  expect(armFeatures(def,"control")[id]).toBe(false);
  expect(armFeatures(def,"bundle")[id]).toBe(true);
  expect(armFeatureBits(def,"control")[id]).toBe(false);
  expect(armFeatureBits(def,"bundle")[id]).toBe(true);
 }
});

it("enables the shop interface only in the bundle of the four current bundle definitions, and keeps it OFF in the next-run default",()=>{
 const id="shop-interface-v1";
 expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const file of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  expect(def.switches.filter(s=>s===id)).toEqual([id]);
  expect(def.onInBoth).not.toContain(id);
  expect(def.base.features[id]).toBe(false);
  expect(armFeatures(def,"control")[id]).toBe(false);
  expect(armFeatures(def,"bundle")[id]).toBe(true);
  expect(armFeatureBits(def,"control")[id]).toBe(false);
  expect(armFeatureBits(def,"bundle")[id]).toBe(true);
 }
});

it("enables the seven training and catching switches only in the bundle of the four current bundle definitions, and keeps them OFF in the next-run default",()=>{
 const ids=["exp-next-level-v1","pokedex-own-v1","exp-earned-ledger-v1","leader-attempt-ledger-v1","seen-trainers-ledger-v1","party-coverage-v1","said-type-matches-v1"] as const;
 for(const id of ids)expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 for(const file of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  for(const id of ids){
   expect(def.switches.filter(s=>s===id)).toEqual([id]);
   expect(def.onInBoth).not.toContain(id);
   expect(def.base.features[id]).toBe(false);
   expect(armFeatures(def,"control")[id]).toBe(false);
   expect(armFeatures(def,"bundle")[id]).toBe(true);
   expect(armFeatureBits(def,"control")[id]).toBe(false);
   expect(armFeatureBits(def,"bundle")[id]).toBe(true);
  }
 }
});

it("enables five GLM-run fixes only in the bundle; cut-off feedback is shared; next-run defaults stay OFF",()=>{
 const ids=["story-goal-player-name-v1","trainer-sight-check-v2","auto-talk-v2","map-wide-triggers-v1","drought-battle-heal-hold-v1"] as const;
 for(const file of ["bundle-v-control","bundle-v-control-2h","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
  const control=armFeatures(def,"control"),bundle=armFeatures(def,"bundle"),controlBits=armFeatureBits(def,"control"),bundleBits=armFeatureBits(def,"bundle");
  for(const id of ids){
   expect(def.switches.filter(s=>s===id)).toEqual([id]);
   expect(def.onInBoth).not.toContain(id);
   expect(def.base.features[id]).toBe(false);
   expect([control[id],bundle[id],controlBits[id],bundleBits[id]]).toEqual([false,true,false,true]);
  }
 }
 for(const id of ids){
  expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
 }
});

it("keeps section-aware labels OFF in the generic next-run default",()=>{
 expect(DEFAULT_NEXT_RUN.features["exit-labels-v3"]).toBe(false);
 expect(parseNextRun(DEFAULT_NEXT_RUN).features["exit-labels-v3"]).toBe(false);
});

it.each([false,true])("rehearses the four-hour GLM pair serially and retains its stop boundary (stop after first: %s)", async stopAfterFirst=>{
 const source=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/glm53-flash-4h.json",import.meta.url),"utf8")).definition;
 const canonical=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")).definition;
 const def=dryRunDefinition({...source,base:{...source.base,features:canonical.base.features},controlBase:canonical.controlBase,switches:canonical.switches,offInBoth:canonical.offInBoth,onInBoth:canonical.onInBoth},14_400_000,"cook");
 for(const arm of ["bundle","control"] as const)expect(armFeatureBits(def,arm)).toEqual(armFeatureBits(canonical,arm));
 expect(def.plan.map(s=>s.arm)).toEqual(["control","bundle"]);
 const {runsRoot,dir}=setup(def);let stop=false;
 class GlmFake extends Fake {
  override async launch(l:FixedLaunch):Promise<number|null>{
   this.launches.push(l);this.running++;this.maxRunning=Math.max(this.maxRunning,this.running);l.started(1000+this.launches.length);this.snapshot();
   await new Promise<void>(resolve=>setImmediate(resolve));this.clock+=14_400_000;
   writeEvents(this.runsRoot,l,"budget");
   const path=join(this.runsRoot,l.runId,"events.jsonl");
   const rows=readFileSync(path,"utf8").trim().split("\n").map(line=>{
    const e=checkEvent(JSON.parse(line));return {...e,run:l.runId,...(e.type==="run_start"&&e.evaluation!==undefined?{evaluation:{...e.evaluation,experiment:{id:def.id,arm:l.arm,trial:l.slot,of:def.plan.length}}}:{})};
   });
   writeFileSync(path,rows.map(e=>JSON.stringify(e)).join("\n")+"\n");this.running--;if(stopAfterFirst)stop=true;return 0;
  }
 }
 const host=new GlmFake(runsRoot,{serving:()=>({...RECEIPT,...def.serving})},def.id);
 expect(await runFixed({def,definitionSha256:"d".repeat(64),runsRoot,host,stopRequested:()=>stop,pid:77,dryRun:true})).toBe(stopAfterFirst?"stopped":"finished");
 const rows=readLedger(join(dir,"trials.jsonl"));const n=stopAfterFirst?1:2;
 expect(host.maxRunning).toBe(1);expect(host.launches.map(l=>l.arm)).toEqual(def.plan.slice(0,n).map(s=>s.arm));
 expect(launchesOf(rows)).toHaveLength(n);expect(outcomes(rows)).toHaveLength(n);expect(outcomes(rows).every(o=>o.valid)).toBe(true);
 const status=parseFixedStatus(JSON.parse(readFileSync(join(dir,"status.json"),"utf8")));
 expect(status).toMatchObject({state:stopAfterFirst?"stopped":"finished",valid:n,invalid:0,total:2});
 expect(status.lanes.map(l=>l.valid)).toEqual([n]);
 const index=await cohortIndex(runsRoot,fileURLToPath(new URL("../../../experiments",import.meta.url)));
 expect(index.runs).toHaveLength(n);expect(index.runs.every(r=>r.cohort===`experiment:${def.id}@${COMMIT.slice(0,12)}`&&r.problem===null)).toBe(true);
 expect(experimentsAudit(runsRoot,index)).toEqual([]);
 for(const launch of host.launches){
  const preset=JSON.parse(readFileSync(launch.presetPath,"utf8")) as {target:null;limits:{maxWallMs:number};features:Record<string,boolean>;start:{sha1:string}};
  expect(preset.target).toBeNull();expect(preset.limits.maxWallMs).toBe(14_400_000);expect(preset.start.sha1).toBe("b3a6cc1c19836600a15febf41b8f8b19661ce5d4");
  expect(preset.features).toEqual(armFeatures(canonical,launch.arm));
 }
});

it("adds progress-aware cycles only to the bundle in canonical and current whole-map definitions",()=>{
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-pair-2h","bundle-v-control-2h","whole-map-cook-1h"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8"));
  expect(def.switches).toContain("progress-aware-cycles-v1");
  expect(armFeatures(def,"control")["progress-aware-cycles-v1"]).toBe(false);
  expect(armFeatures(def,"bundle")["progress-aware-cycles-v1"]).toBe(true);
 }
});

it.each(["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"])("enables the movement, dialogue and shop repairs in %s bundle only",file=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
 const phase=def.phases[0];if(phase===undefined)throw new Error("fixed definition has no phase");
 for(const id of ["rejected-movement-step-v1","observed-field-dialogue-v1","shop-interface-v1","birch-intro-pages-v1"] as const){
  expect(def.base.features[id]).toBe(false);expect(def.switches).toContain(id);
  expect(armPreset(def,phase.id,"control").features[id]).toBe(false);
  expect(armPreset(def,phase.id,"bundle").features[id]).toBe(true);
 }
});


it("the active two-hour cook includes approved gym evidence and milestone memory only in the bundle",()=>{
 const {definition:source}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control-2h.json",import.meta.url),"utf8"));
 const dry=dryRunDefinition(source,7_200_000,"cook");
 for(const arm of ["control","bundle"] as const){
  const def=soloDefinition(dry,arm,"A","dry-run",1);
  const preset=armPreset(def,"dry-run",arm);
  for(const id of ["gym-evidence-v1","milestone-instruction-memory-v1"] as const){
   expect(source.base.features[id],id).toBe(false);
   expect(source.switches,id).toContain(id);
   expect(source.onInBoth,id).not.toContain(id);
   expect(preset.features[id],`${arm}:${id}`).toBe(arm==="bundle");
   expect(DEFAULT_NEXT_RUN.features[id],`default:${id}`).toBe(false);
  }
 }
});

it.each(["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"])("puts checked requested strides in %s normalized bundle only",file=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
 const phase=def.phases[0];if(phase===undefined)throw new Error("missing phase");
 expect(def.switches).toContain("rejected-movement-stride-v1");
 for(const arm of ["control","bundle"] as const){
  const preset=armPreset(def,phase.id,arm);
  expect(preset.features["rejected-movement-stride-v1"]).toBe(arm==="bundle");
  if(arm==="bundle")expect(preset.features["safe-navigation-strides-v1"]).toBe(true);
 }
});

it.each(["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"])("puts boundary facts in %s normalized bundle only",file=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
 const phase=def.phases[0];if(phase===undefined)throw new Error("missing phase");
 for(const arm of ["control","bundle"] as const)expect(armPreset(def,phase.id,arm).features["boundary-crossing-facts-v1"]).toBe(arm==="bundle");
});

it.each(["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h"])("puts section alternatives in %s normalized bundle only",file=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${file}.json`,import.meta.url),"utf8"));
 const phase=def.phases[0];if(phase===undefined)throw new Error("missing phase");
 for(const arm of ["control","bundle"] as const)expect(armPreset(def,phase.id,arm).features["reachable-section-alternatives-v1"]).toBe(arm==="bundle");
});

it("enables observed trainer Pokémon only in every current bundle comparison arm",()=>{
 for(const id of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h","glm53-flash-4h","gym-rustboro-torchic","gym-rustboro-torchic-healed"]){
  const {definition:def}=parseFixedDefinition(readFileSync(new URL(`../../../experiments/fixed/${id}.json`,import.meta.url),"utf8"));
  expect(armFeatureBits(def,"bundle")["trainer-observed-party-v1"],id).toBe(true);
  expect(armFeatureBits(def,"control")["trainer-observed-party-v1"],id).toBe(false);
 }
});

it("rehearses bundle-only reply caps through persisted presets and chained fake trials",async()=>{
 const original=definition();
 const def=definition({bundleMaxTokens:8192,base:{...original.base,features:{...original.base.features,"cut-off-reply-feedback-v1":true}},onInBoth:[...original.onInBoth,"cut-off-reply-feedback-v1"],lanes:original.lanes.slice(0,1),phases:[{id:"cook",perArm:1,maxWallMs:60000,primary:false,start:{kind:"boot"}}]});
 const {runsRoot,dir}=setup(def);const host=new Fake(runsRoot);
 try{
  expect(await runFixed({def,definitionSha256:"d".repeat(64),runsRoot,host,stopRequested:()=>false,pid:77})).toBe("finished");
  expect(host.launches).toHaveLength(2);expect(host.maxRunning).toBe(1);
  expect(outcomes(readLedger(join(dir,"trials.jsonl")))).toHaveLength(2);
  for(const launch of host.launches){
   const preset:unknown=JSON.parse(readFileSync(launch.presetPath,"utf8"));
   const arm=(JSON.parse(launch.env["POKEBENCH_EXPERIMENT"]??"{}") as {arm:string}).arm;
   expect(preset).toMatchObject({sampling:{maxTokens:arm==="bundle"?8192:4096},features:{"cut-off-reply-feedback-v1":true}});
  }
  const index=await cohortIndex(runsRoot,fileURLToPath(new URL("../../../experiments",import.meta.url)));
  expect(index.runs).toHaveLength(2);expect(experimentsAudit(runsRoot,index)).toEqual([]);
 }finally{rmSync(runsRoot,{recursive:true,force:true});}
});
