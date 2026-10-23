import {createHash} from "node:crypto";
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,symlinkSync,unlinkSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync,gzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {Log,START,RUN,state} from "../test-support/events.js";
import {SAVE1,writeArchive} from "../test-support/raw-ram.js";
import {progressAttacher,progressSignature} from "./progress-recovery.js";
import {readNativeRecording} from "./frontier-recording.js";
import {qualifiedNativeMilestone} from "../../agent/src/milestones.js";
const sha=(data:Buffer|string)=>createHash("sha256").update(data).digest("hex");
function fixture(native=false,resumed=false) {
 const dir=join(mkdtempSync(join(tmpdir(),"pokebench-progress-")),RUN);mkdirSync(join(dir,"derived"),{recursive:true});
 const log=new Log();log.add(0,{...START,start_state:resumed?{kind:"save_state",path:"save",sha1:"a".repeat(40)}:{kind:"boot"},harness_features:native?["all-gym-story-milestones-v1"]:[]});
 const progress=(won:boolean)=>{const flags=Buffer.alloc(300);if(won)flags[0x8f>>3]=128;return {flags:flags.toString("hex"),rustboro_stage:0,devon_stage:0,letter:false};};
 const rows:{seq:number;raw_ram:ReturnType<typeof writeArchive>;story_progress:ReturnType<typeof progress>}[]=[];
 for(const [i,won] of [false,true,true].entries()) {
  const ref=writeArchive(dir,i+1,[[0x03005d8c,[0x18,0x5a,0x02,0x02]],[SAVE1+0x1270+(0x8f>>3),[won?128:0]]]);
  const path=join(dir,ref.path),raw:unknown=JSON.parse(gunzipSync(readFileSync(path)).toString());
  const body=gzipSync(JSON.stringify({...raw as object,rom_sha1:"f3ae088181bf583e55daf962a92bb46f4f1d07b7"}));writeFileSync(path,body);ref.sha256=sha(body);
  const e=log.add((i+1)*1000,state({location:"RUSTURF TUNNEL",map_id:[24,4],raw_ram:ref}));
  rows.push({seq:e.seq,raw_ram:ref,story_progress:progress(won)});
 }
 const text=log.events.map(e=>JSON.stringify(e)+"\n").join("");writeFileSync(join(dir,"events.jsonl"),text);
 const footer={v:1,run:RUN,source:"raw-ram-all-gym-story-v1",rom_sha1:"f3ae088181bf583e55daf962a92bb46f4f1d07b7",through_seq:3,log_bytes:Buffer.byteLength(text),log_sha256:sha(text),rows:3};
 const save=()=>{writeFileSync(join(dir,"derived/story_progress.jsonl"),[...rows,footer].map(r=>JSON.stringify(r)+"\n").join(""));};save();return {dir,log,rows,footer,save};
}
it("backfills through the real recording reader with first-observation time, once",()=>{
 const f=fixture(),read=readNativeRecording(join(f.dir,"events.jsonl"),RUN,qualifiedNativeMilestone);
 expect(read.splits.filter(s=>s.name==="DEVON_GOODS_RECOVERED")).toEqual([expect.objectContaining({seq:2,elapsedMs:2000,derived:true})]);
 expect(read.measurement.features).not.toContain("all-gym-story-milestones-v1");
 expect(read.measurement.recoveredFeatures).toEqual(["all-gym-story-milestones-v1"]);
 expect(read.measurement.rawSplits.find(s=>s.name==="DEVON_GOODS_RECOVERED")?.evidence).toEqual([2]);
 expect(progressSignature(f.dir)).toMatch(/^:progress=[a-f0-9]{64}$/);
});
it("does not repair modern missing events and honors witnessed resumed transitions",()=>{
 const native=fixture(true);expect(readNativeRecording(join(native.dir,"events.jsonl"),RUN,qualifiedNativeMilestone).splits.some(s=>s.name==="DEVON_GOODS_RECOVERED")).toBe(false);
 const resumed=fixture(false,true);expect(readNativeRecording(join(resumed.dir,"events.jsonl"),RUN,qualifiedNativeMilestone).splits.some(s=>s.name==="DEVON_GOODS_RECOVERED")).toBe(true);
});
it("refuses changed log prefixes, incomplete or tampered rows and mismatched raw bytes",()=>{
 for(const mode of ["prefix","omit","value","hash","count","identity","symlink"]){
  const f=fixture();
  if(mode==="prefix")f.footer.log_sha256="0".repeat(64);
  if(mode==="omit")f.rows.splice(1,1);
  const second=f.rows[1];if(second===undefined)throw Error("missing row");
  if(mode==="value")second.story_progress.flags="00".repeat(300);
  if(mode==="hash")second.raw_ram.sha256="0".repeat(64);
  if(mode==="count")f.footer.rows=4;
  if(mode==="identity")f.footer.run="other-run";
  f.save();
  if(mode==="symlink"){const p=join(f.dir,"derived/story_progress.jsonl");writeFileSync(p+".real",readFileSync(p));unlinkSync(p);symlinkSync(p+".real",p);}
  const attach=progressAttacher(f.dir),events=f.log.events.map(attach);
  expect(events[2]).toEqual(f.log.events[2]);
 }
});
it("continues archived native recovery after the backfilled live prefix",()=>{
 const f=fixture(),attach=progressAttacher(f.dir);f.log.events.forEach(attach);
 const previous=f.log.events[3];if(previous?.type!=="state"||!("started" in previous))throw Error("missing native fixture");
 const appended={...previous,seq:4};
 expect(attach(appended)).toMatchObject({story_progress:f.rows[2]?.story_progress});
});

it("missing row with a correct count stops later attachment",()=>{
 const f=fixture();f.rows.splice(1,1);f.footer.rows=2;f.save();
 const events=f.log.events.map(progressAttacher(f.dir));
 expect(events[1]).toMatchObject({story_progress:f.rows[0]?.story_progress});
 expect(events[2]).toEqual(f.log.events[2]);
 expect(events[3]).toEqual(f.log.events[3]);
});
