import { describe, expect, it, vi } from "vitest";
import { counterbalancedTrials, prepareComparison, superviseComparison, type ComparisonHost } from "./serial-comparison.js";

function defined<T>(value:T|undefined):T { if(value===undefined)throw new Error("test fixture missing value");return value; }
const hash = "a".repeat(64);
const artifact = (path:string) => ({path,sha256:hash});
function manifest() {
  return {version:1,id:"naming-test",repoRoot:"/repo",sourceCommit:"a".repeat(40),build:{...artifact("/repo/packages/agent/dist/live.js"),treeSha256:hash},
    presets:{diagnostic:artifact("/receipts/passive.json"),enforced:artifact("/receipts/enforced.json")},
    lanes:["one","two","three"].map(id=>({id,model:id,gatewayUrl:"http://inference.example/v1",endpointFile:null,serving:artifact(`/receipts/${id}-serving.json`),environment:artifact(`/receipts/${id}-env.json`),imageTool:artifact(`/receipts/${id}-image.json`),configurationSha256:hash})),
    criteria:{completionLossTolerance:0,medianSpeedGain:0.1},trials:counterbalancedTrials("naming-test",["one","two","three"])};
}
function host(): ComparisonHost {
  return {verify:vi.fn().mockResolvedValue(undefined),readLedger:vi.fn().mockResolvedValue([]),append:vi.fn().mockResolvedValue(undefined),acquire:vi.fn().mockResolvedValue(async()=>{}),runExists:vi.fn().mockResolvedValue(false),launch:vi.fn().mockResolvedValue({exitCode:0,reason:"budget",eventsSha256:hash}),now:()=>"2026-10-12T00:00:00Z"};
}
describe("frozen naming cohort",()=>{
  it("counterbalances every discovered lane into four trials per arm",()=>{
    const plan=prepareComparison(manifest());
    expect(plan.trials).toHaveLength(24);
    expect(plan.trials.slice(0,6).map(t=>[t.lane,t.arm])).toEqual([["one","diagnostic"],["two","enforced"],["three","diagnostic"],["one","enforced"],["two","diagnostic"],["three","enforced"]]);
    for(const lane of plan.lanes) for(const arm of ["diagnostic","enforced"]) expect(plan.trials.filter(t=>t.lane===lane.id&&t.arm===arm)).toHaveLength(4);
  });
  it.each(["unknown","source","order","lane","duplicate","secret","criteria"])("rejects changed %s",kind=>{
    const m=manifest();
    if(kind==="unknown") Object.assign(m,{extra:1});
    if(kind==="source")m.sourceCommit="main";
    if(kind==="order")m.trials.reverse();
    if(kind==="lane")defined(m.lanes[0]).id="three";
    if(kind==="duplicate")defined(m.trials[1]).runId=defined(m.trials[0]).runId;
    if(kind==="secret")defined(m.lanes[0]).gatewayUrl="http://secret:password@inference.example/v1";
    if(kind==="criteria")m.criteria.medianSpeedGain=0.2;
    expect(()=>prepareComparison(m)).toThrow();
  });
  it("launches normal play serially and retains failures",async()=>{
    const h=host();let active=0;let peak=0;
    h.launch=vi.fn<ComparisonHost["launch"]>(async command=>{active++;peak=Math.max(peak,active);await Promise.resolve();active--;return {exitCode:0,reason:command.runId.endsWith("01")?"model_error":"budget",eventsSha256:hash};});
    await superviseComparison(prepareComparison(manifest()),h);
    expect(peak).toBe(1);expect(h.launch).toHaveBeenCalledTimes(24);expect(h.append).toHaveBeenCalledTimes(48);
    const first=defined(vi.mocked(h.launch).mock.calls[0])[0];
    expect(first.argv).toEqual(["/repo/packages/agent/dist/live.js","play"]);
    expect(first.env).toMatchObject({POKEBENCH_RUN_ID:"naming-test_01",POKEBENCH_PLAY_PRESET:"/receipts/passive.json",POKEBENCH_MODEL:"one"});
    expect(defined(vi.mocked(h.append).mock.calls[1])[0]).toMatchObject({type:"outcome",reason:"model_error"});
  });
  it("refuses uncertain resume and releases the global lock",async()=>{
    const h=host();const release=vi.fn();h.acquire=vi.fn().mockResolvedValue(release);
    h.readLedger=vi.fn().mockResolvedValue([{type:"launch",manifestSha256:hash,runId:"naming-test_01",at:"then"}]);
    await expect(superviseComparison(prepareComparison(manifest()),h)).rejects.toThrow(/ledger|uncertain/);
    expect(h.launch).not.toHaveBeenCalled();expect(release).toHaveBeenCalledOnce();
  });
  it("revalidates before each launch and does not start after source drift",async()=>{
    const h=host();vi.mocked(h.verify).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("source drift"));
    await expect(superviseComparison(prepareComparison(manifest()),h)).rejects.toThrow("source drift");
    expect(h.launch).toHaveBeenCalledTimes(1);expect(h.append).toHaveBeenCalledTimes(2);
  });
  it("retains a launcher failure and stops instead of silently replacing it",async()=>{
    const h=host();h.launch=vi.fn().mockRejectedValue(new Error("spawn failed"));
    await expect(superviseComparison(prepareComparison(manifest()),h)).rejects.toThrow(/infrastructure/);
    expect(defined(vi.mocked(h.append).mock.calls[1])[0]).toMatchObject({type:"outcome",reason:"infrastructure_failure",exitCode:null});
    expect(h.launch).toHaveBeenCalledOnce();
  });
  it("never launches over an existing run directory or overlapping supervisor",async()=>{
    const h=host();h.runExists=vi.fn().mockResolvedValue(true);
    await expect(superviseComparison(prepareComparison(manifest()),h)).rejects.toThrow(/exists/);expect(h.launch).not.toHaveBeenCalled();
    h.acquire=vi.fn().mockRejectedValue(new Error("locked"));
    await expect(superviseComparison(prepareComparison(manifest()),h)).rejects.toThrow("locked");
  });
});

