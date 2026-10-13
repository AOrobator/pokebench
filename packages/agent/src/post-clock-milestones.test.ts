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
