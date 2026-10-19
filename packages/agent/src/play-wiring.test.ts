import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {expect,it,vi} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {contextTools,loopSupervisor,stallStop,textOnlySupervisor} from "./play-wiring.js";
import {RunControl,STALL_STOP_MS} from "./run-control.js";
import {Governor} from "./harness.js";
import {type FeatureSet} from "./features.js";
import {parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playTools} from "./play-config.js";
import {checkEvent,type RunEvent} from "./events.js";
import {DOUBLE_WINDOW,WINDOW} from "./harness.js";
import {featureInfo,stateOnlyProblems} from "./features.js";

const NEW=["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","milestone-stall-stop-v1","character-presence-v1","navigation-refusal-reasons-v1","transition-press-result-v1","stall-briefing-v1","battle-details-v2","dialogue-context-kept-v1","disproved-beliefs-v1","same-plan-breaker-v1","loop-guard-screen-v1","battle-effective-damage-v1"] as const;
const OFF:FeatureSet={...ALL_ON,"cache-aligned-window-v1":false,"navigation-evidence-memory-v1":false,...Object.fromEntries(NEW.map(id=>[id,false]))};
function recorder(){
 const subscribers:((e:RunEvent)=>void)[]=[];const delivered:string[]=[];
 return {subscribers,delivered,api:{subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>{delivered.push("navigation");},recordLedgerContext:()=>{delivered.push("ledger");},recordMilestoneHint:()=>{delivered.push("hint");},recordBeliefLedger:()=>{delivered.push("beliefs");}}};
}
const base=(messages:AgentMessage[])=>Promise.resolve(messages);

it("adds no tool, subscriber or context when every memory switch is off",async()=>{
 const r=recorder();const wired=contextTools(OFF,r.api,base);
 expect(wired.tools).toEqual([]);expect(r.subscribers).toHaveLength(0);
 expect(await wired.transformContext([])).toEqual([]);
 expect(loopSupervisor(OFF,r.api)).toBeUndefined();expect(r.subscribers).toHaveLength(0);
});

it("wires each switch's tool, matching the recorded tool list, and chains both pinned contexts",async()=>{
 const on={...OFF,"navigation-evidence-memory-v1":true,"dialogue-log-v1":true,"instruction-ledger-v1":true};
 const r=recorder();const wired=contextTools(on,r.api,base);
 expect(wired.tools.map(t=>t.name)).toEqual(playTools(on).filter(name=>["remember_destination","recall_dialogue","note_contradiction","get_next_milestone"].includes(name)));
 const out=await wired.transformContext([]);
 expect(r.delivered).toEqual(["ledger","navigation"]);
 expect(out.map(m=>JSON.stringify(m)).join()).toContain("INSTRUCTION LEDGER");
 expect(out.map(m=>JSON.stringify(m)).join()).toContain("NAVIGATION EVIDENCE MEMORY");
 const brief=loopSupervisor({...OFF,"loop-guard-supervisor-v1":true},r.api);
 r.subscribers.at(-1)?.(checkEvent({v:1,run:"w",t:"2026-10-14T12:00:00.000-04:00",turn:1,seq:1,type:"turn_start",context:{messages:1,images:0,est_tokens:10}}));
 expect(brief?.("cycle",3)).toContain("SUPERVISOR");
});

it("reads v2 presets written before these switches as all OFF",()=>{
 const features=Object.fromEntries(Object.entries({...ALL_ON,"cache-aligned-window-v1":false,"state-only-decisions-v1":false}).filter(([id])=>!(NEW as readonly string[]).includes(id)));
 const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features});
 for(const id of NEW)expect(presetFeatures(preset)[id]).toBe(false);
});