import { mkdtemp, mkdir, writeFile, readFile, rm, realpath, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filesystemComparisonHost, verifyComparisonFiles, sha256, distDigest, type ComparisonManifest } from "./serial-comparison.js";
import { afterEach } from "vitest";
const temporary:string[]=[];
afterEach(async()=>{await Promise.all(temporary.splice(0).map(p=>rm(p,{recursive:true,force:true})));});
async function diskFixture():Promise<ComparisonManifest>{
  const root=await realpath(await mkdtemp(join(tmpdir(),"pokebench-comparison-")));temporary.push(root);
  const dist=join(root,"packages/agent/dist");await mkdir(dist,{recursive:true});
  const m=manifest();m.repoRoot=root;
  const file=async(name:string,value:unknown)=>{const path=join(root,name),bytes=JSON.stringify(value);await writeFile(path,bytes);return {path,sha256:sha256(bytes)};};
  const preset={version:1,id:"passive",target:"PLAYER_NAME_CONFIRMED",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}};
  m.presets.diagnostic=await file("passive.json",preset);m.presets.enforced=await file("enforced.json",{...preset,id:"enforced",flags:{...preset.flags,loopGuard:true}});
  for(const lane of m.lanes)for(const [kind,key] of [["serving","serving"],["environment","environment"],["image-tool","imageTool"]] as const){lane[key]=await file(`${lane.id}-${kind}.json`,{version:1,kind,qualified:true,model:lane.model,gatewayUrl:lane.gatewayUrl,sourceCommit:m.sourceCommit,validUntil:"2099-01-01T00:00:00Z",configurationSha256:hash,evidence:"manual qualification receipt with actual serving/image/tool proof"});}
  const code=`import{mkdir,writeFile}from'node:fs/promises';import{join}from'node:path';const run=process.env.POKEBENCH_RUN_ID;const dir=join(process.cwd(),'runs',run);await mkdir(dir,{recursive:true});const env={v:1,run,t:'2026-10-12T00:00:00.000-04:00',turn:0};const rows=[{...env,seq:0,type:'run_start',model:{id:process.env.POKEBENCH_MODEL,context_window:65536,max_tokens:4096,vision:true},sampling:{thinking_level:'medium',max_tokens:4096},system_prompt:'test',tools:['observe','press'],harness:{commit:'${m.sourceCommit}',dirty:false},vendor_pin:'${"b".repeat(40)}',pi_version:'test',start_state:{kind:'boot'},harness_features:[],evaluation:{preset_id:'passive',target:'PLAYER_NAME_CONFIRMED',failure_limit:3,flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}},budgets:{max_turns:300,max_wall_ms:600000},isolation:{server_dir:join(dir,'server'),run_data_id:run,load_checkpoint_mode:false,port:8070}},{...env,seq:1,type:'run_end',reason:'budget',furthest_milestone:null,turns:0,wall_ms:1,tokens:{input:0,output:0},frames:{saved:0,bytes:0}}];await writeFile(join(dir,'events.jsonl'),rows.map(r=>JSON.stringify(r)).join('\\n')+'\\n');`;
  const path=join(dist,"live.js");await writeFile(path,code);await writeFile(join(dist,"package.json"),' {"type":"module"}');
  m.build={path,sha256:sha256(code),treeSha256:await distDigest(dist)};
  return prepareComparison(m);
}
describe("real filesystem and child boundaries",()=>{
  it("binds clean source, all build imports, presets and actual receipt attestations",async()=>{
    const m=await diskFixture();const git=(args:string[])=>args[0]==="rev-parse"?m.sourceCommit:"";
    await expect(verifyComparisonFiles(m,Date.now(),git)).resolves.toBeUndefined();
    await expect(verifyComparisonFiles(m,Date.now(),()=>"wrong")).rejects.toThrow(/source/);
    await writeFile(m.presets.diagnostic.path,"tampered");await expect(verifyComparisonFiles(m,Date.now(),git)).rejects.toThrow(/hash/);
  });
  it("rejects a substituted imported module even when live.js stays identical",async()=>{
    const m=await diskFixture();await writeFile(join(m.repoRoot,"packages/agent/dist/injected.js"),"bad");
    await expect(verifyComparisonFiles(m,Date.now(),args=>args[0]==="rev-parse"?m.sourceCommit:"")).rejects.toThrow(/tree/);
  });
  it("requires matching, qualified and current content inside hash-bound receipts",async()=>{
    for(const change of [{model:"other"},{qualified:false},{validUntil:"2000-01-01T00:00:00Z"},{kind:"environment"},{sourceCommit:"c".repeat(40)},{evidence:""},{configurationSha256:"c".repeat(64)},{gatewayUrl:"http://other/v1"}]){
      const m=await diskFixture();const receipt=defined(m.lanes[0]).serving;const raw=JSON.parse(await readFile(receipt.path,"utf8")) as Record<string,unknown>;
      const bytes=JSON.stringify({...raw,...change});await writeFile(receipt.path,bytes);receipt.sha256=sha256(bytes);
      await expect(verifyComparisonFiles(m,Date.now(),args=>args[0]==="rev-parse"?m.sourceCommit:"")).rejects.toThrow(/receipt/);
    }
  });
  it("refuses unplanned effective preset differences despite updated file hashes",async()=>{
    const m=await diskFixture();const raw=JSON.parse(await readFile(m.presets.enforced.path,"utf8")) as Record<string,unknown>;
    const bytes=JSON.stringify({...raw,sampling:{thinkingLevel:"high",maxTokens:4096}});await writeFile(m.presets.enforced.path,bytes);m.presets.enforced.sha256=sha256(bytes);
    await expect(verifyComparisonFiles(m,Date.now(),args=>args[0]==="rev-parse"?m.sourceCommit:"")).rejects.toThrow(/beyond/);
  });
  it("owns one real exclusive lock, fsyncs append-only rows and executes normal child argv",async()=>{
    const m=await diskFixture();const h=filesystemComparisonHost(m,{verify:async()=>{}}),release=await h.acquire();
    await expect(filesystemComparisonHost(m).acquire()).rejects.toThrow();
    const lock=join(m.repoRoot,"runs",".naming-gameplay.inference.example-80.lock");
    expect(JSON.parse(await readFile(join(lock,"owner.json"),"utf8"))).toMatchObject({owner:`cohort:${m.id}`});
    await expect(access(join(m.repoRoot,"runs",".naming-gameplay.lock"))).rejects.toThrow();
    expect(await h.readLedger()).toEqual([]);expect(await h.runExists("missing")).toBe(false);
    const trial=defined(m.trials[0]);const command={runId:trial.runId,argv:[m.build.path,"play"],cwd:m.repoRoot,env:{POKEBENCH_RUN_ID:trial.runId,POKEBENCH_MODEL:"one",POKEBENCH_PLAY_PRESET:m.presets.diagnostic.path}};
    const outcome=await h.launch(command);expect(outcome).toMatchObject({exitCode:0,reason:"budget"});expect(outcome.eventsSha256).toMatch(/^[a-f0-9]{64}$/);
    await h.append({type:"launch",runId:trial.runId,manifestSha256:hash,at:"2026-10-12T00:00:00Z"});await h.append({type:"outcome",runId:trial.runId,manifestSha256:hash,at:"2026-10-12T00:00:01Z",...outcome});
    expect(await h.readLedger()).toHaveLength(2);expect(await h.runExists(trial.runId)).toBe(true);
    await release();const next=await h.acquire();await next();
  });
  it("propagates a real child spawn failure without inventing a terminal record",async()=>{
    const m=await diskFixture();const h=filesystemComparisonHost(m,{node:join(m.repoRoot,"absent-node")});
    await expect(h.launch({runId:"absent",argv:[m.build.path,"play"],cwd:m.repoRoot,env:{}})).rejects.toThrow();
  });
});

