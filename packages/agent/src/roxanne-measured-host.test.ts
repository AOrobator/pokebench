import {createHash} from "node:crypto";
import {parseRun} from "./decision-probe.js";
import {parseGameState} from "./game-state.js";
import {it,expect} from "vitest";
import {gunzipSync,gzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import {RUN_START_META} from "../test-support/events.js";
import {checkEvent} from "./events.js";
import {buildRestoreBundle} from "./roxanne-restore.js";
import {digest,type CampaignJob} from "./roxanne-campaign.js";
import {candidate,verifyEpisodeOutcome} from "./roxanne-campaign-runner.js";
import {measuredCampaignHost,blindedGradingPrompt,eligibleHeldoutTurns,type MeasuredPorts,type MeasuredCommand} from "./roxanne-measured-host.js";
function fixture(){
 const json:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/roxanne-ea04-recovery.json.gz",import.meta.url))).toString());if(!Array.isArray(json))throw Error("fixture");
 const first=json.map(checkEvent).find(e=>e.type==="state"&&"started"in e&&e.map_id?.[0]===11&&e.map_id[1]===3&&!e.in_battle);if(first?.type!=="state"||!("started"in first)||!first.raw_ram)throw Error("fixture");
 const t=first.t,snapshot=parseGameState(Object.fromEntries(Object.entries(first).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key))));
 const meta={...RUN_START_META,rom_sha1:"a".repeat(40),harness:{commit:"b".repeat(40),dirty:false}},source=[{v:1,run:"source",seq:0,t,type:"run_start",turn:0,...meta},{...snapshot,v:1,run:"source",seq:1,t,type:"state",turn:1}],prefix=source.map(e=>JSON.stringify(e)).join("\n")+"\n",state=Buffer.from("native"),history=[{role:"user" as const,content:"original goal",timestamp:0}],budget={limit:10000,sent:null,anchor:null};
 const bundle=buildRestoreBundle({sourceRun:"source",sourceCommit:meta.harness.commit,turn:2,stateSeq:1,stateBytes:state,history,eventsPrefix:prefix,systemPrompt:meta.system_prompt,toolsHash:digest([]),rtcUnixMs:1234,nativeReceipt:{passed:true,frame:first.raw_ram.frame,ewram:"a".repeat(64),iwram:"b".repeat(64),registers:true,restored:true,inputReady:true,insideGym:true},conversationHash:digest(history),budgetHash:digest(budget)});
 const files=new Map<string,Buffer>();const write=(path:string,value:unknown)=>{files.set(path,Buffer.from(JSON.stringify(value)));};
 for(const [name,value] of Object.entries({"bundle.json":bundle,"history.json":history,"persistent-history.json":history,"budget.json":budget,"tools.json":[],"continuation-qualification.json":{passed:true,productionToolsMatch:true}}))write(`/qualified/${name}`,value);
 files.set("/qualified/events-prefix.jsonl",Buffer.from(prefix));files.set("/qualified/checkpoint.state",state);
 const commands:MeasuredCommand[]=[];const ports:MeasuredPorts={now:()=>0,read:path=>{const b=files.get(path);if(!b)throw Error(`missing ${path}`);return b;},write,acquire:()=>Promise.resolve(()=>Promise.resolve()),deadline:()=>()=>undefined,qualifyHeldout:()=>Promise.resolve([]),grade:row=>Promise.resolve({id:row.id,diagnosis:"none",factualError:false,verified:true,tokens:0,evidence:["seq:0"]}),launch:command=>{
  commands.push(command);const definition=JSON.parse(files.get(command.environment["POKEBENCH_PLAY_PRESET"]??"")?.toString()??"null") as {features:Record<string,boolean>;limits:{maxTurns:number;maxWallMs:number}};const stateSha1=createHash("sha1").update(state).digest("hex");const common={v:1,run:command.runId,t};
  const events=[{...common,seq:0,type:"run_start",turn:0,...meta,budgets:{max_turns:definition.limits.maxTurns,max_wall_ms:definition.limits.maxWallMs},evaluation:{preset_id:"study",target:"ROXANNE_DEFEATED",goal_target:null,failure_limit:3,flags:{loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false},features:definition.features},start_state:{kind:"save_state",path:"/qualified/checkpoint.state",sha1:stateSha1},restoration:{source_run:"source",source_turn:2,prefix_sha256:bundle.eventsHash,prefix_last_seq:1}},{...common,seq:2,type:"native_action",turn:2,id:1,frame:1,server_timestamp:1,kind:"native_input",details:{buttons:[]}},{...common,seq:3,type:"run_end",turn:2,reason:"budget",furthest_milestone:null,turns:1,wall_ms:1,tokens:{input:0,output:0},frames:{saved:0,bytes:0}}];
  files.set(`/runs/${command.runId}/events.jsonl`,Buffer.from(events.map(e=>JSON.stringify(e)).join("\n")));
  write(`/runs/${command.runId}/campaign-continuation.json`,{requests:1,messages:history,reminder:null,initialObservation:{snapshot,historyMessages:history.length,restoreHash:digest(bundle),stateSha1},journal:{frame:1,lastId:1}});const bytes=gzipSync(JSON.stringify({messages:[{role:"user",content:"original goal"}],tools:[]}));files.set(`/runs/${command.runId}/campaign-requests/00001.json.gz`,bytes);write(`/runs/${command.runId}/campaign-requests/00001.receipt.json`,{index:1,turn:2,offset:1,sha256:createHash("sha256").update(bytes).digest("hex")});return Promise.resolve({exitCode:0});
 }};
 const config={id:"study",output:"/output",runsRoot:"/runs",sourceCommit:meta.harness.commit,seed:42,starts:[{family:"source",directory:"/qualified"}],lanes:[{id:"gpu0",endpoint:"http://127.0.0.1:8098",endpointFile:"/endpoint",gamePort:8064}]},job:CampaignJob={id:"explore-1",arm:"baseline",family:"source",endpoint:config.lanes[0]?.id??"",capMs:1_800_000,promptHash:digest(""),restoreHash:digest(bundle)};
 return {config,ports,job,files,commands,source:parseRun(prefix),snapshot};
}
it("binds a qualified native run to the frozen job and scores retained originals",async()=>{
 const f=fixture(),host=measuredCampaignHost(f.config,f.ports),o=await host.episode(f.job,new AbortController().signal,1_800_000);verifyEpisodeOutcome(f.job,o,"measured");expect(o.nativeScore).toMatchObject({verified:true,strictRecovery:false});expect(f.commands[0]).toMatchObject({stopAt:1_740_000,deadline:1_800_000});expect(f.commands[0]?.environment["POKEBENCH_CAMPAIGN_CONTINUATION"]).toBe("/output/explore-1-continuation.json");
 await host.record(f.job.id,o);expect(f.files.has("/output/explore-1-outcome.json")).toBe(true);
 const a=candidate("a","reminder");await host.freezeCandidate(a);await host.freezeCandidate(a);await host.freezeFinalist(a);await host.report({status:"no_winner",reason:"fixture",finalist:null,development:[],validation:[],baseline:[],readiness:[],baselineReadiness:[],gpuMs:0});
 await expect(host.qualifyHeldout(a)).rejects.toThrow(/two/);expect(()=>host.freezeFinalist(candidate("z","other"))).toThrow();
});
it("refuses changed bindings, missing teardown budget, dirty provenance and malformed judgments",async()=>{
 const f=fixture(),host=measuredCampaignHost(f.config,f.ports),signal=new AbortController().signal;
 await expect(host.episode({...f.job,restoreHash:"wrong"},signal,1_800_000)).rejects.toThrow(/binding/);await expect(host.episode(f.job,signal,59_999)).rejects.toThrow(/teardown/);
 const o=await host.episode(f.job,signal,1_800_000),row={id:"anonymous",messages:o.messages,nativeScore:o.nativeScore,traceHash:o.traceHash,trace:o.trace};expect((await host.grade([row])).judgments).toHaveLength(1);
 const bad=measuredCampaignHost(f.config,{...f.ports,grade:()=>Promise.resolve({id:"wrong"})});await expect(bad.grade([row])).rejects.toThrow(/judgment/);
 expect(()=>measuredCampaignHost({...f.config,starts:[...f.config.starts,...f.config.starts]},f.ports)).toThrow(/duplicate/);expect(()=>measuredCampaignHost({...f.config,starts:[{family:"fake",directory:"/qualified"}]},f.ports)).toThrow(/family/);
});

