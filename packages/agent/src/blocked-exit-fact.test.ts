import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {BlockedExits} from "./blocked-exit-fact.js";
import {playGameTools} from "./play-wiring.js";
import type {RunEvent} from "./events.js";
import {recorded,recordedFeatures,stateAt,type RecordedState} from "../test-support/battle-facts.js";

const ID="blocked-exit-fact-v1";
const LIVE="battle-facts-54a7.jsonl.gz";
const OTHERS="Other exits from this map: NORTH -> ROUTE103 (map 0/18); SOUTH -> ROUTE101 (map 0/16); (5,7) -> OLDALE TOWN HOUSE1 (map 2/0); (15,16) -> OLDALE TOWN HOUSE2 (map 2/1); (6,16) -> OLDALE TOWN POKEMON CENTER 1F (map 2/2); (14,6) -> OLDALE TOWN MART (map 2/4).";
const line=(turn:number)=>`Blocked exit: WEST -> ROUTE102 (map 0/17). When you last tried it, at turn ${String(turn)}, the game ran a script at (0,10) and kept you on this map. This exit is blocked by a script that runs while a value the game saves still has the setting that script checks for; it has that setting now, so this exit stays blocked for now. ${OTHERS}`;

type Result=Extract<RunEvent,{type:"tool_result"}>;
// Every game tool result of the recorded run with the line BlockedExits gives it (the replay path:
// begin at the tool call, settle at the result with the result's own state and text).
function replay(events:readonly RunEvent[],features:FeatureSet,edit:(s:RecordedState)=>RecordedState=s=>s):Map<number,{result:Result;line:string|null}>{
 const exits=new BlockedExits(features);
 const out=new Map<number,{result:Result;line:string|null}>();
 for(const e of events){
  exits.observe(e);
  if(e.type==="tool_call")exits.begin(e.id,e.name,e.args);
  if(e.type==="tool_result"&&e.state_seq!==undefined)out.set(e.turn,{result:e,line:exits.settle(e.id,edit(stateAt(events,e.state_seq)),e.text)});
 }
 return out;
}

describe("blocked-exit-fact-v1 on live run 54a7 at the Oldale west exit (OldaleTown_EventScript_BlockedPath)",()=>{
 const events=recorded(LIVE),features=recordedFeatures(events,{[ID]:true});
 const results=replay(events,features);
 it("nothing before the first refusal: arriving next to the exit at T246 is not a refusal",()=>{
  expect(results.get(246)?.line).toBeNull();
  for(const [turn,r] of results)if(turn<247)expect(r.line).toBeNull();
 });
 it("T247: LEFT from (1,10) ran the script and left the player at (1,10): the line names the exit and the other exits",()=>{
  expect(results.get(247)?.line).toBe(line(247));
 });
 it("T248 (seq 6071): the result that showed the MANIAC's pages gets the line; the call began inside the script, so it is not a new refusal",()=>{
  expect(results.get(248)?.result.seq).toBe(6071);
  expect(results.get(248)?.line).toBe(line(247));
 });
 it("T249: the next LEFT,LEFT from free controls is the latest refusal",()=>{
  expect(results.get(249)?.line).toBe(line(249));
 });
 it("no line once the condition stops matching in that result's RAM",()=>{
  const flipped=replay(events,features,s=>s.seq===6085?{...s,world_context:s.world_context==null?s.world_context:{...s.world_context,triggers:s.world_context.triggers.map(t=>({...t,current_value:1,condition_met:false}))}}:s);
  expect(flipped.get(249)?.line).toBeNull();
 });
 it("no line two tiles away from the trigger",()=>{
  const moved=replay(events,features,s=>s.seq===6085?{...s,position:{x:3,y:10}}:s);
  expect(moved.get(249)?.line).toBeNull();
 });
 it("a warp name the readout never showed keeps the bare map id",()=>{
  const exits=new BlockedExits(features);
  for(const e of events){if(e.seq>6085)break;exits.observe(e);if(e.type==="tool_call")exits.begin(e.id,e.name,e.args);if(e.type==="tool_result"&&e.state_seq!==undefined&&e.seq<6086)exits.settle(e.id,stateAt(events,e.state_seq),e.text);}
  exits.begin("probe","observe",{});
  expect(exits.settle("probe",stateAt(events,6085),"")).toContain("(5,7) -> map 2/0;");
 });
 it("without world destinations no map connection is named; without world targets no warp is",()=>{
  const r1=replay(events,{...features,"world-destinations-v1":false});
  expect(r1.get(249)?.line).toContain("Other exits from this map: (5,7) -> OLDALE TOWN HOUSE1 (map 2/0);");
  const r2=replay(events,{...features,"world-targets-v1":false});
  expect(r2.get(249)?.line?.endsWith("Other exits from this map: NORTH -> ROUTE103 (map 0/18); SOUTH -> ROUTE101 (map 0/16).")).toBe(true);
 });
 it("measured over the whole fixture: shown only on OLDALE TOWN results next to (0,10), from T247 on",()=>{
  const shown=[...results.values()].filter(r=>r.line!==null);
  expect(shown.length).toBeGreaterThan(100);
  for(const r of shown){
   const s=stateAt(events,r.result.state_seq??-1);
   expect(s.location).toBe("OLDALE TOWN");
   expect(Math.abs((s.position?.x??99)-0)+Math.abs((s.position?.y??99)-10)).toBeLessThanOrEqual(1);
  }
 });
});

