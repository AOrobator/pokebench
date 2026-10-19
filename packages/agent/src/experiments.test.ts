import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,type FeatureSet} from "./features.js";
import {definitionHash,deriveStatus,experimentArms,parseExperiment,parseNewerExperiment,parseLedger,readinessOf,trialOrder,trialProgress,type Experiment,type LedgerEntry,type ReadinessRun} from "./experiments.js";

const features:FeatureSet={...ALL_ON,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"no-exit-here-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false,"clock-view-loop-v1":false,"stale-story-goal-v1":false,"input-cuts-v1":false,"loop-guard-screen-v1":false,"reopened-dialogue-loop-v1":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false,"full-map-navigation-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false,"unset-dynamic-warp-v1":false};
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

it("keeps the automatic-running hypothesis aligned with its post-shoes grading milestone",()=>{
 const entry=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/automatic-running.json",import.meta.url),"utf8")));
 expect(entry.activationMilestone).toBe("RUNNING_SHOES_RECEIVED");
 expect(entry.primaryMilestone).toBe("ROUTE_102");
 expect(entry.hypothesis).toContain("Route 102");
 expect(entry.hypothesis).not.toContain("rival house");
});

it("names a switch this build does not know, so an old viewer says it needs rebuilding",()=>{
 const stale="Invalid experiment: future-switch-v1 is not a switch in this build; if it landed after this build, rebuild on current main (just viewer-main)";
 expect(()=>parseExperiment({...base,changedFeature:"future-switch-v1"})).toThrow(stale);
 expect(()=>parseExperiment({...base,incumbent:{...base.incumbent,features:{...base.incumbent.features,"future-switch-v1":true}}})).toThrow(stale);
 expect(()=>parseExperiment(null)).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,changedFeature:7,incumbent:{...base.incumbent,features:null}})).toThrow(/Invalid experiment/);
});

it("reads a definition whose switch landed after this build, without trusting the switch",()=>{
 const newer={...base,changedFeature:"future-switch-v1",incumbent:{...base.incumbent,features:{...base.incumbent.features,"future-switch-v1":true}}};
 const n=parseNewerExperiment(newer);
 expect(n.unknownSwitches).toEqual(["future-switch-v1"]);
 expect([n.id,n.changedFeature,n.incumbentOn]).toEqual([base.id,"future-switch-v1",true]);
 expect(parseNewerExperiment({...base,changedFeature:"future-switch-v1"}).incumbentOn).toBe(false);
 expect(()=>parseNewerExperiment(base)).toThrow("Invalid experiment: names no switch newer than this build");
 expect(()=>parseNewerExperiment({...newer,title:""})).toThrow(/Invalid experiment/);
 expect(()=>parseNewerExperiment({...newer,changedFeature:"Not An Id"})).toThrow(/Invalid experiment/);
 expect(()=>parseNewerExperiment({...newer,primaryMilestone:"NOWHERE"})).toThrow(/primaryMilestone NOWHERE/);
});