it("gives the blind judge every textual behavior with hashes instead of encoded image pixels",()=>{
 const prompt=blindedGradingPrompt({id:"anonymous",messages:[{role:"user",content:[{type:"text",text:"observed fact"},{type:"image",data:"secret-pixels",mimeType:"image/png"}],timestamp:0}],nativeScore:{verified:true,departed:false,strictRecovery:false,eventualRecovery:false,unchangedRematches:0,recoverySeq:null,victory:false,changes:[],evidence:[]},traceHash:"hash",trace:{kind:"fixture",frames:[]}});
 expect(prompt).toContain("observed fact");expect(prompt).toContain("image pixels unavailable");expect(prompt).not.toContain("secret-pixels");
});

it("selects only input-ready healed post-loss turns with unchanged native capabilities",()=>{
 const f=fixture(),raw:unknown=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/roxanne-ea04-recovery.json.gz",import.meta.url))).toString());if(!Array.isArray(raw))throw Error("fixture");
 const battle=raw.map(checkEvent).find(e=>e.type==="state"&&"started"in e&&e.in_battle&&e.trainer_opponent?.trainer_id===265&&e.battle?.initialized);if(battle?.type!=="state"||!("started"in battle))throw Error("fixture");
 const meta={v:1,run:"source",t:f.source.start.t,turn:1},full={...f.snapshot,party:f.snapshot.party.map(p=>({...p,hp:p.max_hp})),running:{...f.snapshot.running,controllable:true}};
 const events=[f.source.start,checkEvent({...full,...meta,type:"state",seq:1}),checkEvent({...meta,type:"native_action",seq:2,id:1,frame:1,server_timestamp:1,kind:"battle_started",details:{}}),checkEvent({...battle,...meta,type:"state",seq:3}),checkEvent({...meta,type:"native_action",seq:4,id:2,frame:2,server_timestamp:2,kind:"battle_ended",details:{outcome:"lost"}}),checkEvent({...full,...meta,type:"state",seq:5}),checkEvent({...meta,type:"turn_start",seq:6,turn:2,context:{messages:1,images:0,est_tokens:10}})];
 expect(eligibleHeldoutTurns({...f.source,events})).toEqual([2]);
 expect(eligibleHeldoutTurns({...f.source,events:events.map(e=>e.seq===5?checkEvent({...e,in_battle:true}):e)})).toEqual([]);
 expect(eligibleHeldoutTurns({...f.source,events:events.map(e=>e.seq===5?checkEvent({...e,party:full.party.map(p=>({...p,level:(p.level??0)+1}))}):e)})).toEqual([]);
});
it("validates a concrete two-lane launch definition before any effect",async()=>{
 const {parseMeasuredLaunch}=await import("./roxanne-measured-host.js"),f=fixture(),sha="a".repeat(64);
 const config={...f.config,starts:Array.from({length:4},(_,i)=>({family:`source${String(i)}`,directory:`/qualified/${String(i)}`})),lanes:[...f.config.lanes,{id:"gpu1",endpoint:"http://127.0.0.1:8091",endpointFile:"/endpoint1",gamePort:8065}],serving:{model:"discovered-model",build:"pinned-build",contextTokens:65536,slots:1,vision:true,fingerprint:sha},graderModel:"cloud-model",window:{from:1,until:100000,clearanceFile:"/clearance.json",clearanceSha256:sha},authorization:{quote:"run the experiment as planned",reviewFile:"/reviews.json",reviewSha256:sha}};
 expect(parseMeasuredLaunch(config)).toEqual(config);expect(()=>parseMeasuredLaunch({...config,starts:[]})).toThrow();expect(()=>parseMeasuredLaunch({...config,lanes:[config.lanes[0],config.lanes[0]]})).toThrow();expect(()=>parseMeasuredLaunch({...config,output:"relative"})).toThrow();
});
it("rehearses a complete frozen batch through the measured binding with fake process and lease ports",async()=>{
 const {CampaignController,MemoryCampaignStore,createCampaign}=await import("./roxanne-campaign.js"),{runFrozenBatch}=await import("./roxanne-campaign-runner.js");
 const f=fixture(),held=new Set<string>(),arm=candidate("a","observed capability reminder"),lane={id:"gpu1",endpoint:"http://127.0.0.1:8091",endpointFile:"/endpoint1",gamePort:8065};let now=0,graded=0;
 const ports:MeasuredPorts={...f.ports,now:()=>now,acquire:endpoint=>{if(held.has(endpoint))throw Error("overlap");held.add(endpoint);return Promise.resolve(()=>{held.delete(endpoint);return Promise.resolve();});},launch:async command=>{
  const result=await f.ports.launch(command,new AbortController().signal),descriptor:unknown=JSON.parse(f.ports.read(command.environment["POKEBENCH_CAMPAIGN_CONTINUATION"]??"").toString());
  if(typeof descriptor!=="object"||descriptor===null||!("prompt"in descriptor)||typeof descriptor.prompt!=="string")throw Error("descriptor");
  if(descriptor.prompt){const path=`/runs/${command.runId}/campaign-continuation.json`,value:unknown=JSON.parse(f.ports.read(path).toString());if(typeof value!=="object"||value===null||!("messages"in value)||!Array.isArray(value.messages))throw Error("artifact");f.ports.write(path,{...value,messages:[...(value.messages as unknown[]),{role:"user",content:descriptor.prompt,timestamp:0}],reminder:{index:value.messages.length,sha256:digest(descriptor.prompt)}});const bytes=gzipSync(JSON.stringify({messages:[{role:"user",content:"original goal"},{role:"user",content:descriptor.prompt}],tools:[]}));f.files.set(`/runs/${command.runId}/campaign-requests/00001.json.gz`,bytes);f.ports.write(`/runs/${command.runId}/campaign-requests/00001.receipt.json`,{index:1,turn:2,offset:2,sha256:createHash("sha256").update(bytes).digest("hex")});}
  now+=100;return result;
 },grade:row=>{graded++;expect(row.messages).toHaveLength(0);expect(JSON.stringify(row)).not.toContain(arm.text);return f.ports.grade(row);}};
 const host=measuredCampaignHost({...f.config,lanes:[...f.config.lanes,lane]},ports),controller=new CampaignController(new MemoryCampaignStore(createCampaign("binding-rehearsal",0)));await host.freezeCandidate(arm);
 const batch=await runFrozenBatch(controller,"explore",[{...f.job,id:"baseline"},{...f.job,id:"candidate",endpoint:lane.id,arm:arm.id,promptHash:arm.hash}],host);
 expect(batch.outcomes.size).toBe(2);expect(graded).toBe(2);expect(held.size).toBe(0);expect(controller.state.spentMs).toBeGreaterThan(0);expect(controller.state.batches[0]?.gradeHash).toBeTruthy();
});
it("charges physical occupancy even when an invalid draw cannot get a verified score",async()=>{
 const {physicalGpuOccupancy}=await import("./roxanne-measured-host.js");expect(physicalGpuOccupancy([{lane:"gpu0",acquiredAt:0,releasedAt:100},{lane:"gpu1",acquiredAt:0,releasedAt:200},{lane:"gpu0",acquiredAt:100,releasedAt:300}])).toBe(500);expect(()=>physicalGpuOccupancy([{lane:"gpu0",acquiredAt:5,releasedAt:4}])).toThrow();expect(()=>physicalGpuOccupancy([{lane:"gpu0",acquiredAt:0,releasedAt:10},{lane:"gpu0",acquiredAt:9,releasedAt:11}])).toThrow();expect(()=>physicalGpuOccupancy(null)).toThrow();
});
it("binds executing campaign launch owners as well as the agent build to the reviewed pin",async()=>{
 const {verifyCampaignLaunchSource}=await import("./roxanne-measured-host.js");
 const calls:(readonly string[])[]=[];const git=(args:readonly string[])=>{calls.push(args);return args[0]==="ls-tree"?"same-source-tree":"";};
 expect(()=>{verifyCampaignLaunchSource(git,"a".repeat(40));}).not.toThrow();
 expect(calls).toEqual([["merge-base","--is-ancestor","a".repeat(40),"HEAD"],["ls-tree","--full-tree","a".repeat(40),"--","packages/agent","packages/viewer","env","scripts","justfile","package.json","pnpm-lock.yaml","pnpm-workspace.yaml"],["ls-tree","--full-tree","HEAD","--","packages/agent","packages/viewer","env","scripts","justfile","package.json","pnpm-lock.yaml","pnpm-workspace.yaml"]]);
 expect(()=>{verifyCampaignLaunchSource(args=>args[0]==="ls-tree"&&args[2]==="HEAD"?"changed-launch-owner":"reviewed-source", "a".repeat(40));}).toThrow(/reviewed campaign launch sources/);
});
it("requires actual review lanes or the specifically authorized missing-Grok exception",async()=>{
 const {verifyCampaignReviews}=await import("./roxanne-measured-host.js"),head="a".repeat(40),campaign="roxanne-autonomous";
 const lanes=[{family:"claude",model:"claude",cloud:true,verdict:"LGTM"},{family:"gpt",model:"gpt",cloud:true,verdict:"LGTM"}],fallback=[{family:"fallback",model:"sol",cloud:true,verdict:"LGTM"},{family:"fallback",model:"astra",cloud:true,verdict:"LGTM"}];
 const approval={missingFamily:"grok",campaign,quote:"Tell autoresearch I approve proceeding without Grok. Finish landing and preflight, then coordinate taking over both GPUs. Keep the Double Kick investigation moving too.",sourceThread:"00000000-0000-4000-8000-f5efe0494f81",sourceMessage:"00000000-0000-4000-8000-fc6902fdcccf"};
 const receipt={status:"LGTM",head,campaign,lanes};
 expect(()=>{verifyCampaignReviews({...receipt,lanes:[...lanes,{family:"grok",model:"grok",cloud:true,verdict:"LGTM"}]},head,campaign);}).not.toThrow();
 expect(()=>{verifyCampaignReviews({...receipt,lanes:[...lanes,...fallback],operatorException:approval},head,campaign);}).not.toThrow();
 for(const value of [receipt,{...receipt,lanes:[...lanes,...fallback]},{...receipt,lanes:[lanes[0],...fallback],operatorException:approval},{...receipt,lanes:[...lanes,fallback[0],fallback[0]],operatorException:approval},{...receipt,lanes:[...lanes,...fallback],operatorException:{...approval,quote:"go ahead"}},{...receipt,lanes:[...lanes,...fallback],operatorException:{...approval,campaign:"other"}}])expect(()=>{verifyCampaignReviews(value,head,campaign);}).toThrow(/review/);
 expect(()=>{verifyCampaignReviews({...receipt,head:"b".repeat(40)},head,campaign);}).toThrow(/review/);
});
