import { expect, it } from "vitest";
import type { GameStateSnapshot } from "./game-state.js";
import type { RunEvent } from "./events.js";
import { NativeTargetStop } from "./target-stop.js";
import { ObjectiveTracker } from "./objectives.js";
import { checkEvent } from "./events.js";
import { StateMilestones, qualifiedNativeMilestone } from "./milestones.js";
const story={name_confirmed:true,intro_stage:5,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:false,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
const state=(location:string,extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({screen:"overworld",started:true,name:"X",location,map_id:null,position:{x:1,y:1},facing:"DOWN",in_battle:false,party:[],money:3000,badges:[],play_time_s:1,story,...extra});
const names=["PLAYER_HOUSE_EXITED_AFTER_CLOCK","RIVAL_HOUSE_ENTERED","RIVAL_BEDROOM_REACHED"];
it("records gender-correct post-clock route with bounded native evidence",()=>{
 for(const home of ["BRENDANS","MAYS"]){
 const rival=home==="BRENDANS"?"MAYS":"BRENDANS";
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
 const a=state(`LITTLEROOT TOWN ${home} HOUSE 2F`);
 const b=state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:{...story,intro_stage:7,clock_set:true}});
 const c=state("LITTLEROOT TOWN",{story:b.story ?? null});
 tracker.observe(a,1);tracker.observe(b,2);
 const exit=tracker.observe(c,3).find(m=>m.name===names[0]);expect(exit).toMatchObject({kind:"navigation",origin:"observed",evidence:[1,2,3]});
 const wrong=state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:b.story ?? null});expect(tracker.observe(wrong,4).map(m=>m.name)).not.toContain(names[1]);
 const right=state(`LITTLEROOT TOWN ${rival} HOUSE 1F`,{story:b.story ?? null});
 const enter=tracker.observe(right,5).find(m=>m.name===names[1]);expect(enter?.evidence).toEqual([1,5]);
 const bedroom=state(`LITTLEROOT TOWN ${rival} HOUSE 2F`,{story:{...story,clock_set:true,intro_stage:7,rival_stage:2}});
 const reached=tracker.observe(bedroom,6).find(m=>m.name===names[2]);expect(reached).toMatchObject({kind:"navigation",evidence:[6]});
 expect(tracker.observe(bedroom,7).filter(m=>names.includes(m.name))).toEqual([]);
 const events:(Extract<RunEvent,{type:"state"}> & GameStateSnapshot)[]=[a,b,c].map((s,index)=>({...s,type:"state",run:"r",seq:index+1,turn:1,v:1,t:"2026-10-13T00:00:00.000-04:00"}));
 const mark:Extract<RunEvent,{type:"milestone"}>={type:"milestone",run:"r",seq:10,turn:1,v:1,t:"2026-10-13T00:00:00.000-04:00",name:"PLAYER_HOUSE_EXITED_AFTER_CLOCK",kind:"navigation",origin:"observed",evidence:[1,2,3],server_timestamp:1};
 const middle=events[1];if(middle===undefined)throw new Error("missing fixture");
 expect(qualifiedNativeMilestone(mark,events)).toBe(true);
 const target=new NativeTargetStop("r","PLAYER_HOUSE_EXITED_AFTER_CLOCK",()=>undefined);for(const event of events)target.observe(event);target.observe(mark);expect(target.proof?.state_evidence).toEqual([1,2,3]);
 const enterEvent:Extract<RunEvent,{type:"state"}>&GameStateSnapshot={...right,type:"state",run:"r",seq:5,turn:1,v:1,t:mark.t};
 const enterMark={...mark,name:"RIVAL_HOUSE_ENTERED",evidence:[1,5]};
 const enterTarget=new NativeTargetStop("r","RIVAL_HOUSE_ENTERED",()=>undefined);for(const event of [...events,enterEvent])enterTarget.observe(event);enterTarget.observe(enterMark);expect(enterTarget.proof?.state_evidence).toEqual([1,5]);
 const objective=new ObjectiveTracker("Gym",body=>{checkEvent({v:1,run:"r",seq:11,t:mark.t,...body});});for(const event of events)objective.observe(event);
 objective.set({title:"Leave home",supports_goal:"Gym",evidence:[1],completion:{kind:"milestone",name:"PLAYER_HOUSE_EXITED_AFTER_CLOCK"},obstacle:"",next_decision:"Leave home"});objective.observe(mark);expect(objective.snapshot()?.verification?.state_evidence).toEqual([1,2,3]);
 expect(qualifiedNativeMilestone(mark,[events[2]])).toBe(false);
 expect(qualifiedNativeMilestone(mark,[events[0],{...middle,screen:"field_transition"},events[2]])).toBe(false);
 }
});
it("does not infer exits or rival house from initial town, names, missing home or loading",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});tracker.initialize("save_state");
 for(const s of [state("LITTLEROOT TOWN"),state("LITTLEROOT TOWN MAYS HOUSE 1F",{story:{...story,clock_set:true}}),state("LITTLEROOT TOWN MAYS HOUSE 2F",{screen:"field_transition",story:{...story,rival_stage:2}}),state("LITTLEROOT TOWN MAYS HOUSE 2F",{screen:"unknown",story:{...story,rival_stage:2}})])expect(tracker.observe(s,1).filter(m=>names.includes(m.name))).toEqual([]);
 expect(tracker.observe(state("LITTLEROOT TOWN",{story:{...story,rival_stage:2,clock_set:true}}),2).find(m=>m.name===names[2])).toMatchObject({origin:"observed"});
 const resumed=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});resumed.initialize("save_state");
 expect(resumed.observe(state("LITTLEROOT TOWN",{story:{...story,rival_stage:2}}),1).find(m=>m.name===names[2])).toMatchObject({origin:"present_at_start"});
});