describe("BlockedExits rules on synthetic states",()=>{
 const F:FeatureSet={...ALL_ON};
 let seq=1000;
 const trig=(x:number,y:number,met:boolean,variable=0x4051)=>({x,y,elevation:3,variable,required_value:0,current_value:met?0:1,condition_met:met,script_pointer:0x081E903F});
 const base=(fields:Record<string,unknown>)=>{seq++;return {v:1,run:"r",seq,t:"t",type:"state",turn:10,started:true,screen:"overworld",in_battle:false,location:"TOWN",map_id:[0,10],position:{x:1,y:10},facing:"left",field_controls_locked:false,
  world_context:{objects:[],triggers:[trig(0,10,true)],dialogue:null},interaction_targets:[{kind:"warp",x:5,y:7,elevation:0,activation:"movement",availability:"conditional",facing:null,local_id:null,destination:[2,0,0],name:"Warp to map 2/0"}],
  topology:{width:20,height:20,connections:[{direction:"WEST",offset:0,destination:[0,17],destination_name:"ROUTE102",edges:[{x:0,y:10},{x:0,y:11}]}]},...fields} as unknown as RecordedState;};
 function call(exits:BlockedExits,id:string,name:string,args:Record<string,unknown>,before:RecordedState,during:readonly RecordedState[],after:RecordedState):string|null{
  exits.begin(id,name,args);
  exits.observe(before);
  exits.observe({v:1,run:"r",seq:++seq,t:"t",type:"button_press",turn:10,tool_call_id:id,button:"LEFT",before_state_seq:before.seq} as unknown as RunEvent);
  for(const s of during)exits.observe(s);
  return exits.settle(id,after,"");
 }
 it("navigate_to onto the trigger tile that ends next to it counts; a trigger with no readable variable never does",()=>{
  const a=new BlockedExits(F);
  expect(call(a,"n1","navigate_to",{x:0,y:10},base({position:{x:6,y:10}}),[base({field_controls_locked:true})],base({}))).toContain("Blocked exit: WEST -> ROUTE102 (map 0/17).");
  const b=new BlockedExits(F);
  const constant=()=>({world_context:{objects:[],triggers:[trig(0,10,true,0x0003)],dialogue:null}});
  expect(call(b,"n2","navigate_to",{x:0,y:10},base({position:{x:6,y:10},...constant()}),[base({field_controls_locked:true,...constant()})],base(constant()))).toBeNull();
 });
 it("no script during the call, a map change, ending on the trigger or pressing away from it is no refusal",()=>{
  const cases:[Record<string,unknown>,Record<string,unknown>[],Record<string,unknown>,string[]][]=[
   [{},[{}],{},["LEFT"]],
   [{},[{field_controls_locked:true,map_id:[0,17]}],{},["LEFT"]],
   [{},[{field_controls_locked:true}],{position:{x:0,y:10}},["LEFT"]],
   [{},[{field_controls_locked:true}],{},["RIGHT"]],
  ];
  for(const [before,during,after,buttons] of cases){
   const exits=new BlockedExits(F);
   expect(call(exits,"p","press",{buttons},base(before),during.map(base),base(after))).toBeNull();
  }
 });
 it("a trigger next to a warp tile refuses that warp; the warp is then not among the other exits",()=>{
  const exits=new BlockedExits(F);
  const near=()=>({position:{x:5,y:9},world_context:{objects:[],triggers:[trig(5,8,true)],dialogue:null},topology:null});
  const text=call(exits,"w","press",{buttons:["UP"]},base(near()),[base({...near(),world_context:{objects:[],triggers:[trig(5,8,true)],dialogue:"Wait!"}})],base(near()));
  expect(text).toBe("Blocked exit: (5,7) -> map 2/0. When you last tried it, at turn 10, the game ran a script at (5,8) and kept you on this map. This exit is blocked by a script that runs while a value the game saves still has the setting that script checks for; it has that setting now, so this exit stays blocked for now. Other exits from this map: none listed.");
 });
 it("a trigger that is not on or next to an exit is never a blocked exit",()=>{
  const exits=new BlockedExits(F);
  const inner=()=>({position:{x:9,y:9},world_context:{objects:[],triggers:[trig(9,8,true)],dialogue:null}});
  expect(call(exits,"i","press",{buttons:["UP"]},base(inner()),[base({...inner(),field_controls_locked:true})],base(inner()))).toBeNull();
 });
 it("results outside the overworld and calls never begun get nothing",()=>{
  const exits=new BlockedExits(F);
  expect(exits.settle("never",base({}),"")).toBeNull();
  expect(call(exits,"b","press",{buttons:["LEFT"]},base({}),[base({field_controls_locked:true})],base({screen:"battle",in_battle:true}))).toBeNull();
 });
});

