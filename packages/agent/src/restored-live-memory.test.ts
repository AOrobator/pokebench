import {mkdtempSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it} from "vitest";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {userText} from "../test-support/pi.js";
import {checkEvent,type RunEvent} from "./events.js";
import {FrameStore} from "./frames.js";
import {Governor,attachLoopGuard} from "./harness.js";
import {flagFeatures} from "./play-preset.js";
import {contextTools,loopSupervisor} from "./play-wiring.js";
import {withRun,type RunHost,type RunPlan} from "./run.js";
const id="restored-memory-run-v1";
const event=(seq:number,body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"original",seq,t:"2026-10-23T12:00:00.000-04:00",turn:1,...body});
async function exercise(enabled:boolean){
 const original=[event(0,{type:"run_start",turn:0,...RUN_START_META}),event(1,{type:"state",...IN_GAME,location:"RUSTBORO CITY GYM",map_id:[11,3],position:{x:5,y:19}}),event(2,{type:"dialogue_auto_advance",tool_call_id:"old",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,stop:"field_free",detail:"fixture",duration_ms:1,pages:[{text:"DAD: Challenge ROXANNE.",speaker:"DAD",speaker_source:"name_prefix",map:"RUSTBORO CITY GYM",map_id:[11,3],state_seq:1,position:null}]}),event(3,{type:"tool_call",id:"old",name:"observe",args:{}}),event(4,{type:"tool_result",id:"old",name:"observe",is_error:false,duration_ms:1,text:"Location: RUSTBORO CITY GYM\nStory: gym trainers defeated",frames:[],state_seq:1})];
 const prefix=original.map(e=>JSON.stringify(e)).join("\n")+"\n",runsRoot=mkdtempSync(join(tmpdir(),"restored-live-memory-"));
 const plan:RunPlan={runsRoot,runId:"continued",port:8123,model:RUN_START_META.model,sampling:RUN_START_META.sampling,systemPrompt:"Play.",tools:[],startState:{kind:"save_state",path:"external.state",sha1:"a".repeat(40)},harnessFeatures:enabled?[id]:[],budgets:{max_turns:10},piVersion:RUN_START_META.pi_version,continuation:{prior:original,sourceTurn:2,sourceRun:"original",prefix}};
 const host:RunHost={serverHealthy:()=>Promise.resolve(false),launchServer:()=>Promise.resolve({serverDir:"owned",stop:()=>Promise.resolve()}),harness:()=>RUN_START_META.harness,vendorPin:()=>RUN_START_META.vendor_pin,milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve({...IN_GAME,location:"RUSTBORO CITY DEVON CORP 1F",map_id:[11,0],position:{x:5,y:8}})}};
 const observed:RunEvent[]=[],controls:RunEvent[]=[],late:RunEvent[]=[],lateControl:RunEvent[]=[];let before="",after="",warningAfter:string|null=null;
 await withRun(plan,host,new FrameStore(runsRoot),async recorder=>{
  const features={...flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false}),"loop-guard-supervisor-v1":true,"observed-instructions-v1":true};
  const supervisor=loopSupervisor(features,recorder),governor=new Governor({limits:{maxTurns:10,maxWallMs:10000,failureLimit:3},retry:()=>{},abort:()=>{},now:()=>0});
  const detector=attachLoopGuard(recorder,governor,undefined,"enforced",false,supervisor);
  const context=contextTools(features,recorder,recorder.transformContext);
  recorder.subscribe(e=>{if(recorder.isRestoring())observed.push(e);},false,false,true);
  recorder.subscribe(e=>{if(recorder.isRestoring())controls.push(e);});
  await recorder.restoreHistory(async()=>{await context.transformContext([]);});
  recorder.subscribe(e=>{late.push(e);},true,true,true);
  recorder.subscribe(e=>{lateControl.push(e);},true,true);
  expect(detector.stall("map_cycle",calls=>supervisor?.("cycle",calls)??"missing supervisor",[1])).toBe(true);
  before=detector.context()??"";
  await context.transformContext([userText(before)]);
  await recorder.emit({type:"tool_execution_start",toolCallId:"fresh",toolName:"observe",args:{}});
  await recorder.emit({type:"tool_execution_end",toolCallId:"fresh",toolName:"observe",isError:false,result:{content:[{type:"text",text:"Location: RUSTBORO CITY DEVON CORP 1F\nStory: gym trainers defeated"}],details:{state:{...IN_GAME,location:"RUSTBORO CITY DEVON CORP 1F",map_id:[11,0],position:{x:5,y:8}}}}});
  warningAfter=detector.context();
  const sent=await context.transformContext(warningAfter===null?[]:[userText(warningAfter)]);
  after=JSON.stringify(sent);return "budget";
 });
 return {original,prefix,observed,controls,late,lateControl,before,after,warningAfter,recordedPrefix:readFileSync(join(runsRoot,"continued/restoration-prefix.jsonl"),"utf8"),events:readFileSync(join(runsRoot,"continued/events.jsonl"),"utf8").trim().split("\n").map((line)=>checkEvent(JSON.parse(line)))};
}
it("production ON restoration accepts current observations and expires old supervisor while retaining historical dialogue",async()=>{
 const h=await exercise(true);expect(h.before).toContain("5,19");expect(h.warningAfter).toBeNull();expect(h.after).toContain('current: {\\"result_event\\":');expect(h.after).toContain('\\"location\\":\\"RUSTBORO CITY DEVON CORP 1F\\"');expect(h.after).toContain("DAD: Challenge ROXANNE.");expect(h.observed.map(e=>e.run)).toEqual(h.original.map(()=>"continued"));for(const [i,e]of h.controls.entries())expect(e).toBe(h.original[i]);expect(h.late[0]?.run).toBe("continued");expect(h.lateControl[0]).toBe(h.original[1]);expect(h.recordedPrefix).toBe(h.prefix);expect(h.original.every(e=>e.run==="original")).toBe(true);expect(h.events[0]).toMatchObject({restoration:{source_run:"original",source_turn:2,prefix_last_seq:4}});
});
it("OFF preserves original historical envelopes and stale-context behavior exactly",async()=>{
 const h=await exercise(false);expect(h.warningAfter).toBe(h.before);expect(h.late[0]).toBe(h.original[1]);expect(h.lateControl[0]).toBe(h.original[1]);expect(h.after).not.toContain('\\"location\\":\\"RUSTBORO CITY DEVON CORP 1F\\"');expect(h.recordedPrefix).toBe(h.prefix);for(const [i,e]of h.observed.entries())expect(e).toBe(h.original[i]);
});