import { comparisonCommand } from "./serial-comparison.js";
describe("preparation entrypoint",()=>{
  it("freezes immutable 24-trial bytes without child launches or qualification claims",async()=>{
    const m=await diskFixture(),path=join(m.repoRoot,"draft.json");await writeFile(path,JSON.stringify(m));
    expect(await comparisonCommand(["prepare",path])).toMatch(/24 trials.*no gameplay launched/);
    await expect(comparisonCommand(["prepare",path])).rejects.toThrow();
    const frozen=JSON.parse(await readFile(join(m.repoRoot,"runs/launch-receipts/naming-test/manifest.json"),"utf8")) as unknown;
    expect(frozen).toEqual(m);
    const changed={...m,id:"changed"};await writeFile(path,JSON.stringify(changed));
    await expect(comparisonCommand(["execute",path])).rejects.toThrow();
  });
  it("rejects unsupported command shapes and mutable execution input",async()=>{
    await expect(comparisonCommand([])).rejects.toThrow(/usage/);
    const m=await diskFixture(),path=join(m.repoRoot,"draft.json");await writeFile(path,JSON.stringify(m));await comparisonCommand(["prepare",path]);
    m.build.sha256="c".repeat(64);await writeFile(path,JSON.stringify(m));
    await expect(comparisonCommand(["execute",path])).rejects.toThrow(/differs/);
  });
});

