import type { RunEvent } from "@pokebench/agent/events";
import { RunView, isRunEvent, type ControlState, type StateEvent, type Thought } from "./model.js";

export const MAX_OPEN_TOOLS = 1024;
export const MAX_CURRENT_MILESTONES = 1024;
export const CURRENT_VERSION = 1;
type Start = Extract<RunEvent, { type: "run_start" }>;
type End = Extract<RunEvent, { type: "run_end" }>;
interface Reading { tokens: number; turn: number; seq: number; at: number }
export interface CurrentState {
  version: 1; run: string; seq: number; nextSeq: number; at: number; turn: number;
  start: Start | null; end: End | null;
  state: StateEvent | null; partyState: StateEvent | null; card: RunView["cardState"]; health: RunView["partyHealth"];
  frame: string | null;
  thought: Thought | null; streaming: { thinking: string; text: string };
  context: { estimated: Reading | null; measured: Reading | null };
  retry: RunView["retry"];
  totals: { input: number; output: number; retries: number; modelErrors: number; toolErrors: number; compactions: number; requests: number; latencyMs: number };
  control: { state: ControlState; pausedMs: number; pauseAt: number | null; maxWallMs: number | null; maxTurns: number | null; lastExtensionRequest: number | null; emulatorFrozen: boolean | null; pauseReason?: "claude_quota" };
  openTools: Record<string, { at: number; name: string }>;
  requestAt: number | null;
  warning: string | null;
  milestones: Extract<RunEvent,{type:"milestone"}>[];
}
export function emptyCurrent(): CurrentState {
  return { version:1, run:"",seq:-1,nextSeq:0,at:0,turn:0,start:null,end:null,state:null,partyState:null,card:null,health:null,frame:null,thought:null,streaming:{thinking:"",text:""},
    context:{estimated:null,measured:null},retry:null,totals:{input:0,output:0,retries:0,modelErrors:0,toolErrors:0,compactions:0,requests:0,latencyMs:0},
    control:{state:"running",pausedMs:0,pauseAt:null,maxWallMs:null,maxTurns:null,lastExtensionRequest:null,emulatorFrozen:null},openTools:{},requestAt:null,warning:null,milestones:[] };
}
// Current display only. This never hydrates historical timeline or grading state.
export function currentView(s: CurrentState): RunView {
  const v=new RunView();v.start=s.start;v.startMs=s.start===null?null:Date.parse(s.start.t);v.end=s.end;v.lastMs=s.at;v.turn=s.turn;
  v.state=s.state;v.partyState=s.partyState!==null&&s.partyState.seq===s.state?.seq?s.state:s.partyState;v.cardState=s.card;
  v.partyHealth=s.health===null?null:{...s.health,source:s.state!==null&&s.health.source.seq===s.state.seq?s.state:v.partyState!==null&&s.health.source.seq===v.partyState.seq?v.partyState:s.health.source};v.frame=s.frame;
  const estimate=s.context.estimated;v.context=estimate===null?null:{messages:0,images:0,est_tokens:estimate.tokens};v.promptTokens=s.context.measured?.tokens??null;
  v.retry=s.retry===null?null:{...s.retry};v.tokens={input:s.totals.input,output:s.totals.output};v.modelErrors=s.totals.modelErrors;v.toolErrors=s.totals.toolErrors;v.compactions=s.totals.compactions;
  Object.assign(v.control,{state:s.control.state,maxWallMs:s.control.maxWallMs,maxTurns:s.control.maxTurns,lastExtensionRequest:s.control.lastExtensionRequest,emulatorFrozen:s.control.emulatorFrozen,pauseReason:s.control.pauseReason??null});
  // A compressed completed pause is equivalent for current elapsed time only.
  if(s.control.pausedMs>0)v.control.pauses.push({startMs:0,endMs:s.control.pausedMs});
  if(s.control.pauseAt!==null)v.control.pauses.push({startMs:s.control.pauseAt,endMs:null});
  v.lastThought=s.thought;v.streaming=s.streaming;if(s.requestAt!==null){v.turnStartMs=s.requestAt;v.thinkingSpans.push({startMs:s.requestAt,endMs:null});}
  return v;
}
export function foldCurrent(prior: CurrentState, event: RunEvent, continuationNext = 1, toolLimit = MAX_OPEN_TOOLS, milestoneLimit = MAX_CURRENT_MILESTONES): CurrentState {
  if(prior.end!==null)throw new Error("Current checkpoint is terminal");
  if(event.seq!==prior.nextSeq)throw new Error("Current event sequence mismatch");
  if(prior.start===null?event.type!=="run_start":event.run!==prior.run||event.type==="run_start")throw new Error("Current run identity mismatch");
  const ms=Date.parse(event.t);if(!Number.isFinite(ms))throw new Error("Invalid event time");
  const s=structuredClone(prior),v=currentView(s);v.apply(event);
  s.run=event.run;s.seq=event.seq;s.nextSeq=event.type==="run_start"?continuationNext:event.seq+1;s.at=ms;s.turn=v.turn;s.start=v.start===null?null:{...v.start,system_prompt:""};s.end=v.end;
  s.state=v.state;s.partyState=v.partyState;s.card=v.cardState;s.health=v.partyHealth;s.frame=v.frame;s.retry=v.retry;s.thought=v.lastThought;s.streaming=v.streaming;
  if(ms<prior.at)s.warning="Recorded time moved backwards; current display is not timing validation";
  s.totals.input=v.tokens.input;s.totals.output=v.tokens.output;s.totals.modelErrors=v.modelErrors;s.totals.toolErrors=v.toolErrors;s.totals.compactions=v.compactions;
  s.control={state:v.control.state,pausedMs:v.control.pauses.reduce((n,p)=>n+(p.endMs===null?0:Math.max(0,p.endMs-p.startMs)),0),pauseAt:v.control.pauses.find(p=>p.endMs===null)?.startMs??null,maxWallMs:v.control.maxWallMs,maxTurns:v.control.maxTurns,lastExtensionRequest:v.control.lastExtensionRequest,emulatorFrozen:v.control.emulatorFrozen,...(v.control.pauseReason===null?{}:{pauseReason:v.control.pauseReason})};
  if(event.type==="turn_start"){s.context.estimated={tokens:event.context.est_tokens,turn:event.turn,seq:event.seq,at:ms};s.requestAt=ms;}
  if(event.type==="assistant"){
    const tokens=event.usage.input+event.usage.cache_read+(event.usage.cache_write??0);
    if(tokens>0)s.context.measured={tokens,turn:event.turn,seq:event.seq,at:ms};s.totals.requests++;s.totals.latencyMs+=event.latency_ms;s.requestAt=null;
  }
  if(event.type==="milestone"&&!s.milestones.some(m=>m.name===event.name)){
    if(s.milestones.length>=milestoneLimit)throw new Error("Too many recorded progress anchors");
    s.milestones.push(event);
  }
  if(event.type==="retry")s.totals.retries++;
  if(event.type==="tool_call"){
    if(Object.keys(s.openTools).length>=toolLimit)throw new Error("Too many pending tools");
    Object.defineProperty(s.openTools,event.id,{value:{at:ms,name:event.name},enumerable:true,writable:true,configurable:true});
  }
  if(event.type==="tool_result")s.openTools=Object.fromEntries(Object.entries(s.openTools).filter(([key])=>key!==event.id));
  if(event.type==="run_end"){s.openTools={};s.requestAt=null;}
  return s;
}
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const number=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const integer=(v:unknown):v is number=>number(v)&&Number.isSafeInteger(v);
const nullableNumber=(v:unknown)=>v===null||number(v);
const nullableString=(v:unknown)=>v===null||typeof v==="string";
export function parseCurrent(value: unknown): CurrentState {
  const fail=():never=>{throw new Error("Invalid current checkpoint");};
  if(!object(value))return fail();const s=value;
  if(s["version"]!==1||typeof s["run"]!=="string"||!integer(s["seq"])||(!integer(s["nextSeq"])||typeof s["seq"]!=="number"||s["nextSeq"]<=s["seq"])||!number(s["at"])||!integer(s["turn"]))return fail();
  const start=s["start"];if(!isRunEvent(start)||start.type!=="run_start"||start.seq!==0||start.run!==s["run"])return fail();
  for(const key of ["state","partyState","end"]){const e=s[key];if(e!==null&&(!isRunEvent(e)||e.run!==s["run"]||e.seq>s["seq"]||e.type!==(key==="end"?"run_end":"state")))return fail();}
  const milestones=s["milestones"],lastSeq=s["seq"];
  if(!Array.isArray(milestones)||milestones.length>MAX_CURRENT_MILESTONES||!milestones.every((e:unknown)=>isRunEvent(e)&&e.type==="milestone"&&e.run===s["run"]&&e.seq<=lastSeq)||new Set(milestones.map(e=>(e as Extract<RunEvent,{type:"milestone"}>).name)).size!==milestones.length)return fail();
  const c=s["control"],t=s["totals"],context=s["context"],tools=s["openTools"];
  if(!object(c)||!object(t)||!object(context)||!object(tools)||Object.keys(tools).length>MAX_OPEN_TOOLS)return fail();
  if(!["running","pause_pending","paused","stop_pending","ended"].includes(String(c["state"]))||!number(c["pausedMs"])||!["pauseAt","maxWallMs","maxTurns","lastExtensionRequest"].every(k=>nullableNumber(c[k]))||!(c["emulatorFrozen"]===null||typeof c["emulatorFrozen"]==="boolean"))return fail();
  if(c["pauseReason"]!==undefined&&c["pauseReason"]!=="claude_quota")return fail();
  for(const key of ["input","output","retries","modelErrors","toolErrors","compactions","requests","latencyMs"])if(!number(t[key]))return fail();
  for(const key of ["estimated","measured"]){const r=context[key];if(r!==null&&(!object(r)||!number(r["tokens"])||!integer(r["turn"])||!integer(r["seq"])||!number(r["at"])))return fail();}
  if(!nullableString(s["frame"])||!nullableString(s["warning"])||!nullableNumber(s["requestAt"]))return fail();
  const retry=s["retry"];if(retry!==null&&(!object(retry)||!["count","attempt","limit"].every(k=>integer(retry[k]))))return fail();
  const card=s["card"];if(card!==null&&(!object(card)||!nullableString(card["name"])||!nullableString(card["location"])||!Array.isArray(card["party"])))return fail();
  const health=s["health"];if(health!==null&&(!object(health)||!isRunEvent(health["source"])||health["source"].run!==s["run"]||health["source"].type!=="state"||!("started" in health["source"])||health["source"].seq>s["seq"]||!Array.isArray(health["party"])||!Array.isArray(health["slots"])||!health["slots"].every(integer)))return fail();
  for(const tool of Object.values(tools))if(!object(tool)||!number(tool["at"])||typeof tool["name"]!=="string")return fail();
  const thought=s["thought"]??null,streaming=s["streaming"]??{thinking:"",text:""};
  if(thought!==null&&(!object(thought)||!integer(thought["turn"])||typeof thought["thinking"]!=="string"||typeof thought["reply"]!=="string"||!number(thought["latencyMs"])))return fail();
  if(!object(streaming)||typeof streaming["thinking"]!=="string"||typeof streaming["text"]!=="string")return fail();
  return {...value,thought,streaming} as unknown as CurrentState;
}
export const behindLive=(size:number,offset:number,limit:number):boolean=>size-offset>limit;
// A lagging feed shows the newest events at once; the skipped span is folded behind it and replaces this state when done.
// In-flight fields are cleared: the saved values are stale, and the backfill restores any still open.
export function jumpToTail(saved:CurrentState,tail:readonly RunEvent[]):CurrentState{
  const first=tail[0];if(first===undefined)return saved;
  const seed:CurrentState={...saved,nextSeq:first.seq,openTools:{},requestAt:null,streaming:{thinking:"",text:""}};
  return tail.reduce((s,event)=>foldCurrent(s,event),seed);
}
