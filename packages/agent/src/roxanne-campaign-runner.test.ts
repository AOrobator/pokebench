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
it("the batch path rejects a false score after retaining the original evidence and cost",async()=>{
 const c=new CampaignController(new MemoryCampaignStore(createCampaign("bad-score-test",0)));let recorded=false;
 const bad={...outcome(),nativeScore:{...score,strictRecovery:false}};
 const host:EpisodeHost={mode:"offline-fixture",now:()=>0,acquire:()=>Promise.resolve(()=>Promise.resolve()),deadline:()=>()=>undefined,episode:()=>Promise.resolve(bad),record:()=>{recorded=true;return Promise.resolve();},grade:rows=>Promise.resolve({hash:gradeDigest(rows.map(r=>r.id)),ids:rows.map(r=>r.id)})};
 await expect(runFrozenBatch(c,"explore",[job("b")],host)).rejects.toThrow(/recomputed score/);expect(recorded).toBe(true);expect(c.state.jobs[0]?.status).toBe("complete");expect(c.state.stopped).toContain("incomplete");
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
it("reuses completed gameplay before acquiring any lease and charges its recorded occupancy once",async()=>{
 let acquired=0,launched=0,now=300;const controller=new CampaignController(new MemoryCampaignStore(createCampaign("reuse",0,{gpuMs:200,episodes:2})));
 const host:EpisodeHost={mode:"offline-fixture",now:()=>now,recover:j=>Promise.resolve(j.id==="old"?{outcome:outcome(),startedAt:10,finishedAt:110}:null),acquire:()=>{acquired++;return Promise.resolve(()=>Promise.resolve());},deadline:()=>()=>undefined,episode:()=>{launched++;now+=50;return Promise.resolve(outcome());},record:()=>Promise.resolve(),grade:rows=>Promise.resolve({ids:rows.map(r=>r.id),hash:gradeDigest(rows.map(r=>r.id))})};
 await runFrozenBatch(controller,"explore",[job("old"),job("new")],host);
 expect(acquired).toBe(1);expect(launched).toBe(1);expect(controller.state.spentMs).toBe(350);expect(controller.state.priorEpisodes+controller.state.jobs.length).toBe(4);expect(controller.state.jobs[0]).toMatchObject({status:"complete",startedAt:10,finishedAt:110});
});
it("a rejected archived score cannot fall back to new gameplay",async()=>{
 let calls=0;const controller=new CampaignController(new MemoryCampaignStore(createCampaign("bad-reuse",0)));
 const host:EpisodeHost={mode:"offline-fixture",now:()=>0,recover:()=>Promise.resolve({outcome:{...outcome(),traceHash:"0".repeat(64)},startedAt:1,finishedAt:2}),acquire:()=>{calls++;throw Error("forbidden");},deadline:()=>()=>undefined,episode:()=>{calls++;throw Error("forbidden");},record:()=>Promise.resolve(),grade:()=>{throw Error("forbidden");}};
 await expect(runFrozenBatch(controller,"explore",[job("old")],host)).rejects.toThrow(/trace hash/);expect(calls).toBe(0);
});
