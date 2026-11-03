import type { AgentMessage, AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, TextContent, ToolResultMessage } from "@mariozechner/pi-ai";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { ButtonSchema, StateBodySchema, type Button } from "./events.js";
import { parseGameState, type GameStateSnapshot } from "./game-state.js";
import {evolutionTool} from "./evolution-decision.js";
import { ShownStates, pressResult } from "./press-result.js";
import {randomUUID} from "node:crypto";
import {planStride,requestedStep,type PrefixRules} from "./navigation.js";
import {RANDOM_STARTER_LIMITS,atStarterBag,starterPickNote,starterStep,type RandomStarter,type StarterStep} from "./random-starter.js";
import {STRIDE_MAX_FRAMES,StrideReceiptSchema,type StridePlan,type StrideCorridor,type StrideReceipt} from "./stride.js";
import {InterceptReceiptSchema,stepButton,WatchReceiptSchema,type InterceptPlan,type InterceptReceipt,type WatchPlan,type WatchReceipt} from "./intercept.js";

// Which model-visible parts of the observe/press results this run shows.
export interface ToolSwitches { readonly screenshotOnly?: boolean; readonly bagPressFeedback?: boolean; readonly rejectedMovementPrefix?: PrefixRules; readonly rejectedMovementStride?: boolean; readonly rejectedMovementStep?: boolean; readonly navigationToolUseGuard?: boolean; readonly evolutionDecision?: boolean; readonly randomStarter?: () => RandomStarter; readonly readout: boolean; readonly pressResult: boolean; readonly position: boolean; readonly fieldLock: boolean; readonly safeInterfaces?: boolean; readonly automaticRunning?: boolean; readonly transitions?: boolean; readonly warpArrival?: boolean; readonly blockedBatch?: boolean; readonly liveMap?: boolean; readonly ledges?: boolean; readonly edgeWalls?: boolean; readonly counters?: boolean; readonly topology?: boolean; readonly pushback?: boolean; readonly elevation?: boolean; readonly mapObservability?: boolean }
export const ALL_TOOL_SWITCHES: ToolSwitches = { readout: true, pressResult: true, position: true, fieldLock: true, automaticRunning: false, transitions: false };
import type { PressTiming } from "./recorder.js";

const NoArgs = Type.Object({});

const HealthSchema = Type.Object({ status: Type.String() });

const ObservationSchema = Type.Object({
  state_text: Type.String(),
  screenshot_base64: Type.String({ minLength: 1 }),
  state: StateBodySchema,
});

const QueueSchema = Type.Object({ queue_empty: Type.Boolean() });

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class SmokeError extends Error {
  override readonly name = "SmokeError";
}

function deadline(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([timeout, signal]);
}

