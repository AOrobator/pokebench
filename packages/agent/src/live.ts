import {navigationMemory} from "./navigation-memory.js";
// Live entrypoint for real, recorded runs: pi-agent-core on the local stack
// gateway drives the observe / press tools against an isolated game server
// (INV-7) on the real ROM, and every step lands in runs/<id>/events.jsonl.
//   smoke: a short scripted protocol (`just smoke-llm`)
//   play:  the M5 baseline agent from a fresh boot (`just run-agent`)
// Excluded from coverage per INV-6; logic lives in run.ts, recorder.ts,
// game-tools.ts and harness.ts.

import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { activeUiFeatures } from "./ui-feature.js";
import { humanPlan, humanLease, humanRunId, driveHuman, saveHumanCheckpoint } from "./human.js";
import { writeFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { objectiveHarness } from "./objective-tools.js";
import { playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { PLAY_LIMITS, PLAY_MAX_TOKENS, PLAY_TASK, PLAY_THINKING, objectiveSwitches, playGoal, playSystemPrompt, playTools, toolSwitches } from "./play-config.js";
import { verifyIntro } from "./verify-state.js";
import { driveProbe, parseProbeCommand, type ProbeCommand } from "./probe.js";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop, type AgentMessage } from "@mariozechner/pi-agent-core";
import { loadConfig } from "./config.js";
import { checkSmoke, observeTool, pressTool, serverHealthy } from "./game-tools.js";
import { discoverModels, selectModel, type GatewayModel } from "./gateway.js";
import { FrameStore } from "./frames.js";
import { StateWatcher } from "./game-state.js";
import {flagFeatures,parsePlayPreset,presetFeatures,presetFlags} from "./play-preset.js";
import {runStateMode,stateOnlyPrompt,stateOnlyProblems} from "./state-runtime.js";
import {withNavigation} from "./navigation.js";
import {NativeTargetStop} from "./target-stop.js";
import { BudgetTimer, ControlFile, RunControl, freezeGame, watchControl, controlLine } from "./run-control.js";
import {RUN_ID_PATTERN} from "./events.js";
import { StateMilestones } from "./milestones.js";
import { readLoopMode } from "./loop-detection.js";
import { attachLoopGuard, Governor, piLoop, play } from "./harness.js";
import { discoverLocal, readEndpoint } from "./local-endpoint.js";
import { gatewayLoopConfig } from "./provider.js";
import type { RunRecorder } from "./recorder.js";
import { harnessInfo, humanLeasePath, newRunId, withRun, type RunHost, type ServerHandle } from "./run.js";

const HEALTH_TIMEOUT_MS = 180_000;
const LOOP_TIMEOUT_MS = 420_000;
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const RUNS_ROOT = join(REPO_ROOT, "runs");
const VENDOR_DIR = join(REPO_ROOT, "env", "vendor", "continual-harness");
const SYSTEM_PROMPT = "You play Pokémon Emerald and report what you observe precisely.";

const PROMPT =
  "Complete this protocol in order. Do not skip a step, and never send a message that only " +
  "describes progress without the tool call it asks for.\n" +
  "1. Call the observe tool.\n" +
  "2. In your next message, describe the frame you were shown in one short sentence and, " +
  'in that same message, call the press tool with buttons ["A"].\n' +
  "3. Reply DONE followed by the current location from the press result.\n" +
  "The task is not finished until step 3.";

function git(cwd: string): (args: string[]) => string {
  return (args) => execFileSync("git", args, { cwd, encoding: "utf8" });
}

function piVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    dependencies: Record<string, string>;
  };
  return pkg.dependencies["@mariozechner/pi-agent-core"] ?? "unknown";
}

async function waitForHealthy(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverHealthy(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`game server not healthy within ${String(HEALTH_TIMEOUT_MS)} ms`);
}

