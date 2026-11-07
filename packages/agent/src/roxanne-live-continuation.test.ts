import {parseGameState} from "./game-state.js";
import {it,expect} from "vitest";
import {buildRestoreBundle} from "./roxanne-restore.js";
import {digest} from "./roxanne-campaign.js";
import {RUN_START_META} from "../test-support/events.js";
import {loadLiveContinuation} from "./roxanne-live-continuation.js";
function fixture(){
 const history=[{role:"user" as const,content:"original goal",timestamp:0}],state=Buffer.from("native checkpoint"),prefix=[{v:1,run:"source",seq:0,t:"2026-10-21T12:00:00.000-04:00",type:"run_start",turn:0,...RUN_START_META,harness:{commit:"a".repeat(40),dirty:false},system_prompt:"source system"},{v:1,run:"source",seq:10,t:"2026-10-21T12:00:01.000-04:00",type:"state",turn:3,screen:"overworld",started:true,name:"MAY",location:"RUSTBORO GYM",map_id:[11,3],position:{x:1,y:2},facing:"down",in_battle:false,party:[],money:0,badges:[],play_time_s:1,raw_ram:{v:1,sequence:1,frame:1,path:"raw-ram/00000001.json.gz",sha256:"a".repeat(64)}}].map(e=>JSON.stringify(e)).join("\n")+"\n",budget={limit:10000,sent:null,anchor:null};
 const bundle=buildRestoreBundle({sourceRun:"source",sourceCommit:"a".repeat(40),turn:4,stateSeq:10,stateBytes:state,nativeReceipt:{passed:true,frame:1,ewram:"a".repeat(64),iwram:"b".repeat(64),registers:true,restored:true,inputReady:true,insideGym:true},history,eventsPrefix:prefix,systemPrompt:"source system",toolsHash:digest([]),rtcUnixMs:1234.5,conversationHash:digest(history),budgetHash:digest(budget)});
 const files=new Map<string,Buffer>(Object.entries({"/owned/bundle.json":JSON.stringify(bundle),"/owned/history.json":JSON.stringify(history),"/owned/persistent-history.json":JSON.stringify(history),"/owned/budget.json":JSON.stringify(budget),"/owned/events-prefix.jsonl":prefix,"/owned/checkpoint.state":state,"/owned/continuation-qualification.json":JSON.stringify({passed:true,productionToolsMatch:true}),"/owned/tools.json":"[]"}).map(([path,data])=>[path,Buffer.isBuffer(data)?data:Buffer.from(data)]));
 const read=(path:string)=>{const bytes=files.get(path);if(bytes===undefined)throw new Error(`unexpected read ${path}`);return bytes;};
 return {files,read,input:{directory:"/owned",prompt:"candidate reminder",seed:42},bundle,history,budget};
}
it("loads only a hash-bound qualified start before any endpoint call",()=>{
 const {files,read,input,bundle,history}=fixture();const loaded=loadLiveContinuation(input,read);expect(loaded.bundle).toEqual(bundle);expect(loaded.rtcMs).toBe(1235);expect(loaded.history).toEqual(history);
 files.set("/owned/persistent-history.json",Buffer.from(JSON.stringify([{...history[0],content:"changed"}])));expect(()=>loadLiveContinuation(input,read)).toThrow(/conversation/);
 files.set("/owned/persistent-history.json",Buffer.from(JSON.stringify(history)));files.set("/owned/checkpoint.state",Buffer.from("wrong native state"));expect(()=>loadLiveContinuation(input,read)).toThrow(/digest/);
 expect(()=>loadLiveContinuation({...input,prompt:"x".repeat(2501)},read)).toThrow(/descriptor/);
});
it("requires production qualification and learned-budget binding",()=>{
 expect(()=>loadLiveContinuation({directory:"/owned",prompt:""},()=>Buffer.from('{}'))).toThrow();
});
it("leaves fresh play outside the continuation loader and refuses malformed descriptors",async()=>{
 const {liveContinuationFromEnv}=await import("./roxanne-live-continuation.js");
 expect(liveContinuationFromEnv({},()=>{throw new Error("fresh play must not read continuation files");})).toBe(null);
 expect(()=>liveContinuationFromEnv({POKEBENCH_CAMPAIGN_CONTINUATION:"/descriptor"},()=>Buffer.from('{}'))).toThrow(/descriptor/);
});

