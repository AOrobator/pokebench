import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {fileURLToPath} from "node:url";
import {attachLoopGuard,Governor} from "./harness.js";
import {featuresOf} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {PUSHBACK_MESSAGE,type LoopNotice} from "./loop-detection.js";
import {ShownStates,ignoredSteps,pressResult,pushbackPressResult,scriptMove} from "./press-result.js";
import {navigationAfter} from "./dialogue-auto-advance.js";
import {MESSAGE_WAITING} from "./navigation.js";
import {toolSwitches} from "./play-config.js";
import type {GameStateSnapshot} from "./game-state.js";

// Acceptance cases from the cook harness audit (runs/reports/2026-10-16-cook-harness-audit/{live,sh02}.md), as
// schema-valid recorded events: runs 2026-10-16T04-51-03_qwen36-gpu0_54a7 (bundle arm), 2026-10-16T04-51-03_qwen36-gpu1_1623
// (control arm) and 2026-10-16T02-23-17_qwen36-gpu1_sh02, trimmed only where the event schema leaves a field optional.
function recorded(name:string):RunEvent[]{
 const path=fileURLToPath(new URL(`./fixtures/${name}`,import.meta.url));
 return gunzipSync(readFileSync(path)).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
}
type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface Seen {readonly turn:number;readonly seq:number;readonly kind:string;readonly phase:string;readonly message:string}

function replay(events:readonly RunEvent[],pushback:boolean):Seen[]{
 const observers:((e:RunEvent)=>void)[]=[];const seen:Seen[]=[];let current:RunEvent|undefined;
 const start=events.find(e=>e.type==="run_start");
 if(start?.type!=="run_start")throw new Error("fixture has no run_start");
 const features=featuresOf(start.harness_features);
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{checkEvent({v:1,run:"replay",seq:current?.seq??0,t:"2026-10-16T09:00:00.000-04:00",turn:current?.turn??0,type:"loop_guard",...n,evidence:[...n.evidence]});seen.push({turn:current?.turn??-1,seq:current?.seq??-1,kind:n.kind,phase:n.phase,message:n.message});}};
 const governor=new Governor({limits:{maxTurns:5000,maxWallMs:6*3_600_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],(kind,calls)=>`SUPERVISOR: ${kind} at ${String(calls)} calls`,features["transition-loop-detection-v1"],pushback);
 for(const e of events){if(e.type==="loop_guard")continue;current=e;for(const o of observers)o(e);}
 return seen;
}

// One recorded press call: the state its input started from, the state when its own input ended (before the first
// auto-advance B, else its result), its result state, the previous result shown to the model, and its recorded line.
function call(events:readonly RunEvent[],turn:number){
 const state=(seq:number):State=>{const s=events.find(e=>e.seq===seq);if(s?.type!=="state"||!("started"in s))throw new Error(`no state ${String(seq)}`);return s;};
 const tool=events.find(e=>e.type==="tool_call"&&e.turn===turn);
 if(tool?.type!=="tool_call")throw new Error(`no call at T${String(turn)}`);
 const presses=events.filter((e):e is Extract<RunEvent,{type:"button_press"}>=>e.type==="button_press"&&e.tool_call_id===tool.id);
 const result=events.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.id===tool.id);
 const previous=events.filter((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.seq<tool.seq&&!e.is_error&&e.state_seq!==undefined).at(-1);
 if(result?.state_seq===undefined||previous?.state_seq===undefined||presses[0]?.before_state_seq===undefined)throw new Error(`incomplete call T${String(turn)}`);
 const auto=presses[1]?.before_state_seq;
 const start=events.find(e=>e.type==="run_start");if(start?.type!=="run_start")throw new Error("no run_start");
 const off=toolSwitches(featuresOf(start.harness_features));
 const shown=new ShownStates();shown.record(state(previous.state_seq));
 return {before:state(presses[0].before_state_seq),pressed:state(auto??result.state_seq),final:state(result.state_seq),shown,buttons:presses[0].buttons,off,on:{...off,pushback:true},
  line:/^Press result: (.*)$/m.exec(result.text)?.[1],navigation:/^Navigation: .*$/m.exec(result.text)?.[0],auto:auto!==undefined};
}
// The production composition: the inner press line, then (when auto-advance ran) the push-back clause.
function composed(c:ReturnType<typeof call>,on:boolean):string{
 const show=on?c.on:c.off;
 const line=pressResult(c.before,c.pressed,c.buttons,show,c.shown);
 return on&&c.auto?pushbackPressResult(line,c.before,c.pressed,c.final,show):line;
}

