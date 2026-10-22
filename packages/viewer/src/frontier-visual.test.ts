import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readVisualPlan, verifiedVisuals, visualEvidenceSignature } from "./frontier-visual.js";
import { readNativeRecording } from "./frontier-recording.js";
import { qualifiedNativeMilestone } from "../../agent/src/milestones.js";
import { Log, START } from "../test-support/events.js";
function setup() {
  const root=mkdtempSync(join(tmpdir(),"visual-proof-"));mkdirSync(join(root,"frames"));
  const bytes=Buffer.from("synthetic screenshot bytes for hash contract, not visual gameplay proof"),sha1=createHash("sha1").update(bytes).digest("hex");
  writeFileSync(join(root,"frames/000001_0.png"),bytes);
  const log=new Log();log.add(0,{...START,controller:{kind:"human",name:"Test",rom_sha1:"0".repeat(40),input_policy:"frame-held-v1",sample_ms:100,nominal_fps:59.7275}});log.add(1000,{type:"human_sample",turn:0,frame:60,paused:false,screenshot:{path:"frames/000001_0.png",sha1}});
  const body=log.events.map(e=>JSON.stringify(e)).join("\n")+"\n",path=join(root,"events.jsonl");writeFileSync(path,body);
  const plan={v:1,run:log.events[0]?.run,logSha256:createHash("sha256").update(body).digest("hex"),method:"reviewed-victory-screens",milestones:[{name:"RUSTBORO_GYM_TRAINER_JOSH_DEFEATED",sampleSeq:1,screenshots:[{seq:1,path:"frames/000001_0.png",sha1}]}]};
  const save=(value:unknown)=>{writeFileSync(join(root,"viewer-visual-milestones.v1.json"),JSON.stringify(value));};save(plan);return{root,path,plan,save,log};
}
it("binds a reviewed human screenshot to its actual log sample, hash, time and derived provenance",()=>{
 const f=setup(), result=readNativeRecording(f.path,f.plan.run??"",qualifiedNativeMilestone);
 expect(result.splits).toMatchObject([{name:"RUSTBORO_GYM_TRAINER_JOSH_DEFEATED",elapsedMs:1000,derived:true,screenshotEvidence:[{seq:1}]}]);
 expect(result.measurement.logSha256).toBe(f.plan.logSha256);expect(visualEvidenceSignature(f.path)).not.toBe("");
 writeFileSync(join(f.root,"frames/000001_0.png"),"tampered");expect(()=>visualEvidenceSignature(f.path)).toThrow("hash mismatch");
});
it("rejects wrong log identity/hash, unrecorded samples and any agent or resumed reconstruction",()=>{
 const f=setup(), plan=readVisualPlan(f.path), start=f.log.events[0],sample=f.log.events[1];if(start?.type!=="run_start"||sample?.type!=="human_sample"||plan===null)throw Error("fixture");
 const samples=new Map([[sample.seq,sample]]);
 for(const bad of [{...plan,run:"wrong"},{...plan,logSha256:"a".repeat(64)}])expect(()=>verifiedVisuals(bad,start,f.plan.logSha256,samples)).toThrow("bound");
 const agentStart={...start};delete agentStart.controller;expect(()=>verifiedVisuals(plan,agentStart,f.plan.logSha256,samples)).toThrow("bound");
 expect(()=>verifiedVisuals(plan,{...start,start_state:{kind:"save_state",path:"save",sha1:"0".repeat(40)}},f.plan.logSha256,samples)).toThrow("bound");
 expect(()=>verifiedVisuals(plan,start,f.plan.logSha256,new Map())).toThrow("screenshot event");
 expect(()=>verifiedVisuals(plan,start,f.plan.logSha256,new Map([[sample.seq,{...sample,screenshot:{...sample.screenshot,sha1:"0".repeat(40)}}]]))).toThrow("screenshot event");
});
it("rejects malformed, duplicate, escaping or oversized receipts and requires a victory sample among the proof frames",()=>{
 const f=setup();for(const value of [{...f.plan,milestones:[...f.plan.milestones,...f.plan.milestones]},{...f.plan,milestones:[{...f.plan.milestones[0],sampleSeq:2}]},{...f.plan,milestones:[{...f.plan.milestones[0],screenshots:[{seq:1,path:"../escape.png",sha1:"a".repeat(40)}]}]}]){f.save(value);expect(()=>readVisualPlan(f.path)).toThrow("Invalid");}
 writeFileSync(join(f.root,"viewer-visual-milestones.v1.json")," ".repeat(17000));expect(()=>readVisualPlan(f.path)).toThrow("bounds");
 expect(readVisualPlan(join(tmpdir(),"no-such-visual-run/events.jsonl"))).toBeNull();
});

it("rejects each recorded screenshot identity and temporal mismatch independently",()=>{
 const f=setup(), plan=readVisualPlan(f.path), start=f.log.events[0], sample=f.log.events[1];
 if(start?.type!=="run_start"||sample?.type!=="human_sample"||plan===null)throw Error("fixture");
 for(const bad of [{...sample,run:"other-run"},{...sample,screenshot:{...sample.screenshot,path:"frames/000002_0.png"}}]) {
  expect(()=>verifiedVisuals(plan,start,f.plan.logSha256,new Map([[sample.seq,bad]]))).toThrow("screenshot event");
 }
 const future={...sample,seq:2};
 const futurePlan={...plan,milestones:plan.milestones.map(m=>({...m,screenshots:[...m.screenshots,{seq:2,path:sample.screenshot.path,sha1:sample.screenshot.sha1}]}))};
 expect(()=>verifiedVisuals(futurePlan,start,f.plan.logSha256,new Map([[1,sample],[2,future]]))).toThrow("screenshot event");
});
it("rejects realpath escapes even when the schema path and image digest match",()=>{
 const f=setup(), image=join(f.root,"frames/000001_0.png"), external=join(mkdtempSync(join(tmpdir(),"external-proof-")),"same.png");
 writeFileSync(external,"synthetic screenshot bytes for hash contract, not visual gameplay proof");
 unlinkSync(image);symlinkSync(external,image);
 expect(()=>visualEvidenceSignature(f.path)).toThrow("escapes run");
});
it("rejects oversized image metadata before reading the sparse file",()=>{
 const f=setup();truncateSync(join(f.root,"frames/000001_0.png"),2*1024*1024+1);
 expect(()=>visualEvidenceSignature(f.path)).toThrow("exceeds bounds");
});

it("bounds the actual image behind an allowed in-run symlink",()=>{
 const f=setup(),image=join(f.root,"frames/000001_0.png"),target=join(f.root,"frames/oversized.png");
 writeFileSync(target,"");truncateSync(target,2*1024*1024+1);unlinkSync(image);symlinkSync(target,image);
 expect(()=>visualEvidenceSignature(f.path)).toThrow("exceeds bounds");
});
it("supports a reviewed first Roxanne introduction without conflating it with a victory",()=>{
 const f=setup();f.save({...f.plan,method:"reviewed-game-screens",milestones:f.plan.milestones.map(m=>({...m,name:"ROXANNE_FIRST_INTERACTION"}))});
 const result=readNativeRecording(f.path,f.plan.run??"",qualifiedNativeMilestone);
 expect(result.splits).toMatchObject([{name:"ROXANNE_FIRST_INTERACTION",derived:true,screenshotEvidence:[{seq:1}]}]);
 expect(result.splits.some(m=>m.name==="ROXANNE_DEFEATED")).toBe(false);
});
