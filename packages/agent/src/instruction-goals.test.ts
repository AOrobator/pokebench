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
