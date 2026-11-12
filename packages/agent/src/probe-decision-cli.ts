// just probe-decision <run> <turn> [--switch <id>=on|off]... [--samples K] [--runs-root DIR] [--model ID] [--context-only] [--trust-header] [--recorded-trim]
// Rebuilds the recorded turn's context under the run's switches and under the flipped set, and
// samples the next tool call K times in each (K ≤ 8, to keep the GPU mostly free). --trust-header also re-derives
// harness-trust-v1's header in each arm; --recorded-trim cuts the rebuilt history to the request the run recorded sending;
// POKEBENCH_ENDPOINT_FILE samples a local lane instead of the gateway.
// Legacy events require --history-provider: an explicit source identity assertion for this
// recorder, with explicit API/reasoning-field assertions, not identity inferred from the destination.
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { AuthoredSceneLabelSchema, type AuthoredSceneLabel, checkEvent, type RunEvent } from "./events.js";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { completeSimple, type AssistantMessage, type ThinkingLevel } from "@mariozechner/pi-ai";
import { loadConfig, type PokebenchConfig } from "./config.js";
import { contextDiff, decisionContext, serverSwitch, distribution, parseSwitch, recordedRun, recordedAction, recordedFeatures, sample, withSwitches, type ContextSize, type Decision, type DecisionContext, type ProbePorts, type ProbeSwitch, type RawRef, type RecordedRun, type Sampler } from "./decision-probe.js";
import { serverFeatureEnv, type FeatureSet } from "./features.js";
import { discoverModels, selectModel, type GatewayModel } from "./gateway.js";
import { discoverLocal, readEndpoint } from "./local-endpoint.js";
import { PlacesBodySchema, type Place } from "./story-destinations.js";
import { Value } from "typebox/value";
import { gatewayLoopConfig } from "./provider.js";

export const MAX_SAMPLES = 8;
// pi names a thinking block after the response field the reasoning streamed in; the gateway streams `reasoning_content`.
export const THINKING_FIELD = "reasoning_content";
const USAGE = "usage: probe-decision <run id or unique suffix> <turn> [--switch <id>=on|off]... [--samples K≤8] [--runs-root DIR] [--model ID] [--context-only] [--trust-header] [--recorded-trim] [--history-provider SOURCE_PROVIDER --history-api SOURCE_API --history-thinking-field FIELD]";

