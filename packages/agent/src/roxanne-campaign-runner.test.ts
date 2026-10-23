import {it,expect} from "vitest";
import {CampaignController,MemoryCampaignStore,createCampaign,digest,type CampaignJob} from "./roxanne-campaign.js";
import {episodeTraceHash,verifyEpisodeOutcome,gradeDigest,candidate,revise,nominatable,selectParent,runFrozenBatch,type EpisodeHost,type DevelopmentResult} from "./roxanne-campaign-runner.js";
import {scoreRecovery,type RecoveryFrame} from "./roxanne-score.js";
import {insertReminder} from "./roxanne-restore.js";
const job=(id:string,endpoint="gpu0"):CampaignJob=>({id,arm:id==="a"?"candidate":"baseline",family:"dev",endpoint,capMs:1000,promptHash:digest(id==="a"?"secret reminder":""),restoreHash:"b".repeat(64)});
const mon={identity:"fixture",species:280,level:15,moves:[10,45,116,52]};
const frames:RecoveryFrame[]=[0,1,2,3].map(seq=>({seq,turn:seq,elapsedMs:seq*10,map:seq===1||seq===2?[0,31]:[11,3],party:[{...mon,level:seq>=2?16:15}],roxanneBattle:seq===3,victory:false,coherent:true}));
const trace={kind:"fixture" as const,frames};const score=scoreRecovery(frames);
const outcome=(messages:import("@mariozechner/pi-ai").Message[]=[],reminder:import("./roxanne-restore.js").ReminderReceipt|null=null)=>{const o={reason:"budget",messages,reminder,trace,nativeScore:score};return {...o,traceHash:episodeTraceHash(o)};};