import { NAME_CONFIRMED } from "../test-support/events.js";
async function tinyCommand(m:ComparisonManifest,mutation?:(code:string)=>string){
 if(mutation)await writeFile(m.build.path,mutation(await readFile(m.build.path,"utf8")));
 const runId=defined(m.trials[0]).runId;
 return {runId,argv:[m.build.path,"play"],cwd:m.repoRoot,env:{POKEBENCH_RUN_ID:runId,POKEBENCH_MODEL:"one",POKEBENCH_PLAY_PRESET:m.presets.diagnostic.path}};
}
describe("child evidence and resume integrity",()=>{
 it.each([
  ["wrong flags",(s:string)=>s.replace("loopGuard:false","loopGuard:true")],
  ["wrong preset",(s:string)=>s.replace("preset_id:'passive'","preset_id:'other'")],
  ["wrong cap",(s:string)=>s.replace("max_wall_ms:600000","max_wall_ms:600001")],
  ["wrong sampling",(s:string)=>s.replace("max_tokens:4096},system_prompt","max_tokens:2048},system_prompt")],
  ["wrong failure limit",(s:string)=>s.replace("failure_limit:3","failure_limit:4")],
  ["wrong identity",(s:string)=>s.replace("dirty:false","dirty:true")],
  ["unearned success",(s:string)=>s.replace("reason:'budget'","reason:'milestone'")],
 ])("rejects %s in actual child output",async(_label,mutation)=>{
  const m=await diskFixture(),h=filesystemComparisonHost(m);
  await expect(h.launch(await tinyCommand(m,mutation))).rejects.toThrow("event_invalid");
 });
 it("accepts exact native name evidence and rejects a newer negative state",async()=>{
  for(const negative of [false,true]){
   const m=await diskFixture(),h=filesystemComparisonHost(m);
   const command=await tinyCommand(m,s=>s.replace("seq:1,type:'run_end',reason:'budget'",`seq:3,type:'run_end',reason:'milestone',target_proof:{name:'PLAYER_NAME_CONFIRMED',milestone_seq:2,state_evidence:[1]}`).replace("await writeFile(join(dir",`rows.splice(1,0,{...env,...${JSON.stringify({...NAME_CONFIRMED,story:{...NAME_CONFIRMED.story,name_confirmed:!negative}})},type:'state',seq:1},{...env,type:'milestone',seq:2,name:'PLAYER_NAME_CONFIRMED',kind:'story',origin:'observed',server_timestamp:0,evidence:[1]});await writeFile(join(dir`));
   if(negative)await expect(h.launch(command)).rejects.toThrow("event_invalid");else expect(await h.launch(command)).toMatchObject({reason:"milestone",exitCode:0});
  }
 });
 it("resumes only completed prefix and never replays already launched failures",async()=>{
  const m=prepareComparison(manifest()),h=host(),digest=sha256(JSON.stringify(m));
  h.readLedger=vi.fn().mockResolvedValue([{type:"launch",runId:"naming-test_01",manifestSha256:digest,at:h.now()},{type:"outcome",runId:"naming-test_01",manifestSha256:digest,at:h.now(),exitCode:0,reason:"model_error",eventsSha256:hash}]);
  await superviseComparison(m,h);expect(h.launch).toHaveBeenCalledTimes(23);expect(defined(vi.mocked(h.launch).mock.calls[0])[0].runId).toBe("naming-test_02");
  h.readLedger=vi.fn().mockResolvedValue([{type:"launch",runId:"naming-test_01",manifestSha256:digest,at:h.now(),unexpected:true}]);
  await expect(superviseComparison(m,h)).rejects.toThrow(/typed ledger/);
 });
 it("closed ledger file validation rejects corrupt/unknown records",async()=>{
  const m=await diskFixture(),h=filesystemComparisonHost(m),dir=join(m.repoRoot,"runs/launch-receipts/naming-test");await mkdir(dir,{recursive:true});
  await writeFile(join(dir,"trials.jsonl"),'{"type":"unknown"}\n');await expect(h.readLedger()).rejects.toThrow(/typed ledger/);
  await writeFile(join(dir,"trials.jsonl"),"not json\n");await expect(h.readLedger()).rejects.toThrow();
 });
 it("presets with reordered keys compare semantically",async()=>{
  const m=await diskFixture(),raw=JSON.parse(await readFile(m.presets.enforced.path,"utf8")) as Record<string,unknown>;
  const bytes=JSON.stringify(Object.fromEntries(Object.entries(raw).reverse()));await writeFile(m.presets.enforced.path,bytes);m.presets.enforced.sha256=sha256(bytes);
  await expect(verifyComparisonFiles(m,Date.now(),args=>args[0]==="rev-parse"?m.sourceCommit:"")).resolves.toBeUndefined();
 });
 it("execute dispatch reaches supervisor only after immutable prepared bytes agree",async()=>{
  const m=await diskFixture(),path=join(m.repoRoot,"draft.json"),h=host();await writeFile(path,JSON.stringify(m));await comparisonCommand(["prepare",path]);
  expect(await comparisonCommand(["execute",path],()=>h)).toMatch(/No automatic promotion/);expect(h.launch).toHaveBeenCalledTimes(24);
 });
});