export interface ProbeArgs { readonly run: string; readonly turn: number; readonly switches: readonly ProbeSwitch[]; readonly samples: number; readonly runsRoot: string | null; readonly model: string | null; readonly trustHeader?: boolean; readonly recordedTrim?: boolean; readonly contextOnly: boolean; readonly historyProvider?: string; readonly historyApi?: string; readonly historyThinkingField?: string }
export function parseArgs(argv: readonly string[]): ProbeArgs {
  const positional: string[] = [];
  const switches: ProbeSwitch[] = [];
  let samples = 4, runsRoot: string | null = null, model: string | null = null, contextOnly = false, trustHeader = false, recordedTrim = false;
  let historyProvider: string | undefined, historyApi: string | undefined, historyThinkingField: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const value = (): string => { const v = argv[++i]; if (v === undefined || v.startsWith("--")) throw new Error(`${arg} needs a value\n${USAGE}`); return v; };
    if (arg === "--switch") switches.push(parseSwitch(value()));
    else if (arg === "--samples") samples = Number(value());
    else if (arg === "--runs-root") runsRoot = value();
    else if (arg === "--model") model = value();
    else if (arg === "--history-provider") { historyProvider = value(); if (historyProvider.trim() === "") throw new Error("--history-provider must name the source provider"); }
    else if (arg === "--history-api") historyApi = value();
    else if (arg === "--history-thinking-field") historyThinkingField = value();
    else if (arg === "--context-only") contextOnly = true;
    else if (arg === "--trust-header") trustHeader = true;
    else if (arg === "--recorded-trim") recordedTrim = true;
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}\n${USAGE}`);
    else positional.push(arg);
  }
  const assertions = [historyProvider, historyApi, historyThinkingField];
  if (assertions.some(v=>v!==undefined) && assertions.some(v=>v===undefined||v.trim()==="")) throw new Error("legacy history needs explicit --history-provider, --history-api and --history-thinking-field assertions");
  const [run, turn] = positional;
  if (run === undefined || turn === undefined || positional.length !== 2 || !/^\d+$/.test(turn)) throw new Error(USAGE);
  if (!Number.isInteger(samples) || samples < 1 || samples > MAX_SAMPLES) throw new Error(`--samples must be 1..${String(MAX_SAMPLES)}`);
  return { run, turn: Number(turn), switches, samples, runsRoot, model, ...(trustHeader ? { trustHeader } : {}), ...(recordedTrim ? { recordedTrim } : {}), contextOnly, ...(historyProvider === undefined ? {} : {historyProvider,historyApi:historyApi??"",historyThinkingField:historyThinkingField??""}) };
}

export function resolveRun(runsRoot: string, run: string, list: (dir: string) => string[] = readdirSync, exists: (path: string) => boolean = existsSync): string {
  if (exists(join(runsRoot, run, "events.jsonl"))) return join(runsRoot, run);
  const matches = list(runsRoot).filter((id) => id.endsWith(`_${run}`) && exists(join(runsRoot, id, "events.jsonl")));
  if (matches.length !== 1) throw new Error(matches.length === 0 ? `no run ${run} under ${runsRoot}` : `run suffix ${run} is ambiguous: ${matches.join(", ")}`);
  return join(runsRoot, matches[0] ?? "");
}

export type Exec = (file: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv; input: string }) => string;
const execArgv: Exec = (file, args, options) => execFileSync(file, [...args], { ...options, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

export function filePorts(runDir: string, envDir: string, thinkingSignature: string, exec: Exec = execArgv, read: (path: string) => Buffer = readFileSync, env: NodeJS.ProcessEnv = process.env, historicalAssistantIdentity?: ProbePorts["historicalAssistantIdentity"]): ProbePorts {
  // Frame paths come from the run's own events; a recorded path that leaves the run directory is refused, and each
  // frame is read once however many turns are rebuilt.
  const frames = new Map<string, string>();
  const root = resolve(runDir);
  return {
    thinkingSignature,
    ...(historicalAssistantIdentity === undefined ? {} : {historicalAssistantIdentity}),
    frame: (path) => {
      const full = resolve(root, path);
      const rel = relative(root, full);
      if (path === "" || isAbsolute(path) || rel === "" || rel.startsWith("..") || isAbsolute(rel)) throw new Error(`frame path ${JSON.stringify(path)} is not inside the run directory`);
      const cached = frames.get(full);
      if (cached !== undefined) return cached;
      const body = read(full).toString("base64");
      frames.set(full, body);
      return body;
    },
    rerender: (refs: readonly RawRef[], features: FeatureSet) => {
      const out = exec("uv", ["run", "--project", envDir, "python", "-m", "pokebench_env.rerender"], { cwd: envDir, env: { ...env, ...serverFeatureEnv(features) }, input: JSON.stringify({ run_dir: runDir, raw_ram: refs }) });
      const body: unknown = JSON.parse(out);
      if (typeof body !== "object" || body === null || !("readouts" in body) || !Array.isArray(body.readouts) || !body.readouts.every((r): r is string => typeof r === "string") || body.readouts.length !== refs.length) throw new Error("rerender returned an unexpected body");
      return Promise.resolve(body.readouts);
    },
    sceneLabels: (refs:readonly RawRef[]) => {
      const out=exec("uv",["run","--project",envDir,"python","-m","pokebench_env.authored_scene_labels"],{cwd:envDir,env:{...env,POKEBENCH_FEATURES_OFF:""},input:JSON.stringify({run_dir:runDir,raw_ram:refs})});
      const body:unknown=JSON.parse(out);
      if(typeof body!=="object"||body===null||!("labels"in body)||!Array.isArray(body.labels)||body.labels.length!==refs.length||!body.labels.every((label):label is AuthoredSceneLabel|null=>label===null||Value.Check(AuthoredSceneLabelSchema,label)))throw new Error("native scene labels returned an unexpected body");
      return Promise.resolve(body.labels);
    },
    places: (ref: RawRef, features: FeatureSet) => {
      const out = exec("uv", ["run", "--project", envDir, "python", "-m", "pokebench_env.rerender"], { cwd: envDir, env: { ...env, ...serverFeatureEnv(features) }, input: JSON.stringify({ run_dir: runDir, raw_ram: [], places: ref }) });
      const body: unknown = JSON.parse(out);
      const places = typeof body === "object" && body !== null && "places" in body ? { places: body.places } : null;
      if (places === null || !Value.Check(PlacesBodySchema, places)) return Promise.reject(new Error("rerender returned no map table"));
      return Promise.resolve<readonly Place[]>(places.places);
    },
  };
}

// Events parsed as each line is read: an event log can be larger than the longest string Node can hold.
export async function readRunLines(lines: AsyncIterable<string>): Promise<RecordedRun> {
  const events: RunEvent[] = [];
  for await (const line of lines) if (line.trim() !== "") events.push(checkEvent(JSON.parse(line)));
  return recordedRun(events);
}
export async function readRun(path: string): Promise<RecordedRun> {
  return readRunLines(createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity }));
}

// The lane a probe samples, with its key: the local endpoint file when one is configured (fixed-run GPU lanes), else the gateway.
export interface ProbeLane { readonly models: GatewayModel[]; readonly apiKey: string | undefined }
export async function probeLane(config: Pick<PokebenchConfig, "endpoint" | "visionModels">, local = discoverLocal, gateway = discoverModels): Promise<ProbeLane> {
  if (config.endpoint.kind === "codex") throw new Error("Direct Codex provider currently supports ordinary play, not decision probes");
  if (config.endpoint.kind === "gateway") return { models: await gateway({ gatewayUrl: config.endpoint.url, visionModels: config.visionModels }), apiKey: undefined };
  const endpoint = readEndpoint(config.endpoint.path);
  return { models: await local(endpoint), apiKey: endpoint.apiKey };
}

export interface Arm { readonly label: string; readonly features: FeatureSet; readonly context: DecisionContext; readonly decisions: readonly Decision[] }
export interface ProbeReport { readonly run: string; readonly turn: number; readonly recorded: { readonly action: string | null; readonly size: ContextSize | null }; readonly fidelity: boolean; readonly rerendered: boolean; readonly arms: readonly Arm[]; readonly diff: ReturnType<typeof contextDiff> | null }

export async function probe(run: RecordedRun, args: ProbeArgs, ports: ProbePorts, sampler: Sampler | null): Promise<ProbeReport> {
  const recorded = recordedFeatures(run);
  // A flipped server switch re-renders the window's readouts in both arms, so they differ only by the switch.
  const rerender = args.switches.some((s) => serverSwitch(s.id));
  const compositeReadouts = args.switches.length === 1 && args.switches[0]?.id === "party-menu-message-v1" ? "party-menu-message-v1" : null;
  const baseline = await decisionContext(run, args.turn, recorded, ports, "replayed", rerender, compositeReadouts, args.trustHeader === true, args.recordedTrim === true);
  const flipped = args.switches.length === 0 ? null : withSwitches(recorded, args.switches);
  const other = flipped === null ? null : await decisionContext(run, args.turn, flipped, ports, "replayed", rerender, compositeReadouts, args.trustHeader === true, args.recordedTrim === true);
  const start = run.events.find((e) => e.type === "turn_start" && e.turn === args.turn);
  const size = start?.type === "turn_start" ? start.context : null;
  const draw = async (c: DecisionContext): Promise<Decision[]> => (sampler === null ? [] : await sample(c, args.samples, sampler));
  const arms: Arm[] = [{ label: "recorded switches", features: recorded, context: baseline, decisions: await draw(baseline) }];
  if (other !== null && flipped !== null) arms.push({ label: args.switches.map((s) => `${s.id}=${s.on ? "on" : "off"}`).join(" "), features: flipped, context: other, decisions: await draw(other) });
  return { run: run.start.run, turn: args.turn, recorded: { action: recordedAction(run, args.turn), size }, fidelity: size !== null && (baseline.recorderSize === undefined ? JSON.stringify(size) === JSON.stringify(baseline.size) : size.messages === baseline.recorderSize.messages && size.images === baseline.recorderSize.images), rerendered: rerender, arms, diff: other === null ? null : contextDiff(baseline, other) };
}

export function reportLines(report: ProbeReport): string[] {
  const size = (s: ContextSize | null): string => (s === null ? "none" : `${String(s.messages)} messages, ${String(s.images)} images, ~${String(s.est_tokens)} tokens`);
  const lines = [`run ${report.run} turn ${String(report.turn)}: recorded action ${report.recorded.action ?? "(none)"}`,
    `context rebuilt with today's harness: ${size(report.arms[0]?.context.size ?? null)}; recorded: ${size(report.recorded.size)} → ${report.fidelity ? "same size" : "differs (today's guard, notes or collapse text differ from the run's; both arms share this)"}${report.rerendered ? "; readouts re-rendered from raw RAM in both arms" : ""}`,
    ...(report.arms[0]?.context.recorderSize === undefined ? [] : [`--recorded-trim: measured where the run's recorder measured it: ${size(report.arms[0].context.recorderSize)}`])];
  if (report.diff !== null) lines.push(`flipped context differs in: ${[report.diff.systemPrompt ? "system prompt" : "", report.diff.tools ? "tools" : "", report.diff.messages.length > 0 ? `${String(report.diff.messages.length)} messages (indexes ${report.diff.messages.join(",")})` : ""].filter((x) => x !== "").join("; ") || "nothing (the switch does not change this decision's context)"}`);
  for (const arm of report.arms) {
    if (arm.decisions.length === 0) continue;
    lines.push(`${arm.label} (${String(arm.decisions.length)} samples):`);
    for (const [key, n] of distribution(arm.decisions)) lines.push(`  ${String(n)}× ${key}`);
  }
  return lines;
}