describe("audit 1: 54a7 T82 seq 1790, the twin's PushPlayerBackFromRoute moves the player during auto-advance",()=>{
 const c=call(recorded("pushback-twin-54a7.jsonl.gz"),82);
 it("OFF reproduces the recorded false line",()=>{expect(composed(c,false)).toBe(c.line);expect(c.line).toBe("locked (field controls locked in a snapshot; no net movement)");});
 it("ON says the script moved the player, with the tiles",()=>{
  expect(composed(c,true)).toBe("locked (field controls locked in a snapshot; no movement by the press); this call: your press did not move you, then a script moved you (10,1) -> (10,2) while the dialogue advanced");
 });
});

describe("audit 2: 54a7 T92 seq 2014, navigate_to says 'call navigate_to again' while the script undid the walk",()=>{
 const events=recorded("pushback-twin-54a7.jsonl.gz");
 const c=call(events,92);
 const raw={navigation:{unready:true,status:MESSAGE_WAITING,commands:0}};
 const outcome={stop:"field_free" as const,detail:"the conversation closed and field controls are free"};
 it("OFF reproduces the recorded line",()=>{expect(navigationAfter(raw,outcome)).toBe(c.navigation);});
 it("ON names the script's move and drops the advice to call again",()=>{
  const text=navigationAfter(raw,outcome,scriptMove(c.before,c.final,c.on));
  expect(text).toBe("Navigation: a message was open, so navigate_to did not walk; after auto-advance: the conversation closed and field controls are free; a script moved you (10,1) -> (10,2) while the dialogue advanced (navigate_to did not walk there; calling it again walks back into the same script); 0 ordinary button attempts.");
  expect(text).not.toContain("call navigate_to again");
 });
});

describe("audit 3: 54a7 T247 seq 6039, OldaleTown BlockedPath steps the player back inside one press",()=>{
 const c=call(recorded("pushback-oldale-54a7.jsonl.gz"),247);
 it("OFF reproduces the recorded line",()=>{expect(composed(c,false)).toBe("turned left -> right; no net movement");expect(c.line).toBe("turned left -> right; no net movement");});
 it("ON says a script took over",()=>{
  expect(composed(c,true)).toBe("a script took over during your press: you pressed LEFT and now face right on the same tile (1,10), with field controls held by a running script; your press cannot turn you right, so the script turned you or stepped you back between snapshots");
 });
});

describe("audit 4: sh02 Oldale Maniac T1072, T1073, T1080 and the Route 101 twin T142",()=>{
 const maniac=recorded("pushback-maniac-sh02.jsonl.gz");
 it("T1072: the move onto the trigger now says a script took over",()=>{
  const c=call(maniac,1072);
  expect(composed(c,false)).toBe("moved (1,10) -> (0,10)");expect(c.line).toBe("moved (1,10) -> (0,10)");
  expect(composed(c,true)).toBe("moved (1,10) -> (0,10); then a script took over: field controls are held by a running script (no message yet), which may move you");
 });
 it("T1073: the script's walk-back between calls is named before this press",()=>{
  const c=call(maniac,1073);
  expect(composed(c,false)).toBe(c.line);
  expect(composed(c,true)).toBe("a script moved you (0,10) -> (1,10) after your last result, before this press; this press: locked (field controls locked in a snapshot; no net movement)");
 });
 it("T1080: no dialogue at all, the script turned the player back",()=>{
  const c=call(maniac,1080);
  expect(composed(c,false)).toBe("locked (field controls locked in a snapshot; no net movement)");expect(c.line).toBe(composed(c,false));
  expect(composed(c,true)).toMatch(/^a script took over during your press: you pressed LEFT and now face right on the same tile \(1,10\), with field controls held by a running script;/);
 });
 it("T142: the twin's walk-back during auto-advance",()=>{
  const c=call(recorded("pushback-twin-sh02.jsonl.gz"),142);
  expect(composed(c,false)).toBe(c.line);
  expect(composed(c,true)).toBe("locked (field controls locked in a snapshot; no movement by the press); this call: your press did not move you, then a script moved you (11,1) -> (11,2) while the dialogue advanced");
 });
});

