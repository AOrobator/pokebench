import {expect,it} from "vitest";
import {Log,START,state} from "../test-support/events.js";
import {clockEvent,clockStart,foldClock} from "./current-clock.js";
import {currentView} from "./current-state.js";

it("counts pauses and extensions while unrelated state is unreadable to the display",()=>{
 const l=new Log();const start=l.add(0,START);if(start.type!=="run_start")throw new Error("start");
 let clock=clockStart(start);
 const events=[
  l.add(10,{type:"operator_control",turn:0,action:"pause",status:"applied",request:1}),
  {...l.add(15,state()),party:"future format"},
  l.add(20,{type:"operator_control",turn:0,action:"resume",status:"pending",request:2,reason:"claude_quota"}),
  l.add(30,{type:"operator_control",turn:0,action:"resume",status:"applied",request:3,paused_ms:20}),
  l.add(40,{type:"operator_control",turn:0,action:"extend_30m",status:"applied",request:4,max_wall_ms:1_860_000}),
 ];
 for(const e of events)clock=foldClock(clock,clockEvent(JSON.stringify(e)));
 expect(clock.warning).toBeNull();
 expect(currentView(clock).control.pausedMs(clock.at)).toBe(20);
 expect(clock.control.maxWallMs).toBe(1_860_000);
});

it("withholds accurate clock claims for unsupported control bodies or damaged records",()=>{
 const l=new Log();const start=l.add(0,START);if(start.type!=="run_start")throw new Error("start");
 const control=l.add(1,{type:"operator_control",turn:0,action:"pause",status:"applied",request:1});
 expect(foldClock(clockStart(start),clockEvent(JSON.stringify({...control,action:"future_pause"}))).warning).not.toBeNull();
 expect(foldClock(clockStart(start),clockEvent(JSON.stringify(l.add(2,state()))),"Unreadable event").warning).toBe("Unreadable event");
});

it("rejects backward controls after skipped state and preserves a damaged-record warning",()=>{
 const l=new Log();const start=l.add(0,START);if(start.type!=="run_start")throw new Error("start");
 const pause=l.add(10,{type:"operator_control",turn:0,action:"pause",status:"applied",request:1});
 const stateEvent=l.add(20,state());
 const clock=foldClock(foldClock(clockStart(start),clockEvent(JSON.stringify(pause))),clockEvent(JSON.stringify(stateEvent)));
 expect(()=>foldClock(clock,clockEvent(JSON.stringify(pause)))).toThrow("backwards");
 const resume=l.add(30,{type:"operator_control",turn:0,action:"resume",status:"applied",request:2,paused_ms:20});
 const damaged=foldClock(clock,clockEvent(JSON.stringify(resume)),"Unreadable event");
 expect(damaged.warning).toBe("Unreadable event");
 expect(damaged.control.state).toBe("running");
});
