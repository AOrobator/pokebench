import {it,expect} from "vitest";
import {rehearseCampaign} from "./roxanne-rehearsal.js";
import {CampaignController,MemoryCampaignStore,createCampaign} from "./roxanne-campaign.js";
it.each(["revision_wins","no_nominee"] as const)("rehearses full ordinary loop and reserve discipline: %s",async scenario=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("fixture",0)));
 const artifacts=new Map<string,unknown>();const receipt=await rehearseCampaign(c,(id,value)=>{artifacts.set(id,value);},scenario);
 expect(receipt.gpuCalls).toBe(0);expect(receipt.leasesReleased).toBe(true);
 expect(receipt.episodes).toBe(scenario==="revision_wins"?36:10);
 expect(receipt.result.status).toBe(scenario==="revision_wins"?"provisional_winner":"no_winner");
 expect(receipt.spentMs).toBeLessThanOrEqual(57_600_000);
 expect(artifacts.has("frozen-finalist")).toBe(scenario==="revision_wins");
 expect(c.state.jobs.every(j=>j.status==="complete")).toBe(true);
 expect(c.state.batches.every(b=>b.gradeHash!==null&&b.blindMap!==null)).toBe(true);
});
it("chooses the parent using original assistant tokens after locked equal-token judgments",async()=>{
 const {runAutonomousCampaign}=await import("./roxanne-autonomous.js"),{gradeDigest,episodeTraceHash}=await import("./roxanne-campaign-runner.js"),{insertReminder}=await import("./roxanne-restore.js"),{scoreRecovery}=await import("./roxanne-score.js"),{assistant}=await import("../test-support/pi.js");
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("token-tie",0))),frozen:import("./roxanne-campaign-runner.js").Candidate[]=[],prompts=new Map<string,string>();
 const start=(family:string,n:string)=>({id:family,family,restoreHash:n.repeat(64),qualified:true});
 const inputs:import("./roxanne-autonomous.js").AutonomousInputs={development:[start("d1","1"),start("d2","2")],readiness:[start("r1","3"),start("r2","4")],endpoints:["fixture0","fixture1"],seed:1};
 const host:import("./roxanne-autonomous.js").AutonomousHost={mode:"offline-fixture",now:()=>0,acquire:()=>Promise.resolve(()=>Promise.resolve()),deadline:()=>()=>undefined,
 episode:j=>{
  const text=j.arm==="baseline"?"":prompts.get(j.promptHash);if(text===undefined)throw new Error("unfrozen test prompt");
  const delivery=insertReminder([{role:"user",content:"unchanged loss history",timestamp:0}],j.arm!=="baseline",text);
  const trace={kind:"fixture" as const,frames:[{seq:0,turn:0,elapsedMs:0,map:[11,3],party:[{identity:"a",species:280,level:15,moves:[10,45,116,52]}],roxanneBattle:false,victory:false,coherent:true}]};
  const o={reason:"budget",trace,messages:[...delivery.messages,assistant({text:"same failed attempt",input:j.arm==="a"?100:10})],reminder:delivery.receipt,nativeScore:scoreRecovery(trace.frames)};
  return Promise.resolve({...o,traceHash:episodeTraceHash(o)});
 },record:()=>Promise.resolve(),grade:rows=>{
  const judgments=rows.map(r=>({id:r.id,diagnosis:"invalid_action" as const,factualError:false,verified:true,tokens:0,evidence:["owned native evidence"]}));
  return Promise.resolve({ids:rows.map(r=>r.id),hash:gradeDigest(rows.map(r=>r.id),judgments),judgments});
 },freezeCandidate:prompt=>{frozen.push(prompt);prompts.set(prompt.hash,prompt.text);return Promise.resolve();},freezeFinalist:()=>Promise.reject(new Error("no nominee expected")),qualifyHeldout:()=>Promise.reject(new Error("holdouts remain sealed")),report:()=>Promise.resolve()};
 const result=await runAutonomousCampaign(c,inputs,host);
 expect(result.status).toBe("no_winner");expect(frozen.map(p=>p.id)).toEqual(["a","b","b-r1"]);
 expect(result.development.filter(r=>r.candidate.id==="a").map(r=>r.tokens)).toEqual([100,100]);expect(result.development.filter(r=>r.candidate.id==="b").map(r=>r.tokens)).toEqual([10,10]);
 expect(c.state.batches.every(b=>b.gradeHash!==null)).toBe(true);expect(frozen[2]).toMatchObject({parent:"b"});
});
it("can complete every unchanged confirmation phase after two charged failures when episodes naturally finish early",async()=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("approved-recovery",0,{gpuMs:2_460_992,episodes:2})));
 const receipt=await rehearseCampaign(c,()=>{},"revision_wins",60_000);
 expect(receipt.result.status).toBe("provisional_winner");expect(receipt.episodes).toBe(36);expect(c.state.priorEpisodes+c.state.jobs.length).toBe(38);expect(receipt.spentMs).toBeLessThan(57_600_000);expect(receipt.leasesReleased).toBe(true);expect(c.state.batches.map(b=>b.phase)).toEqual(["explore","revise","replicate","validate","controls"]);
});
