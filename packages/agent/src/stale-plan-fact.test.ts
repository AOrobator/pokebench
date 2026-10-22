import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
// stale-plan-fact-v1: run 2026-10-21T13-33-54_qwen36-gpu0_ea04 sent byte-identical thinking for 15 turns (md5 bf66221a,
// seq 20494-20844) while the results cycled through four different move-learning prompts. The readouts below are the
// Screen-to-question lines of its results at seq 20504 (Delete a move), 20529 (Stop learning) and 20554 (page).
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import type {CheckedPressTool} from "./game-tools.js";
import {IN_GAME} from "../test-support/events.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {StalePlanFact} from "./stale-plan-fact.js";

const ID="stale-plan-fact-v1" as const;
const CONFIRM="Interface: evolution_move_confirmation; input ready; selected YES; UP/DOWN selects YES or NO; A chooses; B answers NO";
const PAGE="Interface: evolution_move_learning; input ready; A or B advances the waiting move-learning text; inspect the next choice";
const DELETE=`Screen: evolution\nDialog: none\nMenu: evolution_move_confirmation; selected YES\n${CONFIRM}\nTo answer NO, press DOWN, then A. Pressing A now answers YES. B also answers NO.\nThe game asks: "Delete a move to make room for DOUBLE KICK?" YES: the game lists COMBUSKEN's moves so you pick one to forget for DOUBLE KICK. NO or B: the game asks "Stop learning DOUBLE KICK?"`;
const STOP=`Screen: evolution\nDialog: none\nMenu: evolution_move_confirmation; selected YES\n${CONFIRM}\nTo answer NO, press DOWN, then A. Pressing A now answers YES. B also answers NO.\nThe game asks: "Stop learning DOUBLE KICK?" YES: the game says "COMBUSKEN did not learn DOUBLE KICK." and COMBUSKEN keeps the moves it knows. NO or B: the game starts over with "COMBUSKEN is trying to learn DOUBLE KICK."`;
const LEARNING=`Screen: evolution\nDialog: none\nMenu: no selectable menu is open\n${PAGE}\nBag: POKé BALL ×5; GREAT BALL ×1`;
const THINKING="The game asks if I want to delete a move to make room for DOUBLE KICK. I will press B to keep my moves.";
const features=(on:boolean):FeatureSet=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),[ID]:on});
const texts=(r:AgentToolResult<unknown>):string[]=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]);

function rig(on:boolean){
 const subscribers:((e:RunEvent)=>void)[]=[];let seq=0;let next=DELETE;
 const emit=(body:Record<string,unknown>):void=>{const e=checkEvent({v:1,run:"ea04",seq:++seq,t:"2026-10-21T15:21:00.000-04:00",...body});for(const fn of subscribers)fn(e);};
 const result=(text:string):AgentToolResult<unknown>=>({content:[{type:"image",data:"AAAA",mimeType:"image/png"},{type:"text",text}],details:{state:IN_GAME}});
 const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(next))};
 const run=():Promise<AgentToolResult<unknown>>=>Promise.resolve(result(next));
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:run,executeChecked:run} as unknown as CheckedPressTool;
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
 const tools=playGameTools([observe,press],features(on),{read:()=>Promise.resolve(IN_GAME)},recorder);
 const tool=tools.find(t=>t.name==="press");if(tool===undefined)throw new Error("press missing");
 // One turn: the reply's thinking is recorded, then the call runs and its result is recorded as the model will read it.
 const turn=async(n:number,thinking:string,shows:string):Promise<string[]>=>{
  emit({type:"assistant",turn:n,thinking,text:"",tool_calls:[{id:`c${String(n)}`,name:"press",args:{buttons:["B"]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"});
  next=shows;
  const out=await tool.execute(`c${String(n)}`,{buttons:["B"]});
  emit({type:"tool_result",turn:n,id:`c${String(n)}`,name:"press",is_error:false,duration_ms:1,text:texts(out).join("\n"),frames:[]});
  return texts(out);
 };
 emit({type:"tool_result",turn:546,id:"c546",name:"press",is_error:false,duration_ms:1,text:DELETE,frames:[]});
 return {turn};
}

describe("stale-plan-fact-v1",()=>{
 it("appends the fact when the same thinking meets a different interface, with the game's question",async()=>{
  const r=rig(true);
  expect(await r.turn(547,THINKING,STOP)).toEqual([STOP]);
  expect((await r.turn(548,THINKING,LEARNING)).at(-1)).toBe(`Your reasoning repeats turn 547 word for word; the game now shows: ${PAGE}.`);
  expect((await r.turn(549,THINKING,STOP)).at(-1)).toBe(`Your reasoning repeats turn 547 word for word; the game now shows: ${CONFIRM}. The game asks: "Stop learning DOUBLE KICK?"`);
 });
 it("adds nothing when the same thinking meets the same screen and question, or the thinking changed",async()=>{
  const r=rig(true);
  await r.turn(547,THINKING,STOP);
  expect(await r.turn(548,THINKING,DELETE)).toEqual([DELETE]);
  expect(await r.turn(549,`${THINKING} `,LEARNING)).toEqual([LEARNING]);
  expect(await r.turn(550,"",STOP)).toEqual([STOP]);
  expect(await r.turn(551,"",LEARNING)).toEqual([LEARNING]);
 });
 it("OFF adds nothing",async()=>{
  const r=rig(false);
  await r.turn(547,THINKING,STOP);
  expect(await r.turn(548,THINKING,LEARNING)).toEqual([LEARNING]);
 });
 it("needs an Interface line in the result",()=>{
  const fact=new StalePlanFact();
  fact.observe(checkEvent({v:1,run:"r",seq:1,t:"2026-10-21T15:21:00.000-04:00",turn:1,type:"assistant",thinking:THINKING,text:"",tool_calls:[],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"}));
  fact.observe(checkEvent({v:1,run:"r",seq:2,t:"2026-10-21T15:21:00.000-04:00",turn:2,type:"assistant",thinking:THINKING,text:"",tool_calls:[],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:null,stop_reason:"toolUse"}));
  expect(fact.fact("Recall: nothing found")).toBeNull();
  expect(fact.fact(LEARNING)).toBe(`Your reasoning repeats turn 1 word for word; the game now shows: ${PAGE}.`);
 });
 it("is a default-off agent-only guard, recorded last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES.at(-31)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-11)).toBe(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
