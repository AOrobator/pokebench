import {expect,it} from "vitest";
import {Log,START} from "../test-support/events.js";
import {emptyCurrent,foldCurrent,parseCurrent} from "./current-state.js";
import {progressRows} from "./current-progress.js";
it("preserves each milestone's active time across a later operator pause",()=>{
 const log=new Log();log.add(0,START);
 log.add(10,{type:"milestone",turn:1,name:"BEFORE_PAUSE",origin:"observed",server_timestamp:1,evidence:[1]});
 log.add(20,{type:"operator_control",turn:1,action:"pause",status:"applied",request:1});
 log.add(40,{type:"operator_control",turn:1,action:"resume",status:"applied",request:2,paused_ms:20});
 log.add(50,{type:"milestone",turn:1,name:"AFTER_PAUSE",origin:"observed",server_timestamp:1,evidence:[1]});
 const current=log.events.reduce((s,e)=>foldCurrent(s,e),emptyCurrent());
 expect(progressRows(current).map(row=>row.elapsedMs)).toEqual([10,30]);
 expect(progressRows(parseCurrent(JSON.parse(JSON.stringify(current)) as unknown)).map(row=>row.elapsedMs)).toEqual([10,30]);
});

it("does not invent historical active times in an old checkpoint that already contains pauses",()=>{
 const log=new Log();log.add(0,START);log.add(10,{type:"milestone",turn:1,name:"OLD_MARK",origin:"observed",server_timestamp:1,evidence:[1]});
 const old=log.events.reduce((s,e)=>foldCurrent(s,e),emptyCurrent());delete old.milestoneTimes;old.control.pausedMs=5;
 expect(progressRows(old)[0]?.elapsedMs).toBeNull();
});