const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export function thinkingLevel(recorded: string): ThinkingLevel | "off" {
  const level = LEVELS.find((l) => l === recorded);
  if (level === undefined) throw new Error(`recorded thinking level ${JSON.stringify(recorded)} is not one pi knows`);
  return level;
}

export function gatewaySampler(complete: typeof completeSimple, model: GatewayModel, thinking: ThinkingLevel | "off", maxTokens: number, apiKey?: string): Sampler {
  const config = apiKey === undefined ? gatewayLoopConfig(model, thinking) : gatewayLoopConfig(model, thinking, apiKey);
  return async (context): Promise<AssistantMessage> => complete(model, { systemPrompt: context.systemPrompt, messages: [...context.messages], tools: [...context.tools] }, { maxTokens, ...(config.reasoning === undefined ? {} : { reasoning: config.reasoning }), apiKey: (await config.getApiKey?.(model.provider)) ?? "" });
}

/* v8 ignore start -- the live entrypoint: gateway, files and the Python renderer; covered by the functions above. */
const PACKAGE = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = resolve(PACKAGE, "..", "..");
async function main(argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv);
  const runsRoot = args.runsRoot ?? process.env.POKEBENCH_RUNS_ROOT ?? join(REPO, "runs");
  const runDir = resolveRun(runsRoot, args.run);
  const run = await readRun(join(runDir, "events.jsonl"));
  let sampler: Sampler | null = null;
  if (!args.contextOnly) {
    const config = loadConfig(process.env);
    const lane = await probeLane(config);
    const model = selectModel(lane.models, args.model ?? run.start.model.id);
    sampler = gatewaySampler(completeSimple, model, thinkingLevel(run.start.sampling.thinking_level), run.start.sampling.max_tokens, lane.apiKey);
  }
  const report = await probe(run, args, filePorts(runDir, join(REPO, "env"), args.historyThinkingField ?? THINKING_FIELD, execArgv, readFileSync, process.env, args.historyProvider === undefined ? undefined : {api:args.historyApi??"",provider:args.historyProvider}), sampler);
  for (const line of reportLines(report)) console.log(line);
  const out = join(runsRoot, "decision-probes", `${report.run}_T${String(report.turn)}_${new Date().toISOString().replaceAll(":", "-")}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ ...report, arms: report.arms.map((a) => ({ label: a.label, size: a.context.size, decisions: a.decisions })) }, null, 1)}\n`);
  console.log(`report: ${out}`);
  return 0;
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
}
/* v8 ignore stop */
