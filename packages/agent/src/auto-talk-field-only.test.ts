// auto-talk-field-only-v1: since 10/20 auto-talk "fired" 318 times while the field was not free (evolution 157,
// battle 67, field yes/no 65, shop 22), each a not_free auto_talk event, and once sent a SUPERVISOR note into a battle.
// the operator 2026-10-22: "firing auto talk during a battle is a bug that needs to be fixed".
import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {userText} from "../test-support/pi.js";
import type {RunEvent} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {autoTalkContext} from "./auto-talk.js";

const ID="auto-talk-field-only-v1" as const;
const NONE=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const BASE:FeatureSet={...NONE,"duplicate-turn-collapse-v1":true,"auto-talk-v1":true};
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const BOY:Target={kind:"object",name:"BOY_1",x:9,y:9,elevation:3,activation:"A",availability:"live",facing:"down",local_id:3,destination:null};
const FIELD:GameStateSnapshot={...IN_GAME,map_id:[0,17],location:"ROUTE102",position:{x:7,y:9},facing:"right",field_controls_locked:false,in_battle:false,active_ui:null,interaction_targets:[BOY]};
const BATTLE:GameStateSnapshot={...FIELD,screen:"battle",in_battle:true,active_ui:{phase:"battle_input",selected:"FIGHT",ready:true,controls:"A picks FIGHT",diagnostic:null,value:null}};
// A post-battle evolution decision keeps the battle flag set (gMain.inBattle) with its own interface ready.
const EVOLUTION:GameStateSnapshot={...FIELD,screen:"evolution",in_battle:true,active_ui:{phase:"evolution_decision",selected:null,ready:true,controls:"Evolution is waiting for choose_evolution: evolve or cancel.",diagnostic:null,value:null}};
const YES_NO:GameStateSnapshot={...FIELD,active_ui:{phase:"field_yes_no",selected:"YES",ready:true,controls:"UP/DOWN selects",diagnostic:null,value:null}};
type Talk={readonly outcome:string;readonly text:string|null};

function rig(features:FeatureSet,start:GameStateSnapshot){
 let s=start;const calls:string[]=[];const talks:Talk[]=[];const subscribers:((e:RunEvent)=>void)[]=[];let walked=():void=>undefined;
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:(_id,params)=>{
  calls.push(name);
  if(name==="navigate_to"){const a=params as {x:number;y:number};s={...s,position:{x:a.x,y:a.y}};walked();}
  return Promise.resolve({content:[{type:"text",text:name==="press"?"BOY: Hi!":"x"}],details:{state:s}});
 }});
 const transform=autoTalkContext(features,{read:()=>Promise.resolve(s)},[tool("navigate_to"),tool("press")],m=>Promise.resolve(m),{fixedPoint:()=>({turns:8,loop:"a",names:["battle_action"]}),noTool:()=>({replies:0,loop:"silent:0"})} as never,{subscribe:fn=>{subscribers.push(fn);},recordAutoTalk:b=>{talks.push({outcome:b.outcome,text:b.text});}});
 const messages:AgentMessage[]=[userText("Play."),{role:"toolResult",toolCallId:"c1",toolName:"battle_action",content:[{type:"text",text:"x"}],isError:false,timestamp:0}];
 return {calls,talks,messages,send:()=>transform([...messages]),set:(next:GameStateSnapshot)=>{s=next;},onWalk:(fn:()=>void)=>{walked=fn;}};
}

describe("auto-talk-field-only-v1",()=>{
 it("OFF: a loop during a battle records a not_free auto_talk on every request",async()=>{
  const r=rig(BASE,BATTLE);
  await r.send();await r.send();
  expect(r.talks).toEqual([{outcome:"not_free",text:null},{outcome:"not_free",text:null}]);
 });
 it("OFF with field-ownership-feedback-v1: a SUPERVISOR note goes into the battle",async()=>{
  const r=rig({...BASE,"field-ownership-feedback-v1":true},BATTLE);
  const out=await r.send();
  expect(out.length).toBe(r.messages.length+1);
  expect(r.talks[0]?.text).toContain("the game is showing the battle input");
 });
 it("ON: nothing during a battle (no event, no message, no press), then it talks once the field is free",async()=>{
  for(const ownership of [false,true]){
   const r=rig({...BASE,[ID]:true,"field-ownership-feedback-v1":ownership},BATTLE);
   expect(await r.send()).toEqual(r.messages);
   expect(await r.send()).toEqual(r.messages);
   expect(r.talks).toEqual([]);
   expect(r.calls).toEqual([]);
   r.set(FIELD);
   const out=await r.send();
   expect(r.talks.map(t=>t.outcome)).toEqual(["talked"]);
   expect(out.length).toBe(r.messages.length+1);
  }
 });
 it("ON: a battle the field screen still shows (in_battle) is silent too",async()=>{
  const r=rig({...BASE,[ID]:true,"field-ownership-feedback-v1":true},{...FIELD,in_battle:true});
  expect(await r.send()).toEqual(r.messages);
  expect(r.talks).toEqual([]);
 });
 it("ON: an overworld interface records no not_free no-ops; field-ownership-feedback-v1 keeps its one note",async()=>{
  const quiet=rig({...BASE,[ID]:true},YES_NO);
  await quiet.send();await quiet.send();
  expect(quiet.talks).toEqual([]);
  const noted=rig({...BASE,[ID]:true,"field-ownership-feedback-v1":true},YES_NO);
  const out=await noted.send();
  expect(noted.talks.map(t=>t.outcome)).toEqual(["not_free"]);
  expect(noted.talks[0]?.text).toContain("the game is showing the field yes no");
  expect(out.length).toBe(noted.messages.length+1);
  await noted.send();
  expect(noted.talks.length).toBe(1);
 });
 it("ON: a post-battle evolution decision is not the battle: field-ownership-feedback-v1 keeps its one note",async()=>{
  const r=rig({...BASE,[ID]:true,"field-ownership-feedback-v1":true},EVOLUTION);
  const out=await r.send();
  expect(r.talks.map(t=>t.outcome)).toEqual(["not_free"]);
  expect(r.talks[0]?.text).toContain("the game is showing the evolution decision (screen evolution)");
  expect(out.length).toBe(r.messages.length+1);
  await r.send();
  expect(r.talks.length).toBe(1);
  expect(r.calls).toEqual([]);
 });
 it("ON: a walk a wild battle interrupts is still recorded with its target",async()=>{
  const r=rig({...BASE,[ID]:true},FIELD);
  r.onWalk(()=>{r.set(BATTLE);});
  await r.send();
  expect(r.talks).toEqual([{outcome:"not_free",text:null}]);
  expect(r.calls).toEqual(["navigate_to"]);
 });
 it("is registered as a default-off agent-only guard that needs auto-talk-v1",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"auto-talk-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