describe("blocked-exit-fact-v1 through playGameTools",()=>{
 const events=recorded(LIVE);
 const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
 // A base press tool that replays the recorded call: the events inside it reach the recorder, and the
 // result carries the recorded readout and after state (recorded only after the tool returns).
 async function run(on:boolean,turn:number):Promise<{texts:string[];same:boolean}>{
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");}};
  const emit=(e:RunEvent)=>{for(const o of observers)o(e);};
  const calls=events.filter((e):e is Extract<RunEvent,{type:"tool_call"}>=>e.type==="tool_call");
  const press:AgentTool={name:"press",label:"Press",description:"d",parameters:{} as AgentTool["parameters"],execute:(id)=>{
   const result=events.find((e):e is Result=>e.type==="tool_result"&&e.id===id);
   const call=calls.find(c=>c.id===id);
   if(result===undefined||call===undefined)throw new Error("unknown call");
   for(const e of events)if(e.seq>call.seq&&e.seq<(result.state_seq??result.seq))emit(e);
   return Promise.resolve({content:[{type:"text",text:result.text}],details:{state:stateAt(events,result.state_seq??-1)}});
  }};
  const features:FeatureSet={...recordedFeatures(events,{[ID]:on}),"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"navigate-first-prompt-v1":false,"bounded-navigation-v1":false};
  const tools=playGameTools([press],features,{read:()=>Promise.reject(new Error("unused"))},recorder);
  const wrapped=tools.find(t=>t.name==="press");
  if(wrapped===undefined)throw new Error("no press");
  const texts:string[]=[];
  for(const e of events){
   if(e.turn>turn)break;
   if(e.type==="tool_call"&&e.name==="press"&&e.turn>=245){emit(e);texts.push(text(await wrapped.execute(e.id,e.args)));const r=events.find(x=>x.type==="tool_result"&&x.id===e.id);if(r!==undefined){emit(stateAt(events,(r as Result).state_seq??-1));emit(r);}}
   else if(e.turn<245)emit(e);
  }
  return {texts,same:wrapped===press};
 }
 it("ON appends the line as its own text part at T247; OFF leaves the press tool untouched",async()=>{
  const on=await run(true,247),off=await run(false,247);
  expect(on.texts.at(-1)?.endsWith(`\n${line(247)}`)).toBe(true);
  expect(off.same).toBe(true);
  expect(off.texts.at(-1)).not.toContain("Blocked exit");
 });
});

describe("blocked-exit-fact-v1 registry",()=>{
 it("is an observation switch that needs coordinate-script-conditions-v1, default off",()=>{
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"coordinate-script-conditions-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(normalizeFeatures({...older,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(dependencyProblems({...ALL_ON,"coordinate-script-conditions-v1":false})).toContain(`${ID} needs coordinate-script-conditions-v1`);
 });
});
