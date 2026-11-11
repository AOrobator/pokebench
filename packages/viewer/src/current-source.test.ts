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

it("restores a consumed damaged-line warning before the next valid event arrives",()=>{
 const l=new Log();const start=l.add(0,START);l.add(1,state());const next=l.add(2,state());
 const prefix=Buffer.from(JSON.stringify(start)+"\n{broken\n");
 const cursor=lineCursor();
 const initial=readCurrentLines({stat:{size:prefix.length},read:(at,length)=>prefix.subarray(at,at+length)},cursor,prefix.length,10);
 const stateBefore=foldCurrent(emptyCurrent(),initial.lines[0]?.event??start);
 expect(cursor.problem).toContain("byte");
 const bytes=Buffer.concat([prefix,Buffer.from(JSON.stringify(next)+"\n")]);
 const restored=lineCursor(cursor.offset,cursor.problem);
 const batch=readCurrentLines({stat:{size:bytes.length},read:(at,length)=>bytes.subarray(at,at+length)},restored,bytes.length,10);
 const line=batch.lines[0];if(line===undefined)throw new Error("next event");
 expect(foldDisplayEvent(stateBefore,line.event,line.problem).seq).toBe(next.seq);
 expect(restored.problem).toBeUndefined();
});

it("retains event checkpoints when independent grading evidence changes",async()=>{
 const {sameEventEvidence}=await import("./current-source.js");
 expect(sameEventEvidence(JSON.stringify({prefix:"fixed",receipts:["old"]}),JSON.stringify({prefix:"fixed",receipts:["new"]}))).toBe(true);
 expect(sameEventEvidence(JSON.stringify({prefix:"fixed",receipts:[]}),JSON.stringify({prefix:"changed",receipts:[]}))).toBe(false);
 expect(sameEventEvidence("broken",JSON.stringify({prefix:"fixed"}))).toBe(false);
});