describe("audit 5: sh02 T264, LEFT×3 UP×3 logged as six sent while five ran into the message's lock",()=>{
 it("the five steps not taken count as dropped",()=>{
  const c=call(recorded("pushback-birch-sh02.jsonl.gz"),264);
  expect(c.buttons).toEqual(["LEFT","LEFT","LEFT","UP","UP","UP"]);
  expect(ignoredSteps(c.before,c.pressed,c.buttons)).toEqual(["LEFT","LEFT","UP","UP","UP"]);
 });
 it("a batch whose position is unknown drops nothing it cannot prove",()=>{
  const c=call(recorded("pushback-birch-sh02.jsonl.gz"),264);
  expect(ignoredSteps(undefined,c.pressed,c.buttons)).toEqual([]);
  expect(ignoredSteps(c.before,{...c.pressed,position:null} as GameStateSnapshot,c.buttons)).toEqual([]);
 });
});

describe("audit 6: 1623 Mom push-back T85-T304, one START must not recover the loop",()=>{
 const events=recorded("pushback-mom-1623.jsonl.gz");
 it("OFF (today): the START at T145 recovers and the loop runs unguarded until T293",()=>{
  const seen=replay(events,false);
  expect(seen.find(n=>n.phase==="recovered")).toMatchObject({turn:145});
  expect(seen.filter(n=>n.turn>145&&n.turn<293)).toEqual([]);
 });
 it("ON: one episode from T96 that the START does not end; the supervisor keeps briefing; it recovers at a new tile (T305)",()=>{
  const seen=replay(events,true);
  expect(seen.find(n=>n.phase==="warning")).toMatchObject({turn:96,kind:"cycle",message:PUSHBACK_MESSAGE});
  expect(seen.filter(n=>n.phase==="recovered").map(n=>n.turn)).toEqual([305]);
  const briefs=seen.filter(n=>n.phase==="supervisor").map(n=>n.turn);
  const gaps=briefs.slice(1).map((t,i)=>t-(briefs[i]??t));
  expect(Math.max(...gaps)).toBeLessThanOrEqual(12);
  expect(briefs.at(-1)).toBeGreaterThanOrEqual(298);
 });
});

describe("audits 7 and 8: push-back loops the guard never saw",()=>{
 it("54a7 T80-T114 Littleroot twin (navigate_to targets vary between (10,0) and (11,0)): warns at T88",()=>{
  const events=recorded("pushback-twin-54a7.jsonl.gz");
  expect(replay(events,false).filter(n=>n.phase==="warning")).toEqual([]);
  expect(replay(events,true).find(n=>n.phase==="warning")).toMatchObject({turn:88,seq:1927,kind:"cycle",message:PUSHBACK_MESSAGE});
 });
 it("54a7 T247-T343 Oldale BlockedPath (the step-back is never in a snapshot; irregular LEFT / LEFT,LEFT periods): warns at T254",()=>{
  const events=recorded("pushback-oldale-54a7.jsonl.gz");
  expect(replay(events,false).filter(n=>n.phase==="warning")).toEqual([]);
  expect(replay(events,true).find(n=>n.phase==="warning")).toMatchObject({turn:254,seq:6212,kind:"cycle",message:PUSHBACK_MESSAGE});
 });
 it("sh02 T1068-T1086 Oldale Maniac: warns at T1075",()=>{
  const events=recorded("pushback-maniac-sh02.jsonl.gz");
  expect(replay(events,false).filter(n=>n.phase==="warning")).toEqual([]);
  expect(replay(events,true).find(n=>n.phase==="warning")).toMatchObject({turn:1075,seq:18360,kind:"cycle",message:PUSHBACK_MESSAGE});
 });
});
