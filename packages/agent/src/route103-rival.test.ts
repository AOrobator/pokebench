import { expect, it } from "vitest";
import type { GameStateSnapshot } from "./game-state.js";
import type { RunEvent } from "./events.js";
import { parseGameState } from "./game-state.js";
import { featureInfo, playHarnessFeatures, ALL_ON } from "./features.js";
import { MEASUREMENT_ONLY_MILESTONES, MILESTONES, StateMilestones, qualifiedNativeMilestone } from "./milestones.js";
import { requireRoute103Field } from "./recorder.js";

const story={name_confirmed:true,intro_stage:7,rival_stage:3,birch_lab_stage:3,petalburg_gym_stage:0,woods_stage:0,clock_set:true,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
const NEW=["RIVAL_BATTLE_STARTED","RIVAL_BATTLE_DEFEATED","RIVAL_OLDALE_SEND_OFF","ROUTE_101_AFTER_RIVAL_BATTLE","LITTLEROOT_AFTER_RIVAL_BATTLE"];
type Rival={battle_active:boolean;defeated:boolean;oldale_stage:number|null};
const rival=(r:Partial<Rival>={}):Rival=>({battle_active:false,defeated:false,oldale_stage:0,...r});
const state=(location:string,lab:number,r:Partial<Rival>={},extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({screen:"overworld",started:true,name:"X",location,map_id:null,position:{x:1,y:1},facing:"DOWN",in_battle:false,party:[],money:3000,badges:[],play_time_s:1,story:{...story,birch_lab_stage:lab,rival_battle_won:lab>=4},route103_rival:rival(r),...extra});
const events=(states:readonly GameStateSnapshot[]):(Extract<RunEvent,{type:"state"}>&GameStateSnapshot)[]=>states.map((s,i)=>({...s,type:"state",run:"r",seq:i+1,turn:1,v:1,t:"2026-10-16T03:00:00.000-04:00"}));
const mark=(name:string,evidence:number[]):Extract<RunEvent,{type:"milestone"}>=>({type:"milestone",run:"r",seq:90,turn:1,v:1,t:"2026-10-16T03:00:00.000-04:00",name,kind:["RIVAL_BATTLE_STARTED","RIVAL_BATTLE_DEFEATED","RIVAL_BATTLE_WON","RIVAL_OLDALE_SEND_OFF"].includes(name)?"story":"navigation",origin:"observed",evidence,server_timestamp:1});
// The real return trip from the Route 103 rival, sampled like 2026-10-16T02-23-17_qwen36-gpu1_sh02.
const trip=():GameStateSnapshot[]=>[
 state("ROUTE103",3),
 state("ROUTE103",3,{battle_active:true},{in_battle:true,screen:"battle"}),
 state("ROUTE103",3,{battle_active:true},{in_battle:true,screen:"battle"}),
 state("ROUTE103",3,{defeated:true}),
 state("ROUTE103",4,{defeated:true,oldale_stage:1}),
 state("OLDALE TOWN",4,{defeated:true,oldale_stage:1}),
 state("OLDALE TOWN",4,{defeated:true,oldale_stage:1},{screen:"unknown"}),
 state("OLDALE TOWN",4,{defeated:true,oldale_stage:2}),
 state("ROUTE101",4,{defeated:true,oldale_stage:2},{screen:"field_transition"}),
 state("ROUTE101",4,{defeated:true,oldale_stage:2}),
 state("LITTLEROOT TOWN",4,{defeated:true,oldale_stage:2}),
 state("ROUTE101",4,{defeated:true,oldale_stage:2}),
 state("LITTLEROOT TOWN",4,{defeated:true,oldale_stage:2}),
];

it("orders the splits around the existing rival scene flag and keeps them measurement-only",()=>{
 const names=MILESTONES.map(m=>m.name);
 expect(names.slice(names.indexOf("ROUTE_103"),names.indexOf("RECEIVED_POKEDEX")+1)).toEqual(["ROUTE_103","RIVAL_BATTLE_STARTED","RIVAL_BATTLE_DEFEATED","RIVAL_BATTLE_WON","RIVAL_OLDALE_SEND_OFF","ROUTE_101_AFTER_RIVAL_BATTLE","LITTLEROOT_AFTER_RIVAL_BATTLE","RECEIVED_POKEDEX"]);
 for(const name of NEW)expect(MEASUREMENT_ONLY_MILESTONES.has(name)).toBe(true);
 expect(MEASUREMENT_ONLY_MILESTONES.has("RIVAL_BATTLE_WON")).toBe(false);
 expect(featureInfo("route103-rival-splits-v1")).toMatchObject({switchable:false,needs:null});
 const recorded=playHarnessFeatures(ALL_ON,null);
 expect(recorded.indexOf("route103-rival-splits-v1")).toBe(recorded.indexOf("bedroom-exit-v1")+1);
});

it("records each split once at its first qualifying state on the return trip",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("ROUTE103",3))});tracker.initialize("save_state");
 const found=trip().flatMap((s,i)=>tracker.observe(s,i+1)).filter(m=>NEW.includes(m.name)||m.name==="RIVAL_BATTLE_WON");
 expect(found.map(m=>[m.name,m.origin,m.evidence])).toEqual([
  ["RIVAL_BATTLE_STARTED","observed",[2]],
  ["RIVAL_BATTLE_DEFEATED","observed",[4]],
  ["RIVAL_BATTLE_WON","observed",[5]],
  ["RIVAL_OLDALE_SEND_OFF","observed",[6,8]],
  ["ROUTE_101_AFTER_RIVAL_BATTLE","observed",[4,8,10]],
  ["LITTLEROOT_AFTER_RIVAL_BATTLE","observed",[4,10,11]],
 ]);
 const recorded=events(trip());
 const at=(seqs:number[])=>seqs.map(seq=>recorded[seq-1]);
 for(const [name,,evidence] of found.map(m=>[m.name,m.origin,m.evidence??[]] as const))expect(qualifiedNativeMilestone(mark(name,[...evidence]),at([...evidence]))).toBe(true);
});