// Sorted keys, undefined dropped: the definition file's content, independent of key order.
const stable=(v:unknown):string=>Array.isArray(v)?`[${v.map(stable).join(",")}]`:typeof v==="object"&&v!==null?`{${Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${stable(x)}`).join(",")}}`:JSON.stringify(v);
it("hashes the definition as written, so a switch added to the registry later keeps its approval valid",()=>{
 const {"named-warp-destinations-v1":omitted,...older}=base.incumbent.features as Record<string,boolean>;
 expect(omitted).toBeDefined();
 const written={...base,incumbent:{...base.incumbent,features:older}};
 const e=parseExperiment(written);
 expect(Object.keys(e.incumbent.features)).toContain("named-warp-destinations-v1");
 expect(definitionHash(e)).toBe(createHash("sha256").update(stable({...written,queuePosition:undefined})).digest("hex"));
 expect(definitionHash(parseExperiment({...written,notes:"n",externalCohort:"c",queuePosition:4}))).toBe(definitionHash(e));
});

it("rejects malformed definitions, unknown milestones, short arms, tiny budgets and invalid candidates",()=>{
 expect(()=>parseExperiment({...base,extra:true})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,id:"Bad Id"})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,changedFeature:"story-milestones-v2"})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,activationMilestone:"NOWHERE"})).toThrow(/activationMilestone NOWHERE/);
 expect(()=>parseExperiment({...base,primaryMilestone:"GAME_RUNNING"})).toThrow(/primaryMilestone GAME_RUNNING/);
 expect(()=>parseExperiment({...base,trialsPerArm:3})).toThrow(/Invalid experiment/);
 // A switch that only acts after the graded milestone cannot change the result (running shoes come after the rival house).
 expect(()=>parseExperiment({...base,activationMilestone:"RUNNING_SHOES_RECEIVED",primaryMilestone:"RIVAL_HOUSE_ENTERED"})).toThrow("Invalid experiment: activationMilestone RUNNING_SHOES_RECEIVED comes after primaryMilestone RIVAL_HOUSE_ENTERED, so the switch cannot change the graded result");
 expect(parseExperiment({...base,activationMilestone:"RUNNING_SHOES_RECEIVED",primaryMilestone:"ROUTE_102"}).primaryMilestone).toBe("ROUTE_102");
 expect(()=>parseExperiment({...base,trialsPerArm:9})).toThrow(/Invalid experiment/);
 // Every accepted definition must be gradeable by comparePatchResults.
 expect(()=>parseExperiment({...base,criteria:{completionTolerance:0,speedMarginPercent:0}})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,criteria:{completionTolerance:0,speedMarginPercent:101}})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,criteria:{completionTolerance:5,speedMarginPercent:10}})).toThrow(/completionTolerance exceeds trialsPerArm/);
 expect(parseExperiment({...base,trialsPerArm:8,criteria:{completionTolerance:5,speedMarginPercent:10}}).trialsPerArm).toBe(8);
 expect(()=>parseExperiment({...base,readiness:{window:4,minReached:5}})).toThrow(/minReached/);
 expect(()=>parseExperiment({...base,budget:{maxWallMs:1000}})).toThrow(/budget/);
 expect(()=>parseExperiment({...base,source:{checkout:"main",commit:"abc"}})).toThrow(/Invalid experiment/);
 expect(()=>parseExperiment({...base,incumbent:{...base.incumbent,version:1}})).toThrow(/Invalid experiment/);
 // Flipping bounded navigation off leaves full-map on without its dependency.
 expect(()=>parseExperiment({...base,changedFeature:"bounded-navigation-v1",incumbent:{...base.incumbent,features:{...features,"full-map-navigation-v1":true}}})).toThrow(/candidate: .*full-map-navigation-v1 needs bounded-navigation-v1/);
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

const run=(id:string,reached:string[],over:Partial<FeatureSet>={},extra:Partial<ReadinessRun>={}):ReadinessRun=>({id,model:"think_fast",start:"boot",maxTurns:1500,maxWallMs:1_800_000,features:{...features,...over},reached,...extra});
it("is ready only when enough of the latest comparable runs reach the activation milestone",()=>{
 const e=experiment();
 const comparable=[run("r1",[]),run("r2",["FIRST_TRUCK_EXIT"]),run("r3",["FIRST_TRUCK_EXIT"],{"full-map-navigation-v1":true}),run("r4",["FIRST_TRUCK_EXIT"]),run("r5",["FIRST_TRUCK_EXIT"])];
 expect(readinessOf(e,comparable)).toEqual({ready:true,basis:"comparable",milestone:"FIRST_TRUCK_EXIT",window:4,minReached:3,reached:4,considered:["r2","r3","r4","r5"]});
 expect(readinessOf(e,comparable.slice(0,4))).toMatchObject({ready:true,reached:3,considered:["r1","r2","r3","r4"]});
 expect(readinessOf(e,[run("o1",["FIRST_TRUCK_EXIT"],{"live-map-v1":false,"world-coordinate-grid-v1":false}),...comparable.slice(0,3)])).toMatchObject({ready:true,basis:"recent",reached:3,considered:["o1","r1","r2","r3"]});
 expect(readinessOf(e,comparable.slice(0,3))).toMatchObject({ready:false,basis:"recent",reached:2,considered:["r1","r2","r3"]});
 expect(readinessOf(e,[])).toMatchObject({ready:false,reached:0,considered:[]});
 // Checkpoint starts never count: readiness needs the incumbent's common boot start.
 const checkpoints=["c1","c2","c3","c4"].map(id=>run(id,[],{},{start:"save_state"}));
 expect(readinessOf(e,[...comparable.slice(1),...checkpoints])).toMatchObject({ready:true,basis:"comparable",considered:["r2","r3","r4","r5"]});
 // Only the experiment's own model lane counts, and comparable runs share its turn and wall limits.
 const otherLane=["x1","x2","x3","x4"].map(id=>run(id,["FIRST_TRUCK_EXIT"],{},{model:"think-slow"}));
 expect(readinessOf(e,otherLane)).toMatchObject({ready:false,reached:0,considered:[]});
 const shorter=["s1","s2","s3","s4"].map(id=>run(id,["FIRST_TRUCK_EXIT"],{},{maxTurns:300}));
 expect(readinessOf(e,shorter)).toMatchObject({ready:true,basis:"recent"});
 expect(readinessOf(e,[...shorter,...comparable.slice(1)])).toMatchObject({ready:true,basis:"comparable",considered:["r2","r3","r4","r5"]});
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
it("keeps the superseded unset-warp comparison out of the launch queue",()=>{
 const raw=JSON.parse(readFileSync(new URL("../../../experiments/unset-dynamic-warp.json",import.meta.url),"utf8")) as unknown;
 const e=parseExperiment(raw);
 const status=deriveStatus({experiment:e,approval:null,ledger:[],runner:null,readiness:ready});
 expect(status.state).toBe("discarded");
 expect(status.reason).toContain("no attributable treatment contrast");
});

it("derives one status from the definition, approval, ledger, runner and readiness",()=>{
 const e=experiment(),hash=definitionHash(e),approval={experiment:"full-map",sha256:hash,approvedAt:"t",approvedBy:"operator"};
 const all=trialOrder(e).flatMap((arm,i)=>[launch(i,`r${String(i)}`,arm),outcome(i,`r${String(i)}`,arm)]);
 const status=(over:Partial<Parameters<typeof deriveStatus>[0]>)=>deriveStatus({experiment:e,approval,ledger:[],runner:null,readiness:ready,...over}).state;
 expect(status({experiment:experiment({blocked:"needs a fix",discarded:"lost to the incumbent"})})).toBe("discarded");
 expect(deriveStatus({experiment:experiment({discarded:"lost to the incumbent"}),approval,ledger:all,runner:null,readiness:ready}).reason).toBe("lost to the incumbent");
 expect(status({experiment:experiment({blocked:"needs a fix"})})).toBe("blocked");
 // Measured by another cohort: shown as running, never launched again by the queue, approval untouched.
 expect(deriveStatus({experiment:experiment({externalCohort:"factorial-2x2-think-fast"}),approval:null,ledger:[],runner:null,readiness:ready})).toMatchObject({state:"running",reason:"being measured in the factorial-2x2-think-fast cohort; the queue will not run it again"});
 expect(definitionHash(experiment({externalCohort:"x"}))).toBe(definitionHash(experiment()));
 expect(deriveStatus({experiment:experiment({blocked:"needs a fix"}),approval,ledger:[],runner:null,readiness:ready}).reason).toBe("needs a fix");
 expect(status({ledger:all,graded:true})).toBe("done");
 expect(deriveStatus({experiment:e,approval,ledger:all,runner:null,readiness:ready,graded:false})).toMatchObject({state:"held",reason:"all 8 trials finished; running the queue grades it"});
 expect(status({runner:{experiment:"full-map",trial:0}})).toBe("running");
 expect(status({approval:{...approval,sha256:"0".repeat(64)}})).toBe("stale");
 expect(status({ledger:all.slice(0,2)})).toBe("held");
 // INV-Q2 on resume: a started experiment without a valid approval cannot be held (runnable).
 expect(deriveStatus({experiment:e,approval:null,ledger:all.slice(0,2),runner:null,readiness:ready})).toMatchObject({state:"stale",reason:"trials have started but there is no valid approval; it needs a new approval to resume"});
 expect(status({experiment:experiment({queuePosition:undefined}),readiness:notReady})).toBe("pending");
 expect(deriveStatus({experiment:experiment({queuePosition:undefined}),approval:null,ledger:[],runner:null,readiness:notReady}).reason).toMatch(/not ready: 0 of the last 4 comparable runs reached FIRST_TRUCK_EXIT \(needs 3\)/);
 // A pending experiment joins the queue by itself once readiness passes (operator 2026-10-15: the queue should hold everything merged and untested).
 expect(deriveStatus({experiment:experiment({queuePosition:undefined}),approval:null,ledger:[],runner:null,readiness:ready}).state).toBe("draft");
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