function realHost(port: number, loadState?: string, env:NodeJS.ProcessEnv=process.env): RunHost {
  const url = `http://127.0.0.1:${String(port)}`;
  return {
    serverHealthy,
    launchServer: async (runDir, runId, serverPort): Promise<ServerHandle> => {
      // INV-2: argv list. INV-7: the launcher builds runs/<id>/server and
      // isolates the vendor server. Own process group so stop() reaches both
      // the launcher and its server child.
      const python = join(REPO_ROOT, "env", ".venv", "bin", "python");
      const child = spawn(
        python,
        ["-m", "pokebench_env.launcher", "--run-dir", runDir, "--run-id", runId, "--port", String(serverPort), ...(loadState === undefined ? [] : ["--load-state", loadState])],
        { env, cwd: join(REPO_ROOT, "env"), stdio: ["ignore", "ignore", "inherit"], detached: true },
      );
      const exited = new Promise<void>((resolve) => {
        child.once("exit", () => {
          resolve();
        });
      });
      const stop = async (): Promise<void> => {
        if (child.exitCode === null && child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
        await exited;
      };
      try {
        await waitForHealthy(url);
      } catch (error) {
        await stop();
        throw error;
      }
      return { serverDir: join(runDir, "server"), stop };
    },
    harness: () => harnessInfo(git(REPO_ROOT)),
    vendorPin: () => git(VENDOR_DIR)(["rev-parse", "HEAD"]).trim(),
    milestones: new StateMilestones(new StateWatcher(url)),
    gameState: new StateWatcher(url),
  };
}

interface Live {
  readonly model: GatewayModel;
  readonly port: number;
  readonly gatewayUrl: string;
  readonly apiKey: string | undefined;
}

async function live(): Promise<Live> {
  const config = loadConfig(process.env);
  const configured = new URL(config.gameServerUrl);
  if (configured.hostname !== "127.0.0.1") {
    throw new Error(`POKEBENCH_GAME_SERVER_URL must be http://127.0.0.1:<port>; each run launches its own server (INV-7)`);
  }
  const port = Number(configured.port || "8000");
  const local = config.endpointFile === null ? null : readEndpoint(config.endpointFile);
  const models =
    local === null
      ? await discoverModels({ gatewayUrl: config.gatewayUrl, visionModels: config.visionModels })
      : await discoverLocal(local);
  const model = selectModel(models, config.model);
  if (!model.input.includes("image")) throw new Error(`model ${config.model} is not a vision lane; runs need one`);
  return { model, port, gatewayUrl: local?.baseUrl ?? config.gatewayUrl, apiKey: local?.apiKey };
}

function pressHooks(recorder: RunRecorder): Parameters<typeof pressTool>[1] {
  return {
    beforePress: (id, buttons, timing, before, modifiers) => {
      recorder.buttonPress(id, buttons, timing, before, modifiers);
    },
    afterPress: () => recorder.afterPress(),
  };
}

async function smoke(): Promise<void> {
  const { model, port, gatewayUrl, apiKey } = await live();
  const runId = newRunId(new Date(), model.id, () => randomBytes(2).toString("hex"));
  const tools = ["observe", "press"];
  console.log(`live smoke: run ${runId}, model ${model.id} via ${gatewayUrl}`);
  console.log(`watch: just tail-run ${runId}   (frame: http://127.0.0.1:${String(port)}/stream)`);

  const reason = await withRun(
    {
      romSha1:romSha1(),
      runsRoot: RUNS_ROOT,
      runId,
      port,
      model: { id: model.id, context_window: model.contextWindow, max_tokens: model.maxTokens, vision: true },
      sampling: { thinking_level: "medium", max_tokens: model.maxTokens },
      systemPrompt: SYSTEM_PROMPT,
      tools,
      startState: { kind: "boot" },
      harnessFeatures: ["ram-state-v1", "live-map-v1", "field-control-lock", "naming-cursor-v1", "live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1", "warp-activation-guidance-v1", "clock-milestone-v1", "story-state-v1", ...activeUiFeatures(), "story-milestones-v2", "new-game-created-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1"],
      budgets: { max_wall_ms: LOOP_TIMEOUT_MS },
      piVersion: piVersion(),
    },
    realHost(port),
    new FrameStore(RUNS_ROOT),
    async (recorder, gameServerUrl) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, LOOP_TIMEOUT_MS);
      try {
        const prompt: AgentMessage = { role: "user", content: PROMPT, timestamp: Date.now() };
        const transcript = await runAgentLoop(
          [prompt],
          {
            systemPrompt: SYSTEM_PROMPT,
            messages: [],
            tools: [
              observeTool(gameServerUrl),
              pressTool(gameServerUrl, pressHooks(recorder)),
            ],
          },
          { ...gatewayLoopConfig(model, "medium", apiKey), transformContext: recorder.transformContext },
          recorder.emit,
          controller.signal,
        );
        const summary = checkSmoke(transcript);
        console.log(`tools: ${summary.toolCalls.join(", ")}`);
        for (const text of summary.texts) console.log(`model: ${text}`);
        return "completed";
      } finally {
        clearTimeout(timer);
      }
    },
  );
  console.log(`smoke-llm OK: run ${runId} ended (${reason}); events in runs/${runId}/events.jsonl`);
}


