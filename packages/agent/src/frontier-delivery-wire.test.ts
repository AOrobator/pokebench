import {mkdtempSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {expect,it,vi} from "vitest";
import {Type} from "typebox";
import type {AgentTool,StreamFn} from "@mariozechner/pi-agent-core";
import {createAssistantMessageEventStream,type Message,type Model} from "@mariozechner/pi-ai";
import {assistant,toolCall,userText} from "../test-support/pi.js";
import {IN_GAME,RUN_START_META} from "../test-support/events.js";
import {FrameStore} from "./frames.js";
import {Governor,piLoop,play} from "./harness.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {checkEvent,type RunEvent} from "./events.js";
import {featuresOf,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {playGameTools} from "./play-wiring.js";
import {toolSwitches} from "./play-config.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {pressTool,observeTool} from "./game-tools.js";
import type {StridePlan} from "./stride.js";

const model:Model<"openai-completions">={id:"synthetic-transport",name:"synthetic-transport",api:"openai-completions",provider:"fixture",baseUrl:"http://127.0.0.1:1",reasoning:false,input:["text","image"],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:65536,maxTokens:100};
const text=(r:{content:readonly {type:string;text?:string}[]})=>r.content.flatMap(c=>c.type==="text"?[c.text??""]:[]).join("\n");
function recording(state:()=>GameStateSnapshot,label:string){
 const root=mkdtempSync(join(tmpdir(),`frontier-${label}-`)),log=RunLog.create(root,`synthetic-${label}`);
 const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(state())}});
 return {root,log,recorder};
}
async function deliver(r:ReturnType<typeof recording>,tools:AgentTool[],features:FeatureSet,name:string,args:Record<string,unknown>,expected:readonly string[]){
 await r.recorder.start({...RUN_START_META,harness_features:SWITCHABLE_FEATURES.filter(id=>features[id]),tools:tools.map(t=>t.name),system_prompt:"Synthetic pinned-pi delivery proof; no model endpoint or emulator."});
 const governor=new Governor({limits:{maxTurns:2,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
 let decisions=0,delivered="";
 const streamFn:StreamFn=(_model,context)=>{
  decisions++;
  if(decisions===2){delivered=context.messages.filter(m=>m.role==="toolResult").map(text).join("\n");for(const piece of expected)expect(delivered).toContain(piece);}
  const message=decisions===1?assistant({toolCalls:[toolCall("fixture-call",name,args)],stopReason:"toolUse"}):assistant({text:"fixture complete"});
  const stream=createAssistantMessageEventStream();stream.push({type:"done",reason:message.stopReason==="toolUse"?"toolUse":"stop",message});return stream;
 };
 const loop=piLoop({systemPrompt:"Synthetic new-treatment delivery proof",tools,base:{model,convertToLlm:messages=>messages as Message[]},governor,transformContext:r.recorder.transformContext,emit:r.recorder.emit,streamFn,signal:new AbortController().signal});
 expect(await play(userText("Fixture"),governor,loop)).toBe("budget");r.recorder.end("budget");
 const events=readFileSync(r.log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
 const result=events.find(e=>e.type==="tool_result");if(result?.type!=="tool_result")throw new Error("missing durable result");
 expect(decisions).toBe(2);expect(result.text).toBe(delivered);for(const piece of expected)expect(result.text).toContain(piece);
 console.log(`Synthetic frontier ${name} delivery: ${r.log.eventsPath}`);
 return {events,delivered,result,root:r.root};
}

it("delivers production checked stride receipt to the next pinned-pi decision and records exactly the same text",async()=>{
 const tiles=Array.from({length:5},(_,x)=>({x,y:0,collision:0,behavior:0,elevation:3}));
 let current:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[0,9],position:{x:0,y:0},navigation_grid:{elevation:3,tiles,objects:[],warps:[]},world_context:null,running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:1,callback2:2,diagnostic:null,raw_hex:null}};
 let plan:StridePlan|undefined;
 const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAACYklEQVR4nO3OAQnAMAADsNqYjwm4f1U3USiMQAQk537wjMwHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFP07k6LPv/wpiQAAAABJRU5ErkJggg==","base64");
 const fetchFn=vi.fn<typeof fetch>((input,init)=>{
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown={status:"success"};
  if(init?.method==="POST"&&url.endsWith("/pokebench/stride")){plan=JSON.parse(typeof init.body==="string"?init.body:"null") as StridePlan;current={...current,position:plan.path.at(-1)??plan.origin};}
  if(url.endsWith("/pokebench/state"))body=current;
  else if(url.endsWith("/pokebench/observation"))body={state:current,state_text:"Synthetic plain corridor",screenshot_base64:png.toString("base64")};
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.includes("/pokebench/stride/")&&plan!==undefined)body={...plan,automatic_running:false,completed:plan.path.length,frames:20,reason:"completed",stopped:true};
  return Promise.resolve(new Response(JSON.stringify(body)));
 });
 const features={...featuresOf([]),"rejected-movement-stride-v1":true,"navigation-tool-use-guard-v1":true,"safe-navigation-strides-v1":true,"bounded-navigation-v1":true,"live-map-v1":true,"ram-state-v1":true};
 const r=recording(()=>current,"stride-delivery"),press=pressTool("http://fixture",{beforePress:(...args)=>{r.recorder.buttonPress(...args);},afterPress:()=>Promise.resolve()},fetchFn,{now:()=>0,sleep:()=>Promise.resolve()},toolSwitches(features));
 const out=await deliver(r,playGameTools([observeTool("http://fixture",fetchFn,toolSwitches(features)),press],features,{read:()=>Promise.resolve(current)},r.recorder),features,"press",{buttons:["RIGHT","RIGHT","RIGHT","UP"]},['"submitted":["RIGHT","RIGHT","RIGHT"]','"dropped":["UP"]','"completed":3']);
 const presses=out.events.filter(e=>e.type==="button_press");expect(presses).toHaveLength(1);expect(presses[0]?.buttons).toEqual(["RIGHT","RIGHT","RIGHT"]);
 expect(out.events.some(e=>e.type==="state"&&"position"in e&&e.position?.x===3)).toBe(true);
});

it("delivers recorded leader-loss comparison to the next pinned-pi decision",async()=>{
 const historical=gunzipSync(readFileSync(new URL("./fixtures/training-fd95.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(line=>JSON.parse(line) as RunEvent);
 const field=historical.find(e=>e.seq===24150);if(field?.type!=="state"||!("started"in field))throw new Error("missing fd95 gym field");
 const fields=Object.fromEntries(Object.entries(field).filter(([key])=>!["v","run","seq","t","type","turn","heal_before_trainers"].includes(key)));
 // Recorded fd95 party/history; explicitly synthetic dangerous-HP input for delivery, not a new recorded gameplay outcome.
 const current=parseGameState({...IN_GAME,...fields,field_controls_locked:false,resources:{pc_items:null,storage:null,berry_trees:[],planted_berries:null,diagnostics:[],script_pc:null,script_mode:null,script_status:null,selected_tree_id:null,berry_script_owner:null,...field.resources},party:field.party.map((p,i)=>({...p,...(i===0?{hp:3,max_hp:33}:{}),moves:null}))});
 const features={...featuresOf([]),"leader-loss-comparison-v1":true};
 const r=recording(()=>current,"loss-heal-delivery"),subscribers:((e:RunEvent)=>void)[]=[];
 const subscribe=r.recorder.subscribe.bind(r.recorder);r.recorder.subscribe=fn=>{subscribers.push(fn);subscribe(fn);};
 const observe:AgentTool={name:"observe",label:"Observe",description:"recorded fixture observation",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Synthetic low-HP variant of recorded fd95 gym field"}],details:{state:current}})};
 const tools=playGameTools([observe],features,{read:()=>Promise.resolve(current)},r.recorder);
 for(const e of historical)if(e.seq<=24150)for(const subscriber of subscribers)subscriber(e);
 const out=await deliver(r,tools,features,"observe",{},["Last observed loss to GYM LEADER ROXANNE","EXP: unchanged","moves: unknown","Damage attribution: unknown"]);
 expect(out.events.filter(e=>e.type==="button_press"||e.type==="native_action")).toEqual([]);
});

it("delivers one production coherent-healing warning and its exact durable text to the next pinned-pi decision",async()=>{
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {results:{seq:number;state:unknown}[]};
 const row=fixture.results.find(r=>r.seq===14882);if(row===undefined)throw new Error("missing b300 gym field");
 const recorded=parseGameState(row.state),current={...recorded,party:recorded.party.map((p,i)=>i===0?{...p,hp:3,max_hp:33}:p)};
 const places:unknown=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8"));
 const features={...featuresOf([]),"coherent-healing-feedback-v1":true,"low-hp-trainer-warning-v1":true,"heal-before-trainers-v1":true,"heal-before-trainers-v2":true,"gym-heal-warning-v1":true};
 const r=recording(()=>current,"heal-delivery");
 const observe:AgentTool={name:"observe",label:"Observe",description:"recorded fixture observation",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Synthetic3/33HP variant of recorded b300 gym field"}],details:{state:current}})};
 const out=await deliver(r,playGameTools([observe],features,{read:()=>Promise.resolve(current),places:()=>Promise.resolve(places)},r.recorder),features,"observe",{},["below half","3/33","HP alone does not establish whether you will win."]);
 const warnings=out.events.filter(e=>e.type==="gym_heal_warning"||e.type==="heal_before_trainers_warning"||e.type==="story_battle_warning"||e.type==="low_hp_trainer_warning");
 expect(warnings).toHaveLength(1);expect(out.delivered).toContain(warnings[0]?.text??"missing warning");
 expect(out.events.filter(e=>e.type==="button_press"||e.type==="native_action")).toEqual([]);
});
