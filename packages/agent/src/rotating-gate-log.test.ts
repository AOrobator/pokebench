import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {ALL_ON,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures} from "./features.js";
import type {FeatureSet} from "./features.js";
import type {Button,RunEvent} from "./events.js";
import type {GameStateSnapshot} from "./game-state.js";
import {toolSwitches} from "./play-config.js";
import {contextTools} from "./play-wiring.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {GateLog,gateLogContext,gateTurnLines} from "./rotating-gate-log.js";
import {GateStepTrail,gatePressNote,gateTurns} from "./rotating-gate-press.js";

const REASONS="rotating-gate-turn-reasons-v1",LOG="rotating-gate-push-log-v1";
const COMPASS=["north","east","south","west"] as const;
type Compass=(typeof COMPASS)[number];
const edgeOf=(x:number,y:number,direction:number,length:number):readonly [number,number,number,number]=>direction===0?[x-1,y-1-length,x,y-1-length]:direction===1?[x+length,y-1,x+length,y]:direction===2?[x-1,y+length,x,y+length]:[x-1-length,y-1,x-1-length,y];
// Fortree's real shapes: arm slots north, east, south, west as [short, long] from sRotatingGate_ArmLayout.
const T1=[1,0,1,0,1,0,0,0],L4=[1,1,1,1,0,0,0,0];
const gate=(id:number,x:number,y:number,shape:readonly number[],orientation:number)=>{
 const group=`gate:${String(id)}`;
 const arms=shape.flatMap((present,slot)=>{
  if(present===0)return [];
  const side=(Math.floor(slot/2)+orientation)%4,edge=edgeOf(x,y,side,slot%2),direction:Compass=COMPASS[side]??"north";
  return [{kind:"rotating_gate" as const,x:edge[0],y:edge[1],state:"arm",direction,group,orientation,edge}];
 });
 return [{kind:"rotating_gate" as const,x,y,state:"pivot",group,orientation},...arms];
};
const WALLS=new Set(["1,5"]);
const rows=Array.from({length:25},(_,y)=>Array.from({length:20},(_,x)=>WALLS.has(`${String(x)},${String(y)}`)?"1000":"0300").join(""));
const FORTREE:readonly [number,number]=[12,1];
const room=(gate3:number,gate7:number,position={x:2,y:5}):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,location:"FORTREE CITY GYM",map_id:FORTREE,position,facing:"down",map_grid:{width:20,height:25,elevation:3,rows,objects:[],warps:[]},map_observation:{version:1,map_id:[12,1],origin:[0,0],width:20,height:25,elements:[...gate(3,2,6,T1,gate3),...gate(7,6,3,L4,gate7)],unavailable:[]}} as unknown as GameStateSnapshot);
const city=():GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,location:"FORTREE CITY",map_id:[0,4],position:{x:22,y:12},facing:"up"});
const stateEvent=(s:GameStateSnapshot,seq:number,turn:number):RunEvent=>({...s,v:1,run:"r",seq,t:"2026-11-05T12:00:00.000-05:00",type:"state",turn} as unknown as RunEvent);
const press=(button:Button,seq:number,turn:number,before:number):RunEvent=>({v:1,run:"r",seq,t:"2026-11-05T12:00:00.000-05:00",type:"button_press",turn,tool_call_id:"c",before_state_seq:before,buttons:[button],hold_frames:10,release_frames:8} as unknown as RunEvent);

describe("registry",()=>{
 it.each([[REASONS,"rotating-gate-press-feedback-v1"],[LOG,REASONS]])("%s registers default off and needs %s",(id,needs)=>{
  expect(SWITCHABLE_FEATURES).toContain(id);
  expect(featureInfo(id as typeof REASONS).needs).toBe(needs);
  expect(featureInfo(id as typeof REASONS).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null)).toContain(id);
  const {[id as typeof REASONS]:enabled,...old}=ALL_ON;expect(enabled).toBe(true);expect(normalizeFeatures(old)[id as typeof REASONS]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id as typeof REASONS]).toBe(false);
 });
 it("the press wiring follows the switch",()=>{
  expect(toolSwitches({...ALL_ON,[REASONS]:true}).gateTurnReasons).toBe(true);
  expect(toolSwitches({...ALL_ON,[REASONS]:false,[LOG]:false}).gateTurnReasons).toBeUndefined();
 });
});