async function playAgent(): Promise<void> {
  const presetPath=process.env["POKEBENCH_PLAY_PRESET"];
  const preset=presetPath===undefined?null:parsePlayPreset(JSON.parse(readFileSync(presetPath,"utf8")) as unknown);
  const assigned=process.env["POKEBENCH_RUN_ID"];
  if(assigned!==undefined&&!new RegExp(RUN_ID_PATTERN).test(assigned))throw new Error("POKEBENCH_RUN_ID is invalid");
  const limits=preset?.limits??PLAY_LIMITS;
  const features=preset===null?{...flagFeatures({loopGuard:readLoopMode(process.env)==="enforced",activeUi:activeUiFeatures().length>0,interfaceDocs:process.env["POKEBENCH_INTERFACE_DOCS"]!=="0",objectives:process.env["POKEBENCH_OBJECTIVES"]!=="0"}),"field-dialogue-phase-v1":process.env["POKEBENCH_FIELD_DIALOGUE_PHASE"]!=="0","automatic-running-v1":process.env["POKEBENCH_AUTOMATIC_RUNNING"]!=="0","expanded-menu-battle-information-v1":process.env["POKEBENCH_EXPANDED_INFORMATION"]!=="0"}:presetFeatures(preset);
  const serverEnv={...process.env,...serverFeatureEnv(features)};
  const { model, port, gatewayUrl, apiKey } = await live();
  if(preset!==null&&preset.sampling.maxTokens>model.maxTokens)throw new Error("Play preset maxTokens exceeds the discovered model limit");
  const runId=assigned??newRunId(new Date(),model.id,()=>randomBytes(2).toString("hex"));
  const maxTokens=preset?.sampling.maxTokens??Math.min(PLAY_MAX_TOKENS,model.maxTokens);
  const thinking=preset?.sampling.thinkingLevel??PLAY_THINKING;
  const loopMode=features["deterministic-loop-guard-v1"]?"enforced":"diagnostic";
  const target=preset?.target??null;
  const goal=playGoal(target);
  const stateMode=features["state-only-decisions-v1"];
  const incompatible=stateOnlyProblems(features);if(incompatible.length)throw new Error(incompatible.join("; "));
  const systemPrompt=stateMode?stateOnlyPrompt(features,target):playSystemPrompt(features,target);
  console.log(`run-agent: run ${runId}, model ${model.id} via ${gatewayUrl}`);
  console.log(`watch: just tail-run ${runId}   (frame: http://127.0.0.1:${String(port)}/view)`);

  const reason = await withRun(
    {
      romSha1:romSha1(),
      runsRoot: RUNS_ROOT,
      runId,
      port,
      model: { id: model.id, context_window: model.contextWindow, max_tokens: model.maxTokens, vision: true },
      sampling: { thinking_level: thinking, max_tokens: maxTokens },
      ...(preset===null?{}:{evaluation:{preset_id:preset.id,target:preset.target,failure_limit:limits.failureLimit,flags:presetFlags(preset)}}),
      systemPrompt,
      tools: stateMode?["act"]:playTools(features),
      startState: { kind: "boot" },
      harnessFeatures: playHarnessFeatures(features,target),

      budgets: { max_turns: limits.maxTurns, max_wall_ms: limits.maxWallMs },
      piVersion: piVersion(),
    },
    realHost(port,undefined,serverEnv),
    new FrameStore(RUNS_ROOT),
    async (recorder, gameServerUrl) => {
      const controller = new AbortController();
      const elapsed = preset===null?(()=>Date.now()):()=>recorder.elapsedMs();
      let control: RunControl | null = null;
      const governor = new Governor({
        limits,
        retry: (why, attempt, limit) => {
          recorder.retry(why, attempt, limit);
          console.log(`retry ${String(attempt)}/${String(limit)}: ${why}`);
        },
        abort: () => {
          controller.abort();
        },
        now: elapsed,
        ...(preset===null?{}:{startedAt:0}),
        takeStop: () => control?.takeStop() ?? false,
        pausedMs: () => control?.pausedMs() ?? 0,
      });
      const controlFile = new ControlFile(join(RUNS_ROOT, runId, "control.jsonl"));
      const runControl = new RunControl({
        poll: () => controlFile.poll(),
        record: (body) => { recorder.recordControl(body); },
        freeze: (paused) => freezeGame(gameServerUrl, paused),
        end: (reason) => { governor.abort(reason); },
        now: () => Date.now(),
      });
      control = runControl;
      if(preset!==null&&recorder.elapsedMs()>=limits.maxWallMs){governor.abort("budget");return "budget";}
      const loopDetector = attachLoopGuard(recorder, governor, undefined, loopMode, features["interaction-loop-detection-v1"]);
      if(target!==null){
        const stop=new NativeTargetStop(runId,target,proof=>{
          if(governor.stopReason!==null)return;
          if(preset!==null&&recorder.elapsedMs()-runControl.pausedMs()>limits.maxWallMs){governor.abort("budget");return;}
          recorder.setTargetProof(proof);
          governor.stop("milestone");
        });
        recorder.subscribe(event=>{stop.observe(event);});
      }
      const startedAt = elapsed();
      const wall = new BudgetTimer(runControl, limits.maxWallMs, () => elapsed() - (preset===null?startedAt:0), () => {
        governor.abort("budget");
      });
      const stopWatching = watchControl(controlFile, runControl);
      const interrupt = (): void => {
        console.log("operator abort: finishing the run record");
        governor.abort("operator_abort");
      };
      process.once("SIGINT", interrupt);
      const objectives = features["objective-tracking-v1"] ? objectiveHarness(goal, recorder, gameServerUrl, fetch, { ...objectiveSwitches(features), ...toolSwitches(features) }) : null;
      const baseTools=objectives?.tools ?? [observeTool(gameServerUrl, fetch, toolSwitches(features)), pressTool(gameServerUrl, pressHooks(recorder), fetch, undefined, toolSwitches(features))];
      const tools=withNavigation(baseTools,features,new StateWatcher(gameServerUrl),signal=>runControl.gate(signal));
      const memory=navigationMemory(features,recorder,objectives?.transformContext??recorder.transformContext);
      if(memory!==null)tools.push(memory.tool);
      const loop = piLoop({
        systemPrompt,
        loopDetector,
        tools,
        base: { ...gatewayLoopConfig(model, thinking, apiKey), maxTokens },
        governor,
        transformContext: memory?.transformContext ?? objectives?.transformContext ?? recorder.transformContext,
        emit: recorder.emit,
        signal: controller.signal,
        gate: (signal) => runControl.gate(signal),
      });
      try {
        if(stateMode)return await runStateMode({features,target,serverUrl:gameServerUrl,recorder,governor,base:{...gatewayLoopConfig(model,thinking,apiKey),maxTokens},signal:controller.signal,gate:signal=>runControl.gate(signal),inputEpoch:()=>runControl.pausedMs()});
        const task: AgentMessage = { role: "user", content: target===null?PLAY_TASK:`The game has just booted. ${goal}`, timestamp: Date.now() };
        return await play(task, governor, loop);
      } finally {
        wall.clear();
        stopWatching();
        process.off("SIGINT", interrupt);
      }
    },
  );
  console.log(`run-agent: run ${runId} ended (${reason}); summary: just runs-summary ${runId}`);
}

