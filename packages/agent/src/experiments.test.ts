import {expect,it} from "vitest";
import {ALL_ON,type FeatureSet} from "./features.js";
import {definitionHash,deriveStatus,experimentArms,parseExperiment,parseLedger,readinessOf,trialOrder,trialProgress,type Experiment,type LedgerEntry,type ReadinessRun} from "./experiments.js";

const features:FeatureSet={...ALL_ON,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"full-map-navigation-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false};
const base={
 version:1,id:"full-map",title:"Whole-map navigation",changedFeature:"full-map-navigation-v1",hypothesis:"Seeing the whole map helps.",
 activationMilestone:"FIRST_TRUCK_EXIT",primaryMilestone:"RIVAL_MET",queuePosition:1,
 source:{checkout:"main",commit:"a".repeat(40)},
 incumbent:{version:2,id:"incumbent",target:null,limits:{maxTurns:1500,maxWallMs:1_800_000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features},
 trialsPerArm:4,modelLane:"think_fast",budget:{maxWallMs:8*1_800_000},
 criteria:{completionTolerance:0,speedMarginPercent:10},readiness:{window:4,minReached:3},
} as const;
const experiment=(over:Record<string,unknown>={}):Experiment=>parseExperiment({...base,...over});

it("parses a definition and derives two arms that differ in exactly the changed switch",()=>{
 const e=experiment();
 const {incumbent,candidate}=experimentArms(e);
 expect(incumbent.id).toBe("full-map-incumbent");expect(candidate.id).toBe("full-map-candidate");
 expect(incumbent.features["full-map-navigation-v1"]).toBe(false);expect(candidate.features["full-map-navigation-v1"]).toBe(true);
 expect(Object.entries(candidate.features).filter(([id,on])=>incumbent.features[id as keyof FeatureSet]!==on).map(([id])=>id)).toEqual(["full-map-navigation-v1"]);
 expect(experiment({queuePosition:undefined}).queuePosition).toBeUndefined();
});

it("rejects malformed definitions, unknown milestones, short arms, tiny budgets and invalid candidates",()=>{
 expect(()=>parseExperiment({...base,extra:true})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,id:"Bad Id"})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,changedFeature:"story-milestones-v2"})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,activationMilestone:"NOWHERE"})).toThrow(/activationMilestone NOWHERE/);
 expect(()=>parseExperiment({...base,primaryMilestone:"GAME_RUNNING"})).toThrow(/primaryMilestone GAME_RUNNING/);
 expect(()=>parseExperiment({...base,trialsPerArm:3})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,readiness:{window:4,minReached:5}})).toThrow(/minReached/);
 expect(()=>parseExperiment({...base,budget:{maxWallMs:1000}})).toThrow(/budget/);
 expect(()=>parseExperiment({...base,source:{checkout:"main",commit:"abc"}})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,incumbent:{...base.incumbent,version:1}})).toThrow(/Invalid experiment/);
 // Flipping bounded navigation off leaves full-map on without its dependency.
 expect(()=>parseExperiment({...base,changedFeature:"bounded-navigation-v1",incumbent:{...base.incumbent,features:{...features,"full-map-navigation-v1":true}}})).toThrow(/candidate: full-map-navigation-v1 needs bounded-navigation-v1/);
 expect(()=>parseExperiment({...base,incumbent:{...base.incumbent,features:{...features,"live-map-v1":false}}})).toThrow(/Invalid play preset/);
});

it("alternates arms in ABBA blocks and keeps each arm's count",()=>{
 expect(trialOrder(experiment())).toEqual(["incumbent","candidate","candidate","incumbent","incumbent","candidate","candidate","incumbent"]);
 const five=trialOrder(experiment({trialsPerArm:5}));
 expect(five.filter(a=>a==="incumbent")).toHaveLength(5);expect(five.filter(a=>a==="candidate")).toHaveLength(5);
});

it("hashes the definition except its queue position and notes",()=>{
 const e=experiment();
 expect(definitionHash(e)).toMatch(/^[0-9a-f]{64}$/);
 expect(definitionHash(experiment({queuePosition:3,notes:"moved"}))).toBe(definitionHash(e));
 expect(definitionHash(experiment({trialsPerArm:5}))).not.toBe(definitionHash(e));
});

const run=(id:string,reached:string[],over:Partial<FeatureSet>={}):ReadinessRun=>({id,features:{...features,...over},reached});
it("is ready only when enough of the latest comparable runs reach the activation milestone",()=>{
 const e=experiment();
 const comparable=[run("r1",[]),run("r2",["FIRST_TRUCK_EXIT"]),run("r3",["FIRST_TRUCK_EXIT"],{"full-map-navigation-v1":true}),run("r4",["FIRST_TRUCK_EXIT"]),run("r5",["FIRST_TRUCK_EXIT"])];
 expect(readinessOf(e,comparable)).toEqual({ready:true,basis:"comparable",milestone:"FIRST_TRUCK_EXIT",window:4,minReached:3,reached:4,considered:["r2","r3","r4","r5"]});
 expect(readinessOf(e,comparable.slice(0,4))).toMatchObject({ready:true,reached:3,considered:["r1","r2","r3","r4"]});
 expect(readinessOf(e,[run("o1",["FIRST_TRUCK_EXIT"],{"live-map-v1":false,"world-coordinate-grid-v1":false}),...comparable.slice(0,3)])).toMatchObject({ready:true,basis:"recent",reached:3,considered:["o1","r1","r2","r3"]});
 expect(readinessOf(e,comparable.slice(0,3))).toMatchObject({ready:false,basis:"recent",reached:2,considered:["r1","r2","r3"]});
 expect(readinessOf(e,[])).toMatchObject({ready:false,reached:0,considered:[]});
});

