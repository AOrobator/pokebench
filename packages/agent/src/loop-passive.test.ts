import {describe,expect,it} from "vitest";
import {parseEvent,type RunEvent} from "./events.js";
import {LoopDetector,LOOP_POLICY,type LoopNotice} from "./loop-detection.js";
const policy={...LOOP_POLICY,planning:2,recovery:2};
const metadata={name:"get_objectives",args:{},isError:false,text:"ok"};
const turn=(seq:number):RunEvent=>({v:1,run:"passive",seq,t:"2026-10-12T20:00:00-04:00",type:"turn_start",turn:seq,context:{messages:1,images:0,est_tokens:1}});
describe("passive loop diagnosis",()=>{
 it("never exposes feedback or stops execution and logs threshold only once",()=>{
  const events:LoopNotice[]=[];const detector=new LoopDetector(e=>events.push(e),policy,"diagnostic");detector.complete(metadata);detector.complete(metadata);expect(detector.context()).toBe(null);detector.observe(turn(1));
  for(let i=0;i<10;i++)detector.complete(metadata);expect(detector.stopped).toBe(false);expect(events.map(e=>[e.mode,e.phase])).toEqual([["diagnostic","would_warn"],["diagnostic","would_stop"]]);
  detector.complete({name:"press",args:{buttons:["A"]},isError:false,text:"ok"});expect(events.at(-1)?.phase).toBe("would_recover");detector.complete(metadata);detector.complete(metadata);expect(events.at(-1)?.phase).toBe("would_warn");
 });
 it("preserves legacy logs but rejects contradictory mode and disposition",()=>{
  const base={v:1,run:"passive",seq:1,t:"2026-10-12T20:00:00-04:00",type:"loop_guard",turn:1,kind:"planning",message:"loop",calls:6,evidence:[0]};
  expect(parseEvent(JSON.stringify({...base,phase:"stop"})).type).toBe("loop_guard");expect(parseEvent(JSON.stringify({...base,mode:"diagnostic",phase:"would_stop"})).type).toBe("loop_guard");
  expect(()=>parseEvent(JSON.stringify({...base,mode:"diagnostic",phase:"stop"}))).toThrow();expect(()=>parseEvent(JSON.stringify({...base,mode:"enforced",phase:"would_stop"}))).toThrow();
 });
});