async function probe(verify = false): Promise<void> {
  const port = Number(process.env["POKEBENCH_PROBE_PORT"] ?? "8032");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("invalid probe port");
  const saved = process.argv[3] ? resolve(process.argv[3]) : undefined;
  const startState = saved === undefined
    ? { kind: "boot" as const }
    : { kind: "save_state" as const, path: saved, sha1: createHash("sha1").update(readFileSync(saved)).digest("hex") };
  const runId = newRunId(new Date(), "probe", () => randomBytes(2).toString("hex"));
  console.log(`probe: ${runId} — http://127.0.0.1:8791/#run=${runId}`);
  const lines = createInterface({ input: process.stdin });
  async function* commands(): AsyncGenerator<ProbeCommand> {
    for await (const line of lines) {
      if (line.trim() !== "") yield parseProbeCommand(line);
    }
  }
  try {
    const reason = await withRun({
      romSha1:romSha1(),
      runsRoot: RUNS_ROOT, runId, port,
      model: { id: "manual-probe", context_window: 0, max_tokens: 0, vision: false },
      sampling: { thinking_level: "none", max_tokens: 0 },
      systemPrompt: "Manual game-state validation probe; excluded from benchmark results.",
      tools: ["observe", "press"], startState, harnessFeatures: ["probe", "manual-control", "live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1", "warp-activation-guidance-v1", "clock-milestone-v1", "story-state-v1", ...activeUiFeatures(), "story-milestones-v2", "new-game-created-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1"],
      budgets: {}, piVersion: piVersion(),
    }, realHost(port, saved), new FrameStore(RUNS_ROOT), (recorder, url) => driveProbe(recorder, url, verify ? verifyIntro(new StateWatcher(url), (label, state) => { console.log(`CHECKPOINT ${label} ${JSON.stringify(state)}`); }) : commands()));
    console.log(`probe ended: ${reason}`);
  } finally { lines.close(); }
}

