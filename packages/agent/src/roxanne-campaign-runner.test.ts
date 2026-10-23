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
