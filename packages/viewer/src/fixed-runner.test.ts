import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runFixed, type FixedHost, type FixedLaunch, type ServingReceipt } from "./fixed-runner.js";
import { readLedger, queueState, type FixedLedgerEntry } from "./fixed-ledger.js";
import {checkEvent} from "@pokebench/agent/events";
import {cohortIndex} from "./workbench-store.js";
import {experimentsAudit} from "./experiments-audit.js";
import {fileURLToPath} from "node:url";
import {FRONTIER_MILESTONES} from "./frontier.js";
import { LEASE } from "./lease.js";
import { parseFixedStatus, type FixedStatus } from "./fixed-status.js";
import { definition, MODEL_PATH, ROM_SHA1 } from "../test-support/fixed.js";
import { Log, START } from "../test-support/events.js";
import { armFeatureBits, parseFixedDefinition, controlBaseProblems, dryRunDefinition, type FixedDefinition, type FixedLane } from "./fixed-design.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const RECEIPT: ServingReceipt = { model: MODEL_PATH, build: "b10236-1464c62d8", contextTokens: 65536, slots: 1, vision: true, fingerprint: "f".repeat(64) };

it("keeps the improved blackout receipt out of control and in the bundle",()=>{
 const {definition:def}=parseFixedDefinition(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8"));
 expect(def.switches).toContain("blackout-readout-v1");
 expect(def.onInBoth).not.toContain("blackout-readout-v1");
 expect(armFeatureBits(def,"control")["blackout-readout-v1"]).toBe(false);
 expect(armFeatureBits(def,"bundle")["blackout-readout-v1"]).toBe(true);
});

type Ending = "budget" | "model_error" | "never-started";
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

function writeEvents(runsRoot: string, l: FixedLaunch, ending: "budget" | "model_error", extensionMs = 0): void {
  const preset = JSON.parse(readFileSync(l.presetPath, "utf8")) as { id: string; limits: { maxWallMs: number }; features: Record<string, boolean>; start?: { path: string; sha1: string } };
  const port = Number(new URL(l.env["POKEBENCH_GAME_SERVER_URL"] ?? "").port);
  const log = new Log();
  log.add(0, { ...START, rom_sha1: ROM_SHA1, model: { ...START.model, id: l.env["POKEBENCH_MODEL"] ?? "" }, start_state: preset.start === undefined ? { kind: "boot" } : { kind: "save_state", path: preset.start.path, sha1: preset.start.sha1 }, budgets: { max_wall_ms: preset.limits.maxWallMs }, isolation: { ...START.isolation, port }, evaluation: { preset_id: preset.id, target: null, failure_limit: 3, reply_failures_end_run: false, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: false }, features: preset.features } });
  if (ending === "model_error") log.add(10, { type: "retry", turn: 1, reason: "model error: HTTP 502", attempt: 3, limit: 3 });
  if (extensionMs > 0) {
    log.add(1000, { type: "operator_control", turn: 1, action: "extend_30m", status: "applied", request: 1, previous_max_wall_ms: preset.limits.maxWallMs, max_wall_ms: preset.limits.maxWallMs + extensionMs });
    log.add(preset.limits.maxWallMs + 1000, { type: "milestone", turn: 4, name: "STONE_BADGE", kind: "story", origin: "observed", server_timestamp: 1 });
  }
  log.add(preset.limits.maxWallMs + extensionMs, { type: "run_end", turn: 5, reason: ending, furthest_milestone: null, turns: 5, wall_ms: ending === "budget" ? preset.limits.maxWallMs + extensionMs : 10, tokens: { input: 1, output: 1 }, frames: { saved: 0, bytes: 0 } });
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
    expect(existsSync(join(runsRoot, LEASE))).toBe(false);
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

  it("waits for the gameplay lease, saying who holds it", async () => {
    const { def, runsRoot, dir } = setup();
    mkdirSync(join(runsRoot, LEASE), { recursive: true });
    writeFileSync(join(runsRoot, LEASE, "owner.json"), JSON.stringify({ pid: 999, owner: "experiment-queue" }));
    const holder = { sleeps: (): number => 0 };
    const host: Fake = new Fake(runsRoot, { alive: (pid: number): boolean => pid === 999 && holder.sleeps() < 3 });
    holder.sleeps = () => host.sleeps;
    await runFixed({ def, definitionSha256: "d".repeat(64), runsRoot, host, stopRequested: () => false, pid: 77 });
    expect(host.statuses.some((s) => s.state === "waiting" && s.lanes.every((l) => l.reason === "waiting for the gameplay lease, held by experiment-queue (pid 999)"))).toBe(true);
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
 expect(def.progressOrder).toEqual(FRONTIER_MILESTONES.map(m=>m.id));
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
 expect(def.progressOrder).toEqual(FRONTIER_MILESTONES.map(m=>m.id));
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
