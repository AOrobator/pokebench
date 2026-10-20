import type {AgentMessage,AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "@mariozechner/pi-ai";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {userText} from "../test-support/pi.js";
import {checkEvent,type EventBody,type RunEvent} from "./events.js";
import {ALL_ON,SWITCHABLE_FEATURES,featureInfo,type FeatureSet} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import type {GameStateSnapshot} from "./game-state.js";
import {AUTO_TALK_REPLIES,AUTO_TALK_TURNS,autoTalkContext} from "./auto-talk.js";
import {StoryCharacterGate} from "./stall-gate.js";

const NONE=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const ON:FeatureSet={...NONE,"fixed-point-breaker-v1":true,"auto-talk-v1":true};
type Talk=Omit<Extract<RunEvent,{type:"auto_talk"}>,"v"|"run"|"seq"|"t"|"turn"|"type">;
type Target=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
const person=(local_id:number,name:string,x:number,y:number):Target=>({kind:"object",name,x,y,elevation:3,activation:"A",availability:"live",facing:"down",local_id,destination:null});
const sign=(x:number,y:number):Target=>({kind:"background",name:"Sign text \"ROUTE 103 | ↓ OLDALE TOWN\"",x,y,elevation:0,activation:"A",availability:"live",facing:null,local_id:null,destination:null});
const LINE="Story characters here: MAY at 10,3. Not on this map: PROF. BIRCH.";

// A small Route 103: navigate_to walks straight to any tile not in `walls`; press A answers whoever the player faces.
function world(targets:Target[],options:{walls?:readonly string[];battle?:boolean;encounter?:boolean;trainers?:{local_id:number;defeated:boolean}[]}={}){
 let s:GameStateSnapshot={...IN_GAME,map_id:[0,18],location:"ROUTE103",position:{x:14,y:10},facing:"up",field_controls_locked:false,interaction_targets:targets,in_battle:options.battle===true,...(options.trainers===undefined?{}:{heal_before_trainers:{trainers:options.trainers.map(t=>({...t,x:0,y:0,graphics_id:1,sprite_kind:null,trainer_id:1})),move_power:[],last_heal:null,home:null,mom_heals:false}})};
 const calls:string[]=[];
 const walls=new Set(options.walls??[]);
 const STEP:Record<string,[number,number]>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
 const tool=(name:string,run:(args:Record<string,unknown>)=>string):AgentTool=>({name,label:name,description:name,parameters:Type.Object({}),execute:(_id,params)=>{const text=run(params as Record<string,unknown>);calls.push(`${name} ${JSON.stringify(params)}`);return Promise.resolve({content:[{type:"image",data:"AAAA",mimeType:"image/png"},{type:"text",text}],details:{}});}});
 const tools=[tool("navigate_to",a=>{const x=Number(a["x"]),y=Number(a["y"]);if(walls.has(`${String(x)},${String(y)}`))return "Navigation: no route.";s={...s,position:{x,y},in_battle:options.encounter===true};return "Navigation: arrived.";}),
  tool("press",a=>{const b=(a["buttons"] as string[])[0]??"";if(b!=="A"){s={...s,facing:b.toLowerCase()};return `pressed ${b}`;}const [dx,dy]=STEP[s.facing??"up"]??[0,0];const p=s.position??{x:0,y:0};const t=targets.find(t=>t.x===p.x+dx&&t.y===p.y+dy);return `pressed A\nDialogue shown during this call (1 page, in order, whole):\n1. "${t?.name??"nothing"} says hi"`;})];
 return {tools,calls,state:{read:()=>Promise.resolve(s)}};
}
function rig(targets:Target[],options:Parameters<typeof world>[1]={},features:FeatureSet=ON){
 const w=world(targets,options);
 const subscribers:((e:RunEvent)=>void)[]=[];const talks:Talk[]=[];
 let fixed={turns:0,loop:"a",names:["navigate_to"] as readonly string[]},silent={replies:0,loop:"silent:0"};
 const transform=autoTalkContext(features,w.state,w.tools,m=>Promise.resolve(m),{fixedPoint:()=>fixed,noTool:()=>silent} as never,{subscribe:fn=>{subscribers.push(fn);},recordAutoTalk:b=>{talks.push(b);}});
 let seq=0;
 const emit=(body:EventBody):void=>{const e=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T03:40:00.000-04:00",...body});for(const fn of subscribers)fn(e);};
 // The readout the model last saw: MAY placed at (10,3) on this map.
 const st=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-20T03:40:00.000-04:00",type:"state",turn:1,...IN_GAME,map_id:[0,18],position:{x:14,y:10},facing:"up",interaction_targets:targets});
 for(const fn of subscribers)fn(st);
 emit({type:"tool_result",turn:1,id:"c0",name:"observe",is_error:false,duration_ms:1,text:LINE,frames:[],state_seq:st.seq});
 const messages:AgentMessage[]=[userText("Play."),{role:"toolResult",toolCallId:"c0",toolName:"observe",content:[{type:"text",text:LINE}],isError:false,timestamp:0}];
 return {...w,talks,emit,messages,send:(m:AgentMessage[]=messages)=>transform([...m]),loop:(turns:number,loop="a")=>{fixed={...fixed,turns,loop};},silent:(replies:number,loop="silent:1")=>{silent={replies,loop};}};
}
const last=(out:readonly AgentMessage[]):string=>{const m=out.at(-1);return m!==undefined&&"role"in m&&m.role==="user"&&Array.isArray(m.content)?m.content.flatMap(p=>p.type==="text"?[p.text]:[]).join(""):"";};

describe("auto-talk-v1 (the fixed-point breaker's stage 3)",()=>{
 it("is a default-on guard after positive-supervisor-v1 that needs no switch, so presets that omit it keep stage 3",()=>{
  expect(featureInfo("auto-talk-v1")).toMatchObject({group:"guard",needs:null,switchable:true,title:"AUTO-TALK"});
  expect(featureInfo("auto-talk-v1").description).toContain(" Off: the breaker's stages 1 and 2 still act; the harness never walks or presses on its own.");
  expect(SWITCHABLE_FEATURES.indexOf("auto-talk-v1")).toBe(SWITCHABLE_FEATURES.indexOf("positive-supervisor-v1")+1);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!=="auto-talk-v1")) as Omit<FeatureSet,"auto-talk-v1">;
  expect(normalizeFeatures(older)["auto-talk-v1"]).toBe(true);
  expect(normalizeFeatures({...older,"auto-talk-v1":false})["auto-talk-v1"]).toBe(false);
 });
 it("is the base transform when either switch is off",()=>{
  const base=(m:AgentMessage[])=>Promise.resolve(m);
  const none={read:()=>Promise.reject(new Error("no"))};
  const rec={subscribe:()=>undefined,recordAutoTalk:()=>undefined};
  expect(autoTalkContext(NONE,none,[],base,null,rec)).toBe(base);
  expect(autoTalkContext({...ON,"auto-talk-v1":false},none,[],base,{fixedPoint:()=>({turns:9,loop:"a",names:[]}),noTool:()=>({replies:0,loop:"s"})} as never,rec)).toBe(base);
  expect(autoTalkContext({...ON,"fixed-point-breaker-v1":false},none,[],base,null,rec)).toBe(base);
 });
 it("does nothing before the 8th identical turn, then walks next to MAY, faces her, presses A and ends the request with what she said",async()=>{
  const r=rig([person(2,"RIVAL_MAY_NORMAL",10,3),person(3,"BOY_1",13,10)]);
  r.loop(AUTO_TALK_TURNS-1);
  expect(await r.send()).toEqual(r.messages);
  expect(r.calls).toEqual([]);
  r.loop(AUTO_TALK_TURNS);
  const out=await r.send();
  expect(r.calls).toEqual(['navigate_to {"x":10,"y":4,"map_id":[0,18]}','press {"buttons":["A"]}']);
  expect(last(out)).toBe("SUPERVISOR: Your last 8 turns made the same call and the game state stayed the same, so the harness walked you to MAY at (10,3) and pressed A. It has not chosen where to go next; this is what they said.\n\npressed A\nDialogue shown during this call (1 page, in order, whole):\n1. \"RIVAL_MAY_NORMAL says hi\"");
  expect(out.at(-1)).toMatchObject({content:[{type:"image"},{type:"text"}]});
  expect(r.talks).toEqual([{trigger:"fixed_point",repeats:8,outcome:"talked",target:{kind:"story_character",name:"MAY",character:"MAY",key:"0/18#2",x:10,y:3,map_id:[0,18]},walks:1,tried:1,text:last(out)}]);
 });
 it("acts once per loop and keeps its result in the request until a newer game result arrives",async()=>{
  const r=rig([person(2,"RIVAL_MAY_NORMAL",10,3)]);
  r.loop(9);
  const first=await r.send();
  r.loop(12);
  const again=await r.send();
  expect(r.calls).toHaveLength(2);
  expect(again.at(-1)).toBe(first.at(-1));
  const later=await r.send([...r.messages,{role:"toolResult",toolCallId:"c9",toolName:"press",content:[{type:"text",text:"pressed B"}],isError:false,timestamp:0}]);
  expect(last(later)).toBe("");
  r.loop(8,"b");
  await r.send();
  expect(r.talks.map(t=>t.outcome)).toEqual(["talked","none"]);
 });
 it("prefers story characters, then other people, then signs, and never item balls or unbeaten trainers",async()=>{
  const targets=[sign(13,9),person(4,"ITEM_BALL",14,9),person(5,"YOUNGSTER",15,10),person(3,"BOY_1",12,10),person(2,"RIVAL_MAY_NORMAL",10,3)];
  const r=rig(targets,{trainers:[{local_id:5,defeated:false}]});
  const order:string[]=[];
  for(const loop of ["a","b","c","d"]){r.loop(8,loop);await r.send();order.push(r.talks.at(-1)?.target?.name??"none");}
  expect(order).toEqual(["MAY","BOY_1",targets[0]?.name,"none"]);
  expect(r.calls.filter(c=>c.startsWith("navigate_to")).at(-1)).toBe('navigate_to {"x":13,"y":10,"map_id":[0,18]}');
  expect(r.calls).toContain('press {"buttons":["UP"]}');
 });
 it("tries the next side and then the next person when a walk goes nowhere, and reports unreachable when none works",async()=>{
  const blocked=rig([person(2,"RIVAL_MAY_NORMAL",10,3),person(3,"BOY_1",12,10)],{walls:["10,4","11,3","9,3","10,2"]});
  blocked.loop(8);
  await blocked.send();
  expect(blocked.talks.at(-1)).toMatchObject({outcome:"talked",target:{name:"BOY_1"},tried:2});
  const nobody=rig([person(2,"RIVAL_MAY_NORMAL",10,3)],{walls:["10,4","11,3","9,3","10,2"]});
  nobody.loop(8);
  expect(await nobody.send()).toEqual(nobody.messages);
  expect(nobody.talks).toEqual([{trigger:"fixed_point",repeats:8,outcome:"unreachable",target:{kind:"story_character",name:"MAY",character:"MAY",key:"0/18#2",x:10,y:3,map_id:[0,18]},walks:4,tried:1,text:null}]);
 });
 it("waits for the free field, and fires after 3 replies with no tool call",async()=>{
  const battle=rig([person(2,"RIVAL_MAY_NORMAL",10,3)],{battle:true});
  battle.loop(8);
  await battle.send();
  expect(battle.talks.map(t=>t.outcome)).toEqual(["not_free"]);
  expect(battle.calls).toEqual([]);
  await battle.send();
  expect(battle.talks.map(t=>t.outcome)).toEqual(["not_free","not_free"]);
  const silent=rig([person(2,"RIVAL_MAY_NORMAL",10,3)]);
  silent.silent(AUTO_TALK_REPLIES-1);
  await silent.send();
  silent.silent(AUTO_TALK_REPLIES);
  const out=await silent.send();
  expect(last(out)).toContain("SUPERVISOR: Your last 3 replies called no tool, so the harness walked you to MAY at (10,3)");
 });
 it("stops when a wild battle starts on the way, and stays on the starting map",async()=>{
  const r=rig([person(2,"RIVAL_MAY_NORMAL",10,3),person(3,"BOY_1",12,10)],{encounter:true});
  r.loop(8);
  expect(await r.send()).toEqual(r.messages);
  expect(r.talks).toEqual([{trigger:"fixed_point",repeats:8,outcome:"not_free",target:{kind:"story_character",name:"MAY",character:"MAY",key:"0/18#2",x:10,y:3,map_id:[0,18]},walks:1,tried:1,text:null}]);
  expect(r.calls.filter(c=>c.startsWith("press"))).toEqual([]);
 });
 it("teaches the stall gate that the person was talked to",()=>{
  const gate=new StoryCharacterGate({recordStallGate:()=>undefined});
  gate.observe(checkEvent({v:1,run:"r",seq:1,t:"2026-10-20T03:40:00.000-04:00",type:"auto_talk",turn:1,trigger:"fixed_point",repeats:8,outcome:"talked",target:{kind:"story_character",name:"MAY",character:"MAY",key:"0/18#2",x:10,y:3,map_id:[0,18]},walks:1,tried:1,text:"x"}));
  expect(gate.talkedTo("0/18#2")).toBe(true);
  gate.observe(checkEvent({v:1,run:"r",seq:2,t:"2026-10-20T03:40:00.000-04:00",type:"auto_talk",turn:1,trigger:"fixed_point",repeats:8,outcome:"none",target:null,walks:0,tried:0,text:null}));
  expect(gate.talkedTo("0/18#3")).toBe(false);
 });
});