it("withholds post-clock exit for pre-clock, unrelated previous map, and unknown home",()=>{
 for(const previous of [state("LITTLEROOT TOWN BRENDANS HOUSE 1F"),state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB",{story:{...story,clock_set:true}})]){
 const tracker=new StateMilestones({read:()=>Promise.resolve(previous)});
 tracker.observe(state("LITTLEROOT TOWN BRENDANS HOUSE 2F"),1);tracker.observe(previous,2);
 expect(tracker.observe(state("LITTLEROOT TOWN",{story:{...story,clock_set:true}}),3).map(m=>m.name)).not.toContain("PLAYER_HOUSE_EXITED_AFTER_CLOCK");
 }
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
 tracker.observe(state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{screen:"field_transition"}),1);
 tracker.observe(state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:{...story,clock_set:true}}),2);
 expect(tracker.observe(state("LITTLEROOT TOWN",{story:{...story,clock_set:true}}),3).map(m=>m.name)).not.toContain("PLAYER_HOUSE_EXITED_AFTER_CLOCK");
});

const clocked={...story,intro_stage:7,clock_set:true};
it("records leave-home and rival house after a Clock set save starts inside the player's house",()=>{
 for(const home of ["BRENDANS","MAYS"]){
  const rival=home==="BRENDANS"?"MAYS":"BRENDANS";
  const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
  tracker.initialize("save_state");
  const bedroom=state(`LITTLEROOT TOWN ${home} HOUSE 2F`,{story:clocked});
  const downstairs=state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:clocked});
  const town=state("LITTLEROOT TOWN",{story:clocked});
  const rivalHouse=state(`LITTLEROOT TOWN ${rival} HOUSE 1F`,{story:clocked});
  expect(tracker.observe(bedroom,1).map(m=>m.name)).not.toContain("PLAYER_HOUSE_EXITED_AFTER_CLOCK");
  expect(tracker.observe(downstairs,2).map(m=>m.name)).not.toContain("RIVAL_HOUSE_ENTERED");
  const exit=tracker.observe(town,3).find(m=>m.name==="PLAYER_HOUSE_EXITED_AFTER_CLOCK");
  expect(exit).toMatchObject({origin:"observed",kind:"navigation",evidence:[1,2,3]});
  const enter=tracker.observe(rivalHouse,4).find(m=>m.name==="RIVAL_HOUSE_ENTERED");
  expect(enter).toMatchObject({origin:"observed",kind:"navigation",evidence:[1,4]});
  const events:(Extract<RunEvent,{type:"state"}> & GameStateSnapshot)[]=[bedroom,downstairs,town,rivalHouse].map((game,i)=>({...game,type:"state",run:"r",seq:i+1,turn:1,v:1,t:"2026-10-14T00:00:00.000-04:00"}));
  const exitMark:Extract<RunEvent,{type:"milestone"}>={type:"milestone",run:"r",seq:5,turn:1,v:1,t:"2026-10-14T00:00:00.000-04:00",name:"PLAYER_HOUSE_EXITED_AFTER_CLOCK",kind:"navigation",origin:"observed",evidence:[1,2,3],server_timestamp:1};
  const enterMark:Extract<RunEvent,{type:"milestone"}>={...exitMark,seq:6,name:"RIVAL_HOUSE_ENTERED",evidence:[1,4]};
  expect(qualifiedNativeMilestone(exitMark,[events[0],events[1],events[2]])).toBe(true);
  expect(qualifiedNativeMilestone(enterMark,[events[0],events[3]])).toBe(true);
  const exitTarget=new NativeTargetStop("r","PLAYER_HOUSE_EXITED_AFTER_CLOCK",()=>undefined);
  for(const event of [events[0],events[1],events[2]])if(event!==undefined)exitTarget.observe(event);
  exitTarget.observe(exitMark);expect(exitTarget.proof?.state_evidence).toEqual([1,2,3]);
  const enterTarget=new NativeTargetStop("r","RIVAL_HOUSE_ENTERED",()=>undefined);
  for(const event of [events[0],events[3]])if(event!==undefined)enterTarget.observe(event);
  enterTarget.observe(enterMark);expect(enterTarget.proof?.state_evidence).toEqual([1,4]);
 }
 const late=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
 late.initialize("save_state");
 late.observe(state("LITTLEROOT TOWN",{story:clocked}),1);
 late.observe(state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:clocked}),2);
 expect(late.observe(state("LITTLEROOT TOWN",{story:clocked}),3).map(m=>m.name)).not.toContain("PLAYER_HOUSE_EXITED_AFTER_CLOCK");
 expect(late.observe(state("LITTLEROOT TOWN MAYS HOUSE 1F",{story:clocked}),4).map(m=>m.name)).not.toContain("RIVAL_HOUSE_ENTERED");
 const startedInside=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
 startedInside.initialize("save_state");
 expect(startedInside.observe(state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:clocked}),1).map(m=>m.name)).not.toContain("RIVAL_HOUSE_ENTERED");
 const outside:(Extract<RunEvent,{type:"state"}> & GameStateSnapshot)={...state("LITTLEROOT TOWN",{story:clocked}),type:"state",run:"r",seq:1,turn:1,v:1,t:"2026-10-14T00:00:00.000-04:00"};
 const returned:(Extract<RunEvent,{type:"state"}> & GameStateSnapshot)={...state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:clocked}),type:"state",run:"r",seq:2,turn:1,v:1,t:outside.t};
 const leftAgain:(Extract<RunEvent,{type:"state"}> & GameStateSnapshot)={...outside,seq:3};
 const blocked=new NativeTargetStop("r","PLAYER_HOUSE_EXITED_AFTER_CLOCK",()=>undefined);
 blocked.observe(outside);blocked.observe(returned);blocked.observe(leftAgain);
 blocked.observe({type:"milestone",run:"r",seq:4,turn:1,v:1,t:outside.t,name:"PLAYER_HOUSE_EXITED_AFTER_CLOCK",kind:"navigation",origin:"observed",evidence:[2,2,3],server_timestamp:1});
 expect(blocked.proof).toBeNull();
});