it("parses an append-only ledger and reports malformed lines",()=>{
 const text=[JSON.stringify({type:"launch",trial:0,arm:"incumbent",run:"a",at:"t"}),"",JSON.stringify({type:"outcome",trial:0,arm:"incumbent",run:"a",at:"t",reason:"budget"}),"not json",JSON.stringify({type:"launch",trial:9})].join("\n");
 const {entries,problems}=parseLedger(text);
 expect(entries.map(e=>e.type)).toEqual(["launch","outcome"]);
 expect(problems).toEqual(["line 4: not JSON","line 5: not a ledger entry"]);
 expect(parseLedger("").entries).toEqual([]);
});

const launch=(trial:number,runId:string,arm:"incumbent"|"candidate"):LedgerEntry=>({type:"launch",trial,arm,run:runId,at:"t"});
const outcome=(trial:number,runId:string,arm:"incumbent"|"candidate"):LedgerEntry=>({type:"outcome",trial,arm,run:runId,at:"t",reason:"budget"});
it("folds the ledger into per-trial progress, retrying interrupted and failed launches",()=>{
 const e=experiment();
 const ledger:LedgerEntry[]=[launch(0,"a","incumbent"),outcome(0,"a","incumbent"),launch(1,"b","candidate"),{type:"launcher_error",trial:1,arm:"candidate",run:"b",at:"t",message:"boom"},launch(2,"c","candidate")];
 const trials=trialProgress(e,ledger,{experiment:"full-map",trial:2});
 expect(trials.slice(0,4)).toEqual([{index:0,arm:"incumbent",state:"done",run:"a",runs:["a"]},{index:1,arm:"candidate",state:"failed",run:"b",runs:["b"]},{index:2,arm:"candidate",state:"running",run:"c",runs:["c"]},{index:3,arm:"incumbent",state:"waiting",run:null,runs:[]}]);
 expect(trialProgress(e,ledger,null)[2]?.state).toBe("interrupted");
 expect(trialProgress(e,[...ledger,launch(1,"b2","candidate"),outcome(1,"b2","candidate")],null)[1]).toEqual({index:1,arm:"candidate",state:"done",run:"b2",runs:["b","b2"]});
});

const ready={ready:true,basis:"comparable",milestone:"FIRST_TRUCK_EXIT",window:4,minReached:3,reached:4,considered:["r1","r2","r3","r4"]} as const;
const notReady={...ready,ready:false,reached:0};
it("derives one status from the definition, approval, ledger, runner and readiness",()=>{
 const e=experiment(),hash=definitionHash(e),approval={experiment:"full-map",sha256:hash,approvedAt:"t",approvedBy:"operator"};
 const all=trialOrder(e).flatMap((arm,i)=>[launch(i,`r${String(i)}`,arm),outcome(i,`r${String(i)}`,arm)]);
 const status=(over:Partial<Parameters<typeof deriveStatus>[0]>)=>deriveStatus({experiment:e,approval,ledger:[],runner:null,readiness:ready,...over}).state;
 expect(status({experiment:experiment({blocked:"needs a fix"})})).toBe("blocked");
 expect(deriveStatus({experiment:experiment({blocked:"needs a fix"}),approval,ledger:[],runner:null,readiness:ready}).reason).toBe("needs a fix");
 expect(status({ledger:all})).toBe("done");
 expect(status({runner:{experiment:"full-map",trial:0}})).toBe("running");
 expect(status({approval:{...approval,sha256:"0".repeat(64)}})).toBe("stale");
 expect(status({ledger:all.slice(0,2)})).toBe("held");
 expect(status({experiment:experiment({queuePosition:undefined}),readiness:notReady})).toBe("pending");
 expect(deriveStatus({experiment:experiment({queuePosition:undefined}),approval:null,ledger:[],runner:null,readiness:notReady}).reason).toMatch(/not ready: 0 of the last 4 comparable runs reached FIRST_TRUCK_EXIT \(needs 3\)/);
 expect(deriveStatus({experiment:experiment({queuePosition:undefined}),approval:null,ledger:[],runner:null,readiness:ready}).reason).toMatch(/ready to queue/);
 expect(status({readiness:notReady})).toBe("not-ready");
 expect(deriveStatus({experiment:e,approval:null,ledger:[],runner:null,readiness:{...notReady,basis:"recent",considered:["x"]}}).reason).toBe("not ready: 0 of the last 1 runs of any configuration reached FIRST_TRUCK_EXIT (needs 3 of 4; too few runs match the incumbent)");
 expect(status({approval:null})).toBe("draft");
 expect(status({})).toBe("approved");
 expect(status({runner:{experiment:"other",trial:0}})).toBe("approved");
});

it("every tracked experiment definition parses and has a unique id and queue position",async()=>{
 const {readdirSync,readFileSync}=await import("node:fs");
 const dir=new URL("../../../experiments/",import.meta.url);
 const parsed=readdirSync(dir).filter(f=>f.endsWith(".json")).map(f=>({file:f,e:parseExperiment(JSON.parse(readFileSync(new URL(f,dir),"utf8")))}));
 expect(parsed.length).toBeGreaterThan(0);
 for(const {file,e} of parsed)expect(file).toBe(`${e.id}.json`);
 const positions=parsed.flatMap(({e})=>e.queuePosition===undefined?[]:[e.queuePosition]);
 expect(new Set(positions).size).toBe(positions.length);
});
