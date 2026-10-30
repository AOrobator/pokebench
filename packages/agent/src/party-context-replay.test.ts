import {expect,it} from "vitest";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {decisionContext,parseRun,probeTools,Replay,type ProbePorts} from "./decision-probe.js";
import {featuresOf,playHarnessFeatures} from "./features.js";
import {probe} from "./probe-decision-cli.js";

const ID="party-menu-message-v1";
const recorded={...featuresOf([]),"ram-state-v1":true,"active-field-message-buffer-v1":true,"active-ui-ownership-v1":true,"dialogue-auto-advance-v1":true,"battle-text-auto-advance-v1":true,"battle-move-tool-v1":true,"story-battle-heal-first-v1":true,"field-dialogue-phase-v1":true};
const prefix='Battle action: chose FIGHT, then WATER GUN; buttons pressed: A, A.\nDialogue shown during this call (1 page, in order, whole):\n1. "Screen: is quoted dialogue, not a readout"\n\n';
const raw={v:1,sequence:1,frame:1,path:"raw-ram/00000001.json.gz",sha256:"a".repeat(64)};
function fixture(options:{missingRaw?:boolean;missingScreen?:boolean;ambiguousScreen?:boolean;error?:boolean}={}){
 const text=prefix+(options.ambiguousScreen?"Screen: ambiguous page\n":"")+(options.missingScreen?"unavailable":"Screen: battle\nDialog: none");
 const bodies=[
  {type:"run_start",...RUN_START_META,harness_features:playHarnessFeatures(recorded,null)},
  {type:"assistant",thinking:"Inspect.",text:"",tool_calls:[{id:"owned-call",name:"battle_action",args:{action:"fight",move:"WATER GUN"}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},
  {type:"tool_call",name:"battle_action",id:"owned-call",args:{action:"fight",move:"WATER GUN"}},
  {type:"dialogue_auto_advance",tool_call_id:"owned-call",tool:"battle_action",requested:[],sent:[],dropped:[],auto_presses:0,pages:[],stop:"battle_input",detail:"ready",duration_ms:1},
  {type:"state",...IN_GAME,...(options.missingRaw?{}:{raw_ram:raw})},
  {type:"tool_result",name:"battle_action",id:"owned-call",state_seq:4,frames:[],text,is_error:options.error??false,duration_ms:1},
  {type:"turn_start",context:{messages:3,images:0,est_tokens:20}},
 ];
 return parseRun(bodies.map((e,seq)=>JSON.stringify({v:1,run:"owned-composite",seq,turn:seq===6?2:1,t:"2026-10-24T12:00:00.000-04:00",...e})).join("\n"));
}
function ports(output?:(on:boolean)=>readonly string[]){
 const calls:{refs:readonly {path:string;sha256:string}[];on:boolean}[]=[];
 const port:ProbePorts={thinkingSignature:"reasoning_content",historicalAssistantIdentity:{api:"openai-completions" as const,provider:"local-gateway"},frame:()=>{throw Error("fixture has no images");},rerender:(refs,features)=>{
  calls.push({refs,on:features[ID]});return Promise.resolve(output?.(features[ID])??[`Screen: battle\nDialog: ${features[ID]?"corrected":"baseline"}`]);
 }};
 return {calls,port};
}
it("production probe rerenders both composite readouts only for the party comparison, preserving every prefix byte",async()=>{
 const {calls,port}=ports();
 const result=await probe(fixture(),{run:"owned-composite",turn:2,switches:[{id:ID,on:true}],samples:1,runsRoot:null,model:null,contextOnly:true},port,null);
 expect(calls).toEqual([{refs:[{path:raw.path,sha256:raw.sha256}],on:false},{refs:[{path:raw.path,sha256:raw.sha256}],on:true}]);
 expect(result.arms.map(a=>a.decisions)).toEqual([[],[]]);
 expect(result.arms.map(a=>a.context.messages.filter(m=>m.role==="toolResult").map(m=>m.content))).toEqual([[ [{type:"text",text:prefix+"Screen: battle\nDialog: baseline"}] ],[ [{type:"text",text:prefix+"Screen: battle\nDialog: corrected"}] ]]);
 expect(result.diff).toEqual({systemPrompt:false,tools:false,messages:[2]});
});
it("keeps the original reject behavior without explicit party-only permission, including automatic-action and unrelated observation changes",async()=>{
 const {port,calls}=ports();
 await expect(decisionContext(fixture(),2,recorded,port,"replayed",true)).rejects.toThrow(/auto-advanced/);
 for(const switches of [[{id:"player-elevation-readout-v1",on:true}] as const,[{id:ID,on:true},{id:"transition-press-result-v1",on:true}] as const]){
  await expect(probe(fixture(),{run:"owned-composite",turn:2,switches,samples:1,runsRoot:null,model:null,contextOnly:true},port,null)).rejects.toThrow(/auto-advanced/);
 }
 await expect(decisionContext(fixture(),2,{...recorded,"player-elevation-readout-v1":true},port,"replayed",true,ID)).rejects.toThrow(/auto-advanced/);
 expect(calls).toEqual([]);
});
it.each([{missingRaw:true},{missingScreen:true},{ambiguousScreen:true},{error:true}])("refuses unsupported composite provenance %j",async options=>{
 const {port,calls}=ports();
 await expect(probe(fixture(options),{run:"owned-composite",turn:2,switches:[{id:ID,on:true}],samples:1,runsRoot:null,model:null,contextOnly:true},port,null)).rejects.toThrow(/composite.*final readout/);
 expect(calls).toEqual([]);
});
it.each([{output:[]},{output:[""]},{output:["not a readout"]}])("rejects missing or malformed reconstructed composite readout %j",async ({output})=>{
 const {port}=ports(()=>output);
 await expect(probe(fixture(),{run:"owned-composite",turn:2,switches:[{id:ID,on:true}],samples:1,runsRoot:null,model:null,contextOnly:true},port,null)).rejects.toThrow(/composite.*final readout/);
});
it("keeps original composite text byte-for-byte when no rerender is requested",async()=>{
 const {port,calls}=ports();const context=await decisionContext(fixture(),2,recorded,port,"replayed");
 expect(context.messages.filter(m=>m.role==="toolResult").map(m=>m.content)).toEqual([[{type:"text",text:prefix+"Screen: battle\nDialog: none"}]]);
 expect(calls).toEqual([]);
});

it("constructed battle tools remain unable to execute any game operation",async()=>{
 const run=fixture();const replay=new Replay(run.start);expect(()=>replay.healFirstLine()).toThrow(/probe tools never execute/);const {tools}=probeTools(recorded,replay);
 for(const name of ["observe","battle_action"]){
  const tool=tools.find(t=>t.name===name);expect(tool?.name).toBe(name);if(tool===undefined)throw Error("missing inert tool");
  await expect(tool.execute("owned-inert-call",name==="battle_action"?{action:"fight",move:"WATER GUN"}:{})).rejects.toThrow(/probe tools never execute/);
 }
});