const met={...clocked,rival_stage:3};
it("records leaving the rival's house after meeting the rival, with home, rival-house and town evidence",()=>{
 for(const home of ["BRENDANS","MAYS"]){
  const rival=home==="BRENDANS"?"MAYS":"BRENDANS";
  const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
  const witness=state(`LITTLEROOT TOWN ${home} HOUSE 2F`);
  const sequence=[witness,state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:clocked}),state("LITTLEROOT TOWN",{story:clocked}),state(`LITTLEROOT TOWN ${rival} HOUSE 1F`,{story:clocked}),state(`LITTLEROOT TOWN ${rival} HOUSE 2F`,{story:met}),state(`LITTLEROOT TOWN ${rival} HOUSE 1F`,{story:met})];
  sequence.forEach((s,i)=>{expect(tracker.observe(s,i+1).map(m=>m.name)).not.toContain("RIVAL_HOUSE_EXITED");});
  const exit=tracker.observe(state("LITTLEROOT TOWN",{story:met}),7).find(m=>m.name==="RIVAL_HOUSE_EXITED");
  expect(exit).toEqual({name:"RIVAL_HOUSE_EXITED",kind:"navigation",origin:"observed",serverTimestamp:expect.any(Number) as number,evidence:[1,6,7]});
  expect(tracker.observe(state(`LITTLEROOT TOWN ${rival} HOUSE 1F`,{story:met}),8)).toEqual([]);
  expect(tracker.observe(state("LITTLEROOT TOWN",{story:met}),9)).toEqual([]);
  const events:(Extract<RunEvent,{type:"state"}> & GameStateSnapshot)[]=[...sequence,state("LITTLEROOT TOWN",{story:met})].map((game,i)=>({...game,type:"state",run:"r",seq:i+1,turn:1,v:1,t:"2026-10-15T00:00:00.000-04:00"}));
  const mark:Extract<RunEvent,{type:"milestone"}>={type:"milestone",run:"r",seq:20,turn:1,v:1,t:"2026-10-15T00:00:00.000-04:00",name:"RIVAL_HOUSE_EXITED",kind:"navigation",origin:"observed",evidence:[1,6,7],server_timestamp:1};
  const [first,,,,,inside,town]=events;if(first===undefined||inside===undefined||town===undefined)throw new Error("fixture");
  expect(qualifiedNativeMilestone(mark,[first,inside,town])).toBe(true);
  expect(qualifiedNativeMilestone({...mark,origin:"present_at_start"},[first,inside,town])).toBe(false);
  expect(qualifiedNativeMilestone(mark,[first,{...inside,story:clocked},town])).toBe(false);
  expect(qualifiedNativeMilestone(mark,[first,{...inside,screen:"field_transition"},town])).toBe(false);
  expect(qualifiedNativeMilestone(mark,[first,{...inside,location:`LITTLEROOT TOWN ${home} HOUSE 1F`},town])).toBe(false);
  expect(qualifiedNativeMilestone({...mark,evidence:[6,7]},[inside,town])).toBe(false);
 }
});
it("withholds the rival-house exit for the player's own house, before the rival is met, and without a home",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});
 tracker.observe(state("LITTLEROOT TOWN BRENDANS HOUSE 2F"),1);
 for(const [s,seq] of [[state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:met}),2],[state("LITTLEROOT TOWN",{story:met}),3],[state("LITTLEROOT TOWN MAYS HOUSE 1F",{story:{...clocked,rival_stage:2}}),4],[state("LITTLEROOT TOWN",{story:{...clocked,rival_stage:2}}),5],[state("LITTLEROOT TOWN MAYS HOUSE 1F",{story:met}),6],[state("LITTLEROOT TOWN",{screen:"unknown",story:met}),7]] as const)expect(tracker.observe(s,seq).map(m=>m.name)).not.toContain("RIVAL_HOUSE_EXITED");
 expect(tracker.observe(state("LITTLEROOT TOWN MAYS HOUSE 1F",{story:met,screen:"field_transition"}),8).map(m=>m.name)).not.toContain("RIVAL_HOUSE_EXITED");
 expect(tracker.observe(state("LITTLEROOT TOWN",{story:met}),9).map(m=>m.name)).not.toContain("RIVAL_HOUSE_EXITED");
 const homeless=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});homeless.initialize("save_state");
 for(const [s,seq] of [[state("LITTLEROOT TOWN",{story:met}),1],[state("LITTLEROOT TOWN MAYS HOUSE 1F",{story:met}),2],[state("LITTLEROOT TOWN",{story:met}),3]] as const)expect(homeless.observe(s,seq).map(m=>m.name)).not.toContain("RIVAL_HOUSE_EXITED");
});
it("records the rival-house exit after a Clock set save that starts inside the player's house",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});tracker.initialize("save_state");
 const seq=[state("LITTLEROOT TOWN MAYS HOUSE 2F",{story:clocked}),state("LITTLEROOT TOWN MAYS HOUSE 1F",{story:clocked}),state("LITTLEROOT TOWN",{story:clocked}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:clocked}),state("LITTLEROOT TOWN BRENDANS HOUSE 2F",{story:met}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:met}),state("LITTLEROOT TOWN",{story:met})];
 const found=seq.flatMap((s,i)=>tracker.observe(s,i+1)).filter(m=>m.name==="RIVAL_HOUSE_EXITED");
 expect(found).toMatchObject([{origin:"observed",kind:"navigation",evidence:[1,6,7]}]);
});
it("gives no rival-house exit credit to a save whose home already shows the rival met",()=>{
 for(const [start,home] of [["LITTLEROOT TOWN MAYS HOUSE 2F","MAYS"],["LITTLEROOT TOWN BRENDANS HOUSE 2F","BRENDANS"]] as const){
  const rival=home==="BRENDANS"?"MAYS":"BRENDANS";
  const tracker=new StateMilestones({read:()=>Promise.resolve(state("LITTLEROOT TOWN"))});tracker.initialize("save_state");
  const seq=[state(start,{story:met}),state(`LITTLEROOT TOWN ${home} HOUSE 1F`,{story:met}),state("LITTLEROOT TOWN",{story:met}),state(`LITTLEROOT TOWN ${rival} HOUSE 1F`,{story:met}),state("LITTLEROOT TOWN",{story:met})];
  expect(seq.flatMap((s,i)=>tracker.observe(s,i+1)).map(m=>m.name)).not.toContain("RIVAL_HOUSE_EXITED");
 }
 const events:(Extract<RunEvent,{type:"state"}> & GameStateSnapshot)[]=[state("LITTLEROOT TOWN MAYS HOUSE 2F",{story:met}),state("LITTLEROOT TOWN BRENDANS HOUSE 1F",{story:met}),state("LITTLEROOT TOWN",{story:met})].map((game,i)=>({...game,type:"state",run:"r",seq:i+1,turn:1,v:1,t:"2026-10-15T00:00:00.000-04:00"}));
 const mark:Extract<RunEvent,{type:"milestone"}>={type:"milestone",run:"r",seq:9,turn:1,v:1,t:"2026-10-15T00:00:00.000-04:00",name:"RIVAL_HOUSE_EXITED",kind:"navigation",origin:"observed",evidence:[1,2,3],server_timestamp:1};
 expect(qualifiedNativeMilestone(mark,events)).toBe(false);
 const [, inside, town]=events;if(inside===undefined||town===undefined)throw new Error("fixture");
 const home={...state("LITTLEROOT TOWN MAYS HOUSE 2F",{story:clocked}),type:"state" as const,run:"r",seq:1,turn:1,v:1,t:mark.t};
 expect(qualifiedNativeMilestone(mark,[home,inside,town])).toBe(true);
 expect(qualifiedNativeMilestone(mark,[home,inside,{...town,story:{...clocked,rival_stage:2}}])).toBe(false);
 expect(qualifiedNativeMilestone(mark,[{...home,location:"LITTLEROOT TOWN"},inside,town])).toBe(false);
});