function romSha1():string {
  const rom=process.env["POKEBENCH_ROM"];
  if(rom===undefined)throw new Error("POKEBENCH_ROM is required");
  return createHash("sha1").update(readFileSync(rom)).digest("hex");
}

async function playHuman(): Promise<void> {
  const port = Number(process.env["POKEBENCH_HUMAN_PORT"] ?? "8040");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("invalid human port");
  const rom = process.env["POKEBENCH_ROM"];
  if (rom === undefined) throw new Error("POKEBENCH_ROM is required");
  const runsRoot = join(process.env["POKEBENCH_RUNS_ROOT"] ?? RUNS_ROOT,"human");
  const runId = humanRunId(process.env["POKEBENCH_HUMAN_RUN_ID"], new Date(), () => randomBytes(2).toString("hex"));
  const release = humanLease(dirname(humanLeasePath(REPO_ROOT,git(REPO_ROOT)(["rev-parse","--git-common-dir"]).trim())), runId);
  const token = randomBytes(32).toString("hex");
  const runDir = join(runsRoot, runId);
  const abort = new AbortController();
  const onSignal = (): void => { abort.abort(); };
  process.on("SIGINT",onSignal); process.on("SIGTERM",onSignal);
  try {
    const basePlan = humanPlan(runsRoot,runId,port,romSha1());
    const plan = {...basePlan,romSha1:romSha1(),harnessFeatures:[...basePlan.harnessFeatures,...(process.env["POKEBENCH_HUMAN_VALIDATION"]==="true"?["probe"]:[])]};
    const host=realHost(port,undefined,{...process.env,POKEBENCH_HUMAN_TOKEN:token,POKEBENCH_ACTIVE_UI:"1",POKEBENCH_FEATURES_OFF:"named-interactions-v1,world-destinations-v1,bounded-navigation-v1,expanded-menu-battle-information-v1"});
    await withRun(plan,{...host,launchServer:async(dir,id,p)=>{writeFileSync(join(dir,"human-token"),token,{mode:0o600,flag:"wx"});if(process.env["POKEBENCH_HUMAN_START_PAUSED"]==="true")writeFileSync(join(dir,"control.jsonl"),controlLine(1,"pause",new Date().toISOString())+"\n",{flag:"wx"});return host.launchServer(dir,id,p);}},new FrameStore(runsRoot),async(recorder,url)=>{
      console.log(`Human play: http://127.0.0.1:8791/play#run=${runId}`);
      const reason=await driveHuman(recorder,url,join(runDir,"control.jsonl"),abort.signal,fetch,token);
      await saveHumanCheckpoint(url,token,runDir);
      return reason;
    });
  } finally { process.off("SIGINT",onSignal);process.off("SIGTERM",onSignal);release(); }
}

const command = process.argv[2];
const entry = command === "smoke" ? smoke : command === "human" ? playHuman : command === "play" ? playAgent : command === "probe" ? () => probe() : command === "verify-state" ? () => probe(true) : null;
if (entry === null) {
  console.error("usage: live.js smoke | live.js play | live.js probe [save-state]");
  process.exitCode = 2;
} else {
  entry().catch((error: unknown) => {
    console.error(`${command ?? ""} FAILED: ${String(error)}`);
    process.exitCode = 1;
  });
}
