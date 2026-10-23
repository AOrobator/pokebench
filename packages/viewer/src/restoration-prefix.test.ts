import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { eventProblem, parseEvent, type RunEvent } from "@pokebench/agent/events";
import { qualifiedNativeMilestone } from "@pokebench/agent/milestones";
import { Log, START, assistant, state } from "../test-support/events.js";
import { restorationNextSequence } from "./restoration-prefix.js";
import { RUN_LOG_MAX_BYTES } from "./run-log.js";
import { createNativeRecordingTailer, readNativeRecording } from "./frontier-recording.js";
import { createIncrementalRunLoader, createWorkbenchLoader, loadRun } from "./workbench-store.js";
const roots:string[]=[];
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture() {
 const source=new Log(),first=source.add(0,START),second=source.add(10,state());
 if(second.type!=="state"||!("started" in second))throw new Error("fixture state missing");
 const prefix=source.events.map(e=>JSON.stringify(e)).join("\n")+"\n",root=mkdtempSync(join(tmpdir(),"restored-viewer-")),id="restored",folder=join(root,id);roots.push(root);
 const bound={source_run:first.run,source_turn:2,prefix_last_seq:1,prefix_sha256:createHash("sha256").update(prefix).digest("hex")};
 const start:RunEvent={...first,run:id,t:"2026-10-12T22:00:00.000-04:00",...START,start_state:{kind:"save_state",path:"/owned/source.state",sha1:"a".repeat(40)},restoration:bound};
 const next={...second,run:id,seq:2,t:"2026-10-12T22:00:01.000-04:00"};
 return {root,id,folder,prefix,start,next,bound};
}
function write(f:ReturnType<typeof fixture>,prefix=f.prefix,start:unknown=f.start,next:RunEvent=f.next){const path=join(f.folder,"events.jsonl");mkdir(f.folder);writeFileSync(join(f.folder,"restoration-prefix.jsonl"),prefix);writeFileSync(path,[start,next].map(e=>JSON.stringify(e)).join("\n")+"\n");return path;}
function mkdir(path:string){mkdirSync(path,{recursive:true});}
it("reads only new continuation progress, with current timing/hash and incremental parity",()=>{
 const f=fixture(),path=write(f,f.prefix,f.start,{...f.next,game_stats:{pokemon_captures:0,evolved_pokemon:1,used_pokecenter:0,saved_game:0}}),tail=createNativeRecordingTailer(path,f.id,qualifiedNativeMilestone),first=tail.read();
 expect(first.last?.name).toBe("MAY");expect(first.view.startMs).toBe(Date.parse(f.start.t));expect(first.view.tokens).toEqual({input:0,output:0});expect(first.measurement.logSha256).toBe(createHash("sha256").update(readFileSync(path)).digest("hex"));expect(first.splits).toEqual([]);
 appendFileSync(path,JSON.stringify({v:1,run:f.id,seq:3,t:"2026-10-12T22:00:02.000-04:00",type:"milestone",turn:1,name:"FIRST_EVOLUTION",kind:"story",origin:"observed",server_timestamp:2,evidence:[2]})+"\n");const continued=tail.read();expect(continued.splits).toMatchObject([{name:"FIRST_EVOLUTION",elapsedMs:2000,seq:3}]);expect(continued).toEqual(readNativeRecording(path,f.id,qualifiedNativeMilestone));expect(loadRun(f.root,f.id).run.status).toBe("unresponsive");
});
it("does not accept ordinary gaps or a gap after the restored boundary",()=>{
 const f=fixture(),{restoration,...ordinary}=f.start;expect(restoration).toBeDefined();expect(()=>readNativeRecording(write(f,f.prefix,ordinary),f.id,qualifiedNativeMilestone)).toThrow(/order/);
 const g=fixture();expect(()=>readNativeRecording(write(g,g.prefix,g.start,{...g.next,seq:3}),g.id,qualifiedNativeMilestone)).toThrow(/order/);
});
it("requires exact bound source identity, complete prefix, last sequence and save-state provenance",()=>{
 const cases=[
  {prefix:"",expected:/incomplete/},
  {prefix:f=>f.prefix+"garbage",expected:/incomplete/},
  {prefix:f=>f.prefix.replace('"seq":1','"seq":3'),rehash:true,expected:/identity or order/},
  {prefix:f=>f.prefix.replaceAll('"run":"2026-10-11T22-00-00_think-swarm_test"','"run":"wrong"'),rehash:true,expected:/identity or order/},
  {start:f=>({...f.start,start_state:{kind:"boot"}}),expected:/provenance/},
  {start:f=>({...f.start,restoration:{...f.bound,prefix_last_seq:4}}),expected:/bound identity/},
 ] satisfies {prefix?:string|((f:ReturnType<typeof fixture>)=>string);rehash?:boolean;start?:(f:ReturnType<typeof fixture>)=>unknown;expected:RegExp}[];
 for(const c of cases){const f=fixture(),prefix=typeof c.prefix==="function"?c.prefix(f):c.prefix??f.prefix;let start=c.start?.(f)??f.start;if(c.rehash)start={...f.start,restoration:{...f.bound,prefix_sha256:createHash("sha256").update(prefix).digest("hex")}};const path=write(f,prefix,start);expect(()=>readNativeRecording(path,f.id,qualifiedNativeMilestone)).toThrow(c.expected);}

});
it("withdraws cached continuation data when prefix changes, disappears or becomes a symlink",()=>{
 const f=fixture(),path=write(f),prefix=join(dirname(path),"restoration-prefix.jsonl"),load=createIncrementalRunLoader();expect(load(f.root,f.id).run.status).toBe("unresponsive");writeFileSync(prefix,f.prefix.replace("MAY","MAX"));expect(load(f.root,f.id).run.status).toBe("invalid");writeFileSync(prefix,f.prefix);expect(load(f.root,f.id).run.status).toBe("unresponsive");rmSync(prefix);expect(load(f.root,f.id).run.status).toBe("invalid");writeFileSync(prefix+".copy",f.prefix);symlinkSync(prefix+".copy",prefix);expect(load(f.root,f.id).run.status).toBe("invalid");
});