it("withholds the send-off when Littleroot sets the Oldale state, and the trip splits without a pre-battle witness",()=>{
 const bypass=new StateMilestones({read:()=>Promise.resolve(state("ROUTE103",3))});
 const seq=[state("ROUTE103",3),state("ROUTE101",4,{defeated:true,oldale_stage:1}),state("LITTLEROOT TOWN",4,{defeated:true,oldale_stage:2})];
 expect(seq.flatMap((s,i)=>bypass.observe(s,i+1)).map(m=>m.name)).not.toContain("RIVAL_OLDALE_SEND_OFF");
 const late=new StateMilestones({read:()=>Promise.resolve(state("ROUTE103",3))});late.initialize("save_state");
 const after=[state("OLDALE TOWN",4,{defeated:true,oldale_stage:2}),state("ROUTE101",4,{defeated:true,oldale_stage:2}),state("LITTLEROOT TOWN",4,{defeated:true,oldale_stage:2})];
 const names=after.flatMap((s,i)=>late.observe(s,i+1));
 expect(names.filter(m=>m.name==="ROUTE_101_AFTER_RIVAL_BATTLE"||m.name==="LITTLEROOT_AFTER_RIVAL_BATTLE"||m.name==="RIVAL_OLDALE_SEND_OFF")).toEqual([]);
 expect(names.find(m=>m.name==="RIVAL_BATTLE_DEFEATED")?.origin).toBe("present_at_start");
 const wild=new StateMilestones({read:()=>Promise.resolve(state("ROUTE103",3))});
 expect(wild.observe(state("ROUTE103",3,{},{in_battle:true,screen:"battle"}),1).map(m=>m.name)).not.toContain("RIVAL_BATTLE_STARTED");
 const recorded=events(trip());
 const [first,,,,,town,,,,route]=recorded;if(first===undefined||town===undefined||route===undefined)throw new Error("fixture");
 expect(qualifiedNativeMilestone(mark("ROUTE_101_AFTER_RIVAL_BATTLE",[1,6,10]),[{...first,story:{...story,birch_lab_stage:4}},town,route])).toBe(false);
 expect(qualifiedNativeMilestone(mark("ROUTE_101_AFTER_RIVAL_BATTLE",[1,6,10]),[first,{...town,location:"LITTLEROOT TOWN"},route])).toBe(false);
 expect(qualifiedNativeMilestone(mark("RIVAL_OLDALE_SEND_OFF",[6,10]),[town,route])).toBe(false);
 expect(qualifiedNativeMilestone(mark("RIVAL_BATTLE_STARTED",[1]),[first])).toBe(false);
});

it("parses the reader field and treats a missing field as unknown",()=>{
 const base={screen:"overworld",started:true,name:"X",location:"ROUTE103",map_id:null,position:{x:1,y:1},facing:"DOWN",in_battle:false,party:[],money:3000,badges:[],play_time_s:1,story};
 expect(parseGameState({...base,route103_rival:{battle_active:true,defeated:false,oldale_stage:null}}).route103_rival).toEqual({battle_active:true,defeated:false,oldale_stage:null});
 expect(()=>parseGameState({...base,route103_rival:{battle_active:true,defeated:false,oldale_stage:3}})).toThrow();
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("ROUTE103",3))});
 expect(tracker.observe(parseGameState(base),1).map(m=>m.name)).not.toContain("RIVAL_BATTLE_DEFEATED");
 expect(MILESTONES.find(m=>m.name==="RIVAL_BATTLE_DEFEATED")?.reached(parseGameState(base))).toBeNull();
});

it("refuses to record a run that declares the splits when the reader omits the field",()=>{
 expect(()=>{ requireRoute103Field(true,{}); }).toThrow(/route103-rival-splits-v1/);
 expect(()=>{ requireRoute103Field(false,{}); }).not.toThrow();
 expect(()=>{ requireRoute103Field(true,{route103_rival:null}); }).not.toThrow();
});
