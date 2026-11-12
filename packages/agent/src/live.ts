import {readDirectCodexProvider,recordDirectCodexTransport} from "./direct-codex-runtime.js";
import {loadCheckpointResearchNote,checkpointResearchNoteReceipt} from "./checkpoint-research-note.js";
import type {Model,Api} from "@mariozechner/pi-ai";
import {gzipSync} from "node:zlib";
import {liveContinuationFromEnv,restoreLiveContinuation,validateLiveContinuationStart,validateLiveContinuationModel,validateLiveContinuationFeatures,captureContinuationStart,continuationPayload} from "./roxanne-live-continuation.js";
import {StableJitContext} from "./jit-v2-context.js";
import {JitContext} from "./jit-context.js";
import {exactCountProblems,payloadCounter} from "./exact-context.js";
import type {FitReport} from "./context-budget.js";
import {finalGuide,battleDecisionContext,contextBudget,contextTools,loopSupervisor,playGameTools,stallBriefing,stallStop,textOnlySupervisor} from "./play-wiring.js";
import {ModelErrorRecovery} from "./model-error-recovery.js";
import {ModelStreamLog,chatCompletionsUrl} from "./model-stream.js";
import { operatorSignalLatch } from "./operator-signals.js";
import { GAME_PORT_POOL, allocatePort, noPortMessage } from "./port-allocator.js";
import { listClaims } from "./run-claim.js";
import {CheckpointCapture,checkpointSelection} from "./checkpoint-capture.js";
import {experimentFromEnv} from "./play-experiment.js";
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
import { humanPlan, humanLease, humanRunId, driveHuman, saveHumanCheckpoint, humanPlayUrl, viewerRunUrl } from "./human.js";
import { closeSync, linkSync, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { objectiveHarness } from "./objective-tools.js";
import { cutOffReplyNotice } from "./cut-off-reply.js";
import { screenshotButtonBaseline, playHarnessFeatures, serverFeatureEnv } from "./features.js";
import { PLAY_LIMITS, PLAY_MAX_TOKENS, PLAY_THINKING, deliverInitialPlayTask, initialPlayTask, objectiveSwitches, playGoal, playSystemPrompt, playTools, toolSwitches } from "./play-config.js";
import { verifyIntro } from "./verify-state.js";
import { driveProbe, parseProbeCommand, type ProbeCommand } from "./probe.js";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runAgentLoop, type AgentMessage } from "@mariozechner/pi-agent-core";
import { loadConfig, requireModel } from "./config.js";
import { checkSmoke, gameTools, observeTool, pressTool, serverHealthy } from "./game-tools.js";
import { discoverModels, selectModel, type GatewayModel } from "./gateway.js";
import { FrameStore } from "./frames.js";
import { StateWatcher } from "./game-state.js";
import {terminationTarget,flagFeatures,parsePlayPreset,presetFeatures,presetStart} from "./play-preset.js";
import {runEvaluation} from "./run-evaluation.js";
import {runStateMode,stateOnlyPrompt,stateOnlyProblems} from "./state-runtime.js";
import {NativeTargetStop} from "./target-stop.js";
import {attachGameClearStop} from "./game-clear-stop.js";
import { BudgetTimer, ControlFile, controlledRun, type RunControl, freezeGame, watchControl, controlLine } from "./run-control.js";
import {RUN_ID_PATTERN} from "./events.js";
import { StateMilestones } from "./milestones.js";
import { readLoopMode } from "./loop-detection.js";
import { attachLoopGuard, TEXT_ONLY_REMINDER, piLoop, play, playFromHistory } from "./harness.js";
import { autoTalkContext } from "./auto-talk.js";
import { discoverLocal, readEndpoint } from "./local-endpoint.js";
import { gatewayLoopConfig, playLoopBase } from "./provider.js";
import { playSampling } from "./presence-penalty.js";
import type { RunRecorder } from "./recorder.js";
import { harnessInfo, humanLeasePath, newRunId, withRun, type RunHost, type ServerHandle } from "./run.js";
import {gameServerLauncherArgs,verifyCampaignListenerGroups} from "./server-launch.js";