it("withdraws summary-cache hits when bound prefix changes without a log append",async()=>{
 const f=fixture(),path=write(f),load=createWorkbenchLoader({build:null});expect((await load.load(f.root,f.id)).run.status).toBe("unresponsive");
 writeFileSync(join(dirname(path),"restoration-prefix.jsonl"),f.prefix.replace("MAY","MAX"));expect((await load.load(f.root,f.id)).run.status).toBe("invalid");
});
it("rejects a changed prefix through an already-created direct tailer",()=>{
 const f=fixture(),path=write(f),tail=createNativeRecordingTailer(path,f.id,qualifiedNativeMilestone);tail.read();writeFileSync(join(dirname(path),"restoration-prefix.jsonl"),f.prefix.replace("MAY","MAX"));expect(()=>tail.read()).toThrow(/prefix changed/);
});

it("does not replay source tokens or source milestones into the new run",()=>{
 const f=fixture(),old=new Log();old.add(0,START);old.add(1,assistant());const witness=old.add(2,state({game_stats:{pokemon_captures:0,evolved_pokemon:1,used_pokecenter:0,saved_game:0}}));old.add(3,{type:"milestone",turn:1,name:"FIRST_EVOLUTION",kind:"story",origin:"observed",server_timestamp:1,evidence:[witness.seq]});
 const prefix=old.events.map(e=>JSON.stringify(e)).join("\n")+"\n",start={...f.start,restoration:{...f.bound,prefix_last_seq:3,prefix_sha256:createHash("sha256").update(prefix).digest("hex")}};
 const control=join(f.root,"source-events.jsonl");writeFileSync(control,prefix);const original=readNativeRecording(control,f.bound.source_run,qualifiedNativeMilestone);expect(original.splits).toMatchObject([{name:"FIRST_EVOLUTION",seq:3}]);expect(original.view.tokens.input).toBe(500);
 const path=write(f,prefix,start,{...f.next,seq:4}),result=readNativeRecording(path,f.id,qualifiedNativeMilestone);
 expect(result.view.tokens).toEqual({input:0,output:0});expect(result.view.milestones.some(m=>m.name==="FIRST_EVOLUTION")).toBe(false);expect(result.splits).toEqual([]);
});
it("enforces metadata, bounded bytes and complete prefix framing",()=>{
 const f=fixture(),path=write(f);for(const restoration of [{...f.bound,source_run:f.id},{...f.bound,source_turn:0},{...f.bound,prefix_last_seq:Number.MAX_SAFE_INTEGER}])expect(()=>restorationNextSequence(path,{...f.start,restoration})).toThrow(/provenance/);
 const raw=f.prefix.trimEnd(),start={...f.start,restoration:{...f.bound,prefix_sha256:createHash("sha256").update(raw).digest("hex")}};writeFileSync(join(f.folder,"restoration-prefix.jsonl"),raw);expect(()=>restorationNextSequence(path,start)).toThrow(/incomplete/);
 truncateSync(join(f.folder,"restoration-prefix.jsonl"),RUN_LOG_MAX_BYTES+1);expect(()=>restorationNextSequence(path,f.start)).toThrow(/bound/);
});

it("rejects schema-valid terminal, temporal, start-marker and future-turn violations at the prefix guard",()=>{
 const f=fixture(),original=f.prefix.trimEnd().split("\n").map(parseEvent),first=original[0],second=original[1];if(first===undefined||second===undefined)throw new Error("missing fixture events");
 const terminal=new Log();terminal.add(0,START);terminal.add(10,{type:"run_end",turn:1,reason:"budget",furthest_milestone:null,turns:1,wall_ms:10,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
 const cases:RunEvent[][]=[terminal.events,[{...first,t:"2026-99-11T22:00:00.000-04:00"},second],[{...first,t:"2026-10-11T22:00:00.020-04:00"},second],[first,{...second,t:"2026-10-12T22:00:00.001-04:00"}],[{...second,seq:0}],[first,{...first,seq:1,t:second.t}],[first,{...second,turn:3}]];
 for(const rows of cases){for(const row of rows)expect(eventProblem(row)).toBeNull();const g=fixture(),last=rows.at(-1);if(last===undefined)throw new Error("empty case");const prefix=rows.map(e=>JSON.stringify(e)).join("\n")+"\n",start={...g.start,restoration:{...g.bound,prefix_last_seq:last.seq,prefix_sha256:createHash("sha256").update(prefix).digest("hex")}};const path=write(g,prefix,start,{...g.next,seq:last.seq+1});expect(()=>readNativeRecording(path,g.id,qualifiedNativeMilestone)).toThrow(/Restoration prefix identity or order/);}
});
