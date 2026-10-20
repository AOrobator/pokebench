import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";
import {navigationTool,withNavigation} from "./navigation.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {loopSupervisor} from "./play-wiring.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {IN_GAME} from "../test-support/events.js";
import {checkEvent,type RunEvent} from "./events.js";

const COUNT="briefing-repeat-count-v1",HERE="navigate-already-here-v1";

// Run 2026-10-20T03-02-13_qwen36-gpu1_f28d, turns 2201-2585: navigate_to (10,5) on Route 101 while standing on (10,5).
const ev=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"f28d-test",t:"2026-10-20T06:55:10.000-04:00",turn:1,seq,...body});
const route=(seq:number,x=10,y=5)=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"ROUTE101",map_id:[0,16],position:{x,y},facing:"left",field_controls_locked:false,interaction_targets:[]},seq);
const navigate=(b:SupervisorBriefing,seq:number,id:string,x=10,y=5)=>{
 b.observe(ev({type:"tool_call",id,name:"navigate_to",args:{x:10,y:5,map_id:[0,16]}},seq));
 b.observe(route(seq+1,x,y));
 b.observe(ev({type:"tool_result",id,name:"navigate_to",is_error:false,duration_ms:1,text:"Navigation: arrived at requested coordinate; 0 bounded movement actions.",frames:[],state_seq:seq+1},seq+2));
};
const focused=(count:boolean)=>{
 const b=new SupervisorBriefing({...ALL_ON,"supervisor-briefing-v2":true,[COUNT]:count});
 b.observe(route(1,11,5));b.observe(ev({type:"tool_result",id:"first",name:"observe",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:1},2));
 navigate(b,10,"a");for(let i=0;i<4;i++)navigate(b,20+i*10,`n${String(i)}`);
 return b.text("ineffective",2285);
};

describe(COUNT,()=>{
 it("is honored by the production loop-guard briefing factory",()=>{
  for(const on of [false,true]){
   const subscribers:((e:RunEvent)=>void)[]=[];
   const brief=loopSupervisor({...ALL_ON,"loop-guard-supervisor-v1":true,"supervisor-briefing-v2":true,[COUNT]:on},{subscribe:fn=>{subscribers.push(fn);}});
   const feed={observe:(e:RunEvent)=>{for(const fn of subscribers)fn(e);}} as unknown as SupervisorBriefing;
   feed.observe(route(1,11,5));feed.observe(ev({type:"tool_result",id:"first",name:"observe",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:1},2));
   navigate(feed,10,"a");for(let i=0;i<4;i++)navigate(feed,20+i*10,`n${String(i)}`);
   expect(brief?.("ineffective",2285).includes("navigate_to 10,5 ×4 → no change")).toBe(on);
  }
 });
 it("ON: the focused briefing keeps the repeat count the full briefing shows",()=>{
  expect(focused(true)).toContain("- Recent attempts (up to 3): navigate_to 10,5 ×4 → no change; navigate_to 10,5 → moved to 10,5\n");
 });
 it("OFF: the focused briefing is exactly the recorded f28d shape, with no count",()=>{
  expect(focused(false)).toContain("- Recent attempts (up to 3): navigate_to 10,5 → no change; navigate_to 10,5 → moved to 10,5\n");
  expect(focused(false)).not.toContain("×");
 });
 it("ON: repeated presses inside an interface carry their count too; OFF has none",()=>{
  const menu=(seq:number)=>ev({type:"state",...IN_GAME,started:true,screen:"naming",location:"ROUTE101",map_id:[0,16],position:{x:10,y:5},facing:"left",field_controls_locked:true,active_ui:{phase:"naming_editor",selected:"A",ready:true,controls:"",diagnostic:null,value:"",details:{page:"uppercase",column:0,row:0}},naming:{text:"",page:"uppercase",column:0,row:0,key:"A",ready:true}},seq);
  for(const on of [false,true]){
   const b=new SupervisorBriefing({...ALL_ON,"supervisor-briefing-v2":true,[COUNT]:on});
   b.observe(menu(1));b.observe(ev({type:"tool_result",id:"o",name:"observe",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:1},2));
   for(let i=0;i<3;i++){const s=10+i*10,id=`p${String(i)}`;b.observe(ev({type:"tool_call",id,name:"press",args:{buttons:["B"]}},s));b.observe(menu(s+1));b.observe(ev({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:s+1},s+2));}
   const text=b.text("ineffective",5);
   expect(text).toContain("- Open interface: naming editor");expect(text.includes("press B ×3 → latest:")).toBe(on);expect(text).toContain("press B");
  }
 });
});