describe("which way a gate can turn",()=>{
 it("reads rotating_gate.c's sweep: gate 3 at 90 degrees hits (1,5) clockwise and is free counterclockwise",()=>{
  const turns=gateTurns(room(1,2));
  expect(turns?.get("gate:3")).toEqual({clockwise:{x:1,y:5},counterclockwise:null});
 });
 it("says nothing when a swept tile was not read",()=>{
  const s=room(1,2);
  expect(gateTurns({...s,map_grid:null})).toBeNull();
  expect(gateTurns({...s,map_observation:{...s.map_observation,unavailable:["gate:3 rotating gate state unavailable"]}} as GameStateSnapshot)).toBeNull();
 });
 it("lists each gate's free and blocked turns, and names no push",()=>{
  expect(gateTurnLines(room(1,2))).toEqual([
   "Gate 3: counterclockwise free; clockwise blocked, an arm would swing into the wall at (1,5).",
   "Gate 7: clockwise free; counterclockwise free.",
  ]);
 });
});

describe("why a push was refused",()=>{
 it("on: names the turn the push asked for and the wall",()=>{
  expect(gatePressNote(room(1,2),room(1,2),["DOWN"],true,true)).toBe("Gate 3's arm between (2,5) and (2,6) did not turn: turning clockwise would swing an arm into the wall at (1,5)");
 });
 it("on: a push the game's check allows gives no cause",()=>{
  const at={x:1,y:6};
  expect(gatePressNote(room(1,2,at),room(1,2,at),["RIGHT"],true,true)).toBe("Gate 3's arm between (1,6) and (2,6) did not turn");
 });
 it("off: the sentence ends where it did",()=>{
  expect(gatePressNote(room(1,2),room(1,2),["DOWN"],true)).toBe("Gate 3's arm between (2,5) and (2,6) did not turn");
 });
 it("a walking batch carries the cause",()=>{
  expect(new GateStepTrail(true,true).add(room(1,2),room(1,2),"DOWN")).toBe("gates by step: step 1 DOWN: Gate 3's arm between (2,5) and (2,6) did not turn: turning clockwise would swing an arm into the wall at (1,5)");
 });
});

describe("the push log",()=>{
 const fed=(...events:RunEvent[])=>{const log=new GateLog();events.forEach(e=>{log.observe(e);});return log;};
 it("records entry, a turn and a refused push, oldest first",()=>{
  const log=fed(stateEvent(room(1,2,{x:15,y:24}),1,1),stateEvent(room(1,2,{x:1,y:6}),2,2),press("RIGHT",3,3,2),stateEvent(room(0,2,{x:2,y:6}),4,3),stateEvent(room(1,2),5,4),press("DOWN",6,5,5),stateEvent(room(1,2),7,5));
  expect(log.lines()).toEqual([
   "Turn 1: entered FORTREE CITY GYM: all gates at their starting positions.",
   "Turn 3: RIGHT from (1,6) to (2,6): Gate 3 turned 90 degrees counterclockwise (arms east, south, west -> north, east, south)",
   "Turn 4: Gate 3 turned 90 degrees clockwise (arms north, east, south -> east, south, west) with no single press read",
   "Turn 5: DOWN at (2,5): Gate 3's arm between (2,5) and (2,6) did not turn: turning clockwise would swing an arm into the wall at (1,5)",
  ]);
 });
 it("records re-entry and keeps the earlier visit",()=>{
  const log=fed(stateEvent(room(1,2),1,1),press("UP",2,2,1),stateEvent(room(0,2,{x:2,y:4}),3,2),stateEvent(city(),4,3),stateEvent(room(1,2,{x:15,y:24}),5,4));
  expect(log.lines().at(-1)).toBe("Turn 4: entered FORTREE CITY GYM: all gates at their starting positions.");
  expect(log.lines()).toHaveLength(3);
 });
 it("names gates away from their start on entry",()=>{
  expect(fed(stateEvent(room(0,2),1,1)).lines()).toEqual(["Turn 1: entered FORTREE CITY GYM: Gate 3 is not at its starting position."]);
 });
 it("a free step past no arm logs nothing",()=>{
  const log=fed(stateEvent(room(1,2,{x:3,y:2}),1,1),press("LEFT",2,2,1),stateEvent(room(1,2,{x:2,y:2}),3,2));
  expect(log.lines()).toHaveLength(1);
 });
 it("a press in a battle pushes nothing",()=>{
  const log=fed(stateEvent({...room(1,2),in_battle:true},1,1),press("DOWN",2,2,1),stateEvent({...room(1,2),in_battle:true},3,2));
  expect(log.lines()).toHaveLength(1);
 });
 it("a read without gates on the same map keeps the visit and its press open",()=>{
  const blank={...room(1,2)};delete blank.map_observation;
  const log=fed(stateEvent(room(1,2),1,1),stateEvent({...room(1,2),map_id:null},2,2),press("UP",3,3,1),stateEvent(blank,4,3),stateEvent(room(0,2,{x:2,y:4}),5,3));
  expect(log.lines()).toHaveLength(2);
  expect(log.lines()[1]).toContain("Turn 3: UP from (2,5) to (2,4): Gate 3 turned");
 });
 it("an unread tile is not read as free",()=>{
  const s=room(1,2);
  const rows=s.map_grid?.rows.map((row,y)=>y===5?`${row.slice(0,4)}ffff${row.slice(8)}`:row);
  expect(gateTurns({...s,map_grid:{...s.map_grid,rows}} as GameStateSnapshot)).toBeNull();
 });
 it("a swept tile off the map is not read as free",()=>{
  const s=room(1,2);
  expect(gateTurns({...s,map_grid:{...s.map_grid,rows:s.map_grid?.rows.slice(0,3)}} as GameStateSnapshot)).toBeNull();
 });
 it("a direction in a menu or battle read with no gates logs no refusal",()=>{
  const blank={...room(1,2),in_battle:true};delete blank.map_observation;
  const log=fed(stateEvent(room(1,2),1,1),stateEvent(blank,2,2),press("DOWN",3,3,2),stateEvent(room(1,2),4,3));
  expect(log.lines()).toHaveLength(1);
 });
 it("a repeated direction that stayed is one refused push; a mixed batch proves nothing",()=>{
  const log=fed(stateEvent(room(1,2),1,1),press("DOWN",2,2,1),press("DOWN",3,2,1),stateEvent(room(1,2),4,2),press("DOWN",5,3,4),press("LEFT",6,3,4),stateEvent(room(1,2),7,3));
  expect(log.lines()).toHaveLength(2);
  expect(log.lines()[1]).toContain("Turn 2: DOWN at (2,5): Gate 3's arm");
 });
 it("presses off a gate map are not kept",()=>{
  const log=fed(stateEvent(city(),1,1),press("UP",2,2,1),stateEvent(room(1,2),3,3),stateEvent(room(1,2),4,4));
  expect(log.lines()).toHaveLength(1);
 });
 it("a transition read with no map shows no stale gates",()=>{
  expect(fed(stateEvent(room(1,2),1,1),stateEvent({...room(1,2),map_id:null},2,2)).onGateMap()).toBe(false);
 });
 it("is shown only while on a gate map",()=>{
  expect(fed(stateEvent(room(1,2),1,1),stateEvent(city(),2,2)).onGateMap()).toBe(false);
  expect(fed(stateEvent(room(1,2),1,1)).onGateMap()).toBe(true);
 });
});

