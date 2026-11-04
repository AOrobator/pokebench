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

import { rm } from "node:fs/promises";
import { sha256, type ComparisonManifest } from "./serial-comparison.js";
import { afterEach } from "vitest";
const temporary:string[]=[];
afterEach(async()=>{await Promise.all(temporary.splice(0).map(p=>rm(p,{recursive:true,force:true})));});


describe("child evidence and resume integrity",()=>{
 it("resumes only completed prefix and never replays already launched failures",async()=>{
  const m=prepareComparison(manifest()),h=host(),digest=sha256(JSON.stringify(m));
  h.readLedger=vi.fn().mockResolvedValue([{type:"launch",runId:"naming-test_01",manifestSha256:digest,at:h.now()},{type:"outcome",runId:"naming-test_01",manifestSha256:digest,at:h.now(),exitCode:0,reason:"model_error",eventsSha256:hash}]);
  await superviseComparison(m,h);expect(h.launch).toHaveBeenCalledTimes(23);expect(defined(vi.mocked(h.launch).mock.calls[0])[0].runId).toBe("naming-test_02");
  h.readLedger=vi.fn().mockResolvedValue([{type:"launch",runId:"naming-test_01",manifestSha256:digest,at:h.now(),unexpected:true}]);
  await expect(superviseComparison(m,h)).rejects.toThrow(/typed ledger/);
 });
});

describe("qualification edge boundaries",()=>{
 it("rejects invalid roots, entrypoints, endpoints and artifact paths",()=>{
  for(const mutate of [(m:ComparisonManifest)=>{m.repoRoot="relative";},(m:ComparisonManifest)=>{m.build.path="/repo/other.js";},(m:ComparisonManifest)=>{defined(m.lanes[0]).gatewayUrl="file:///tmp/a";},(m:ComparisonManifest)=>{defined(m.lanes[0]).endpointFile={path:"relative",sha256:hash};},(m:ComparisonManifest)=>{m.presets.enforced.path="relative";}]){
   const m=manifest() as ComparisonManifest;mutate(m);expect(()=>prepareComparison(m)).toThrow();
  }
 });
 it("refuses malformed, foreign, nonzero and chronologically reversed resume rows",async()=>{
  const m=prepareComparison(manifest()),digest=sha256(JSON.stringify(m)),launch={type:"launch" as const,manifestSha256:digest,runId:"naming-test_01",at:"2026-10-12T00:00:01Z"},outcome={...launch,type:"outcome" as const,at:"2026-10-12T00:00:02Z",exitCode:0,reason:"budget",eventsSha256:hash};
  for(const altered of [{...outcome,manifestSha256:hash},{...outcome,runId:"foreign"},{...outcome,exitCode:1},{...outcome,reason:"infrastructure_failure"},{...outcome,at:"2026-10-12T00:00:00Z"},{...outcome,at:"bad"}]){
   const h=host();h.readLedger=vi.fn().mockResolvedValue([launch,altered]);await expect(superviseComparison(m,h)).rejects.toThrow(/ledger/);expect(h.launch).not.toHaveBeenCalled();
  }
 });
});