it("hands the play loop the incumbent window unless double-context-window-v1 is on",()=>{
 const r=recorder();
 expect(contextTools(OFF,r.api,base).window).toBe(WINDOW);
 expect(contextTools({...OFF,"double-context-window-v1":true},r.api,base).window).toBe(DOUBLE_WINDOW);
 expect(featureInfo("double-context-window-v1")).toMatchObject({group:"guidance",needs:null,switchable:true});
 expect(featureInfo("double-context-window-v1").description).toContain(" Off: ");
 expect(stateOnlyProblems({...ALL_ON,"cache-aligned-window-v1":false,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires double-context-window-v1 OFF");
 const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:Object.fromEntries(Object.entries({...ALL_ON,"cache-aligned-window-v1":false,"state-only-decisions-v1":false}).filter(([id])=>id!=="double-context-window-v1"))});
 expect(presetFeatures(preset)["double-context-window-v1"]).toBe(false);
});

it("sends text-only replies back to the model only while fresh-retry-v1 is off",async()=>{
 const textOnly:AgentMessage={role:"assistant",content:[{type:"thinking",thinking:"Let me press B to"}],api:"openai-completions",provider:"p",model:"m",usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:0};
 const nudge:AgentMessage={role:"user",content:"Keep playing",timestamp:0};
 const task:AgentMessage={role:"user",content:"Play.",timestamp:0};
 expect(await contextTools(OFF,recorder().api,base).transformContext([task,textOnly,nudge])).toEqual([task,textOnly,nudge]);
 const on={...OFF,"fresh-retry-v1":true,"navigation-evidence-memory-v1":true};const r=recorder();
 const out=await contextTools(on,r.api,base).transformContext([task,textOnly,nudge]);
 expect(out.some(m=>m.role==="assistant")).toBe(false);
 expect(out).toContainEqual(nudge);
 expect(r.delivered).toEqual(["navigation"]);
 expect(stateOnlyProblems({...ALL_ON,"cache-aligned-window-v1":false,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires fresh-retry-v1 OFF");
});

it("ends a run as stalled after ten minutes without a new milestone only while milestone-stall-stop-v1 is on",()=>{
 vi.useFakeTimers();
 try{
  let elapsed=0;
  const aborted=vi.fn();
  const governor=new Governor({limits:{maxTurns:300,maxWallMs:45*60_000,failureLimit:3},retry:()=>undefined,abort:aborted,now:()=>elapsed,startedAt:0});
  const control=new RunControl({record:()=>undefined,freeze:()=>Promise.resolve(),end:reason=>{governor.abort(reason);},now:()=>elapsed});
  const step=(ms:number):void=>{elapsed+=ms;vi.advanceTimersByTime(ms);};
  const off=recorder();
  expect(stallStop(OFF,off.api,control,()=>elapsed,()=>{governor.abort("stalled");})).toBeNull();
  expect(off.subscribers).toHaveLength(0);
  expect(stallStop({...ALL_ON,"cache-aligned-window-v1":false,"milestone-stall-stop-v1":false},off.api,control,()=>elapsed,()=>{governor.abort("stalled");})).toBeNull();
  const on=recorder();
  const stop=stallStop({...OFF,"milestone-stall-stop-v1":true},on.api,control,()=>elapsed,()=>{governor.abort("stalled");});
  expect(stop).not.toBeNull();expect(on.subscribers).toHaveLength(1);
  const milestone=(seq:number,origin:"observed"|"present_at_start"):RunEvent=>checkEvent({v:1,run:"w",t:"2026-10-15T12:00:00.000-04:00",turn:1,seq,type:"milestone",name:"NEW_GAME_CREATED",server_timestamp:0,origin});
  step(8*60_000);
  on.subscribers[0]?.(milestone(1,"present_at_start"));
  on.subscribers[0]?.(milestone(2,"observed"));
  step(STALL_STOP_MS-1);
  expect(governor.stopReason).toBeNull();
  step(1);
  expect(governor.stopReason).toBe("stalled");
  expect(aborted).toHaveBeenCalledOnce();
  stop?.clear();
 }finally{vi.useRealTimers();}
});

it("text-only-supervisor-v1 wires a recorded supervisor note only when on",()=>{
 const subscribers:((e:RunEvent)=>void)[]=[];const recorded:[number,number,number,string][]=[];
 const api={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},textOnlySupervisor:(replies:number,note:number,limit:number,text:string)=>{recorded.push([replies,note,limit,text]);}};
 expect(textOnlySupervisor({...ALL_ON,"cache-aligned-window-v1":false,"text-only-supervisor-v1":false},api)).toBeUndefined();expect(subscribers).toHaveLength(0);
 const note=textOnlySupervisor(ALL_ON,api);if(note===undefined)throw new Error("missing wiring");
 expect(subscribers).toHaveLength(1);
 const text=note(3,1);
 expect(text).toMatch(/^SUPERVISOR: Your last 3 replies called no tool/);
 expect(text).toContain("Where you are:");
 expect(text).toContain("note 1 of 3");
 expect(recorded).toEqual([[3,1,3,text]]);
});
