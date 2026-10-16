// `just fixed-run <command>`: the fixed-N two-arm experiment driver. Definitions live in
// experiments/fixed/<id>.json; their ledgers, status and approvals in runs/experiments/<id>/.
// Approval is interactive so an agent can never grant it.
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { userInfo } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { Value } from "typebox/value";
import { newRunId } from "@pokebench/agent/run";
import { spawnDetached } from "./detached.js";
import { mainCheckout, sourceIdentity } from "./experiment-cli.js";
import { analyze, renderAnalysis, trialsFromLedger, type AnalysisTrial } from "./fixed-analysis.js";
import { controlBaseProblems, dryRunDefinition, FixedDraftSchema, generatePlan, parseFixedDefinition, phaseOf, type FixedDefinition } from "./fixed-design.js";
import { classifyTrial, readLedger } from "./fixed-ledger.js";
import { runFixed, type FixedHost, type FixedRunOptions, type ServingReceipt } from "./fixed-runner.js";
import { fixedStatusPath, parseFixedStatus } from "./fixed-status.js";
import { fixedTreeDir, fixedTreeLiveJs, prepareFixedTree, type FixedTreeDeps } from "./fixed-tree.js";
import { pidAlive } from "./lease.js";
import { randomSuffix } from "./next-run.js";

export interface FixedCliDeps {
  readonly root: string;
  readonly runsRoot: string;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly randomSeed: () => string;
  readonly interactive: boolean;
  readonly prompt: (question: string) => Promise<string>;
  readonly now: () => Date;
  readonly user: string;
  readonly head: () => string;
  readonly sha1File: (path: string) => string | null;
  // POKEBENCH_ROM as the runner sees it; `just` loads it from the gitignored .env.
  readonly rom: string | undefined;
  readonly run: (options: FixedRunOptions) => Promise<"finished" | "stopped">;
  readonly host: () => FixedHost;
  readonly stopRequested?: () => boolean;
}

const USAGE = [
  "usage: fixed-run plan <id> [--seed <16 hex>]   freeze the seeded plan into experiments/fixed/<id>.json",
  "       fixed-run check <id>                     validate the definition and every phase's start save",
  "       fixed-run approve <id>                   operator only, interactive",
  "       fixed-run run <id>                       run the approved experiment (both lanes)",
  "       fixed-run dry-run <id> [--phase <phase>] [--wall-ms <ms>]  one trial per arm per lane with that phase's start, as <id>-dryrun-<phase>",
  "       fixed-run status <id>",
  "       fixed-run analyze <id> [--phase <id>]",
  "       fixed-run analyze-receipt <dir> <control-arm> <treatment-arm> --cap-ms <ms> [--primary <milestone>]",
].join("\n");

class CliError extends Error {}
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const flag = (argv: readonly string[], name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
};
const msInt = (value: string | undefined, fallback: number | undefined, name: string): number => {
  if (value === undefined && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 60_000) throw new CliError(`${name} must be an integer of at least 60000 ms`);
  return n;
};

const definitionPath = (deps: FixedCliDeps, id: string): string => join(deps.root, "experiments", "fixed", `${id}.json`);
const experimentDir = (deps: FixedCliDeps, id: string): string => join(deps.runsRoot, "experiments", id);

function loadText(deps: FixedCliDeps, id: string): string {
  const path = definitionPath(deps, id);
  if (!existsSync(path)) throw new CliError(`no definition ${path}`);
  return readFileSync(path, "utf8");
}

function load(deps: FixedCliDeps, id: string): { definition: FixedDefinition; sha256: string } {
  const loaded = parseFixedDefinition(loadText(deps, id));
  for (const { start } of loaded.definition.phases) {
    if (start.kind !== "save_state") continue;
    const actual = deps.sha1File(join(deps.root, start.path));
    if (actual === null) throw new CliError(`start save ${start.path} is missing`);
    if (actual !== start.sha1) throw new CliError(`start save ${start.path} has sha1 ${actual}, the definition records ${start.sha1}`);
  }
  const base = loaded.definition.controlBase;
  const basePath = join(deps.root, base.path);
  if (!existsSync(basePath)) throw new CliError(`control base ${base.path} is missing`);
  const problems = controlBaseProblems(loaded.definition, readFileSync(basePath, "utf8"));
  if (problems.length > 0) throw new CliError(problems.join("\n"));
  return loaded;
}