const HEALTH_TIMEOUT_MS = 180_000;
const LOOP_TIMEOUT_MS = 420_000;
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
// A fixed-run trial runs from an experiment checkout and records into the main checkout's runs root.
const RUNS_ROOT = process.env["POKEBENCH_RUNS_ROOT"] ?? join(REPO_ROOT, "runs");
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
      // The server's own streams are evidence: the vendor announces the signal it received on
      // stdout, and inheriting stderr left that announcement in a stream the run did not own.
      // They live beside the isolation dir, not in it: the launcher owns runs/<id>/server and
      // refuses a run directory it finds already prepared.
      mkdirSync(runDir, { recursive: true });
      const serverStdout = openSync(join(runDir, "server-stdout.log"), "a");
      const serverStderr = openSync(join(runDir, "server-stderr.log"), "a");
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(
          python,
          gameServerLauncherArgs(python,runDir,runId,serverPort,loadState).slice(1),
          { env, cwd: join(REPO_ROOT, "env"), stdio: ["ignore", serverStdout, serverStderr], detached: true },
        );
      } finally {
        // The child holds its own duplicates of both descriptors, and a refused spawn still owes
        // them back.
        closeSync(serverStdout);
        closeSync(serverStderr);
      }
      if(env["POKEBENCH_CAMPAIGN_CONTINUATION"]!==undefined&&child.pid!==undefined)writeFileSync(join(runDir,"campaign-server-owner.json"),JSON.stringify({pid:child.pid,runId,port:serverPort}),{flag:"wx",mode:0o600});
      let stopRequested = false;
      const exited = new Promise<{code:number|null;signal:NodeJS.Signals|null}>((resolve) => {
        child.once("exit", (code, signal) => {
          resolve({ code, signal });
        });
      });
      const stop = async (): Promise<void> => {
        stopRequested = true;
        if (child.exitCode === null && child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
        await exited;
      };
      try {
        await waitForHealthy(url);
        if(env["POKEBENCH_CAMPAIGN_CONTINUATION"]!==undefined){
          const pids=[...new Set(execFileSync("lsof",["-nP","-t",`-iTCP:${String(serverPort)}`,"-sTCP:LISTEN"],{encoding:"utf8"}).trim().split(/\s+/))];
          const groups=pids.map(pid=>Number(execFileSync("ps",["-p",pid,"-o","pgid="],{encoding:"utf8"}).trim()));
          verifyCampaignListenerGroups(child.pid,groups);
        }
      } catch (error) {
        await stop();
        throw error;
      }
      return { serverDir: join(runDir, "server"), ...(child.pid===undefined?{}:{pid:child.pid}), stop, exit: exited.then(({code,signal})=>({code,signal,stopRequested})) };
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
  readonly directApiKey?:()=>string;
}

// An unset port is allocated and then recorded on the run claim, never guessed down from a constant:
// a busy port belongs to some run, and taking it means ending that run (INV-Q5).
function allocateGamePort(): number {
  const listening = (port: number): boolean => {
    try {
      return execFileSync("lsof", ["-nP", "-t", `-iTCP:${String(port)}`, "-sTCP:LISTEN"], {encoding: "utf8"}).trim() !== "";
    } catch {
      return false;
    }
  };
  const claims = listClaims(RUNS_ROOT);
  const port = allocatePort({claims, listening});
  if (port === null) throw new Error(noPortMessage(GAME_PORT_POOL, claims));
  return port;
}

