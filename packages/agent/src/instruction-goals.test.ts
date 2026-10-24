import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {checkEvent,type RunEvent} from "./events.js";
import {InstructionGoals} from "./instruction-goals.js";
const fixture=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/pokenav-instruction-goals.json.gz",import.meta.url))).toString()) as {events:unknown[]};
const events=fixture.events.map(checkEvent);
const fresh=()=>{const g=new InstructionGoals();for(const e of events.filter(e=>e.seq<=39462))g.observe(e);return g;};
const review={reviewed:[{episode:39430,interpretation:"Scientist asks me to test Match Call"},{episode:39462,interpretation:"Select the POKéNAV to continue"}],updates:[{id:"call",title:"Call President Stone",sources:[{episode:39430,page:7}],parent:null,status:"active" as const,reason:"The scientist asked",completion:"Game confirms the call"},{id:"select",title:"Select POKéNAV",sources:[{episode:39462,page:0}],parent:"call",status:"active" as const,reason:"Immediate instruction",completion:"POKéNAV opens"}]};
it("retains unnamed scientist requests as pending and accepts model-chosen goals without prescribing actions",()=>{
 const g=fresh();expect(g.pending()).toEqual([39430,39462]);expect(g.text()).toContain("Please select the POKéNAV.");g.apply(review);expect(g.pending()).toEqual([]);expect(g.text()).toContain("Call President Stone");expect(g.text()).toContain("POKéNAV opens");
});
it("rejects invalid evidence atomically and never retires a goal on age, arrival or repeated text",()=>{
 const g=fresh();const before=g.text();expect(()=>g.apply({...review,updates:[...review.updates,{...review.updates[0]!,id:"bad",sources:[{episode:999999,page:0}]}]})).toThrow();expect(g.text()).toBe(before);
 g.apply(review);for(const e of events.filter(e=>e.seq>39462))g.observe(e);expect(g.text()).toContain('"status":"active"');
});
it("keeps completion a model claim and requires newer delivered evidence for completion",()=>{
 const g=fresh();g.apply(review);expect(()=>g.apply({reviewed:[],updates:[{...review.updates[1]!,status:"reported_complete",evidence:[999999]}]})).toThrow();
 for(const e of events.filter(e=>e.seq>39462))g.observe(e);
 expect(()=>g.apply({reviewed:[],updates:[{...review.updates[1]!,status:"reported_complete",evidence:[39462]}]})).toThrow();
});
it("ignores failed delivery and foreign-run dialogue",()=>{
 const g=fresh();const n=g.pending();const e=events.find(e=>e.type==="dialogue_auto_advance")!;g.observe({...e,run:"foreign",seq:90000} as RunEvent);expect(g.pending()).toEqual(n);
});
it.each(["parent","cycle","replacement","duplicate","page","schema"])("rejects invalid %s updates without partial changes",kind=>{
 const g=fresh(),before=g.text();let updates:unknown=review.updates;
 if(kind==="parent")updates=[{...review.updates[0]!,parent:"missing"}];
 if(kind==="cycle")updates=[{...review.updates[0]!,parent:"select"},review.updates[1]!];
 if(kind==="replacement")updates=[{...review.updates[0]!,status:"superseded"}];
 if(kind==="duplicate")updates=[review.updates[0]!,review.updates[0]!];
 if(kind==="page")updates=[{...review.updates[0]!,sources:[{episode:39430,page:100}]}];
 if(kind==="schema")updates=[{...review.updates[0]!,status:"verified_complete"}];
 expect(()=>g.apply({reviewed:review.reviewed,updates})).toThrow();expect(g.text()).toBe(before);
});
it("defers a parent while completing a step as an explicitly provisional model report",()=>{
 const g=fresh();g.apply(review);const latest=events.find(e=>e.type==="tool_result"&&e.seq===39462)!;
 g.observe({...latest,seq:50000,id:"later",text:"Another observation"});g.apply({reviewed:[],updates:[{...review.updates[0]!,status:"deferred",reason:"Finish tutorial first"},{...review.updates[1]!,status:"reported_complete",evidence:[50000]}]});
 expect(g.archive(undefined,"call")).toContain('"status":"deferred"');expect(g.archive(undefined,"select")).toContain('"verification":"model_reported"');expect(g.archive()).toContain('"id":"select"');
 expect(()=>g.archive(99999)).toThrow();expect(()=>g.archive(undefined,"unknown")).toThrow();
});
it("repeated dialogue resurfaces for interpretation without erasing unfinished goals",()=>{
 const g=fresh();g.apply(review);const dialogue=events.find(e=>e.type==="dialogue_auto_advance"&&e.turn===1028)!;
 const result=events.find(e=>e.seq===39462)!;g.observe({...dialogue,seq:51000,tool_call_id:"repeat"} as RunEvent);g.observe({...result,seq:51001,id:"repeat"} as RunEvent);
 expect(g.pending()).toEqual([39462]);expect(g.archive(undefined,"call")).toContain('"status":"active"');
 expect(()=>g.apply({reviewed:[{episode:39462,interpretation:"same"},{episode:39462,interpretation:"same"}],updates:[]})).toThrow();
});
it("uses the shared native-proof interface only after a paired successful observation",()=>{
 let done=false;const state=events.find(e=>e.type==="state"&&"started"in e)!;
 const g=new InstructionGoals({observe:()=>{},tasks:pages=>new Map(pages.map(p=>[p,{requires:["existing task"]}])),completed:(_task,s)=>done&&s!==undefined?"existing task complete":null});
 for(const e of events.filter(e=>e.seq<=39462))g.observe(e);g.apply(review);expect(g.text()).not.toContain("native_verified");
 done=true;g.observe({...state,seq:60000} as RunEvent);
 expect(g.text()).not.toContain("native_verified");const result=events.find(e=>e.seq===39462)!;
 g.observe({...result,seq:60001,state_seq:60000,id:"native"} as RunEvent);expect(g.archive(undefined,"select")).toContain('"verification":"native_verified"');
 expect(g.archive(undefined,"call")).toContain("existing task complete");
});
it("retains unknown native completion and treats failed dialogue delivery as no instruction",()=>{
 const g=new InstructionGoals({observe:()=>{},tasks:()=>new Map(),completed:()=>null});
 const d=events.find(e=>e.type==="dialogue_auto_advance")!,r=events.find(e=>e.seq===39430)!;
 g.observe(d);g.observe({...r,is_error:true} as RunEvent);expect(g.pending()).toEqual([]);expect(g.text()).toContain("none recorded");
 for(const e of events.filter(e=>e.seq<=39462))g.observe(e);g.apply(review);expect(g.text()).not.toContain("native_verified");
 expect(()=>g.apply({reviewed:[{episode:99999,interpretation:"unknown"}],updates:[]})).toThrow();
});
it("supports explicit abandonment and supersession without making either a verified success",()=>{
 const g=fresh();g.apply(review);
 g.apply({reviewed:[],updates:[{...review.updates[0]!,status:"abandoned",reason:"My choice"},{...review.updates[1]!,status:"superseded",superseded_by:"call"}]});
 expect(g.archive(undefined,"call")).toContain('"status":"abandoned"');expect(g.archive(undefined,"select")).toContain('"status":"superseded"');
 expect(()=>g.apply({reviewed:[],updates:[{...review.updates[1]!,status:"superseded",superseded_by:"select"}]})).toThrow();
});
it("injects a small unfinished-goal bound and rejects overflow atomically",()=>{
 const g=new InstructionGoals(undefined,{headerGoals:1,headerEpisodes:1,maxUnfinished:2});for(const e of events.filter(e=>e.seq<=39462))g.observe(e);g.apply(review);const before=g.text();
 expect(before).toContain("2 total, 1 shown");expect(()=>g.apply({reviewed:[],updates:[{...review.updates[0]!,id:"third"}]})).toThrow("bound");expect(g.text()).toBe(before);
 g.apply({reviewed:[],updates:[]},"same-call");g.apply({bad:"ignored replay"},"same-call");
});
