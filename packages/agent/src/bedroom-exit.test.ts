import { expect, it } from "vitest";
import type { GameStateSnapshot } from "./game-state.js";
import type { RunEvent } from "./events.js";
import { checkEvent } from "./events.js";
import { ObjectiveTracker } from "./objectives.js";
import { MEASUREMENT_ONLY_MILESTONES, MILESTONES, StateMilestones, qualifiedNativeMilestone } from "./milestones.js";
import { parsePlayPreset } from "./play-preset.js";

const story={name_confirmed:true,intro_stage:5,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:false,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
const justSet={...story,intro_stage:6,clock_set:true};
const told={...story,intro_stage:7,clock_set:true};
const state=(location:string,extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({screen:"overworld",started:true,name:"X",location,map_id:null,position:{x:1,y:1},facing:"DOWN",in_battle:false,party:[],money:3000,badges:[],play_time_s:1,story,...extra});
const NAME="PLAYER_BEDROOM_EXITED_AFTER_CLOCK";
const run=(tracker:StateMilestones,states:readonly GameStateSnapshot[])=>states.flatMap((s,i)=>tracker.observe(s,i+1)).filter(m=>m.name===NAME);
const events=(states:readonly GameStateSnapshot[]):(Extract<RunEvent,{type:"state"}>&GameStateSnapshot)[]=>states.map((s,i)=>({...s,type:"state",run:"r",seq:i+1,turn:1,v:1,t:"2026-10-16T00:00:00.000-04:00"}));
const mark=(evidence:number[]):Extract<RunEvent,{type:"milestone"}>=>({type:"milestone",run:"r",seq:50,turn:1,v:1,t:"2026-10-16T00:00:00.000-04:00",name:NAME,kind:"navigation",origin:"observed",evidence,server_timestamp:1});

it("orders the bedroom exit between the clock and Mom's rival instruction and keeps it measurement-only",()=>{
 const names=MILESTONES.map(m=>m.name);
 expect(names.indexOf(NAME)).toBe(names.indexOf("CLOCK_SET")+1);
 expect(names.indexOf("MOM_RIVAL_INSTRUCTION")).toBe(names.indexOf(NAME)+1);
 expect(MILESTONES.find(m=>m.name===NAME)?.kind).toBe("navigation");
 expect(MEASUREMENT_ONLY_MILESTONES.has(NAME)).toBe(true);
});

it("records the first walk downstairs after the clock, once, for both families",()=>{
 for(const home of ["BRENDANS","MAYS"]){
  const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
  const found=run(tracker,[
   state(`LITTLEROOT TOWN ${home} HOUSE 2F`),
   state(`LITTLEROOT TOWN ${home} HOUSE 2F`,{story:justSet}),
   state(`LITTLEROOT TOWN ${home} HOUSE 2F`,{story:justSet,screen:"unknown"}),
   state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:justSet,screen:"field_transition"}),
   state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:justSet}),
   state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:told}),
   state(`LITTLEROOT TOWN ${home} HOUSE 2F`,{story:told}),
   state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:told}),
  ]);
  expect(found).toMatchObject([{kind:"navigation",origin:"observed",evidence:[2,5]}]);
 }
});

it("records it after a Clock set save that starts in the bedroom, and qualifies the same evidence",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});tracker.initialize("save_state");
 const seq=[state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:justSet}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:justSet})];
 expect(run(tracker,seq)).toMatchObject([{origin:"observed",evidence:[1,2]}]);
 expect(qualifiedNativeMilestone(mark([1,2]),events(seq))).toBe(true);
});