async function getJson(url: string, fetchFn: typeof fetch, timeoutMs = 15_000, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchFn(url, { signal: deadline(timeoutMs, signal) });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`);
  return (await response.json()) as unknown;
}

export async function serverHealthy(gameServerUrl: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const body = await getJson(`${gameServerUrl}/health`, fetchFn, 2_000);
    return Value.Check(HealthSchema, body) && body.status === "healthy";
  } catch {
    return false;
  }
}

function checkFrame(base64: string): void {
  const bytes = Buffer.from(base64, "base64");
  const isPng =
    bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) && bytes.toString("ascii", 12, 16) === "IHDR";
  if (!isPng) throw new Error("observation frame is not a PNG");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 240 || height !== 160) {
    throw new Error(`observation frame is ${String(width)}x${String(height)}, expected 240x160`);
  }
}

type ObservationContent = [ImageContent, TextContent];

async function observation(
  gameServerUrl: string,
  fetchFn: typeof fetch,
  signal: AbortSignal | undefined,
  prefix: string | ((state: GameStateSnapshot) => string) = "",
): Promise<{ content: ObservationContent; state: GameStateSnapshot }> {
  const body = await getJson(`${gameServerUrl}/pokebench/observation`, fetchFn, 15_000, signal);
  if (!Value.Check(ObservationSchema, body)) throw new Error("malformed /pokebench/observation payload");
  checkFrame(body.screenshot_base64);
  return { content: [
    { type: "image", data: body.screenshot_base64, mimeType: "image/png" },
    { type: "text", text: `${typeof prefix === "string" ? prefix : prefix(body.state)}${body.state_text}` },
  ], state: body.state };
}

export function observeTool(gameServerUrl: string, fetchFn: typeof fetch = fetch, switches: ToolSwitches = ALL_TOOL_SWITCHES, shown?: ShownStates): AgentTool {
  return {
    name: "observe",
    label: "Observe",
    description: switches.readout ? "See the current game screen and the game state read from memory (location, party, map)." : "See the current game screen.",
    parameters: NoArgs,
    execute: async (_toolCallId, _params, signal) => {
      const result = await observation(gameServerUrl, fetchFn, signal);
      shown?.record(result.state);
      return { content: switches.screenshotOnly ? result.content.filter(item => item.type === "image") : result.content, details: { state: result.state } };
    },
  };
}

export interface Clock {
  sleep(ms: number): Promise<void>;
  now(): number;
}

const realClock: Clock = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

const QUEUE_POLL_MS = 100;
const QUEUE_TIMEOUT_MS = 20_000;
// The vendor caches get_comprehensive_state for 100 ms; outwait it so the
// observation reflects the last press, not a state read mid-queue.
const STATE_CACHE_SETTLE_MS = 150;

export async function waitForQueue(
  gameServerUrl: string,
  fetchFn: typeof fetch,
  clock: Clock,
  signal?: AbortSignal,
): Promise<void> {
  const giveUpAt = clock.now() + QUEUE_TIMEOUT_MS;
  for (;;) {
    signal?.throwIfAborted();
    const body = await getJson(`${gameServerUrl}/queue_status`, fetchFn, 15_000, signal);
    if (!Value.Check(QueueSchema, body)) throw new Error("malformed /queue_status payload");
    if (body.queue_empty) return;
    if (clock.now() >= giveUpAt) throw new Error(`action queue did not drain within ${String(QUEUE_TIMEOUT_MS)} ms`);
    await clock.sleep(QUEUE_POLL_MS);
  }
}

export interface SmokeSummary {
  readonly toolCalls: string[];
  readonly texts: string[];
}

function assistantTexts(transcript: readonly AgentMessage[]): string[] {
  return transcript
    .filter((m): m is AssistantMessage => m.role === "assistant")
    .flatMap((m) => m.content.filter((c): c is TextContent => c.type === "text").map((c) => c.text.trim()))
    .filter((text) => text !== "");
}

function toolResults(transcript: readonly AgentMessage[]): ToolResultMessage[] {
  return transcript.filter((m): m is ToolResultMessage => m.role === "toolResult");
}

export function checkSmoke(transcript: readonly AgentMessage[]): SmokeSummary {
  const ended = transcript.find(
    (m): m is AssistantMessage => m.role === "assistant" && (m.stopReason === "error" || m.stopReason === "aborted"),
  );
  if (ended !== undefined) {
    throw new SmokeError(`model turn ended: ${ended.stopReason}${ended.errorMessage ? ` (${ended.errorMessage})` : ""}`);
  }
  const results = toolResults(transcript);
  const texts = assistantTexts(transcript);
  const failed = results.filter((r) => r.isError);
  if (failed.length > 0) {
    throw new SmokeError(`tool calls failed: ${failed.map((r) => r.toolName).join(", ")}`);
  }
  const toolCalls = results.map((r) => r.toolName);
  if (!toolCalls.includes("observe")) throw new SmokeError("observe tool was never called");
  if (!toolCalls.includes("press")) throw new SmokeError("no second tool call: press was never called");
  if (texts.length < 2) {
    throw new SmokeError(`expected a frame description and a final reply, got: ${texts.join(" | ")}`);
  }
  return { toolCalls, texts };
}

const PressArgs = Type.Object({ buttons: Type.Array(ButtonSchema, { minItems: 1, maxItems: 8 }), walking: Type.Optional(Type.Boolean({description: "Walk deliberately; do not add automatic running to directional travel."})) });
const DeterministicRunningPressArgs = Type.Object({ buttons: PressArgs.properties.buttons }, { additionalProperties: false });

const ActionSchema = Type.Object({ status: Type.String(), message: Type.Optional(Type.String()) });

// The pinned vendor's "normal" preset (server/app.py SPEED_PRESETS), sent
// explicitly so the log records what the server was asked to do.
export const PRESS_TIMING: PressTiming = { hold_frames: 10, release_frames: 8 };

/** Automatic B is a held modifier, not a second sequential button action. */
export function permitsAutomaticRunning(before: GameStateSnapshot | undefined, buttons: readonly Button[], _walking: boolean | undefined, enabled: boolean | undefined): boolean {
  return enabled === true && buttons.length > 0 && buttons.every(button => ["UP", "DOWN", "LEFT", "RIGHT"].includes(button)) && before?.screen === "overworld" && !before.in_battle && before.field_controls_locked === false && before.active_ui == null && before.running?.permitted === true && before.running.controllable === true;
}

/** Modifiers actually submitted by the harness; raw model arguments remain in the tool_call event. */
export interface PressModifiers { readonly automatic_running: boolean; readonly walking?: boolean; readonly requested_held_buttons?: readonly Button[];readonly stride?:StridePlan }

export interface PressHooks {
  beforePress(toolCallId: string, buttons: readonly Button[], timing: PressTiming, before?: GameStateSnapshot, modifiers?: PressModifiers): void;
  afterPress(): Promise<void>;
}

export type BeforePressCheck=(before:GameStateSnapshot|undefined)=>void;
export interface CheckedPressOptions { readonly automaticRunning?: boolean; readonly stride?:StrideCorridor }
export type CheckedPressTool=AgentTool<typeof PressArgs> & {
 readonly executeChecked:(id:string,params:Static<typeof PressArgs>,check:BeforePressCheck,signal?:AbortSignal,update?:Parameters<AgentTool<typeof PressArgs>["execute"]>[3],options?:CheckedPressOptions)=>Promise<AgentToolResult<{state:GameStateSnapshot|undefined;stride?:StrideReceipt;starterPick?:true}>>;
 // moving-npc-intercept-v1: frame-owned patrol watch (no input) and path step-in on the game server.
 readonly executeWatch?:(plan:Omit<WatchPlan,"id">,check:BeforePressCheck,signal?:AbortSignal)=>Promise<WatchReceipt>;
 readonly executeIntercept?:(id:string,plan:Omit<InterceptPlan,"id">,check:BeforePressCheck,signal?:AbortSignal)=>Promise<AgentToolResult<{state:GameStateSnapshot;intercept:InterceptReceipt}>>;
};
export function isCheckedPress(tool:AgentTool):tool is CheckedPressTool {return "executeChecked" in tool&&typeof tool.executeChecked==="function";}

export function submittedButtons(buttons:readonly Button[], before:GameStateSnapshot|undefined, switches:ToolSwitches):readonly Button[] {
  const freeField = before?.screen === "overworld" && before.started && !before.in_battle && before.field_controls_locked === false && before.active_ui == null && before.world_context?.dialogue == null && before.world_context?.message == null;
  const directional = buttons.every(button=>["UP","DOWN","LEFT","RIGHT"].includes(button));
  return switches.safeInterfaces && !(freeField && directional) ? buttons.slice(0,1) : buttons;
}
class PrefixStop extends Error {}
type RequestedStepOk=Extract<ReturnType<typeof requestedStep>,{ok:true}>;
const point=(p:{readonly x:number;readonly y:number}|null):string=>p===null?"an unknown tile":`(${String(p.x)},${String(p.y)})`;
const sameMapId=(a:readonly [number,number]|null,b:readonly [number,number]|null):boolean=>a!==null&&b!==null&&a[0]===b[0]&&a[1]===b[1];
// The free-field state navigation-tool-use-guard-v1 intercepts walking batches in.
const freeToWalk=(s:GameStateSnapshot):boolean=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.active_ui===null&&s.field_controls_locked===false&&s.running?.controllable===true&&s.map_id!==null&&s.position!==null&&s.world_context?.field_activity==null&&s.world_context?.dialogue==null&&s.world_context?.message==null;
export function pressTool(
  gameServerUrl: string,
  hooks: PressHooks,
  fetchFn: typeof fetch = fetch,
  clock: Clock = realClock,
  switches: ToolSwitches = ALL_TOOL_SWITCHES,
  shown: ShownStates = new ShownStates(),
): CheckedPressTool {
  const execute=async(toolCallId:string,params:Static<typeof PressArgs>,signal?:AbortSignal,_update?:Parameters<AgentTool<typeof PressArgs>["execute"]>[3],check?:BeforePressCheck,checkedOptions?:CheckedPressOptions):Promise<AgentToolResult<{state:GameStateSnapshot|undefined;stride?:StrideReceipt;starterPick?:true}>>=>{
      // A stopped run (budget, operator abort) must not press anything further.
      signal?.throwIfAborted();
      let before: GameStateSnapshot | undefined;
      try {
        before = parseGameState(await getJson(`${gameServerUrl}/pokebench/state`, fetchFn, 15_000, signal));
      } catch (error) {
        // Preserve ordinary press operation for old/unavailable state servers;
        // the feedback explicitly withholds a before/after classification.
        signal?.throwIfAborted();
        if(check!==undefined)throw error;
      }
      check?.(before);
      if(switches.randomStarter!==undefined&&!picking&&atStarterBag(before))return pickStarter(toolCallId,switches.randomStarter,before,signal,_update);
      let limitedMovement=false;
      if(switches.navigationToolUseGuard===true&&check===undefined&&params.buttons.length>=2&&params.buttons.every(button=>button==="UP"||button==="DOWN"||button==="LEFT"||button==="RIGHT")&&before?.started&&before.screen==="overworld"&&!before.in_battle&&before.active_ui===null&&before.field_controls_locked===false&&before.running?.controllable===true&&before.map_id!==null&&before.position!==null&&before.world_context?.field_activity==null&&before.world_context?.dialogue==null&&before.world_context?.message==null){
        if(switches.rejectedMovementPrefix!==undefined)return walkPrefix(toolCallId,params.buttons,before,switches.rejectedMovementPrefix,signal,_update);
        if(switches.rejectedMovementStride===true){
          const directions=params.buttons;
          const corridor=planStride(before,directions,{});
          const submitted=corridor===null?[]:directions.slice(0,corridor.path.length);
          const prefix=`Checked requested movement: one safe straight prefix only; remaining directions were not sent. ${JSON.stringify({requested:params.buttons,submitted,dropped:params.buttons.slice(submitted.length)})}\n`;
          if(corridor===null){
            const result=await observation(gameServerUrl,fetchFn,signal,prefix+"No verified plain-floor corridor; no input was sent. Inspect the state before continuing.\n");
            shown.record(result.state,before);return {content:result.content,details:{state:result.state}};
          }
          const result=await execute(toolCallId,{buttons:submitted},signal,_update,actual=>{
            if(actual===undefined||actual.screen!=="overworld"||actual.in_battle||actual.active_ui!==null||actual.field_controls_locked!==false||actual.running?.controllable!==true||actual.world_context?.field_activity!=null||actual.world_context?.dialogue!=null||actual.world_context?.message!=null||JSON.stringify(planStride(actual,directions,{}))!==JSON.stringify(corridor))throw new Error("Requested stride geometry or field input changed before submission; no command submitted");
          },{automaticRunning:false,stride:corridor});
          return {...result,content:[{type:"text",text:prefix},...result.content]};
        }
        if(switches.rejectedMovementStep===true){limitedMovement=true;}else{
          const receipt={requested:params.buttons,submitted:[],map_id:before.map_id,position:before.position};
          const result=await observation(gameServerUrl,fetchFn,signal,`Navigation tool-use guard: no input was sent. Use an available navigation tool with a target you choose for walking. Single direction presses remain available for facing or crossing an exit. ${JSON.stringify(receipt)}\n`);
          shown.record(result.state,before);
          return {content:result.content,details:{state:result.state}};
        }
      }
      if(switches.evolutionDecision===true&&before?.screen==="evolution"&&(before.active_ui?.phase==="evolution_decision"||before.active_ui?.phase==="evolution_cancel_window"||(typeof before.active_ui?.details?.evolution_state==="number"&&before.active_ui.details.evolution_state<=8&&typeof before.active_ui.details.task_flags==="number"&&(before.active_ui.details.task_flags&1)!==0))){
        const result=await observation(gameServerUrl,fetchFn,signal,"Ordinary buttons are blocked during this evolution animation. Use choose_evolution when the decision is ready. Nothing pressed.\n");
        return {content:result.content,details:{state:result.state}};
      }
      const buttons = limitedMovement ? params.buttons.slice(0,1) : submittedButtons(params.buttons,before,switches);
      const automaticRunning = limitedMovement||checkedOptions?.automaticRunning===false?false:permitsAutomaticRunning(before, buttons, params.walking, switches.automaticRunning);
      const stride=checkedOptions?.stride===undefined?undefined:{id:randomUUID(),...checkedOptions.stride};
      const timing=stride===undefined?PRESS_TIMING:{hold_frames:STRIDE_MAX_FRAMES,release_frames:8};
      if (stride!==undefined || switches.automaticRunning===true || params.walking!==undefined) hooks.beforePress(toolCallId, buttons, timing, before, {automatic_running:automaticRunning,...(stride===undefined?{}:{stride}),...(switches.automaticRunning===true?{}:{walking:params.walking===true}),...(automaticRunning?{requested_held_buttons:["B"] as const}:{})});
      else hooks.beforePress(toolCallId, buttons, PRESS_TIMING, before);
      const url = `${gameServerUrl}${stride!==undefined?"/pokebench/stride":automaticRunning ? "/pokebench/travel" : "/action"}`;
      try {
      const response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stride===undefined?{ buttons, ...PRESS_TIMING, ...(automaticRunning ? {automatic_running:true} : {}) }:{...stride,automatic_running:automaticRunning}),
        signal: deadline(15_000, signal),
      });
      const body: unknown = await response.json();
      if (!response.ok || !Value.Check(ActionSchema, body) || body.status !== "success") {
        const detail = Value.Check(ActionSchema, body) ? (body.message ?? body.status) : `HTTP ${String(response.status)}`;
        throw new Error(`POST ${url} failed: ${detail}`);
      }
      await waitForQueue(gameServerUrl, fetchFn, clock, signal);
      }
      catch(error){
        if(stride!==undefined){
          const cancelled=await fetchFn(`${gameServerUrl}/pokebench/stride/${stride.id}/cancel`,{method:"POST",signal:AbortSignal.timeout(2000)});
          if(!cancelled.ok)throw new Error(`Navigation stride cancellation failed: HTTP ${String(cancelled.status)}`,{cause:error});
        }
        throw error;
      }
      let receipt:StrideReceipt|undefined;
      if(stride!==undefined){
        const raw:unknown=await getJson(`${gameServerUrl}/pokebench/stride/${stride.id}`,fetchFn,15_000,signal);
        if(!Value.Check(StrideReceiptSchema,raw)||raw.id!==stride.id||!raw.stopped||raw.completed>stride.path.length||JSON.stringify(raw.path)!==JSON.stringify(stride.path)||JSON.stringify(raw.origin)!==JSON.stringify(stride.origin)||JSON.stringify(raw.map_id)!==JSON.stringify(stride.map_id)||raw.elevation!==stride.elevation||raw.tall_grass!==stride.tall_grass||(raw.reason==="completed"&&raw.completed!==stride.path.length))throw new Error("Navigation stride lacks a matching terminal receipt");
        receipt=raw;
      }
      await clock.sleep(STATE_CACHE_SETTLE_MS);
      await hooks.afterPress();
      const content = await observation(gameServerUrl, fetchFn, signal, (after) => `pressed ${buttons.join(", ")}\n${limitedMovement?`Movement batch limited to one direction press; remaining inputs were not sent. Inspect the new state before another input. ${JSON.stringify({requested:params.buttons,submitted:buttons,dropped:params.buttons.slice(1)})}\n`:""}${!limitedMovement&&buttons.length < params.buttons.length ? `Interface safety: submitted 1 of ${String(params.buttons.length)} requested inputs; remaining inputs were not sent. Inspect the new state before another input.\n` : ""}${switches.pressResult ? `Press result: ${pressResult(before, after, buttons, switches, shown)}\n` : ""}\n`);
      shown.record(content.state, before);
      return { content: [...(receipt===undefined?[]:[{type:"text" as const,text:`Navigation stride receipt: ${JSON.stringify(receipt)}`}]),...(switches.screenshotOnly ? content.content.filter(item => item.type === "image") : content.content)], details: { state: content.state,...(receipt===undefined?{}:{stride:receipt}) } };
  };
  // random-starter-v1: the run's pick replaces the model's press at the starter bag; one button per press, each read back.
  let picking=false,starter:RandomStarter|null=null;
  const pickStarter=async(toolCallId:string,pick:()=>RandomStarter,before:GameStateSnapshot|undefined,signal?:AbortSignal,update?:Parameters<AgentTool<typeof PressArgs>["execute"]>[3]):Promise<AgentToolResult<{state:GameStateSnapshot|undefined;stride?:StrideReceipt;starterPick?:true}>>=>{
    const target=starter??=pick();
    let current=before,presses=0,confirmed=false,waitingSince:number|null=null,detail:string|null=null,picked=false;
    picking=true;
    try {
      while(current!==undefined){
        const step:StarterStep=confirmed&&!atStarterBag(current)?{kind:"done"}:starterStep(current,target);
        if(step.kind==="done"){picked=true;break;}
        if(step.kind==="stop"){detail=step.detail;break;}
        if(step.kind==="press"){
          if(presses>=RANDOM_STARTER_LIMITS.presses){detail=`no starter after ${String(presses)} presses`;break;}
          presses+=1;waitingSince=null;
          confirmed=current.active_ui?.phase==="starter_confirmation"&&step.button==="A";
          current=(await execute(toolCallId,{buttons:[step.button]},signal,update)).details.state;
          continue;
        }
        waitingSince??=clock.now();
        if(clock.now()-waitingSince>=RANDOM_STARTER_LIMITS.waitMs){detail=`the starter bag stayed in ${current.active_ui?.phase??"transition"} for ${String(RANDOM_STARTER_LIMITS.waitMs/1000)} s`;break;}
        await clock.sleep(RANDOM_STARTER_LIMITS.pollMs);
        current=parseGameState(await getJson(`${gameServerUrl}/pokebench/state`,fetchFn,15_000,signal));
      }
    } finally {picking=false;}
    if(current===undefined&&!picked)detail??="the game state is unavailable";
    const result=await observation(gameServerUrl,fetchFn,signal,starterPickNote(target,picked?"picked":"stopped",detail));
    shown.record(result.state,before);
    return {content:result.content,details:{state:result.state,starterPick:true}};
  };
  // rejected-movement-prefix-v1: the longest prefix of a guarded walking batch, one checked ordinary press per direction,
  // each re-validated by navigate_to's rules on the state read just before it and verified on the state after it.
  const walkPrefix=async(toolCallId:string,buttons:readonly Button[],before:GameStateSnapshot,rules:PrefixRules,signal?:AbortSignal,update?:Parameters<AgentTool<typeof PressArgs>["execute"]>[3]):Promise<AgentToolResult<{state:GameStateSnapshot|undefined;stride?:StrideReceipt;starterPick?:true}>>=>{
    const requested=buttons.flatMap(b=>b==="UP"||b==="DOWN"||b==="LEFT"||b==="RIGHT"?[b]:[]),submitted:Button[]=[];
    let expected=before.position,last:AgentToolResult<{state:GameStateSnapshot|undefined;stride?:StrideReceipt;starterPick?:true}>|undefined,stop:string|null=null;
    for(const [i,direction] of requested.entries()){
      const planned:{step:RequestedStepOk|null;refusal:string}={step:null,refusal:"walking was interrupted"};
      try {
        last=await execute(toolCallId,{buttons:[direction]},signal,update,actual=>{
          if(actual===undefined||!freeToWalk(actual)||!sameMapId(actual.map_id,before.map_id)||expected===null||actual.position===null||actual.position.x!==expected.x||actual.position.y!==expected.y)throw new PrefixStop();
          const step=requestedStep(actual,direction,rules);
          if(!step.ok){planned.refusal=step.reason;throw new PrefixStop();}
          planned.step=step;
        },{automaticRunning:false});
      } catch(error){if(!(error instanceof PrefixStop))throw error;stop=`Stopped before step ${String(i+1)}: ${planned.refusal}`;break;}
      submitted.push(direction);
      const after=last.details.state,step=planned.step;
      if(step===null)throw new Error("Requested movement step lacks its checked landing");
      if(after===undefined||!sameMapId(after.map_id,before.map_id)){stop=`Stopped after step ${String(i+1)}: the map changed`;break;}
      if(!freeToWalk(after)){stop=`Stopped after step ${String(i+1)}: walking was interrupted`;break;}
      if(after.position?.x!==step.landing.x||after.position.y!==step.landing.y){stop=`Stopped after step ${String(i+1)}: the ${direction} press from ${point(expected)} ended at ${point(after.position)}, not ${point(step.landing)}`;break;}
      if(step.warp){stop=`Stopped after step ${String(i+1)}: stepped onto a warp at ${point(step.landing)}`;break;}
      expected=step.landing;
    }
    const head=`Requested movement: walked ${String(submitted.length)} of ${String(requested.length)} directions by navigate_to's rules, one press each; remaining inputs were not sent. ${JSON.stringify({requested,submitted,dropped:requested.slice(submitted.length)})}\n${stop===null?"":`${stop}\n`}`;
    if(last===undefined){const result=await observation(gameServerUrl,fetchFn,signal,head);shown.record(result.state,before);return {content:result.content,details:{state:result.state}};}
    return {...last,content:[{type:"text",text:head},...last.content]};
  };
  // One private queue action on the game server; cancelled if the queue wait fails.
  const owned=async<T>(route:string,body:{readonly id:string},receipt:(raw:unknown)=>T|null,signal?:AbortSignal):Promise<T>=>{
    const url=`${gameServerUrl}${route}`;
    try{
      const response=await fetchFn(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body),signal:deadline(15_000,signal)});
      const reply:unknown=await response.json();
      if(!response.ok||!Value.Check(ActionSchema,reply)||reply.status!=="success")throw new Error(`POST ${url} failed: ${Value.Check(ActionSchema,reply)?(reply.message??reply.status):`HTTP ${String(response.status)}`}`);
      await waitForQueue(gameServerUrl,fetchFn,clock,signal);
    }catch(error){
      const cancelled=await fetchFn(`${gameServerUrl}/pokebench/intercept/${body.id}/cancel`,{method:"POST",signal:AbortSignal.timeout(2000)});
      if(!cancelled.ok)throw new Error(`Patrol intercept cancellation failed: HTTP ${String(cancelled.status)}`,{cause:error});
      throw error;
    }
    const parsed=receipt(await getJson(`${gameServerUrl}/pokebench/intercept/${body.id}`,fetchFn,15_000,signal));
    if(parsed===null)throw new Error("Patrol intercept lacks a matching terminal receipt");
    return parsed;
  };
  const readBefore=async(check:BeforePressCheck,signal?:AbortSignal):Promise<GameStateSnapshot>=>{
    signal?.throwIfAborted();
    const before=parseGameState(await getJson(`${gameServerUrl}/pokebench/state`,fetchFn,15_000,signal));
    check(before);
    return before;
  };
  const executeWatch=async(plan:Omit<WatchPlan,"id">,check:BeforePressCheck,signal?:AbortSignal):Promise<WatchReceipt>=>{
    await readBefore(check,signal);
    const body={id:randomUUID(),...plan};
    return owned("/pokebench/intercept/watch",body,raw=>Value.Check(WatchReceiptSchema,raw)&&raw.id===body.id&&raw.stopped&&raw.target_local_id===plan.target_local_id&&raw.target_slot===plan.target_slot&&JSON.stringify(raw.map_id)===JSON.stringify(plan.map_id)?raw:null,signal);
  };
  const executeIntercept=async(toolCallId:string,plan:Omit<InterceptPlan,"id">,check:BeforePressCheck,signal?:AbortSignal):Promise<AgentToolResult<{state:GameStateSnapshot;intercept:InterceptReceipt}>>=>{
    const before=await readBefore(check,signal);
    const direction=stepButton(plan.wait,plan.enter);
    if(direction===null)throw new Error("Patrol intercept wait tile is not next to the entered tile");
    const body={id:randomUUID(),...plan};
    hooks.beforePress(toolCallId,[direction],{hold_frames:plan.max_frames+1,release_frames:8},before,{automatic_running:false});
    const receipt=await owned("/pokebench/intercept",body,raw=>Value.Check(InterceptReceiptSchema,raw)&&raw.id===body.id&&raw.stopped&&JSON.stringify({...raw,frames:0,phase:"",reason:"",stopped:true})===JSON.stringify({...body,frames:0,phase:"",reason:"",stopped:true})?raw:null,signal);
    await clock.sleep(STATE_CACHE_SETTLE_MS);
    await hooks.afterPress();
    const content=await observation(gameServerUrl,fetchFn,signal,`Path step-in receipt: ${JSON.stringify(receipt)}\n`);
    shown.record(content.state,before);
    return {content:switches.screenshotOnly?content.content.filter(item=>item.type==="image"):content.content,details:{state:content.state,intercept:receipt}};
  };
  return {
    name: "press",
    label: "Press buttons",
    description: (switches.readout
      ? "Press Game Boy Advance buttons in order (up to 8), then see the resulting screen and game state."
      : "Press Game Boy Advance buttons in order (up to 8), then see the resulting screen.") + (switches.safeInterfaces ? " Interaction/menu or locked/unknown-interface batches submit only the first input; inspect before continuing." : "") + (switches.automaticRunning===true ? " Direction-only field travel runs whenever native controls permit it; the harness, not the model, owns this choice." : ""),
    parameters: (switches.automaticRunning===true ? DeterministicRunningPressArgs : PressArgs) as typeof PressArgs,
    execute,
    executeChecked:(id,params,check,signal,update,options)=>execute(id,params,signal,update,check,options),
    executeWatch,
    executeIntercept,
  };
}


/** observe and press sharing what the model was last shown. */
export function gameTools(gameServerUrl: string, hooks: PressHooks, fetchFn: typeof fetch = fetch, switches: ToolSwitches = ALL_TOOL_SWITCHES, clock: Clock = realClock): [AgentTool, CheckedPressTool, ...AgentTool[]] {
  const shown = new ShownStates();
  return [observeTool(gameServerUrl, fetchFn, switches, shown), pressTool(gameServerUrl, hooks, fetchFn, clock, switches, shown), ...(switches.evolutionDecision===true?[evolutionTool(gameServerUrl,fetchFn,hooks,clock,async(signal,prefix)=>{const result=await observation(gameServerUrl,fetchFn,signal,prefix);shown.record(result.state);return {content:result.content,details:{state:result.state}};})]:[])];
}
