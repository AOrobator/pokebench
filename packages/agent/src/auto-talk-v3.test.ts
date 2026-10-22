// auto-talk-v3: the 10/22 frontier report found every run that heard MAY's mother ("MAY went out to ROUTE 103") found
// MAY within 3-8 min, against 11.5-68.6 min for the rest; 47c3 left her room at T97 with her last talked to "5 story
// milestones since". auto-talk-v1 only acts on a loop. v3 acts after a quiet stretch on one map instead.
import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {userText} from "../test-support/pi.js";
import {checkEvent,type RunEvent} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {AUTO_TALK_QUIET_TURNS,autoTalkContext} from "./auto-talk.js";

const ID="auto-talk-v3" as const;
const NONE=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const V1:FeatureSet={...NONE,"duplicate-turn-collapse-v1":true,"auto-talk-v1":true};
const V3:FeatureSet={...V1,[ID]:true};
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const person=(local_id:number,name:string,x:number,y:number):Target=>({kind:"object",name,x,y,elevation:3,activation:"A",availability:"live",facing:"down",local_id,destination:null});
// MAY's house 1F as 47c3 stood in it: the mother (object 4) farther away, a never-talked-to person next to the player.
const WOMAN=person(4,"WOMAN_4",2,4),BOY=person(2,"BOY_1",6,5);
const ROOM:GameStateSnapshot={...IN_GAME,map_id:[1,2],location:"LITTLEROOT TOWN MAYS HOUSE 1F",position:{x:6,y:7},facing:"up",field_controls_locked:false,in_battle:false,active_ui:null,interaction_targets:[WOMAN,BOY]};
const BATTLE:GameStateSnapshot={...ROOM,screen:"battle",in_battle:true,active_ui:{phase:"battle_input",selected:"FIGHT",ready:true,controls:"A picks FIGHT",diagnostic:null,value:null}};
type Talk={readonly trigger:string;readonly repeats:number;readonly outcome:string;readonly name:string|null;readonly text:string|null};
let seq=0;
const ev=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-22T12:00:00.000-04:00",turn:1,...body});
const milestone=(name:string):RunEvent=>ev({type:"milestone",name,server_timestamp:1,kind:"story",origin:"observed"});

function rig(features:FeatureSet,start:GameStateSnapshot,breaker:boolean=true){
 let s=start;const calls:string[]=[];const talks:Talk[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:(_id,params)=>{
  calls.push(name);
  if(name==="navigate_to"){const a=params as {x:number;y:number};s={...s,position:{x:a.x,y:a.y}};}
  return Promise.resolve({content:[{type:"text",text:name==="press"?"Hello!":"x"}],details:{state:s}});
 }});
 const quiet={fixedPoint:()=>({turns:0,loop:"none",names:[]}),noTool:()=>({replies:0,loop:"silent:0"})};
 const transform=autoTalkContext(features,{read:()=>Promise.resolve(s)},[tool("navigate_to"),tool("press")],m=>Promise.resolve(m),breaker?quiet as never:null,{subscribe:fn=>{subscribers.push(fn);},recordAutoTalk:b=>{talks.push({trigger:b.trigger,repeats:b.repeats,outcome:b.outcome,name:b.target?.name??null,text:b.text});}});
 let n=0;
 const turn=async():Promise<AgentMessage[]>=>{
  n++;
  const messages:AgentMessage[]=[userText("Play."),{role:"toolResult",toolCallId:`c${String(n)}`,toolName:"press",content:[{type:"text",text:"x"}],isError:false,timestamp:n}];
  return transform(messages);
 };
 const turns=async(k:number):Promise<AgentMessage[]>=>{let out:AgentMessage[]=[];for(let i=0;i<k;i++)out=await turn();return out;};
 return {calls,talks,turn,turns,set:(next:GameStateSnapshot)=>{s=next;},emit:(e:RunEvent)=>{for(const fn of subscribers)fn(e);}};
}
const lastText=(out:readonly AgentMessage[]):string=>{const m=out.at(-1);return m!==undefined&&"role"in m&&m.role==="user"&&Array.isArray(m.content)?m.content.flatMap(p=>p.type==="text"?[p.text]:[]).join(""):"";};

