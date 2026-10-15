import {expect,it} from "vitest";
import {ALL_ON,type FeatureSet} from "./features.js";
import {DEFAULT_FINALS,FINALS_MAX_TURNS,decideFinals,finalsConfig,finalsOrder,finalsPreset,furthestIndex,nominate,parseFinalsLedger,parseNomination,parsePromotions,rankArms,withPromotion,type ArmRuns,type Promotion,type RunOutcome} from "./experiment-gate.js";
import {parseExperiment} from "./experiments.js";
import {MILESTONES} from "./milestones.js";

const order=MILESTONES.filter(m=>m.kind!=="legacy").map(m=>m.name);
const upTo=(name:string,ms=60_000):RunOutcome=>{const reached=order.slice(order.indexOf("CLOCK_SET"),order.indexOf(name)+1);return {reached,milestoneMs:Object.fromEntries(reached.map((m,i)=>[m,ms*(i+1)]))};};
const none:RunOutcome={reached:[],milestoneMs:{}};
const features:FeatureSet={...ALL_ON,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"full-map-navigation-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false,"navigation-evidence-memory-v1":false};
const preset={version:2,id:"incumbent",target:null,limits:{maxTurns:1500,maxWallMs:1_800_000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features} as const;

it("ranks arms by primary reach, then median furthest milestone, then speed, then the given order",()=>{
 const arms:ArmRuns[]=[
  {arm:"control",runs:[upTo("RIVAL_HOUSE_ENTERED"),none,none,none]},
  {arm:"whole",runs:[upTo("RIVAL_MET"),upTo("RIVAL_HOUSE_ENTERED"),none,none]},
  {arm:"memory",runs:[upTo("RIVAL_HOUSE_ENTERED",30_000),upTo("RIVAL_HOUSE_ENTERED",30_000),none,none]},
  {arm:"both",runs:[upTo("RIVAL_HOUSE_ENTERED"),upTo("RIVAL_HOUSE_ENTERED"),none,none]},
 ];
 const ranked=rankArms(arms,"RIVAL_HOUSE_ENTERED");
 // whole reaches further in one run, but the median furthest ties; memory is fastest; whole and both tie, so the given order decides.
 expect(ranked.map(r=>r.arm)).toEqual(["memory","whole","both","control"]);
 expect(ranked[0]).toMatchObject({arm:"memory",runs:4,reached:2,medianPrimaryMs:expect.any(Number) as number});
 expect(ranked[3]).toMatchObject({arm:"control",reached:1});
 expect(rankArms([{arm:"a",runs:[]},{arm:"b",runs:[]}],"RIVAL_HOUSE_ENTERED").map(r=>[r.arm,r.medianFurthest,r.medianPrimaryMs])).toEqual([["a",-1,null],["b",-1,null]]);
});

it("nominates at most three finalists, only arms ranked above the incumbent arm",()=>{
 const r=(arm:string)=>({arm,runs:4,reached:0,medianFurthest:0,medianPrimaryMs:null});
 expect(nominate([r("a"),r("b"),r("c"),r("control"),r("d")],"control")).toEqual(["a","b","c"]);
 expect(nominate([r("a"),r("b"),r("c"),r("e"),r("control")],"control")).toEqual(["a","b","c"]);
 expect(nominate([r("control"),r("a")],"control")).toEqual([]);
 expect(()=>nominate([r("a")],"control")).toThrow("no incumbent arm control");
});

it("orders finals so every arm runs the same number of times, balanced: ABBA for two arms",()=>{
 expect(finalsOrder(["incumbent","candidate"],4)).toEqual(["incumbent","candidate","candidate","incumbent","incumbent","candidate","candidate","incumbent"]);
 for(const arms of [["incumbent","a","b"],["incumbent","a","b","c"]]){
  const o=finalsOrder(arms,8);
  expect(o).toHaveLength(arms.length*8);
  for(const a of arms)expect(o.filter(x=>x===a)).toHaveLength(8);
  // Each block of n holds every arm once, and no arm always goes first.
  for(let i=0;i<o.length;i+=arms.length)expect(new Set(o.slice(i,i+arms.length)).size).toBe(arms.length);
  expect(new Set(Array.from({length:8},(_,b)=>o[b*arms.length])).size).toBe(arms.length);
 }
});

it("builds a finals preset: boot start, the finals wall limit and stop milestone, the finalist's switches over the incumbent",()=>{
 const withStart={...preset,target:"RIVAL_MET",start:{kind:"save_state",path:"/x/CLOCK_SET.state",sha1:"a".repeat(40)}};
 const p=finalsPreset(withStart,"exp","whole",{"full-map-navigation-v1":true},DEFAULT_FINALS);
 expect(p).toMatchObject({id:"exp-finals-whole",target:null,limits:{maxTurns:FINALS_MAX_TURNS,maxWallMs:45*60_000,failureLimit:3}});
 expect(DEFAULT_FINALS).toEqual({runsPerArm:8,maxWallMs:45*60_000,target:null});
 expect("start" in p).toBe(false);
 expect(p.features["full-map-navigation-v1"]).toBe(true);
 expect(finalsPreset(preset,"exp","incumbent",{},DEFAULT_FINALS).features).toEqual(features);
 // An experiment can stop its finals early, at a milestone or a shorter wall limit.
 expect(finalsPreset(preset,"exp","whole",{},{runsPerArm:4,maxWallMs:20*60_000,target:"RIVAL_MET"})).toMatchObject({target:"RIVAL_MET",limits:{maxWallMs:20*60_000}});
 expect(()=>finalsPreset(preset,"exp","bad",{"bounded-navigation-v1":true,"live-map-v1":false},DEFAULT_FINALS)).toThrow(/finals preset bad/);
});

it("reads an experiment's finals settings, defaulting to 8 runs of 45 minutes with no stop milestone",()=>{
 const base={version:1,id:"hint",title:"Hint",changedFeature:"next-milestone-hint-v1",hypothesis:"h",activationMilestone:"CLOCK_SET",primaryMilestone:"RIVAL_HOUSE_ENTERED",queuePosition:2,source:{checkout:"main",commit:"a".repeat(40)},incumbent:preset,trialsPerArm:8,modelLane:"think-fast",budget:{maxWallMs:30_000_000},criteria:{completionTolerance:0,speedMarginPercent:10},readiness:{window:4,minReached:3}};
 expect(finalsConfig(parseExperiment(base))).toEqual(DEFAULT_FINALS);
 expect(finalsConfig(parseExperiment({...base,finals:{runsPerArm:4,maxWallMs:1_200_000,target:"RIVAL_MET"}}))).toEqual({runsPerArm:4,maxWallMs:1_200_000,target:"RIVAL_MET"});
 expect(finalsConfig(parseExperiment({...base,finals:{maxWallMs:1_200_000}}))).toEqual({...DEFAULT_FINALS,maxWallMs:1_200_000});
 expect(()=>parseExperiment({...base,finals:{target:"NOT_A_MILESTONE"}})).toThrow(/finals target NOT_A_MILESTONE is not a native milestone/);
 expect(()=>parseExperiment({...base,finals:{runsPerArm:2}})).toThrow(/Invalid experiment/);
});

it("measures the furthest native milestone a run reached",()=>{
 expect(furthestIndex(none)).toBe(-1);
 expect(furthestIndex(upTo("RIVAL_MET"))).toBe(order.indexOf("RIVAL_MET"));
 expect(furthestIndex({reached:["NOT_A_MILESTONE"],milestoneMs:{}})).toBe(-1);
});

const eight=(r:RunOutcome)=>Array.from({length:8},()=>r);
it("declares a finalist that reaches further, without regressing on earlier milestones",()=>{
 const d=decideFinals({incumbent:eight(upTo("RIVAL_HOUSE_ENTERED")),finalists:[{arm:"whole",runs:eight(upTo("RIVAL_MET"))}],speedMarginPercent:10,completionTolerance:0});
 expect(d.winner).toBe("whole");
 expect(d.verdicts[0]).toMatchObject({arm:"whole",pass:true});
 expect(d.incumbent.medianFurthest).toBe(order.indexOf("RIVAL_HOUSE_ENTERED"));
});

it("declares a finalist that reaches the same milestone enough faster, and refuses one that is only a little faster",()=>{
 const fast=decideFinals({incumbent:eight(upTo("RIVAL_HOUSE_ENTERED",60_000)),finalists:[{arm:"a",runs:eight(upTo("RIVAL_HOUSE_ENTERED",50_000))}],speedMarginPercent:10,completionTolerance:0});
 expect(fast.winner).toBe("a");
 const slow=decideFinals({incumbent:eight(upTo("RIVAL_HOUSE_ENTERED",60_000)),finalists:[{arm:"a",runs:eight(upTo("RIVAL_HOUSE_ENTERED",57_000))}],speedMarginPercent:10,completionTolerance:0});
 expect(slow.winner).toBeNull();
 expect(slow.verdicts[0]?.reasons.join(" ")).toMatch(/not further and not 10% faster/);
 const nowhere=decideFinals({incumbent:eight(none),finalists:[{arm:"a",runs:eight(none)}],speedMarginPercent:10,completionTolerance:0});
 expect(nowhere.winner).toBeNull();
});

it("fails a finalist that regresses on an earlier milestone, and the runner-up can pass instead",()=>{
 const incumbent=[...Array.from({length:4},()=>upTo("RIVAL_MET")),...Array.from({length:4},()=>upTo("RIVAL_HOUSE_ENTERED"))];
 // Further at the median, but reaches RIVAL_HOUSE_ENTERED in only 6 runs where the incumbent did in 8.
 const best=[...Array.from({length:6},()=>upTo("STARTER_CHOSEN")),none,none];
 const runnerUp=eight(upTo("RIVAL_MET"));
 const d=decideFinals({incumbent,finalists:[{arm:"best",runs:best},{arm:"second",runs:runnerUp}],speedMarginPercent:10,completionTolerance:0});
 expect(d.verdicts[0]).toMatchObject({arm:"best",pass:false});
 expect(d.verdicts[0]?.reasons.join(" ")).toMatch(/RIVAL_HOUSE_ENTERED in 6 of 8 runs; the incumbent did in 8/);
 expect(d.winner).toBe("second");
 expect(decideFinals({incumbent,finalists:[{arm:"best",runs:best}],speedMarginPercent:10,completionTolerance:2}).winner).toBe("best");
 expect(decideFinals({incumbent,finalists:[],speedMarginPercent:10,completionTolerance:0}).winner).toBeNull();
});

it("overlays a promotion's switches on an incumbent and names a superseded experiment",()=>{
 const promotion:Promotion={id:"full-map-navigation@t",from:"full-map-navigation",arm:"whole",features:{"full-map-navigation-v1":true},at:"t",finals:["r1"]};
 const e=parseExperiment({version:1,id:"hint",title:"Hint",changedFeature:"next-milestone-hint-v1",hypothesis:"h",activationMilestone:"CLOCK_SET",primaryMilestone:"RIVAL_HOUSE_ENTERED",queuePosition:2,source:{checkout:"main",commit:"a".repeat(40)},incumbent:preset,trialsPerArm:8,modelLane:"think-fast",budget:{maxWallMs:30_000_000},criteria:{completionTolerance:0,speedMarginPercent:10},readiness:{window:4,minReached:3}});
 const applied=withPromotion(e,promotion);
 expect(applied.superseded).toBeNull();
 expect(applied.experiment.incumbent.features["full-map-navigation-v1"]).toBe(true);
 expect(applied.experiment.definitionSha256).toBe(e.definitionSha256);
 expect(withPromotion(e,null)).toEqual({experiment:e,superseded:null});
 const same=withPromotion({...e,changedFeature:"full-map-navigation-v1"},promotion);
 expect(same.superseded).toMatch(/full-map-navigation-v1 was decided by the full-map-navigation finals/);
 expect(same.experiment.incumbent.features["full-map-navigation-v1"]).toBe(false);
});

it("validates nomination, finals ledger and promotion records",()=>{
 const nomination={experiment:"exp",source:"cohort",cohort:"factorial",at:"t",incumbent:finalsPreset(preset,"exp","incumbent",{},DEFAULT_FINALS),finals:DEFAULT_FINALS,ranking:[{arm:"whole",runs:8,reached:3,medianFurthest:4,medianPrimaryMs:null}],finalists:[{arm:"whole",switches:{"full-map-navigation-v1":true}}],reason:"r"};
 expect(parseNomination(nomination).finalists[0]?.arm).toBe("whole");
 expect(()=>parseNomination({...nomination,finalists:[1,2,3,4].map(i=>({arm:`a${String(i)}`,switches:{}}))})).toThrow(/Invalid nomination/);
 expect(()=>parseNomination({...nomination,finalists:[{arm:"incumbent",switches:{}}]})).toThrow(/finalist cannot be named incumbent/);
 expect(()=>parseNomination({...nomination,finalists:[{arm:"whole",switches:{"not-a-switch":true}}]})).toThrow(/not-a-switch/);
 const {entries,problems}=parseFinalsLedger(`${JSON.stringify({type:"launch",trial:0,arm:"whole",run:"r",at:"t",model:"m",commit:"c".repeat(40)})}\nnope\n{"type":"x"}\n\n`);
 expect(entries).toHaveLength(1);expect(problems).toEqual(["line 2: not JSON","line 3: not a finals entry"]);
 const p=parsePromotions(`${JSON.stringify({id:"p",from:"exp",arm:"whole",features:{"full-map-navigation-v1":true},at:"t",finals:[]})}\n{}\nbad\n`);
 expect(p.promotions).toHaveLength(1);expect(p.problems).toHaveLength(2);
});