describe("bounded child lifetime",()=>{
 it("retains stdout/stderr and classifies a real hung child as infrastructure",async()=>{
  const m=await diskFixture();await writeFile(m.build.path,"console.log('child stdout');console.error('child stderr');process.on('SIGINT',()=>{});setInterval(()=>{},1000);");
  const h=filesystemComparisonHost(m,{watchdogMs:100,interruptGraceMs:10,killGraceMs:10});
  await expect(h.launch(await tinyCommand(m))).rejects.toThrow("timed_out");
  const dir=join(m.repoRoot,"runs/launch-receipts/naming-test");
  expect(await readFile(join(dir,"naming-test_01.stdout.log"),"utf8")).toContain("child stdout");
  expect(await readFile(join(dir,"naming-test_01.stderr.log"),"utf8")).toContain("child stderr");
 });
 it("preserves safe failure category in supervisor outcome",async()=>{
  const m=await diskFixture(),h=filesystemComparisonHost(m,{verify:async()=>{},node:join(m.repoRoot,"missing")});
  await expect(superviseComparison(m,h)).rejects.toThrow(/infrastructure/);
  const rows=await h.readLedger();expect(rows).toHaveLength(2);expect(rows[1]).toMatchObject({reason:"infrastructure_failure",failureCode:"spawn_error"});
 });
});

