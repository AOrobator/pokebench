import {expect,it} from "vitest";
import {parseEvent} from "./events.js";
import {NativeTargetStop} from "./target-stop.js";
import {NAME_CONFIRMED} from "../test-support/events.js";
const RUN="target-test";
const state=parseEvent(JSON.stringify({v:1,type:"state",turn:1,t:"2026-10-12T22:00:00.000-04:00",...NAME_CONFIRMED,run:RUN,seq:10}));
const mark={v:1,run:RUN,seq:11,t:"2026-10-12T22:00:00.000-04:00",turn:1,type:"milestone",name:"PLAYER_NAME_CONFIRMED",kind:"story",origin:"observed",server_timestamp:0,evidence:[10]} as const;
it("latches exact observed native proof once and ignores unqualified target claims",()=>{
 const hits:string[]=[];const target=new NativeTargetStop(RUN,"PLAYER_NAME_CONFIRMED",proof=>hits.push(proof.name));
 for(const bad of [{...mark,run:"foreign"},{...mark,origin:"present_at_start" as const},{...mark,kind:"legacy" as const},{...mark,evidence:[999]},{...mark,name:"CLOCK_SET"}])target.observe(bad);
 expect(hits).toEqual([]);target.observe(state);target.observe({...mark,evidence:[11]});expect(hits).toEqual([]);target.observe(mark);target.observe(mark);
 expect(hits).toEqual(["PLAYER_NAME_CONFIRMED"]);expect(target.proof).toEqual({name:"PLAYER_NAME_CONFIRMED",milestone_seq:11,state_evidence:[10]});
});
it("unknown, false, foreign and superseded state cannot prove native success",()=>{
 for(const override of [{story:null},{story:{...NAME_CONFIRMED.story,name_confirmed:false}},{run:"foreign"},{seq:12}]){const target=new NativeTargetStop(RUN,"PLAYER_NAME_CONFIRMED",()=>{throw new Error("unqualified stop");});target.observe(parseEvent(JSON.stringify({...state,...override})));target.observe(mark);expect(target.proof).toBeNull();}
});

it("does not use older positive evidence after a newer negative observation",()=>{const target=new NativeTargetStop(RUN,"PLAYER_NAME_CONFIRMED",()=>{throw new Error("stale stop");});target.observe(state);target.observe(parseEvent(JSON.stringify({...state,seq:12,story:{...NAME_CONFIRMED.story,name_confirmed:false}})));target.observe({...mark,seq:13});expect(target.proof).toBeNull();});