it("restores production event memories then the hash-bound budget and exact OFF conversation",async()=>{
 const {restoreLiveContinuation}=await import("./roxanne-live-continuation.js"),{ContextBudget}=await import("./context-budget.js");
 const {read,input,budget}=fixture(),loaded=loadLiveContinuation(input,read),calls:string[]=[],owner=new ContextBudget(budget.limit);
 const prepared=await restoreLiveContinuation(loaded,loaded.runtime.features,{restoreHistory:async before=>{calls.push("restore");await before(1);calls.push("restored");}},{transformContext:messages=>{calls.push(`consume:${String(messages.length)}`);return Promise.resolve(messages);}},{systemPrompt:loaded.bundle.systemPrompt,tools:[],budget:owner});
 expect(calls).toEqual(["restore","consume:0","restored"]);expect(prepared.messages).toBe(loaded.conversation);expect(prepared.receipt).toBe(null);expect(owner.snapshot()).toEqual(budget);
 await expect(restoreLiveContinuation(loaded,loaded.runtime.features,{restoreHistory:()=>Promise.resolve()},{transformContext:m=>Promise.resolve(m)},{systemPrompt:"wrong",tools:[],budget:owner})).rejects.toThrow(/runtime prompt/);
});
it.each(["qualification","budget","tools","source"] as const)("refuses altered %s at the disk consumer",defect=>{
 const {files,read,input,bundle}=fixture();
 if(defect==="qualification")files.set("/owned/continuation-qualification.json",Buffer.from('{"passed":false,"productionToolsMatch":true}'));
 if(defect==="budget")files.set("/owned/budget.json",Buffer.from('{"limit":2,"sent":null,"anchor":null}'));
 if(defect==="tools")files.set("/owned/tools.json",Buffer.from('[{"name":"other"}]'));
 if(defect==="source")files.set("/owned/bundle.json",Buffer.from(JSON.stringify({...bundle,sourceRun:"another"})));
 expect(()=>loadLiveContinuation(input,read)).toThrow();
});
it("rejects a mismatched preset before discovery and requires source model/sampling parity",async()=>{
 const {validateLiveContinuationStart,validateLiveContinuationModel}=await import("./roxanne-live-continuation.js"),{createHash}=await import("node:crypto");
 const {read,input}=fixture(),loaded=loadLiveContinuation(input,read),start={kind:"save_state",path:loaded.statePath,sha1:createHash("sha1").update(loaded.state).digest("hex")},source=loaded.source.start;
 expect(()=> { validateLiveContinuationStart(loaded,start); }).not.toThrow();expect(()=> { validateLiveContinuationStart(loaded,{...start,path:"/other"}); }).toThrow();expect(()=> { validateLiveContinuationStart(loaded,{...start,sha1:"bad"}); }).toThrow();expect(()=> { validateLiveContinuationStart(loaded,{kind:"boot"}); }).toThrow();
 const model={id:source.model.id,contextWindow:source.model.context_window,maxTokens:source.model.max_tokens},sampling={thinkingLevel:source.sampling.thinking_level,maxTokens:source.sampling.max_tokens};
 expect(()=> { validateLiveContinuationModel(loaded,model,sampling); }).not.toThrow();expect(()=> { validateLiveContinuationModel(loaded,{...model,id:"wrong"},sampling); }).toThrow();expect(()=> { validateLiveContinuationModel(loaded,model,{...sampling,maxTokens:1}); }).toThrow();
});
it("captures the independently observed native start without creating a model turn",async()=>{
 const {captureContinuationStart}=await import("./roxanne-live-continuation.js");const {read,input}=fixture(),loaded=loadLiveContinuation(input,read),state=loaded.source.events.find(e=>e.type==="state");
 if(state?.type!=="state"||!("started"in state))throw Error("fixture");
 const snapshot=parseGameState(Object.fromEntries(Object.entries(state).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key))));
 expect(captureContinuationStart(loaded,snapshot)).toMatchObject({restoreHash:digest(loaded.bundle),snapshot});
 expect(()=>captureContinuationStart(loaded,{...snapshot,in_battle:true})).toThrow();expect(()=>captureContinuationStart(loaded,{...snapshot,map_id:[0,31]})).toThrow();
});

it("retains the exact seeded request body before sending",async()=>{
 const {continuationPayload}=await import("./roxanne-live-continuation.js");const retained:string[]=[];
 const body=continuationPayload(42,{messages:[],presence_penalty:0},s=>{retained.push(s);});expect(JSON.parse(retained[0]??"null")).toEqual(body);expect(body).toEqual({messages:[],presence_penalty:0,seed:42});expect(()=>continuationPayload(42,null,()=>undefined)).toThrow();
});