function plan(argv: readonly string[], deps: FixedCliDeps, id: string): void {
  const launched = readLedger(join(experimentDir(deps, id), "trials.jsonl")).filter((e) => e.kind === "launch").length;
  if (launched > 0) throw new CliError(`the plan is frozen: ${String(launched)} trial${launched === 1 ? " has" : "s have"} launched`);
  const value = JSON.parse(loadText(deps, id)) as Record<string, unknown>;
  delete value["plan"];
  const seed = flag(argv, "--seed") ?? (typeof value["seed"] === "string" ? value["seed"] : deps.randomSeed());
  if (!/^[0-9a-f]{16}$/.test(seed)) throw new CliError("the seed must be 16 lowercase hex digits");
  const draft = { ...value, seed };
  if (!Value.Check(FixedDraftSchema, draft)) {
    const [first] = Value.Errors(FixedDraftSchema, draft);
    throw new CliError(`not a fixed-run draft: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);
  }
  const def = { ...draft, seed, plan: generatePlan({ ...draft, seed }) };
  const text = `${JSON.stringify(def, null, 1)}\n`;
  parseFixedDefinition(text);
  writeFileSync(definitionPath(deps, id), text);
  deps.out(`planned ${String(def.plan.length)} trials with seed ${seed}`);
}

interface Approval { readonly experiment: string; readonly definitionSha256: string; readonly approvedBy: string; readonly approvedAt: string; readonly commit: string }
const approvalPath = (deps: FixedCliDeps, id: string): string => join(experimentDir(deps, id), "approval.json");
function readApproval(deps: FixedCliDeps, id: string): Approval | null {
  const path = approvalPath(deps, id);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Approval) : null;
}

function check(deps: FixedCliDeps, id: string): void {
  const { definition: def, sha256: digest } = load(deps, id);
  deps.out(`${def.id}: ${def.title}`);
  deps.out(`seed ${def.seed}, ${String(def.plan.length)} planned trials, definition sha256 ${digest}`);
  for (const phase of def.phases) {
    const n = (arm: string): number => def.plan.filter((s) => s.phase === phase.id && s.arm === arm).length;
    const start = phase.start.kind === "save_state" ? `start ${phase.start.path} (sha1 ${phase.start.sha1.slice(0, 12)})` : "start boot";
    deps.out(`${phase.id}: ${String(n("control"))} control + ${String(n("bundle"))} bundle, ${String(phase.maxWallMs)} ms cap${phase.primary ? ", primary" : ", exploratory"}, ${start}`);
  }
  for (const lane of def.lanes) deps.out(`lane ${lane.id}: ${lane.gpu}, game port ${String(lane.gamePort)}, model ${lane.modelUrl}`);
  deps.out(`bundle switches: ${def.switches.join(", ")}; off in both: ${def.offInBoth.join(", ")}; on in both: ${def.onInBoth.length === 0 ? "none" : def.onInBoth.join(", ")}`);
  deps.out(`control base: ${def.controlBase.presetId} (${def.controlBase.path}, sha256 ${def.controlBase.sha256}) matches outside the switches and off-in-both flags`);
  const approval = readApproval(deps, id);
  deps.out(`approval: ${approval === null ? "none" : approval.definitionSha256 === digest ? `${approval.approvedBy} at ${approval.approvedAt}` : "stale (the definition changed since)"}`);
}

async function approve(deps: FixedCliDeps, id: string): Promise<void> {
  const { sha256: digest } = load(deps, id);
  if (!deps.interactive) throw new CliError("approval needs an interactive terminal");
  const typed = (await deps.prompt(`Type ${id} to approve this definition (sha256 ${digest.slice(0, 12)}): `)).trim();
  if (typed !== id) throw new CliError("not approved");
  mkdirSync(experimentDir(deps, id), { recursive: true });
  const approval: Approval = { experiment: id, definitionSha256: digest, approvedBy: deps.user, approvedAt: deps.now().toISOString(), commit: deps.head() };
  writeFileSync(approvalPath(deps, id), `${JSON.stringify(approval, null, 1)}\n`);
  deps.out(`approved ${id}`);
}

// Every trial inherits the runner's environment, so a runner without the ROM would only produce invalid trials.
function requireRom(deps: FixedCliDeps): string {
  if (deps.rom === undefined || deps.rom === "") throw new CliError("POKEBENCH_ROM is not set; launch with `just fixed-run`, which loads .env");
  const sha1 = deps.sha1File(deps.rom);
  if (sha1 === null) throw new CliError(`cannot read POKEBENCH_ROM ${deps.rom}`);
  return sha1;
}

function requireDefinitionRom(deps: FixedCliDeps, romSha1: string, def: FixedDefinition): void {
  if (romSha1 !== def.romSha1) throw new CliError(`POKEBENCH_ROM ${deps.rom ?? ""} has sha1 ${romSha1}, the definition records ${def.romSha1}`);
}

async function run(deps: FixedCliDeps, id: string): Promise<void> {
  const rom = requireRom(deps);
  const { definition: def, sha256: digest } = load(deps, id);
  requireDefinitionRom(deps, rom, def);
  const approval = readApproval(deps, id);
  if (approval === null) throw new CliError(`${id} is not approved; run \`just fixed-run approve ${id}\` in a terminal`);
  if (approval.definitionSha256 !== digest) throw new CliError("the definition changed since it was approved; approve it again");
  const result = await deps.run({ def, definitionSha256: digest, runsRoot: deps.runsRoot, host: deps.host(), stopRequested: deps.stopRequested ?? (() => false), pid: process.pid, dryRun: false });
  deps.out(`${id}: ${result}`);
}

async function dryRun(argv: readonly string[], deps: FixedCliDeps, id: string): Promise<void> {
  const wallMs = msInt(flag(argv, "--wall-ms"), 120_000, "--wall-ms");
  const rom = requireRom(deps);
  const { definition: def } = load(deps, id);
  requireDefinitionRom(deps, rom, def);
  const phase = flag(argv, "--phase") ?? def.phases[0]?.id ?? "";
  if (!def.phases.some((p) => p.id === phase)) throw new CliError(`no phase ${phase}; phases: ${def.phases.map((p) => p.id).join(", ")}`);
  const dry = dryRunDefinition(def, wallMs, phase);
  if (existsSync(join(experimentDir(deps, dry.id), "trials.jsonl"))) throw new CliError(`${dry.id} already has a ledger; move runs/experiments/${dry.id} aside first`);
  const result = await deps.run({ def: dry, definitionSha256: sha256(JSON.stringify(dry)), runsRoot: deps.runsRoot, host: deps.host(), stopRequested: deps.stopRequested ?? (() => false), pid: process.pid, dryRun: true });
  deps.out(`${dry.id}: ${result}`);
}

function status(deps: FixedCliDeps, id: string): void {
  const path = fixedStatusPath(deps.runsRoot, id);
  if (!existsSync(path)) throw new CliError(`${id} has no status yet`);
  const s = parseFixedStatus(JSON.parse(readFileSync(path, "utf8")));
  deps.out(`${s.experiment} ${s.state}: ${String(s.valid)} / ${String(s.total)} done, ${String(s.invalid)} invalid, reserve ${(s.reserve.usedMs / 3_600_000).toFixed(2)} / ${(s.reserve.totalMs / 3_600_000).toFixed(2)} GPU-h, updated ${s.updatedAt}${pidAlive(s.pid) ? "" : ` (runner pid ${String(s.pid)} is not running)`}`);
  for (const l of s.lanes) deps.out(`lane ${l.id} (${l.gpu}, :${String(l.port)}) ${l.state}: ${l.reason}${l.retryAt === null ? "" : `; retry ${l.retryAt}`}`);
  if (s.lastError !== null) deps.out(`last error: ${s.lastError}`);
  for (const t of s.invalidTrials) deps.out(`invalid #${String(t.slot)} lane ${t.lane} ${t.arm} ${t.run}: ${t.reason}`);
}

function analyzeLedger(argv: readonly string[], deps: FixedCliDeps, id: string): void {
  const def = parseFixedDefinition(loadText(deps, id)).definition;
  const phaseId = flag(argv, "--phase") ?? def.phases.find((p) => p.primary)?.id ?? def.phases[0]?.id ?? "";
  let phase;
  try {
    phase = phaseOf(def, phaseId);
  } catch {
    throw new CliError(`no phase ${phaseId}`);
  }
  const trials = trialsFromLedger(def, readLedger(join(experimentDir(deps, id), "trials.jsonl")), phase.id);
  deps.out(renderAnalysis(analyze(trials, def.lanes.map((l) => l.id)), `${def.id} ${phase.id}${phase.primary ? "" : " (exploratory)"}`));
}

interface ReceiptRow { readonly type?: unknown; readonly trial?: unknown; readonly arm?: unknown; readonly run?: unknown; readonly exit?: unknown }
function analyzeReceipt(argv: readonly string[], deps: FixedCliDeps): number {
  const [dir, control, treatment] = argv;
  const capFlag = flag(argv, "--cap-ms");
  if (dir === undefined || control === undefined || treatment === undefined || treatment.startsWith("--") || capFlag === undefined) {
    deps.err(USAGE);
    return 2;
  }
  const capMs = msInt(capFlag, undefined, "--cap-ms");
  const primary = flag(argv, "--primary") ?? "RIVAL_MET";
  const rows = readFileSync(join(dir, "trials.jsonl"), "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as ReceiptRow);
  const trials: AnalysisTrial[] = rows.filter((r) => r.type === "outcome" && (r.arm === control || r.arm === treatment) && typeof r.run === "string").map((r) => {
    const run = String(r.run);
    const path = join(deps.runsRoot, run, "events.jsonl");
    const o = classifyTrial(existsSync(path) ? readFileSync(path, "utf8") : null, { maxWallMs: capMs, primary }, typeof r.exit === "number" ? r.exit : undefined);
    return { slot: Number(r.trial), lane: "A", arm: r.arm === treatment ? "bundle" : "control", run, valid: o.valid, reason: o.reason, primaryReached: o.primaryReached, primaryMs: o.primaryMs, capMs, furthestDepth: o.furthestDepth, furthestMs: o.furthestMs };
  });
  deps.out(renderAnalysis(analyze(trials, []), `${dir}: ${treatment} (as bundle) vs ${control} (as control)`));
  return 0;
}

export async function main(argv: readonly string[], deps: FixedCliDeps): Promise<number> {
  const [command, id, ...rest] = argv;
  try {
    if (command === "analyze-receipt") return analyzeReceipt(argv.slice(1), deps);
    if (id === undefined) throw new RangeError();
    if (command === "plan") plan(rest, deps, id);
    else if (command === "check") check(deps, id);
    else if (command === "approve") await approve(deps, id);
    else if (command === "run") await run(deps, id);
    else if (command === "dry-run") await dryRun(rest, deps, id);
    else if (command === "status") status(deps, id);
    else if (command === "analyze") analyzeLedger(rest, deps, id);
    else throw new RangeError();
    return 0;
  } catch (error) {
    if (error instanceof RangeError) {
      deps.err(USAGE);
      return 2;
    }
    deps.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

// What a llama-server says it serves: /health must be ok, /props names the model, build, context, slots and vision.
export async function servingReceipt(baseUrl: string, fetchFn: typeof fetch): Promise<ServingReceipt> {
  const health = await fetchFn(`${baseUrl}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!health.ok) throw new Error(`${baseUrl}/health answered HTTP ${String(health.status)}`);
  const props = record(await (await fetchFn(`${baseUrl}/props`, { signal: AbortSignal.timeout(10_000) })).json());
  const settings = record(props["default_generation_settings"]);
  const model = props["model_path"], build = props["build_info"], slots = props["total_slots"], context = settings["n_ctx"];
  if (typeof model !== "string" || typeof build !== "string" || typeof slots !== "number" || typeof context !== "number") throw new Error(`${baseUrl}/props is not a llama-server /props payload`);
  const vision = record(props["modalities"])["vision"] === true;
  const template = typeof props["chat_template"] === "string" ? props["chat_template"] : "";
  return { model, build, contextTokens: context, slots, vision, fingerprint: sha256(JSON.stringify({ model, build, context, slots, vision, template: sha256(template) })) };
}

export interface FixedHostDeps {
  readonly root: string;
  readonly runsRoot: string;
  readonly git: (args: readonly string[]) => string;
  readonly fetchFn: typeof fetch;
  readonly node: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: (line: string) => void;
}

// Variables a trial gets from its lane, never from the runner's own environment.
const LANE_VARIABLES = new Set(["POKEBENCH_RUNS_ROOT", "POKEBENCH_ENDPOINT_FILE", "POKEBENCH_PLAY_PRESET", "POKEBENCH_GATEWAY_URL", "POKEBENCH_MODEL", "POKEBENCH_RUN_ID", "POKEBENCH_EXPERIMENT", "POKEBENCH_GAME_SERVER_URL"]);

export interface FixedLaunchSpec { readonly command: string; readonly argv: readonly string[]; readonly cwd: string; readonly env: Record<string, string> }

// A trial runs the agent of the experiment checkout at the pinned commit; cwd stays the main checkout so
// relative preset paths (the start save) resolve there, and the run is recorded in the main runs root.
export function fixedLaunchSpec(deps: Pick<FixedHostDeps, "root" | "runsRoot" | "node" | "env">, commit: string, laneEnv: Readonly<Record<string, string>>): FixedLaunchSpec {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(deps.env)) if (v !== undefined && !LANE_VARIABLES.has(k)) env[k] = v;
  Object.assign(env, laneEnv, { POKEBENCH_RUNS_ROOT: deps.runsRoot });
  return { command: deps.node, argv: [fixedTreeLiveJs(fixedTreeDir(commit)), "play"], cwd: deps.root, env };
}

export function productionFixedHost(deps: FixedHostDeps): FixedHost {
  let prepared: string | null = null;
  const treeDeps: FixedTreeDeps = {
    root: deps.root, node: deps.node,
    git: (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" }),
    exec: (cmd, args, cwd) => new Promise((resolveExec) => {
      execFile(cmd, [...args], { cwd, env: { ...deps.env, VIRTUAL_ENV: undefined }, encoding: "utf8", timeout: 1_200_000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error === null) { resolveExec(null); return; }
        const lines = `${stdout}\n${stderr}`.split("\n").filter((line) => line.trim() !== "").slice(-3);
        resolveExec(lines.length > 0 ? lines.join("; ") : error.message);
      });
    }),
    exists: existsSync,
    read: (path) => (existsSync(path) ? readFileSync(path, "utf8") : null),
    write: (path, text) => { writeFileSync(path, text); },
    copyDir: (from, to) => { rmSync(to, { recursive: true, force: true }); cpSync(from, to, { recursive: true }); },
    sources: (commit) => sourceIdentity(deps.git, commit),
    sitePackages: (venv) => {
      const lib = join(venv, "lib");
      if (!existsSync(lib)) return null;
      const python = readdirSync(lib).find((name) => /^python3\.\d+$/.test(name));
      return python === undefined ? null : join(lib, python, "site-packages");
    },
  };
  return {
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    head: () => deps.git(["rev-parse", "HEAD"]).trim(),
    sources: (commit) => sourceIdentity(deps.git, commit),
    verifyBuild: async (commit) => {
      deps.log(`preparing the experiment checkout for ${commit.slice(0, 7)}`);
      const problem = await prepareFixedTree(treeDeps, commit);
      prepared = problem === null ? commit : null;
      return problem;
    },
    serving: (lane) => servingReceipt(lane.modelUrl, deps.fetchFn),
    portInUse: (port) => new Promise((resolvePort) => {
      const probe = createServer();
      probe.once("error", () => { resolvePort(true); });
      probe.listen(port, "127.0.0.1", () => { probe.close(() => { resolvePort(false); }); });
    }),
    runId: (lane) => newRunId(new Date(), `qwen36-${lane.gpu.toLowerCase()}`, randomSuffix),
    launch: (l) => {
      // The runner checks the build before every launch, so a launch always follows a prepared checkout.
      if (prepared === null) return Promise.reject(new Error("no prepared experiment checkout"));
      const spec = fixedLaunchSpec(deps, prepared, l.env);
      return spawnDetached(spec.command, [...spec.argv], { cwd: spec.cwd, env: spec.env, stdout: l.stdout, stderr: l.stderr, started: (pid) => { l.started(pid); } });
    },
    alive: pidAlive,
    log: deps.log,
  };
}

/* v8 ignore start -- process wiring, exercised by the dry run */
if (import.meta.main) {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const gitIn = (cwd: string, args: readonly string[]): string => execFileSync("git", [...args], { cwd, encoding: "utf8" });
  const root = mainCheckout(here, gitIn), runsRoot = join(root, "runs");
  const git = (args: readonly string[]): string => gitIn(root, args);
  let stop = false;
  // Ctrl-C stops new trials only: running trials are detached and play to their wall cap; a later runner adopts them.
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stop = true; console.log("fixed-run: no new trials will start; running trials continue to their wall cap"); });
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  const log = (line: string): void => { console.log(`${new Date().toISOString()} ${line}`); };
  main(process.argv.slice(2), {
    root, runsRoot, out: (line) => { console.log(line); }, err: (line) => { console.error(line); },
    randomSeed: () => randomBytes(8).toString("hex"), interactive: rl !== null, prompt: (q) => rl?.question(q) ?? Promise.resolve(""),
    now: () => new Date(), user: userInfo().username, head: () => git(["rev-parse", "HEAD"]).trim(),
    sha1File: (path) => (existsSync(path) ? createHash("sha1").update(readFileSync(path)).digest("hex") : null),
    rom: process.env["POKEBENCH_ROM"],
    run: runFixed, host: () => productionFixedHost({ root, runsRoot, git, fetchFn: fetch, node: process.execPath, env: process.env, log }),
    stopRequested: () => stop,
  }).then((code) => { process.exitCode = code; }, (error: unknown) => {
    console.error(`fixed-run: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }).finally(() => { rl?.close(); });
}
/* v8 ignore stop */
