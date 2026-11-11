import {expect,it} from "vitest";
import {Log,START,state} from "../test-support/events.js";
import {lineCursor,readCurrentLines} from "./current-source.js";
import {emptyCurrent,foldCurrent,foldDisplayEvent} from "./current-state.js";

it("retains provenance of damaged lines and displays later state without accepting backwards identity",()=>{
 const l=new Log();const start=l.add(0,START),lost=l.add(1,state()),next=l.add(2,state());
 const bytes=Buffer.from([JSON.stringify(start),"broken json",JSON.stringify(next),""].join("\n"));
 const source={stat:{size:bytes.length},read:(offset:number,length:number)=>bytes.subarray(offset,offset+length)};
 const batch=readCurrentLines(source,lineCursor(),bytes.length,10);
 expect(batch.lines).toHaveLength(2);expect(batch.atEnd).toBe(true);
 const first=batch.lines[0],last=batch.lines[1];if(first===undefined||last===undefined)throw new Error("lines");
 const initial=foldCurrent(emptyCurrent(),first.event);
 expect(last.problem).toContain("byte");
 const current=foldDisplayEvent(initial,last.event,last.problem);
 expect(current.seq).toBe(next.seq);expect(current.state?.seq).toBe(next.seq);
 expect(current.warning).toContain("byte");
 expect(()=>foldDisplayEvent(current,lost,last.problem)).toThrow("sequence");
 expect(()=>foldDisplayEvent(initial,{...next,run:"foreign"},last.problem)).toThrow("identity");
});