import { symlink } from "node:fs/promises";
describe("qualification edge boundaries",()=>{
 it("rejects invalid roots, entrypoints, endpoints and artifact paths",()=>{
  for(const mutate of [(m:ComparisonManifest)=>{m.repoRoot="relative";},(m:ComparisonManifest)=>{m.build.path="/repo/other.js";},(m:ComparisonManifest)=>{defined(m.lanes[0]).gatewayUrl="file:///tmp/a";},(m:ComparisonManifest)=>{defined(m.lanes[0]).endpointFile={path:"relative",sha256:hash};},(m:ComparisonManifest)=>{m.presets.enforced.path="relative";}]){
   const m=manifest() as ComparisonManifest;mutate(m);expect(()=>prepareComparison(m)).toThrow();
  }
 });
 it("hash binds private endpoint bytes without echoing credentials",async()=>{
  const m=await diskFixture(),lane=defined(m.lanes[0]),path=join(m.repoRoot,"endpoint.json"),bytes='{"api_key":"private-test-key"}';await writeFile(path,bytes);lane.endpointFile={path,sha256:sha256(bytes)};
  const git=(args:string[])=>args[0]==="rev-parse"?m.sourceCommit:"";
  await expect(verifyComparisonFiles(m,Date.now(),git)).resolves.toBeUndefined();await writeFile(path,"substitution");
  await expect(verifyComparisonFiles(m,Date.now(),git)).rejects.toThrow(/hash mismatch/);
  const h=host();await superviseComparison(m,h);expect(defined(vi.mocked(h.launch).mock.calls[0])[0].env["POKEBENCH_ENDPOINT_FILE"]).toBe(path);
 });
 it("hashes nested imports and forbids symlinked build inputs",async()=>{
  const m=await diskFixture(),root=join(m.repoRoot,"packages/agent/dist"),sub=join(root,"nested");await mkdir(sub);await writeFile(join(sub,"module.js"),"export{}");
  expect(await distDigest(root)).not.toBe(m.build.treeSha256);await symlink(m.presets.diagnostic.path,join(sub,"link.js"));await expect(distDigest(root)).rejects.toThrow(/symlinks/);
 });
 it("requires common interface/objective instrumentation and matching arms",async()=>{
  for(const change of [{target:null},{limits:{maxTurns:300,maxWallMs:1800000,failureLimit:3}},{flags:{loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true}},{flags:{loopGuard:false,activeUi:false,interfaceDocs:true,objectives:true}}]){
   const m=await diskFixture(),raw=JSON.parse(await readFile(m.presets.diagnostic.path,"utf8")) as Record<string,unknown>,bytes=JSON.stringify({...raw,...change});await writeFile(m.presets.diagnostic.path,bytes);m.presets.diagnostic.sha256=sha256(bytes);
   await expect(verifyComparisonFiles(m,Date.now(),args=>args[0]==="rev-parse"?m.sourceCommit:"")).rejects.toThrow(/preset/);
  }
 });
 it("retains missing or malformed child evidence as infrastructure categories",async()=>{
  for(const [code,expected] of [["process.exit(0)","event_missing"],["import{mkdir,writeFile}from'node:fs/promises';import{join}from'node:path';const dir=join(process.cwd(),'runs',process.env.POKEBENCH_RUN_ID);await mkdir(dir,{recursive:true});await writeFile(join(dir,'events.jsonl'),'invalid');","event_invalid"]]){
   const m=await diskFixture();await writeFile(m.build.path,defined(code));const h=filesystemComparisonHost(m,{verify:async()=>{}});
   await expect(superviseComparison(m,h)).rejects.toThrow(/infrastructure/);expect((await h.readLedger())[1]).toMatchObject({failureCode:expected});
  }
 });
 it("retains nonzero child exit even alongside a valid terminal record",async()=>{
  const m=await diskFixture(),h=filesystemComparisonHost(m);const command=await tinyCommand(m,s=>s+"\nprocess.exitCode=2;");expect(await h.launch(command)).toMatchObject({exitCode:2,failureCode:"child_nonzero"});
 });
 it("hard terminates only the owned test child if polite signals are ignored",async()=>{
  const m=await diskFixture();await writeFile(m.build.path,"process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});setInterval(()=>{},1000);");
  const h=filesystemComparisonHost(m,{watchdogMs:100,interruptGraceMs:10,killGraceMs:10});await expect(h.launch(await tinyCommand(m))).rejects.toThrow("timed_out");
 });
 it("refuses malformed, foreign, nonzero and chronologically reversed resume rows",async()=>{
  const m=prepareComparison(manifest()),digest=sha256(JSON.stringify(m)),launch={type:"launch" as const,manifestSha256:digest,runId:"naming-test_01",at:"2026-10-12T00:00:01Z"},outcome={...launch,type:"outcome" as const,at:"2026-10-12T00:00:02Z",exitCode:0,reason:"budget",eventsSha256:hash};
  for(const altered of [{...outcome,manifestSha256:hash},{...outcome,runId:"foreign"},{...outcome,exitCode:1},{...outcome,reason:"infrastructure_failure"},{...outcome,at:"2026-10-12T00:00:00Z"},{...outcome,at:"bad"}]){
   const h=host();h.readLedger=vi.fn().mockResolvedValue([launch,altered]);await expect(superviseComparison(m,h)).rejects.toThrow(/ledger/);expect(h.launch).not.toHaveBeenCalled();
  }
 });
});


it("rejects a human controller spoofing the planned model id at the actual child outcome boundary", async () => {
  const m = await diskFixture();
  const command = await tinyCommand(m, code => code.replace("model:{", "controller:{kind:'human',name:'Operator',rom_sha1:'" + "c".repeat(40) + "',input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275},model:{"));
  await expect(filesystemComparisonHost(m).launch(command)).rejects.toThrow("event_invalid");
});