it("withholds credit before the clock, after the room was already left, in the rival's house, and on loading frames",()=>{
 const cases:GameStateSnapshot[][]=[
  [state("LITTLEROOT TOWN BRENDANS HOUSE 2F"),state("LITTLEROOT TOWN BRENDANS HOUSE 1F")],
  [state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:told}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:told})],
  [state("LITTLEROOT TOWN MAYS HOUSE 2F",{story:justSet}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:justSet})],
  [state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:justSet}),state("LITTLEROOT TOWN",{story:justSet})],
  [state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:justSet}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:justSet,screen:"unknown"})],
  [state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:justSet,screen:"field_transition"}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:justSet})],
 ];
 for(const seq of cases){
  const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});tracker.initialize("save_state");
  expect(run(tracker,seq)).toEqual([]);
 }
 const [up,down]=events([state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:justSet}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:justSet})]);
 if(up===undefined||down===undefined)throw new Error("fixture");
 expect(qualifiedNativeMilestone(mark([1,2]),[{...up,story:told},down])).toBe(false);
 expect(qualifiedNativeMilestone(mark([1,2]),[up,{...down,location:"LITTLEROOT TOWN MAYS HOUSE 1F"}])).toBe(false);
 expect(qualifiedNativeMilestone(mark([2]),[down])).toBe(false);
 expect(qualifiedNativeMilestone({...mark([1,2]),origin:"present_at_start"},[up,down])).toBe(false);
});

it("gives no leave-home credit to a save inside home after the rival bedroom visit",()=>{
 for(const rivalStage of [2,3,4]){
  const later={...told,rival_stage:rivalStage};
  const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});tracker.initialize("save_state");
  const seq=[state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:later}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:later}),state("LITTLEROOT TOWN",{story:later})];
  expect(seq.flatMap((s,i)=>tracker.observe(s,i+1)).map(m=>m.name)).not.toContain("PLAYER_HOUSE_EXITED_AFTER_CLOCK");
  const houseMark={...mark([1,2,3]),name:"PLAYER_HOUSE_EXITED_AFTER_CLOCK"};
  expect(qualifiedNativeMilestone(houseMark,events(seq))).toBe(false);
 }
});

it("leaves measurement-only splits out of the objective record the model reads",()=>{
 const envelope={v:1,run:"r",t:"2026-10-16T00:00:00.000-04:00",turn:1};
 const tracker=new ObjectiveTracker("Gym",()=>undefined,{repeatGuard:true,nativeCompletion:true});
 const seq=[state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:justSet}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:justSet})];
 seq.forEach((s,i)=>{tracker.observe(checkEvent({...envelope,seq:i+1,type:"state",...s}));});
 tracker.observe(checkEvent({...envelope,seq:3,type:"milestone",name:"CLOCK_SET",kind:"story",origin:"observed",server_timestamp:1,evidence:[1]}));
 tracker.observe(checkEvent({...envelope,seq:4,type:"milestone",name:NAME,kind:"navigation",origin:"observed",server_timestamp:1,evidence:[1,2]}));
 const lab=(stage:number)=>({...told,rival_stage:4,birch_lab_stage:stage});
 [state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB",{story:lab(2)}),state("LITTLEROOT TOWN",{story:lab(3)}),state("ROUTE101",{story:lab(3)})].forEach((s,i)=>{tracker.observe(checkEvent({...envelope,seq:i+5,type:"state",...s}));});
 tracker.observe(checkEvent({...envelope,seq:8,type:"milestone",name:"ROUTE_101_AFTER_HANDOFF",kind:"navigation",origin:"observed",server_timestamp:1,evidence:[5,6,7]}));
 const text=JSON.stringify(tracker.context([],1));
 expect(text).toContain("recorded_native_milestones");
 expect(text).toContain('\\"name\\":\\"CLOCK_SET\\"');
 expect(text).not.toContain(NAME);
 expect(text).not.toContain("ROUTE_101_AFTER_HANDOFF");
});

it("refuses measurement-only splits as STOP AT targets, because the target is written into the model's goal",()=>{
 const preset={version:1,id:"t",target:"CLOCK_SET",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}};
 expect(parsePlayPreset(preset).target).toBe("CLOCK_SET");
 for(const target of MEASUREMENT_ONLY_MILESTONES)expect(()=>parsePlayPreset({...preset,target})).toThrow(/measurement-only/);
});