it("runs the real batch controller through injected host, records originals and blinds only the inserted text",async()=>{let now=0;const calls:string[]=[];const c=new CampaignController(new MemoryCampaignStore(createCampaign("fixture",0)));const host:EpisodeHost={mode:"offline-fixture",now:()=>now,acquire:e=>{calls.push(`lease:${e}`);return Promise.resolve(()=>{calls.push(`release:${e}`);return Promise.resolve();});},deadline:()=>()=>undefined,episode:j=>{calls.push(`episode:${j.id}`);now+=100;const s=insertReminder([{role:"user",content:"original loss history",timestamp:0}],j.arm==="candidate","secret reminder");return Promise.resolve(outcome([...s.messages],s.receipt));},record:(id,o)=>{calls.push(`record:${id}`);if(id==="a")expect(o.messages).toHaveLength(2);return Promise.resolve();},grade:rows=>{expect(rows).toHaveLength(2);expect(rows.every(r=>r.messages.length===1)).toBe(true);expect(JSON.stringify(rows)).not.toContain("secret reminder");return Promise.resolve({hash:gradeDigest(rows.map(r=>r.id)),ids:rows.map(r=>r.id)});}};await runFrozenBatch(c,"explore",[job("a"),job("b")],host);expect(c.state.spentMs).toBe(200);expect(c.state.reservedMs).toBe(0);expect(calls).toEqual(["lease:gpu0","episode:a","record:a","release:gpu0","lease:gpu0","episode:b","record:b","release:gpu0"]);});
it("records a failed host as incomplete and releases its owned endpoint without resampling",async()=>{const c=new CampaignController(new MemoryCampaignStore(createCampaign("fixture",0)));let released=0;const host:EpisodeHost={mode:"offline-fixture",now:()=>0,acquire:()=>Promise.resolve(()=>{released++;return Promise.resolve();}),deadline:()=>()=>undefined,episode:()=>Promise.reject(new Error("uncertain response")),record:()=>Promise.resolve(),grade:()=>Promise.reject(new Error("must not grade"))};await expect(runFrozenBatch(c,"explore",[job("a")],host)).rejects.toThrow("uncertain");expect(released).toBe(1);expect(c.state.stopped).toContain("incomplete");expect(()=> { c.resume(); }).toThrow("uncertain");});
it("allows only one evidenced focused revision and never inherits parent recovery",()=>{const p=candidate("a","reminder"),r=revise(p,"invalid_action",["run:12"]);expect(r.parent).toBe("a");expect(()=>revise(r,"abandonment",["run:20"])).toThrow();expect(()=>revise(p,"none",[])).toThrow();const row=(family:string,c=p):DevelopmentResult=>({candidate:c,family,recovered:true,baselineRecovered:false,unchanged:0,wins:0,tokens:100,factualError:false,evidence:"run:12",diagnosis:"none"});const rows=[row("d1"),row("d2"),row("d1",r)];expect(nominatable(rows,r.hash,["d1","d2"],true)).toBe(false);expect(nominatable(rows,p.hash,["d1","d2"],true)).toBe(true);expect(nominatable(rows,p.hash,["d1","d2"],false)).toBe(false);expect(selectParent(rows)?.hash).toBe(p.hash);expect(selectParent([])).toBe(null);});
it("charges teardown occupancy and stops on a persisted overrun",async()=>{
 let now=0;const c=new CampaignController(new MemoryCampaignStore(createCampaign("fixture",0)));
 const host:EpisodeHost={mode:"offline-fixture",now:()=>now,acquire:()=>Promise.resolve(()=>{now+=1001;return Promise.resolve();}),deadline:()=>()=>undefined,episode:()=>Promise.resolve(outcome()),record:()=>Promise.resolve(),grade:()=>{throw new Error("must not grade overrun");}};
 await expect(runFrozenBatch(c,"explore",[job("b")],host)).rejects.toThrow(/occupancy/);expect(c.state.spentMs).toBe(1001);expect(c.state.jobs[0]?.status).toBe("complete");
});
it("stops the fixed batch on acquisition failure without fabricating an episode",async()=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("fixture",0)));
 const host:EpisodeHost={mode:"offline-fixture",now:()=>0,acquire:()=>Promise.reject(new Error("lease unavailable")),deadline:()=>()=>undefined,episode:()=>{throw new Error("must not start");},record:()=>Promise.resolve(),grade:()=>{throw new Error("must not grade");}};
 await expect(runFrozenBatch(c,"explore",[job("a")],host)).rejects.toThrow(/lease unavailable/);expect(c.state.jobs[0]?.status).toBe("pending");expect(c.state.stopped).toContain("incomplete");
});
it("recomputes full trace scores, checks evidence hashes and forbids fixture evidence in measured hosts",()=>{
 const o=outcome();expect(()=> { verifyEpisodeOutcome(job("b"),o,"offline-fixture"); }).not.toThrow();
 expect(()=> { verifyEpisodeOutcome(job("b"),{...o,nativeScore:{...score,strictRecovery:false}},"offline-fixture"); }).toThrow(/recomputed/);
 expect(()=> { verifyEpisodeOutcome(job("b"),{...o,traceHash:"a".repeat(64)},"offline-fixture"); }).toThrow(/trace hash/);
 expect(()=> { verifyEpisodeOutcome(job("b"),o,"measured"); }).toThrow(/native trace/);
 expect(()=> { verifyEpisodeOutcome(job("a"),o,"offline-fixture"); }).toThrow(/reminder/);
});
it("replays real native evidence through verification and anonymizes its full event sequence",async()=>{
 const {readFileSync}=await import("node:fs"),{gunzipSync}=await import("node:zlib"),{checkEvent}=await import("./events.js"),{recoveryFrames}=await import("./roxanne-score.js");
 const raw:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/roxanne-ea04-recovery.json.gz",import.meta.url))).toString());if(!Array.isArray(raw))throw new Error("invalid recording");
 const events=raw.map(checkEvent),first=events.find(e=>e.type==="state"&&e.seq===17303);if(first===undefined)throw new Error("missing source state");
 const nativeTrace={kind:"native" as const,events,startSeq:17303,startedAtMs:Date.parse(first.t)};
 const o={reason:"budget",messages:[],reminder:null,trace:nativeTrace,nativeScore:scoreRecovery(recoveryFrames(events,17303,nativeTrace.startedAtMs))};const result={...o,traceHash:episodeTraceHash(o)};
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("native-replay-test",0)));
 const host:EpisodeHost={mode:"measured",now:()=>0,acquire:()=>Promise.resolve(()=>Promise.resolve()),deadline:()=>()=>undefined,episode:()=>Promise.resolve(result),record:()=>Promise.resolve(),grade:rows=>{for(const row of rows){if(row.trace.kind!=="native")throw new Error("lost native trace");expect(row.trace.events.length).toBeGreaterThan(2000);expect(row.trace.events.every(e=>e.run===row.id&&e.type!=="run_start")).toBe(true);}return Promise.resolve({hash:gradeDigest(rows.map(r=>r.id)),ids:rows.map(r=>r.id)});}};
 await runFrozenBatch(c,"explore",[{...job("b"),capMs:1_800_000}],host);expect(c.state.jobs[0]?.status).toBe("complete");
});
it("the batch path rejects a false score after retaining the original evidence and cost",async()=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("bad-score-test",0)));let recorded=false;
 const bad={...outcome(),nativeScore:{...score,strictRecovery:false}};
 const host:EpisodeHost={mode:"offline-fixture",now:()=>0,acquire:()=>Promise.resolve(()=>Promise.resolve()),deadline:()=>()=>undefined,episode:()=>Promise.resolve(bad),record:()=>{recorded=true;return Promise.resolve();},grade:rows=>Promise.resolve({hash:gradeDigest(rows.map(r=>r.id)),ids:rows.map(r=>r.id)})};
 await expect(runFrozenBatch(c,"explore",[job("b")],host)).rejects.toThrow(/recomputed score/);expect(recorded).toBe(true);expect(c.state.jobs[0]?.status).toBe("complete");expect(c.state.stopped).toContain("incomplete");
});
it.each(["ram","identity","moves","diagnostic","map"] as const)("preserves a schema-valid native %s gap through verification instead of silently grading recovery",async defect=>{
 const {readFileSync}=await import("node:fs"),{gunzipSync}=await import("node:zlib"),{checkEvent}=await import("./events.js"),{recoveryFrames,scoreReadiness}=await import("./roxanne-score.js");
 const raw:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/roxanne-ea04-recovery.json.gz",import.meta.url))).toString());if(!Array.isArray(raw))throw new Error("invalid recording");
 const events=raw.map(checkEvent);const i=events.findIndex(e=>e.type==="state"&&e.seq===17751),s=events[i];if(s?.type!=="state"||!("started"in s))throw new Error("missing test-owned state");
 const corrupt={...s,...(defect==="map"?{map_id:null}:{}),party:s.party.map((p,j)=>j!==0?p:{...p,...(defect==="identity"?{identity:null}:{}),...(defect==="moves"?{moves:null}:{}),...(defect==="diagnostic"?{diagnostic:"unqualified native party"}:{})})};
 if(defect==="ram")delete corrupt.raw_ram;events[i]=checkEvent(corrupt);
 const fs=recoveryFrames(events,17303),gap=fs.filter(f=>f.seq===17751);
 expect(gap).toHaveLength(1);expect(gap[0]).toMatchObject({coherent:false});expect(scoreReadiness(fs.filter(f=>f.seq>=17751))).toBe(false);
 const honest=scoreRecovery(fs,{turns:1000,ms:4_000_000});expect(honest).toMatchObject({verified:false,eventualRecovery:false,victory:true});
 const first=events.find(e=>e.seq===17303);if(first===undefined)throw new Error("missing start");
 const o={reason:"budget",messages:[],reminder:null,trace:{kind:"native" as const,events,startSeq:17303,startedAtMs:Date.parse(first.t)},nativeScore:{...scoreRecovery(fs),verified:true}};
 expect(()=> {verifyEpisodeOutcome({...job("b"),capMs:1_800_000},{...o,traceHash:episodeTraceHash(o)},"measured");}).toThrow(/recomputed/);
});
it("blinds realistic usage and actual recorder context telemetry at the grade consumer while retaining originals",async()=>{
 const {mkdtempSync,readFileSync,rmSync}=await import("node:fs"),{tmpdir}=await import("node:os"),{join}=await import("node:path"),{gunzipSync}=await import("node:zlib"),{checkEvent,parseEvent}=await import("./events.js"),{recoveryFrames}=await import("./roxanne-score.js"),{RunLog,easternTimestamp}=await import("./run-log.js"),{RunRecorder}=await import("./recorder.js"),{FrameStore}=await import("./frames.js"),{RUN_START_META}=await import("../test-support/events.js"),{assistant}=await import("../test-support/pi.js");
 const raw:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/roxanne-ea04-recovery.json.gz",import.meta.url))).toString());if(!Array.isArray(raw))throw new Error("invalid recording");const archived=raw.map(checkEvent),first=archived.find(e=>e.seq===17303);if(first===undefined)throw new Error("missing start");
 const dir=mkdtempSync(join(tmpdir(),"roxanne-blind-")),originals:import("./roxanne-campaign-runner.js").EpisodeOutcome[]=[];
 try{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("blind-seam",0)));
 const host:EpisodeHost={mode:"measured",now:()=>0,acquire:()=>Promise.resolve(()=>Promise.resolve()),deadline:()=>()=>undefined,episode:async j=>{
  const shift=j.arm==="baseline"?20000:10000,epoch=Date.parse(first.t)+shift;let tick=0;
  const delivered=insertReminder([{role:"user",content:"original history",timestamp:epoch+5}],j.arm!=="baseline","secret reminder");
  const reply={...assistant({text:"same action",input:j.arm==="baseline"?100:104,output:j.arm==="baseline"?10:12}),timestamp:epoch+10};
  const log=RunLog.create(dir,`2026-10-11T22-00-00_blind_${j.id}`,()=>new Date(epoch)),rec=new RunRecorder({log,frames:new FrameStore(dir,1000,()=>undefined),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.reject(new Error("no game calls"))},now:()=>tick});
  log.append({type:"run_start",turn:0,...RUN_START_META});await rec.transformContext([...delivered.messages]);rec.recordRequestContext({mode:"full",scene:"overworld",state_seq:null,system_prompt:"same core",prompt_sha256:digest(j.arm),tools:[],tools_sha256:digest([]),component_chars:{core_text:9,guidance_text:0,canonical_history_json:j.arm==="baseline"?100:116}});tick=j.arm==="baseline"?40:20;await rec.emit({type:"message_update",message:reply,assistantMessageEvent:{type:"text_delta",contentIndex:0,delta:"same action",partial:reply}});tick*=3;await rec.emit({type:"message_end",message:reply});
  log.append({type:"compaction",turn:1,from_tokens:reply.usage.input,to_tokens:reply.usage.input/2});rec.end("budget");
  const telemetry=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent).filter(e=>["turn_start","assistant","compaction","run_end"].includes(e.type));
  const trace={kind:"native" as const,events:[...telemetry,...archived.map(e=>({...e,t:easternTimestamp(new Date(Date.parse(e.t)+shift))}))],startSeq:17303,startedAtMs:epoch};
  const o={reason:"budget",messages:[...delivered.messages,reply],reminder:delivered.receipt,trace,nativeScore:scoreRecovery(recoveryFrames(trace.events,17303))};return {...o,traceHash:episodeTraceHash(o)};
 },record:(_id,o)=>{originals.push(o);return Promise.resolve();},grade:rows=>{
  for(const row of rows)if(row.trace.kind==="native")row.trace.events.forEach(checkEvent);
  const comparable=rows.map(r=>({...r,id:"anonymous",traceHash:"projection",trace:r.trace.kind==="native"?{...r.trace,events:r.trace.events.map(e=>({...e,run:"anonymous"}))}:r.trace}));
  expect(comparable[0]).toEqual(comparable[1]);expect(rows.every(r=>r.traceHash!==originals[0]?.traceHash&&r.traceHash!==originals[1]?.traceHash)).toBe(true);
  return Promise.resolve({hash:gradeDigest(rows.map(r=>r.id)),ids:rows.map(r=>r.id)});
 }};
 await runFrozenBatch(c,"explore",[{...job("a"),capMs:1_800_000},{...job("b"),capMs:1_800_000}],host);
 expect(originals.map(o=>o.messages.length)).toEqual([3,2]);expect(originals.map(o=>o.messages.at(-1)).map(m=>m?.role==="assistant"?m.usage.input:null)).toEqual([104,100]);
 expect(originals.map(o=>o.trace.kind==="native"?o.trace.events.filter(e=>e.type==="turn_start")[0]?.context.messages:null)).toEqual([2,1]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it("scores from a separately retained pre-decision native observation",async()=>{
 const {readFileSync}=await import("node:fs"),{gunzipSync}=await import("node:zlib"),{checkEvent}=await import("./events.js"),{RUN_START_META}=await import("../test-support/events.js"),{nativeEpisodeFrames}=await import("./roxanne-campaign-runner.js");
 const raw:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/roxanne-ea04-recovery.json.gz",import.meta.url))).toString());if(!Array.isArray(raw))throw new Error("invalid fixture");const prior=raw.map(checkEvent),initial=prior.find(e=>e.type==="state"&&e.seq===17303);if(initial?.type!=="state"||!("started"in initial))throw new Error("missing exact fixture state");
 const {v,run,seq,t,type,turn,...snapshot}=initial;expect(type).toBe("state");
 const start=checkEvent({v,run,seq:0,t,type:"run_start",turn:0,...RUN_START_META,start_state:{kind:"save_state",path:"/owned/checkpoint.state",sha1:"a".repeat(40)},restoration:{source_run:"source",source_turn:turn+1,prefix_sha256:"b".repeat(64),prefix_last_seq:seq}});
 const native={kind:"native" as const,events:[start,...prior.filter(e=>e.seq>seq)],startSeq:0,startedAtMs:Date.parse(t),initialObservation:{snapshot,restoreHash:job("b").restoreHash,stateSha1:"a".repeat(40)}};
 const frames=nativeEpisodeFrames(native);expect(frames[0]).toMatchObject({seq:0,turn:0,map:[11,3],coherent:true});expect(frames[1]?.seq).toBeGreaterThan(seq);
 const outside=checkEvent({...initial,seq:seq+1,map_id:[0,31],turn:turn+1});
 const journal=prior.find(e=>e.type==="native_action");if(journal?.type!=="native_action")throw new Error("missing native journal fixture");
 const firstExit=nativeEpisodeFrames({...native,events:[start,outside,checkEvent({...journal,id:1,seq:seq+2,t,turn:turn+1,kind:"native_input"})]});
 expect(firstExit[0]?.map).toEqual([11,3]);expect(firstExit[1]?.map).toEqual([0,31]);expect(scoreRecovery(firstExit).departed).toBe(true);
 const o={reason:"budget",messages:[],reminder:null,trace:native,nativeScore:scoreRecovery(frames)};
 expect(()=> { verifyEpisodeOutcome({...job("b"),capMs:1_800_000},{...o,traceHash:episodeTraceHash(o)},"measured"); }).not.toThrow();
 const wrong={...o,trace:{...native,initialObservation:{...native.initialObservation,restoreHash:"c".repeat(64)}}};expect(()=> { verifyEpisodeOutcome({...job("b"),capMs:1_800_000},{...wrong,traceHash:episodeTraceHash(wrong)},"measured"); }).toThrow(/restore bundle/);
 expect(()=>nativeEpisodeFrames({...native,initialObservation:{...native.initialObservation,stateSha1:"f".repeat(40)}})).toThrow(/provenance/);
});

it("drains a healthy peer to its original terminal after grading preparation fails, without starting another draw",async()=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("peer-isolation",0))),recorded:string[]=[],called:string[]=[];let healthySignal:AbortSignal|undefined;
 let ready:()=>void=()=>undefined,finish:()=>void=()=>undefined;const started=new Promise<void>(resolve=>{ready=resolve;}),finished=new Promise<void>(resolve=>{finish=resolve;});
 const host:EpisodeHost={mode:"offline-fixture",now:()=>0,acquire:()=>Promise.resolve(()=>Promise.resolve()),deadline:()=>()=>undefined,episode:async(j,signal)=>{called.push(j.id);if(j.id==="bad"){await started;throw Error("grading preparation failed");}healthySignal=signal;ready();await finished;return outcome();},record:(id)=>{recorded.push(id);return Promise.resolve();},grade:()=>Promise.reject(Error("incomplete batch must not grade"))};
 const batch=runFrozenBatch(c,"explore",[job("bad","gpu0"),job("healthy","gpu1"),job("never-start","gpu1")],host),rejected=expect(batch).rejects.toThrow(/grading preparation failed/);
 await started;await new Promise<void>(resolve=>{setImmediate(resolve);});
 try{expect(healthySignal?.aborted).toBe(false);}finally{finish();await rejected;}
 expect(recorded).toEqual(["healthy"]);expect(called).toEqual(["bad","healthy"]);expect(c.state.jobs.find(j=>j.id==="healthy")).toMatchObject({status:"complete",reason:"budget"});expect(c.state.jobs.find(j=>j.id==="bad")?.status).toBe("running");expect(c.state.stopped).toContain("incomplete");
});