async function runtimeFixture(){
 const f=fixture(),{recordedFeatures}=await import("./decision-probe.js"),legacy=loadLiveContinuation(f.input,f.read);
 const baseline={version:1,sourceBundleHash:digest(f.bundle),sourceCommit:"b".repeat(40),features:{...recordedFeatures(legacy.source),"move-learn-tool-v1":true,"move-learn-offer-identity-v1":true},systemPrompt:"qualified runtime system",tools:[{name:"learn_move",description:"qualified identity guard",parameters:{type:"object",properties:{decline_move:{type:"string"}}}}],referenceHash:digest(f.history.map(m=>({...m,timestamp:0}))),passed:true};
 const bind=(value:unknown)=>{const bytes=Buffer.from(JSON.stringify(value));f.files.set("/owned/runtime-baseline.json",bytes);return {...f.input,runtimeBaselineSha256:createHash("sha256").update(bytes).digest("hex")};};
 const {createHash}=await import("node:crypto");return {...f,baseline,bind,input:bind(baseline)};
}
it("binds an explicit guarded runtime while preserving every historical source artifact",async()=>{
 const f=await runtimeFixture(),original=new Map(f.files),loaded=loadLiveContinuation(f.input,f.read);
 expect(loaded).toMatchObject({bundle:f.bundle,history:f.history,conversation:f.history,runtimeBaselineSha256:f.input.runtimeBaselineSha256,runtime:{systemPrompt:f.baseline.systemPrompt,tools:f.baseline.tools,sourceCommit:f.baseline.sourceCommit},restoreHash:digest({bundle:f.bundle,runtimeBaseline:f.baseline})});
 expect(f.files).toEqual(original);
 const {restoreLiveContinuation}=await import("./roxanne-live-continuation.js"),{ContextBudget}=await import("./context-budget.js"),{normalizeFeatures}=await import("./play-preset.js"),features=normalizeFeatures(f.baseline.features);
 const run=(systemPrompt:string,tools:readonly unknown[])=>restoreLiveContinuation(loaded,features,{restoreHistory:()=>Promise.resolve()},{transformContext:m=>Promise.resolve(m)},{systemPrompt,tools,budget:new ContextBudget(f.budget.limit)});
 expect((await run(f.baseline.systemPrompt,f.baseline.tools)).messages).toEqual(f.history);
 await expect(run(f.bundle.systemPrompt,f.baseline.tools)).rejects.toThrow(/runtime/);
 await expect(run(f.baseline.systemPrompt,[])).rejects.toThrow(/runtime/);
});
it("rejects unqualified, tampered, wrong-source and broadened runtime migrations",async()=>{
 const f=await runtimeFixture();
 for(const baseline of [{...f.baseline,passed:false},{...f.baseline,sourceBundleHash:"c".repeat(64)},{...f.baseline,referenceHash:"c".repeat(64)},{...f.baseline,features:{...f.baseline.features,"move-learn-tool-v1":false}},{...f.baseline,features:{...f.baseline.features,"roxanne-campaign-reminder-v1":true}},{...f.baseline,features:{...f.baseline.features,"move-learn-goal-reminder-v1":true}}])expect(()=>loadLiveContinuation(f.bind(baseline),f.read)).toThrow(/runtime/);
 f.bind({...f.baseline,systemPrompt:"tampered"});expect(()=>loadLiveContinuation(f.input,f.read)).toThrow(/runtime/);
});
it("checks runtime flags before model discovery and binds migrated native anchors",async()=>{
 const f=await runtimeFixture(),loaded=loadLiveContinuation(f.input,f.read),{validateLiveContinuationFeatures,captureContinuationStart}=await import("./roxanne-live-continuation.js");
 expect(()=>{validateLiveContinuationFeatures(loaded,{...loaded.runtime.features,"move-learn-tool-v1":false});}).toThrow(/runtime features/);
 expect(()=>{validateLiveContinuationFeatures(loaded,{...loaded.runtime.features,"roxanne-campaign-reminder-v1":true});}).not.toThrow();
 const state=loaded.source.events.find(e=>e.type==="state");if(state?.type!=="state"||!("started"in state))throw Error("fixture");
 const snapshot=parseGameState(Object.fromEntries(Object.entries(state).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key))));expect(captureContinuationStart(loaded,snapshot).restoreHash).toBe(loaded.restoreHash);
});

it("explicit memory-run migration is hash-bound without allowing another feature change",async()=>{
 const f=await runtimeFixture(),baseline={...f.baseline,features:{...f.baseline.features,"restored-memory-run-v1":true}},input=f.bind(baseline),loaded=loadLiveContinuation(input,f.read);
 expect(loaded.runtime.features["restored-memory-run-v1"]).toBe(true);expect(loaded.bundle).toEqual(f.bundle);expect(loaded.history).toEqual(f.history);
 expect(()=>loadLiveContinuation(f.bind({...baseline,features:{...baseline.features,"ram-state-v1":!loaded.runtime.features["ram-state-v1"]}}),f.read)).toThrow(/unapproved/);
});

it("preserves the recorded provider wait setting when a qualified baseline predates the switch", async () => {
 const f = await runtimeFixture();
 const features: Partial<typeof f.baseline.features> = { ...f.baseline.features };
 delete features["provider-wait-pause-v1"];
 const loaded = loadLiveContinuation(f.bind({ ...f.baseline, features }), f.read);
 expect(loaded.runtime.features["provider-wait-pause-v1"]).toBe(false);
});