const tile=(x:number,y:number)=>({x,y,collision:0,behavior:0,elevation:3});
const field:GameStateSnapshot={screen:"overworld",started:true,name:"A",location:"ROUTE101",map_id:[0,16],position:{x:10,y:5},facing:"left",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,navigation_grid:{elevation:3,tiles:[tile(10,5),tile(11,5),tile(10,6)],objects:[],warps:[]}};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
const first=(r:AgentToolResult<unknown>)=>r.content[0]?.type==="text"?r.content[0].text:"";

describe(HERE,()=>{
 const run=async(alreadyHere:boolean|undefined,start=field,goal={x:10,y:5})=>{
  let current=start;const buttons:string[][]=[];
  const tool=navigationTool({...(alreadyHere===undefined?{}:{alreadyHere}),read:()=>Promise.resolve(current),press:(_id,params)=>{buttons.push([...params.buttons]);current={...current,position:{x:10,y:5}};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
  const outcome=await tool.execute("nav",{...goal,map_id:[0,16]});return {buttons,text:first(outcome),outcome};
 };
 it("ON: a goal on the player's own tile says the player is already there and presses nothing",async()=>{
  const on=await run(true);
  expect(on.buttons).toEqual([]);
  expect(on.text).toBe("Navigation: you are already standing on (10,5), the coordinate you asked for, so no movement was needed; 0 ordinary button attempts.");
  expect(on.outcome.details).toMatchObject({navigation:{status:"you are already standing on (10,5), the coordinate you asked for, so no movement was needed",commands:0}});
 });
 it("OFF (and the default): the recorded f28d text",async()=>{
  for(const flag of [false,undefined]){const off=await run(flag);expect(off.buttons).toEqual([]);expect(off.text).toBe("Navigation: arrived at requested coordinate; 0 ordinary button attempts.");}
 });
 it("ON: a walk that moved still says it arrived",async()=>{
  const walked=await run(true,{...field,position:{x:11,y:5}});
  expect(walked.buttons).toEqual([["LEFT"]]);expect(walked.text).toBe("Navigation: arrived at requested coordinate; 1 ordinary button attempts.");
 });
 it("is wired through the production factory",async()=>{
  let current=field;
  const press={name:"press",execute:()=>Promise.reject(new Error("unchecked press")),executeChecked:()=>Promise.reject(new Error("no press expected"))} as unknown as CheckedPressTool;
  const observe={name:"observe",execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
  const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true};
  for(const on of [false,true]){
   current=field;
   const tool=withNavigation([press,observe],{...features,[HERE]:on},{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");
   if(tool===undefined)throw new Error("missing navigate_to");
   const text=first(await tool.execute("nav",{x:10,y:5,map_id:[0,16]}));
   expect(text.includes("already standing on (10,5)")).toBe(on);expect(text.includes("arrived at requested coordinate")).toBe(!on);
  }
 });
});

describe("registration",()=>{
 for(const [id,group,needs] of [[COUNT,"guidance","supervisor-briefing-v2"],[HERE,"guidance","bounded-navigation-v1"]] as const){
  it(`${id} is a default-off switch with a pending experiment and an explainer`,()=>{
   expect(SWITCHABLE_FEATURES).toContain(id);
   expect(featureInfo(id)).toMatchObject({group,needs:null,switchable:true});expect(featureInfo(id).description).toContain(" Off: ");
   const legacy=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
   expect(legacy[id]).toBe(false);expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[id]).toBe(false);
   expect(playHarnessFeatures({...legacy,[needs]:true,[id]:true},null)).toContain(id);expect(playHarnessFeatures({...legacy,[needs]:true,[id]:false},null)).not.toContain(id);
   const raw=JSON.parse(readFileSync(new URL(`../../../experiments/${id}.json`,import.meta.url),"utf8")) as {queuePosition?:number;changedFeature:string};
   expect(raw.queuePosition).toBeUndefined();expect(raw.changedFeature).toBe(id);
   const arms=experimentArms(parseExperiment(raw));expect(SWITCHABLE_FEATURES.filter(f=>arms.incumbent.features[f]!==arms.candidate.features[f])).toEqual([id]);
   expect(readFileSync(new URL(`../../../docs/explainers/${id}.html`,import.meta.url),"utf8")).toContain(id);
  });
 }
});
