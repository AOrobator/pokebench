import { createHash } from "node:crypto";
import { appendFileSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { qualifiedNativeMilestone } from "@pokebench/agent/milestones";
import { Log, START, state } from "../test-support/events.js";
import { createNativeRecordingTailer, readNativeRecording } from "./frontier-recording.js";
import { createIncrementalRunLoader, loadRun } from "./workbench-store.js";
function fixture() {
 const source=new Log();source.add(0,START);source.add(10,state());
 const prefix=source.events.map(e=>JSON.stringify(e)).join("\n")+"\n",root=mkdtempSync(join(tmpdir(),"restored-viewer-")),id="restored",folder=join(root,id);writeFileSync(join(root,"placeholder"),"");
 const start:RunEvent={...source.events[0]!,run:id,t:"2026-10-12T22:00:00.000-04:00",...START,start_state:{kind:"save_state",path:"/owned/source.state",sha1:"a".repeat(40)},restoration:{source_run:source.events[0]!.run,source_turn:2,prefix_last_seq:1,prefix_sha256:createHash("sha256").update(prefix).digest("hex")}};
 const next={...source.events[1]!,run:id,seq:2,t:"2026-10-12T22:00:01.000-04:00"};
 return {root,id,folder,prefix,start,next};
}
function write(f:ReturnType<typeof fixture>,prefix=f.prefix,start=f.start,next=f.next){const path=join(f.folder,"events.jsonl");mkdir(f.folder);writeFileSync(join(f.folder,"restoration-prefix.jsonl"),prefix);writeFileSync(path,[start,next].map(e=>JSON.stringify(e)).join("\n")+"\n");return path;}
import { mkdirSync } from "node:fs";
function mkdir(path:string){mkdirSync(path,{recursive:true});}
it("reads only new continuation progress, with current timing/hash and incremental parity",()=>{
 const f=fixture(),path=write(f),tail=createNativeRecordingTailer(path,f.id,qualifiedNativeMilestone),first=tail.read();
 expect(first.last?.name).toBe("MAY");expect(first.view.startMs).toBe(Date.parse(f.start.t));expect(first.view.tokens).toEqual({input:0,output:0});expect(first.measurement.logSha256).toBe(createHash("sha256").update(readFileSync(path)).digest("hex"));expect(first.splits.every(s=>s.seq>1&&s.elapsedMs<=1000)).toBe(true);
 appendFileSync(path,JSON.stringify({...f.next,seq:3,t:"2026-10-12T22:00:02.000-04:00"})+"\n");expect(tail.read()).toEqual(readNativeRecording(path,f.id,qualifiedNativeMilestone));expect(loadRun(f.root,f.id).run.status).toBe("unresponsive");
});
it("does not accept ordinary gaps or a gap after the restored boundary",()=>{
 const f=fixture(),{restoration,...ordinary}=f.start;expect(restoration).toBeDefined();expect(()=>readNativeRecording(write(f,f.prefix,ordinary),f.id,qualifiedNativeMilestone)).toThrow(/order/);
 const g=fixture();expect(()=>readNativeRecording(write(g,g.prefix,g.start,{...g.next,seq:3}),g.id,qualifiedNativeMilestone)).toThrow(/order/);
});
it("requires exact bound source identity, complete prefix, last sequence and save-state provenance",()=>{
 const cases=[{prefix:""},{prefix:f=>f.prefix+"garbage"},{prefix:f=>f.prefix.replace('"seq":1','"seq":3'),rehash:true},{prefix:f=>f.prefix.replaceAll('"run":"2026-10-11T22-00-00_think-swarm_test"','"run":"wrong"'),rehash:true},{prefix:f=>f.prefix.replace('"type":"state"','"type":"run_end"'),rehash:true},{start:f=>({...f.start,start_state:{kind:"boot"}})},{start:f=>({...f.start,restoration:{...f.start.restoration!,prefix_last_seq:4}})}] satisfies {prefix?:string|((f:ReturnType<typeof fixture>)=>string);rehash?:boolean;start?:(f:ReturnType<typeof fixture>)=>unknown}[];
 for(const c of cases){const f=fixture(),prefix=typeof c.prefix==="function"?c.prefix(f):c.prefix??f.prefix;let start=c.start?.(f)??f.start;if(c.rehash)start={...f.start,restoration:{...f.start.restoration!,prefix_sha256:createHash("sha256").update(prefix).digest("hex")}};const path=write(f,prefix,start as RunEvent);expect(()=>readNativeRecording(path,f.id,qualifiedNativeMilestone)).toThrow();}
});
it("withdraws cached continuation data when prefix changes, disappears or becomes a symlink",()=>{
 const f=fixture(),path=write(f),prefix=join(dirname(path),"restoration-prefix.jsonl"),load=createIncrementalRunLoader();expect(load(f.root,f.id).run.status).toBe("unresponsive");writeFileSync(prefix,f.prefix.replace("MAY","MAX"));expect(load(f.root,f.id).run.status).toBe("invalid");writeFileSync(prefix,f.prefix);expect(load(f.root,f.id).run.status).toBe("unresponsive");rmSync(prefix);expect(load(f.root,f.id).run.status).toBe("invalid");writeFileSync(prefix+".copy",f.prefix);symlinkSync(prefix+".copy",prefix);expect(load(f.root,f.id).run.status).toBe("invalid");
});