describe("auto-talk-v3",()=>{
 it("OFF: quiet turns with no loop never walk or press",async()=>{
  const r=rig(V1,ROOM);
  await r.turns(AUTO_TALK_QUIET_TURNS*3);
  expect(r.calls).toEqual([]);
  expect(r.talks).toEqual([]);
 });
 it("ON: nothing for 9 quiet turns on the free field; on the 10th the harness talks to the nearest person",async()=>{
  expect(AUTO_TALK_QUIET_TURNS).toBe(10);
  const r=rig(V3,ROOM);
  await r.turns(9);
  expect(r.calls).toEqual([]);
  const out=await r.turn();
  expect(r.calls.at(-1)).toBe("press");
  expect(r.talks).toEqual([{trigger:"quiet_map",repeats:10,outcome:"talked",name:"BOY_1",text:expect.any(String) as string}]);
  expect(lastText(out)).toBe("SUPERVISOR: Your last 10 turns on this map brought no story milestone, so the harness walked you to BOY_1 at (6,5) and pressed A. It has not chosen where to go next; this is what they said.\n\nHello!");
 });
 it("ON: the next talk needs another 10 quiet turns and goes to the next person",async()=>{
  const r=rig(V3,ROOM);
  await r.turns(10);
  await r.turns(9);
  expect(r.talks.length).toBe(1);
  await r.turn();
  expect(r.talks.map(t=>t.name)).toEqual(["BOY_1","WOMAN_4"]);
 });
 it("ON: a story milestone or a new map starts the count over",async()=>{
  const r=rig(V3,ROOM);
  await r.turns(6);
  r.emit(milestone("PLAYER_HOUSE_EXITED"));
  await r.turns(9);
  expect(r.talks).toEqual([]);
  r.set({...ROOM,map_id:[0,9]});
  await r.turns(9);
  expect(r.talks).toEqual([]);
  await r.turn();
  expect(r.talks.length).toBe(1);
 });
 it("ON: a measurement-only or present-at-start milestone does not start the count over",async()=>{
  const r=rig(V3,ROOM);
  await r.turns(6);
  r.emit(milestone("RIVAL_BATTLE_STARTED"));
  r.emit(ev({type:"milestone",name:"STARTER_CHOSEN",server_timestamp:1,kind:"story",origin:"present_at_start"}));
  await r.turns(4);
  expect(r.talks.length).toBe(1);
 });
 it("ON: turns in a battle are not counted and record nothing",async()=>{
  const r=rig(V3,ROOM);
  await r.turns(5);
  r.set(BATTLE);
  await r.turns(20);
  expect(r.talks).toEqual([]);
  expect(r.calls).toEqual([]);
  r.set(ROOM);
  await r.turns(4);
  expect(r.talks).toEqual([]);
  await r.turn();
  expect(r.talks.map(t=>t.outcome)).toEqual(["talked"]);
 });
 it("ON: someone talked to before the latest story milestone comes ahead of a nearer stranger",async()=>{
  const r=rig(V3,ROOM);
  r.emit(ev({type:"auto_talk",trigger:"fixed_point",repeats:8,outcome:"talked",target:{kind:"person",name:"WOMAN_4",character:null,key:"1/2#4",x:2,y:4,map_id:[1,2]},walks:1,tried:1,text:"SUPERVISOR: x"}));
  r.emit(milestone("PLAYER_HOUSE_EXITED"));
  await r.turns(10);
  expect(r.talks.map(t=>t.name)).toEqual(["WOMAN_4"]);
 });
 it("ON: acts without the fixed-point breaker or the duplicate-turn collapse",async()=>{
  const r=rig({...V3,"duplicate-turn-collapse-v1":false},ROOM,false);
  await r.turns(10);
  expect(r.talks.map(t=>t.outcome)).toEqual(["talked"]);
 });
 it("ON: the old loop trigger is replaced",async()=>{
  const subscribers:((e:RunEvent)=>void)[]=[];const talks:string[]=[];
  const loop={fixedPoint:()=>({turns:8,loop:"a",names:["press"]}),noTool:()=>({replies:0,loop:"silent:0"})};
  const tool=(name:string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"x"}],details:{state:ROOM}})});
  const transform=autoTalkContext(V3,{read:()=>Promise.resolve(ROOM)},[tool("navigate_to"),tool("press")],m=>Promise.resolve(m),loop as never,{subscribe:fn=>{subscribers.push(fn);},recordAutoTalk:b=>{talks.push(b.trigger);}});
  await transform([userText("Play.")]);
  expect(talks).toEqual([]);
 });
 it("is registered as a default-off agent-only guard that needs auto-talk-v1",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"auto-talk-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
});