describe("the pinned note",()=>{
 const harness=(features:FeatureSet)=>{
  let feed:(e:RunEvent)=>void=()=>undefined;const recorded:string[]=[];
  const recorder={subscribe:(observer:(e:RunEvent)=>void)=>{feed=observer;},recordLedgerContext:(body:{text:string})=>{recorded.push(body.text);}};
  const base=(m:AgentMessage[])=>Promise.resolve(m);
  return {transform:gateLogContext(features,recorder,base,()=>7),base,feed:(e:RunEvent)=>{feed(e);},recorded};
 };
 it("production wiring carries the note",async()=>{
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder=new Proxy({subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);}},{get:(target,key)=>key==="subscribe"?target.subscribe:()=>undefined}) as unknown as Parameters<typeof contextTools>[1];
  const wiring=contextTools(ALL_ON,recorder,m=>Promise.resolve(m));
  for(const observer of observers)observer(stateEvent(room(1,2),1,1));
  expect(JSON.stringify(await wiring.transformContext([]))).toContain("Gate 3: counterclockwise free");
 });
 it("both off returns the base transform unchanged",()=>{
  const h=harness({...ALL_ON,[REASONS]:false,[LOG]:false});
  expect(h.transform).toBe(h.base);
 });
 it("on a gate map the note ends the request, is recorded whole and is not kept in history",async()=>{
  const h=harness(ALL_ON);h.feed(stateEvent(room(1,2),1,1));
  const history:AgentMessage[]=[];
  const out=await h.transform(history);
  expect(history).toEqual([]);
  expect(out).toHaveLength(1);
  const note=out[0];
  expect(note).toMatchObject({role:"user",timestamp:7});
  const text=note?.role==="user"&&typeof note.content==="string"?note.content:"";
  expect(text).toContain("Gate 3: counterclockwise free; clockwise blocked");
  expect(text).toContain("Turn 1: entered FORTREE CITY GYM");
  expect(h.recorded).toEqual([text]);
 });
 it("reasons alone shows the turns without the log",async()=>{
  const h=harness({...ALL_ON,[LOG]:false});h.feed(stateEvent(room(1,2),1,1));
  expect(JSON.stringify(await h.transform([]))).not.toContain("Turn 1:");
  expect(JSON.stringify(await h.transform([]))).toContain("Gate 3: counterclockwise free");
 });
 it("off a gate map adds nothing",async()=>{
  const h=harness(ALL_ON);h.feed(stateEvent(city(),1,1));
  expect(await h.transform([])).toEqual([]);
  expect(h.recorded).toEqual([]);
 });
});
