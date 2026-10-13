import {expect,it} from "vitest";
import {parseEvent,type RunEvent} from "./events.js";
import {qualifiedNativeMilestone} from "./milestones.js";
import {NativeTargetStop} from "./target-stop.js";
import {NAME_CONFIRMED} from "../test-support/events.js";
const RUN="target-test";
const state=parseEvent(JSON.stringify({v:1,type:"state",turn:1,t:"2026-10-12T22:00:00.000-04:00",...NAME_CONFIRMED,run:RUN,seq:10}));
const mark:Extract<RunEvent,{type:"milestone"}>={v:1,run:RUN,seq:11,t:"2026-10-12T22:00:00.000-04:00",turn:1,type:"milestone",name:"PLAYER_NAME_CONFIRMED",kind:"story",origin:"observed",server_timestamp:0,evidence:[10]};
it("latches exact observed native proof once and ignores unqualified target claims",()=>{
 const hits:string[]=[];const target=new NativeTargetStop(RUN,"PLAYER_NAME_CONFIRMED",proof=>hits.push(proof.name));target.observe(state);
 for(const bad of [{...mark,run:"foreign"},{...mark,origin:"present_at_start" as const},{...mark,kind:"legacy" as const},{...mark,evidence:[999]},{...mark,name:"CLOCK_SET"}])target.observe(bad);
 expect(hits).toEqual([]);target.observe(state);target.observe({...mark,evidence:[11]});expect(hits).toEqual([]);target.observe(mark);target.observe(mark);
 expect(hits).toEqual(["PLAYER_NAME_CONFIRMED"]);expect(target.proof).toEqual({name:"PLAYER_NAME_CONFIRMED",milestone_seq:11,state_evidence:[10]});
});
it("unknown, false, foreign and superseded state cannot prove native success",()=>{
 for(const override of [{story:null},{story:{...NAME_CONFIRMED.story,name_confirmed:false}},{run:"foreign"},{seq:12}]){const target=new NativeTargetStop(RUN,"PLAYER_NAME_CONFIRMED",()=>{throw new Error("unqualified stop");});target.observe(parseEvent(JSON.stringify({...state,...override})));target.observe(mark);expect(target.proof).toBeNull();}
});

it("does not use older positive evidence after a newer negative observation",()=>{const target=new NativeTargetStop(RUN,"PLAYER_NAME_CONFIRMED",()=>{throw new Error("stale stop");});target.observe(state);target.observe(parseEvent(JSON.stringify({...state,seq:12,story:{...NAME_CONFIRMED.story,name_confirmed:false}})));target.observe({...mark,seq:13});expect(target.proof).toBeNull();});

it("retains only the earliest truck witness and current exit state, rejecting duplicate/reversed refs",()=>{
 const target=new NativeTargetStop(RUN,"FIRST_TRUCK_EXIT",()=>undefined);
 const truck=parseEvent(JSON.stringify({...state,seq:20,started:true,name:"MAY",location:"INSIDE OF TRUCK"}));
 target.observe(truck);target.observe({...truck,seq:21});
 const exit=parseEvent(JSON.stringify({...truck,seq:22,location:"LITTLEROOT TOWN"}));target.observe(exit);
 for(const evidence of [[22,22],[22,20],[21,22]])target.observe({...mark,name:"FIRST_TRUCK_EXIT",seq:23,evidence});
 expect(target.proof).toBeNull();target.observe({...mark,name:"FIRST_TRUCK_EXIT",seq:23,evidence:[20,22]});
 expect(target.proof).toEqual({name:"FIRST_TRUCK_EXIT",milestone_seq:23,state_evidence:[20,22]});
});

it("rejects a complete foreign proof and superseded positive evidence",()=>{
 const target=new NativeTargetStop(RUN,"PLAYER_NAME_CONFIRMED",()=>{throw new Error("foreign or stale success");});
 target.observe({...state,run:"foreign"});target.observe({...mark,run:"foreign"});expect(target.proof).toBeNull();
 target.observe(state);target.observe({...state,seq:12});target.observe({...mark,seq:13});expect(target.proof).toBeNull();
});


it("rejects transient clock evidence through the native target and replay qualifier",()=>{
 const target=new NativeTargetStop(RUN,"CLOCK_SET",()=>undefined);
 const bad=parseEvent(JSON.stringify({...state,screen:"field_transition",started:true,location:"PETALBURG CITY",map_id:[0,0],story:{...NAME_CONFIRMED.story,clock_set:true,intro_stage:0,rival_battle_won:true}}));
 const clock={...mark,name:"CLOCK_SET"};
 target.observe(bad);target.observe(clock);expect(target.proof).toBeNull();
 expect(qualifiedNativeMilestone(clock,[bad])).toBe(false);
 const good=parseEvent(JSON.stringify({...bad,seq:12,screen:"overworld",location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_id:[1,1],story:{...NAME_CONFIRMED.story,clock_set:true,intro_stage:6}}));
 const real={...clock,seq:13,evidence:[12]};
 target.observe(good);target.observe(real);expect(target.proof).toEqual({name:"CLOCK_SET",milestone_seq:13,state_evidence:[12]});
 expect(qualifiedNativeMilestone(real,[good])).toBe(true);
});


it("rejects a transition as the recorded truck witness",()=>{
 const truck=parseEvent(JSON.stringify({...state,seq:20,screen:"field_transition",started:true,name:"MAY",location:"INSIDE OF TRUCK"}));
 const exit=parseEvent(JSON.stringify({...truck,seq:21,screen:"overworld",location:"LITTLEROOT TOWN"}));
 expect(qualifiedNativeMilestone({...mark,seq:22,name:"FIRST_TRUCK_EXIT",evidence:[20,21]},[truck,exit])).toBe(false);
});
