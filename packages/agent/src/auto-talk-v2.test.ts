// auto-talk-v2: in 2026-10-21T01-16-23_glm53-mac_e9ee auto-talk walked to Route 102's Calvin after he was beaten
// (auto_talk seq 10359). With the switch on, a trainer the readout shows as defeated is not a target.
import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "@mariozechner/pi-ai";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {userText} from "../test-support/pi.js";
import {checkEvent,type RunEvent} from "./events.js";
import {SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {AUTO_TALK_TURNS,autoTalkContext} from "./auto-talk.js";

const NONE=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const V1:FeatureSet={...NONE,"fixed-point-breaker-v1":true,"auto-talk-v1":true};
const V2:FeatureSet={...V1,"auto-talk-v2":true};
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const person=(local_id:number,name:string,x:number,y:number):Target=>({kind:"object",name,x,y,elevation:3,activation:"A",availability:"live",facing:"down",local_id,destination:null});
// Route 102 as e9ee stood on it: CALVIN (object 5, YOUNGSTER) beaten and next to the player, a BOY one tile farther.
const TARGETS=[person(5,"YOUNGSTER",15,10),person(3,"BOY_1",12,10)];

async function firstTarget(features:FeatureSet,defeated:boolean):Promise<string|null> {
 let s:GameStateSnapshot={...IN_GAME,map_id:[0,17],location:"ROUTE102",position:{x:14,y:10},facing:"up",field_controls_locked:false,interaction_targets:TARGETS,in_battle:false,heal_before_trainers:{trainers:[{local_id:5,defeated,x:15,y:10,graphics_id:1,sprite_kind:"YOUNGSTER",trainer_id:1}],move_power:[],last_heal:null,home:null,mom_heals:false}};
 const tool=(name:string,run:(args:Record<string,unknown>)=>string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:(_id,params)=>Promise.resolve({content:[{type:"text",text:run(params as Record<string,unknown>)}],details:{state:s}})});
 const tools=[tool("navigate_to",a=>{s={...s,position:{x:Number(a["x"]),y:Number(a["y"])}};return "Navigation: arrived.";}),tool("press",()=>"pressed"),tool("observe",()=>"observe")];
 const subscribers:((e:RunEvent)=>void)[]=[];const talks:{target:{name:string}|null}[]=[];
 const transform=autoTalkContext(features,{read:()=>Promise.resolve(s)},tools,m=>Promise.resolve(m),{fixedPoint:()=>({turns:AUTO_TALK_TURNS,loop:"a",names:["navigate_to"]}),noTool:()=>({replies:0,loop:"silent:0"})} as never,{subscribe:fn=>{subscribers.push(fn);},recordAutoTalk:b=>{talks.push(b);}});
 const st=checkEvent({v:1,run:"r",seq:1,t:"2026-10-21T03:28:00.000-04:00",type:"state",turn:1,...IN_GAME,map_id:[0,17],position:{x:14,y:10},facing:"up",interaction_targets:TARGETS});
 for(const fn of subscribers)fn(st);
 const messages:AgentMessage[]=[userText("Play."),{role:"toolResult",toolCallId:"c0",toolName:"observe",content:[{type:"text",text:"Route 102"}],isError:false,timestamp:0}];
 await transform(messages);
 return talks[0]?.target?.name ?? null;
}

describe("auto-talk-v2",()=>{
 it("OFF (auto-talk-v1 alone): a beaten trainer is still a target, as e9ee's Calvin was",async()=>{
  expect(await firstTarget(V1,true)).toBe("YOUNGSTER");
 });
 it("ON: a beaten trainer is skipped and the next person is talked to",async()=>{
  expect(await firstTarget(V2,true)).toBe("BOY_1");
 });
 it("an unbeaten trainer stays excluded either way",async()=>{
  expect(await firstTarget(V1,false)).toBe("BOY_1");
  expect(await firstTarget(V2,false)).toBe("BOY_1");
 });
});