async function live(directEnabled=false): Promise<Live> {
  const config = loadConfig(process.env);
  const configured = new URL(config.gameServerUrl);
  if (configured.hostname !== "127.0.0.1") {
    throw new Error(`POKEBENCH_GAME_SERVER_URL must be http://127.0.0.1:<port>; each run launches its own server (INV-7)`);
  }
  const port = configured.port === "" ? allocateGamePort() : Number(configured.port);
  const wanted = requireModel(config);
  const { endpoint } = config;
  if(directEnabled&&endpoint.kind!=="codex")throw Error("direct-codex-provider-v1 requires POKEBENCH_CODEX_PROVIDER_FILE");
  let lane: { readonly models: GatewayModel[]; readonly baseUrl: string; readonly apiKey: string | undefined };
  if (endpoint.kind === "codex") {
    const direct=readDirectCodexProvider(endpoint.path,wanted,directEnabled);
    return {model:direct.model,port,gatewayUrl:direct.model.baseUrl,apiKey:undefined,directApiKey:direct.getApiKey};
  }
  if (endpoint.kind === "gateway") {
    lane = { models: await discoverModels({ gatewayUrl: endpoint.url, visionModels: config.visionModels }), baseUrl: endpoint.url, apiKey: undefined };
  } else {
    const local = readEndpoint(endpoint.path);
    lane = { models: await discoverLocal(local), baseUrl: local.baseUrl, apiKey: local.apiKey };
  }
  const model = selectModel(lane.models, wanted);
  if (!model.input.includes("image")) throw new Error(`model ${wanted} is not a vision lane; runs need one`);
  return { model, port, gatewayUrl: lane.baseUrl, apiKey: lane.apiKey };
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
      harnessFeatures: ["ram-state-v1", "live-map-v1", "field-control-lock", "naming-cursor-v1", "live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1", "warp-activation-guidance-v1", "clock-milestone-v1", "story-state-v1", ...activeUiFeatures(), "story-milestones-v2", "new-game-created-v1", "roxanne-first-interaction-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1"],
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


// A fit that failed is only the run's death sentence when it was fitted against a ceiling that is
// actually in force: a plain window-limit fit with no refusal behind it proves nothing about the lane.
export function ceilingMakesRunUnsatisfiable(recovery: ModelErrorRecovery | null, report: FitReport): boolean {
  if (recovery === null || report.fits) return false;
  const ceiling = recovery.ceiling.limit;
  return ceiling !== null && report.limit === ceiling;
}

// The composition live.ts uses, exported so a test can prove the decision itself: a model error that
// the recovery cannot answer ends the run instead of being resent.
export function modelErrorHandlers(
  recovery: ModelErrorRecovery | null,
  abort: (reason: "model_error") => void,
): { readonly modelErrorRecovery: boolean; readonly onModelError?: (message: { readonly errorMessage?: string }) => void } {
  if (recovery === null) return { modelErrorRecovery: false };
  return {
    modelErrorRecovery: true,
    onModelError: (message) => {
      if (recovery.observe(message)) abort("model_error");
    },
  };
}

async function playAgent(): Promise<void> {
  const signals = operatorSignalLatch(process);
  // Set by the latch so the run_end can name the signal that ended it, instead of looking finished.
  let operatorAbort: string | null = null;
  const presetPath=process.env["POKEBENCH_PLAY_PRESET"];
  const preset=presetPath===undefined?null:parsePlayPreset(JSON.parse(readFileSync(presetPath,"utf8")) as unknown);
  const assigned=process.env["POKEBENCH_RUN_ID"];
  if(assigned!==undefined&&!new RegExp(RUN_ID_PATTERN).test(assigned))throw new Error("POKEBENCH_RUN_ID is invalid");
  const continuation=liveContinuationFromEnv(process.env);
  const limits=preset?.limits??PLAY_LIMITS;
  const resolvedFeatures=preset===null?{...flagFeatures({loopGuard:readLoopMode(process.env)==="enforced",activeUi:activeUiFeatures().length>0,interfaceDocs:process.env["POKEBENCH_INTERFACE_DOCS"]!=="0",objectives:process.env["POKEBENCH_OBJECTIVES"]!=="0"}),"field-dialogue-phase-v1":process.env["POKEBENCH_FIELD_DIALOGUE_PHASE"]!=="0","automatic-running-v1":process.env["POKEBENCH_AUTOMATIC_RUNNING"]!=="0","expanded-menu-battle-information-v1":process.env["POKEBENCH_EXPANDED_INFORMATION"]!=="0"}:presetFeatures(preset);
  // Flag-only launches cannot express the switch. Keep their preset conversion stable.
  const features=preset?.version===2?resolvedFeatures:{...resolvedFeatures,"provider-wait-pause-v1":true};
  const serverEnv={...process.env,...serverFeatureEnv(features),...(continuation===null?{}:{POKEBENCH_RESTORE_RTC_MS:String(continuation.rtcMs)})};
  const start=preset===null?{kind:"boot" as const}:presetStart(preset,path=>readFileSync(path));
  const researchFile=process.env["POKEBENCH_CHECKPOINT_RESEARCH_NOTE"];
  const researchHash=process.env["POKEBENCH_CHECKPOINT_RESEARCH_NOTE_SHA256"];
  const researchNote=loadCheckpointResearchNote(features,start,researchFile===undefined||researchHash===undefined?undefined:{path:researchFile,sha256:researchHash},path=>readFileSync(path,"utf8"));
  if(researchNote!==null&&continuation!==null)throw new Error("checkpoint research note requires ordinary save-state startup, not restored history");
  if(continuation!==null){validateLiveContinuationStart(continuation,start);validateLiveContinuationFeatures(continuation,features);}
  const captureMode=checkpointSelection(process.env);
  const experiment=experimentFromEnv(process.env);
  const { model, port, gatewayUrl, apiKey, directApiKey } = await live(features["direct-codex-provider-v1"]);
  if(preset!==null&&preset.sampling.maxTokens>model.maxTokens)throw new Error("Play preset maxTokens exceeds the discovered model limit");
  const runId=assigned??newRunId(new Date(),model.id,()=>randomBytes(2).toString("hex"));
  const maxTokens=preset?.sampling.maxTokens??Math.min(PLAY_MAX_TOKENS,model.maxTokens);
  const thinking=preset?.sampling.thinkingLevel??PLAY_THINKING;
  if(continuation!==null)validateLiveContinuationModel(continuation,model,{thinkingLevel:thinking,maxTokens});
  const loopMode=features["deterministic-loop-guard-v1"]?"enforced":"diagnostic";
  const target=terminationTarget(preset);
  const goalTarget=preset?.target??null;
  const goal=playGoal(goalTarget,features);
  const stateMode=features["state-only-decisions-v1"];
  const incompatible=[...stateOnlyProblems(features),...exactCountProblems(features)];if(incompatible.length)throw new Error(incompatible.join("; "));
  const systemPrompt=stateMode?stateOnlyPrompt(features,goalTarget):playSystemPrompt(features,goalTarget);
  console.log(`run-agent: run ${runId}, model ${model.id} via ${gatewayUrl}`);
  console.log(`watch: just tail-run ${runId}   (frame: http://127.0.0.1:${String(port)}/view)`);

  const reason = await withRun(
    {
      romSha1:romSha1(),
      operatorSignal:()=>operatorAbort,
      ...(continuation===null?{}:{continuation:{prior:continuation.source.events,sourceTurn:continuation.bundle.turn,sourceRun:continuation.bundle.sourceRun,prefix:continuation.prefix}}),
      runsRoot: RUNS_ROOT,
      runId,
      port,
      model: { id: model.id, context_window: model.contextWindow, max_tokens: model.maxTokens, vision: true },
      sampling: playSampling(features, thinking, maxTokens),
      ...(preset===null?{}:{evaluation:runEvaluation(preset,target,limits,features,experiment)}),
      systemPrompt,
      tools: stateMode?["act"]:playTools(features),
      startState: start,
      harnessFeatures: playHarnessFeatures(features,target),

      extend_run: true,
      extend_budget: true,
      budgets: { max_turns: limits.maxTurns, max_wall_ms: limits.maxWallMs },
      piVersion: piVersion(),
    },
    realHost(port,start.kind==="save_state"?start.path:undefined,serverEnv),
    new FrameStore(continuation?.frameRoot??RUNS_ROOT),
    async (recorder,gameServerUrl,startMeta,lifecycle) => {
      if(researchNote!==null)writeFileSync(join(RUNS_ROOT,runId,"checkpoint-research-note.json"),JSON.stringify(checkpointResearchNoteReceipt(researchNote,initialPlayTask(start,goalTarget,features,researchNote))),{flag:"wx",mode:0o600});
      const controller = new AbortController();
      const elapsed = preset===null?(()=>Date.now()):()=>recorder.elapsedMs();
      let control: RunControl | null = null;
      const textOnly = textOnlySupervisor(features, recorder,limits.replyFailuresEndRun!==false);
      // The notice escalates with the streak of cut-off replies, so the governor gets a rule, not a string.
      const cutOffNotice = cutOffReplyNotice(features,maxTokens);
      const cutOff = cutOffNotice === undefined ? undefined : (repeats: number) => cutOffReplyNotice(features,maxTokens,repeats) ?? cutOffNotice;
      const controlFile = new ControlFile(join(RUNS_ROOT, runId, "control.jsonl"));
      const quotaFile = features["provider-wait-pause-v1"] ? new ControlFile(join(RUNS_ROOT, runId, "quota-control.jsonl")) : undefined;
      let startedAt = elapsed();
      const activeMs = (): number => elapsed() - (preset === null ? startedAt : 0) - (control?.pausedMs() ?? 0);
      // model-error-recovery-v1: one per run; a refused prompt lowers a sticky ceiling, a dead lane is
      // probed before the retry. Two consecutive model errors are absorbed; the third ends the run.
      const recovery = features["model-error-recovery-v1"]
        ? new ModelErrorRecovery({baseUrl: model.baseUrl, ...(directApiKey===undefined?{}:{readinessProbe:()=>Promise.resolve(true)}), ...(apiKey===undefined?{}:{apiKey}), record:(reason)=> { recorder.retry(reason,1,limits.failureLimit); }})
        : null;
      const {governor,control:runControl,callControl} = controlledRun({
        limits,
        ...(screenshotButtonBaseline(features) ? { uncoachedBaseline: true } : {}),
        ...(features["text-only-supervisor-v2"]?{textOnlyReminder:TEXT_ONLY_REMINDER}:{}),
        retry: (why, attempt, limit) => {
          recorder.retry(why, attempt, limit);
          console.log(`retry ${String(attempt)}/${String(limit)}: ${why}`);
        },
        abort: () => {
          controller.abort();
        },
        now: elapsed,
        ...(preset===null?{}:{startedAt:0}),
        ...(textOnly === undefined ? {} : { textOnlySupervisor: textOnly }),
        ...(cutOff === undefined ? {} : { cutOffNotice: cutOff }),
        ...modelErrorHandlers(recovery, (reason) => { governor.abort(reason); }),
      }, {
        providerWaitPause: features["provider-wait-pause-v1"],
        poll: () => controlFile.poll(),
        ...(quotaFile === undefined ? {} : { pollQuota: () => quotaFile.poll() }),
        record: (body) => { recorder.recordControl(body); },
        freeze: (paused) => freezeGame(gameServerUrl, paused),
        now: () => Date.now(),
      }, activeMs);
      control = runControl;
      const capture = new CheckpointCapture(captureMode, { run: runId, serverUrl: gameServerUrl, dir: join(RUNS_ROOT, runId, "checkpoints"), libraryDir:join(RUNS_ROOT,"checkpoints"), fetch, write: (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); }, linkExclusive:linkSync,remove:unlinkSync,rename: renameSync },startMeta);
      if(captureMode!==null){recorder.subscribe(event=>{capture.observe(event);});lifecycle.beforeRunEnd(async()=>{await capture.close().catch((error:unknown)=>{console.error(`checkpoint capture failed: ${String(error)}`);try {recorder.checkpointFailure(error);} catch(recordError) {console.error(`checkpoint failure not recorded: ${String(recordError)}`);}});});}
      // Every end saves RUN_END, after all other end tasks so it carries the final reason. Its failure is reported, never a crash.
      lifecycle.lastBeforeRunEnd(async(reason)=>{await capture.saveRunEnd({reason,turn:recorder.currentTurn()}).catch((error:unknown)=>{console.error(String(error));try {recorder.checkpointFailure(error);} catch(recordError) {console.error(`checkpoint failure not recorded: ${String(recordError)}`);}});});
      if(preset!==null&&recorder.elapsedMs()>=limits.maxWallMs){governor.abort("budget");return "budget";}
      const loopDetector = attachLoopGuard(recorder, governor, undefined, loopMode, features["interaction-loop-detection-v1"], loopSupervisor(features, recorder), features["transition-loop-detection-v1"], features["pushback-loop-detection-v1"], features["battle-observation-loop-v1"], features["navigation-truth-v1"], features["ineffective-loops-v1"], features["battle-menu-loop-v1"], features["clock-view-loop-v1"], features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"],features["same-target-no-progress-v1"],features);
      if(target!==null){
        const stop=new NativeTargetStop(runId,target,proof=>{
          if(governor.stopReason!==null)return;
          if(preset!==null&&activeMs()>runControl.wallLimit(limits.maxWallMs)){governor.abort("budget");return;}
          recorder.setTargetProof(proof);
          governor.stop("milestone");
        });
        recorder.subscribe(event=>{stop.observe(event);});
      }
      if(features["game-clear-completion-v1"])attachGameClearStop(recorder,governor,lifecycle,{run:runId,serverUrl:gameServerUrl,dir:join(RUNS_ROOT,runId,"checkpoints"),fetch,write:(path,data)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);},rename:renameSync},()=>preset!==null&&activeMs()>runControl.wallLimit(limits.maxWallMs));
      startedAt = elapsed();
      const wall = new BudgetTimer(runControl, limits.maxWallMs, () => elapsed() - (preset===null?startedAt:0), () => {
        governor.abort("budget");
      });
      const stall = stallStop(features, recorder, runControl, () => elapsed() - (preset===null?startedAt:0), loopDetector);
      stallBriefing(features, recorder, loopDetector, runControl, () => elapsed() - (preset===null?startedAt:0));
      const stopWatching = watchControl(controlFile, runControl, undefined, quotaFile);
      signals.onAbort((signal) => {
        console.log(`operator abort (${signal}): finishing the run record`);
        operatorAbort = signal;
        governor.abort("operator_abort");
      });
      const absoluteStop=continuation?.stopAt===undefined?null:setTimeout(()=>{governor.abort("budget");},Math.max(0,continuation.stopAt-Date.now()));
      try {
      const objectives = features["objective-tracking-v1"] ? objectiveHarness(goal, recorder, gameServerUrl, fetch, { ...objectiveSwitches(features), ...toolSwitches(features) }) : null;
      const baseTools=objectives?.tools ?? gameTools(gameServerUrl, pressHooks(recorder), fetch, toolSwitches(features));
      const context=contextTools(features,recorder,objectives?.transformContext??recorder.transformContext,cutOffNotice,new StateWatcher(gameServerUrl));
      const tools=playGameTools(baseTools,features,new StateWatcher(gameServerUrl),recorder,signal=>runControl.gate(signal),context.tools,context.training,context.instructionGoals);
      const jit=new JitContext(features,goalTarget);
      const stableJit=new StableJitContext(features,goalTarget);
      recorder.subscribe(event=>{if(event.type==="state"){jit.observe(event);stableJit.observe(event);}},false,true);
      const {exact,...budget}=contextBudget(features, model, maxTokens, recorder, payloadCounter(model.provider, model.baseUrl, apiKey),(report)=>{ if(ceilingMakesRunUnsatisfiable(recovery,report)) recovery?.markUnsatisfiable(); });
      recovery?.attach({...budget, ...(exact===undefined?{}:{exact})});
      const restored=continuation===null?null:await restoreLiveContinuation(continuation,features,recorder,context,{systemPrompt,tools:tools.map(({name,description,parameters})=>({name,description,parameters})),...(budget.budget===undefined?{}:{budget:budget.budget})});
      const messages:AgentMessage[]=restored===null?[]:[...restored.messages];
      let requestIndex=0;
      if(continuation!==null){
        const initialObservation=captureContinuationStart(continuation,await new StateWatcher(gameServerUrl).read());
        lifecycle.beforeRunEnd(async()=>{
          await freezeGame(gameServerUrl,true);
          await recorder.afterPress();
          const journal=recorder.nativeJournalReceipt();
          writeFileSync(join(RUNS_ROOT,runId,"campaign-continuation.json"),JSON.stringify({initialObservation,messages,requests:requestIndex,reminder:restored?.receipt??null,journal}),{flag:"wx"});
        });
      }
      // Records the raw model stream beside each reply; passes every request through untouched (model-stream.ts).
      const streamLog=new ModelStreamLog({url:chatCompletionsUrl(model.baseUrl),now:()=>Date.now(),turn:()=>recorder.currentTurn(),record:(turn,body)=>{recorder.recordModelStream(turn,body);},save:(name,raw)=>{const directory=join(RUNS_ROOT,runId,"model-stream");mkdirSync(directory,{recursive:true});const bytes=gzipSync(raw);writeFileSync(join(directory,name),bytes,{flag:"wx"});return bytes.byteLength;},sleep:ms=>new Promise(resolve=>{setTimeout(resolve,ms).unref();})});
      recorder.subscribe(event=>{streamLog.observe(event);});
      globalThis.fetch=streamLog.fetch(globalThis.fetch);
      lifecycle.beforeRunEnd(()=>streamLog.flush());
      const normalBase={...playLoopBase(model, thinking, apiKey, maxTokens, features, exact===undefined?undefined:payload=>exact.fit(payload)),...(directApiKey===undefined?{}:{getApiKey:directApiKey})};
      if(directApiKey!==undefined){
        if(stateMode||continuation!==null)throw Error("Direct Codex provider currently supports the ordinary play loop only");
        globalThis.fetch=recordDirectCodexTransport(globalThis.fetch,join(RUNS_ROOT,runId,"provider-transcript"),()=>recorder.currentTurn());
      }
      const loop = piLoop({
        systemPrompt,
        loopDetector,
        tools,
        base: {...normalBase,...(continuation===null?{}:{onPayload:async(payload:unknown,currentModel:Model<Api>)=>{const next=await normalBase.onPayload?.(payload,currentModel)??payload;return continuationPayload(continuation.seed,next,body=>{const directory=join(RUNS_ROOT,runId,"campaign-requests");mkdirSync(directory,{recursive:true});const bytes=gzipSync(body),name=String(++requestIndex).padStart(5,"0");writeFileSync(join(directory,`${name}.json.gz`),bytes,{flag:"wx"});writeFileSync(join(directory,`${name}.receipt.json`),JSON.stringify({index:requestIndex,turn:recorder.currentTurn(),offset:messages.length,sha256:createHash("sha256").update(bytes).digest("hex")}),{flag:"wx"});});}}),beforeToolCall:({toolCall})=>Promise.resolve(features["just-in-time-prompt-v2"]||jit.allowed(toolCall.name)?undefined:{block:true,reason:"This tool was not available for the screen of this decision; inspect the current state and choose an available tool."})},
        requestContext: context=>{const presentation=features["just-in-time-prompt-v2"]?stableJit:jit;const next=presentation.context(context);recorder.recordRequestContext(presentation.receipt());return next;},
        governor,
        transformContext: finalGuide(features,recorder,autoTalkContext(features,new StateWatcher(gameServerUrl),tools,battleDecisionContext(features,new StateWatcher(gameServerUrl),tools,context.transformContext,recorder,controller.signal),context.breaker,recorder,controller.signal)),
        window: context.window,
        ...budget,
        emit: event=>{if(event.type==="message_end"){exact?.observe(event.message);if(restored!==null)messages.push(event.message);}return recorder.emit(event);},
        signal: controller.signal,
        callControl,
        gate: async (signal) => { await runControl.gate(signal); await recovery?.beforeModelCall(signal); },
      });
        if(restored!==null)return await playFromHistory(restored.messages,governor,loop);
        if(stateMode)return await runStateMode({features,target:goalTarget,serverUrl:gameServerUrl,recorder,governor,base:playLoopBase(model,thinking,apiKey,maxTokens,features),signal:controller.signal,callControl,gate:async signal=>{await runControl.gate(signal);await recovery?.beforeModelCall(signal);},inputEpoch:()=>runControl.pausedMs(),...(exact===undefined?{}:{exact})});
        return await deliverInitialPlayTask(start,goalTarget,features,()=>Date.now(),task=>play(task,governor,loop),researchNote);
      } finally {
        if(absoluteStop!==null)clearTimeout(absoluteStop);
        wall.clear();
        stall?.clear();
        stopWatching();
        signals.close();
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
  console.log(`probe: ${runId} — ${viewerRunUrl(runId)}`);
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
      tools: ["observe", "press"], startState, harnessFeatures: ["probe", "manual-control", "live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1", "warp-activation-guidance-v1", "clock-milestone-v1", "story-state-v1", ...activeUiFeatures(), "story-milestones-v2", "new-game-created-v1", "roxanne-first-interaction-v1", "rustboro-gym-trainer-milestones-v1", "native-progress-activity-v1", "battle-choices-v1", "continuous-battle-state-v1", "validated-pokemon-v1", "menu-observability-v1", "native-action-history-v1", "full-raw-ram-v1", "remaining-native-milestones-v1"],
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
  const runsRoot = join(RUNS_ROOT,"human");
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
    const host=realHost(port,undefined,{...process.env,POKEBENCH_HUMAN_TOKEN:token,POKEBENCH_ACTIVE_UI:"1",POKEBENCH_FEATURES_OFF:"named-interactions-v1,world-destinations-v1,bounded-navigation-v1,expanded-menu-battle-information-v1,full-map-navigation-v1,player-map-visibility-v2,shop-shelf-hidden-v1,field-call-input-v1"});
    await withRun(plan,{...host,launchServer:async(dir,id,p)=>{writeFileSync(join(dir,"human-token"),token,{mode:0o600,flag:"wx"});if(process.env["POKEBENCH_HUMAN_START_PAUSED"]==="true")writeFileSync(join(dir,"control.jsonl"),controlLine(1,"pause",new Date().toISOString())+"\n",{flag:"wx"});return host.launchServer(dir,id,p);}},new FrameStore(runsRoot),async(recorder,url)=>{
      console.log(`Human play: ${humanPlayUrl(runId)}`);
      const reason=await driveHuman(recorder,url,join(runDir,"control.jsonl"),abort.signal,fetch,token);
      await saveHumanCheckpoint(url,token,runDir);
      return reason;
    });
  } finally { process.off("SIGINT",onSignal);process.off("SIGTERM",onSignal);release(); }
}

const command = process.argv[2];
const entry = command === "smoke" ? smoke : command === "human" ? playHuman : command === "play" ? playAgent : command === "probe" ? () => probe() : command === "verify-state" ? () => probe(true) : null;
let entryCompleted: Promise<void>;
if (entry === null) {
  entryCompleted = Promise.resolve();
  console.error("usage: live.js smoke | live.js play | live.js probe [save-state]");
  process.exitCode = 2;
} else {
  entryCompleted = entry().catch((error: unknown) => {
    console.error(`${command ?? ""} FAILED: ${String(error)}`);
    process.exitCode = 1;
  });
}

export { entryCompleted };
