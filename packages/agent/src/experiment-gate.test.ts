import {expect,it} from "vitest";
import {ALL_ON,type FeatureSet} from "./features.js";
import {DEFAULT_FINALS,FINALS_MAX_TURNS,WIN_SHARE,compareRuns,decideFinals,finalsConfig,finalsOrder,finalsPlan,finalsPreset,furthestIndex,nominate,parseFinalsLedger,parseNomination,parsePromotions,rankArms,superiority,withPromotion,type ArmRuns,type Promotion,type RunOutcome} from "./experiment-gate.js";
import {parseExperiment} from "./experiments.js";
import {MILESTONE_HINTS} from "./milestone-hint.js";

const order=MILESTONE_HINTS.map(h=>h.name);
const upTo=(name:string,ms=60_000):RunOutcome=>{const reached=order.slice(order.indexOf("CLOCK_SET"),order.indexOf(name)+1);return {reached,milestoneMs:Object.fromEntries(reached.map((m,i)=>[m,ms*(i+1)]))};};
const none:RunOutcome={reached:[],milestoneMs:{}};
const features:FeatureSet={...ALL_ON,"briefing-exits-v1":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"trainer-heal-guidance-v1":false,"low-hp-trainer-warning-v1":false,"readout-rules-in-prompt-v1":false,"disproved-beliefs-v1":false,"same-plan-breaker-v1":false,"navigation-refusal-reasons-v2":false,"navigate-first-prompt-v1":false,"blocked-batch-result-v1":false,"battle-text-auto-advance-v1":false,"explorer-guidance-v1":false,"adjacent-tiles-v1":false,"script-line-presence-v1":false,"character-presence-v1":false,"navigation-refusal-reasons-v1":false,"transition-press-result-v1":false,"stall-briefing-v1":false,"battle-details-v2":false,"dialogue-auto-advance-v1":false,"state-only-decisions-v1":false,"named-interactions-v1":false,"world-destinations-v1":false,"full-map-navigation-v1":false,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false,"navigation-evidence-memory-v1":false};
const preset={version:2,id:"incumbent",target:null,limits:{maxTurns:1500,maxWallMs:1_800_000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features} as const;

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

it("runs only the incumbent slots that recorded runs do not already fill",()=>{
 expect(finalsPlan(["incumbent","a"],4,0)).toEqual(finalsOrder(["incumbent","a"],4));
 expect(finalsPlan(["incumbent","a"],4,3)).toEqual(["a","a","a","a","incumbent"]);
 expect(finalsPlan(["incumbent","a"],4,9)).toEqual(["a","a","a","a"]);
});

it("builds a finals preset: boot start, the finals wall limit and stop milestone, the finalist's switches over the incumbent",()=>{
 const withStart={...preset,target:"RIVAL_MET",start:{kind:"save_state" as const,path:"/x/CLOCK_SET.state",sha1:"a".repeat(40)}};
 const p=finalsPreset(withStart,"exp","whole",{"full-map-navigation-v1":true},DEFAULT_FINALS);
 expect(p).toMatchObject({id:"exp-finals-whole",target:null,limits:{maxTurns:FINALS_MAX_TURNS,maxWallMs:45*60_000,failureLimit:3}});
 expect(DEFAULT_FINALS).toEqual({runsPerArm:8,maxWallMs:45*60_000,target:null});
 expect("start" in p).toBe(false);
 expect(p.features["full-map-navigation-v1"]).toBe(true);
 // Finals never end a run early for lack of a milestone (operator 2026-10-15 14:02 UTC): every run plays the full wall limit.
 expect(finalsPreset(preset,"exp","incumbent",{},DEFAULT_FINALS).features).toEqual({...features,"milestone-stall-stop-v1":false,"text-only-supervisor-v1":true});
 // Text-only replies get a supervisor note instead of ending a finals run (operator 2026-10-15 14:41 UTC).
 expect(finalsPreset(preset,"exp","whole",{"text-only-supervisor-v1":false},DEFAULT_FINALS).features["text-only-supervisor-v1"]).toBe(true);
 // State-only decisions deliver no follow-up message, so their finals keep it off.
 const stateOnly=Object.fromEntries(Object.entries(features).map(([k,v])=>[k,["objective-tracking-v1","deterministic-loop-guard-v1","bounded-navigation-v1","press-result-v1","navigation-evidence-memory-v1","game-evidence-priority-v1","dialogue-log-v1","instruction-ledger-v1","next-milestone-hint-v1","double-context-window-v1","fresh-retry-v1","grass-cost-navigation-v1","cross-map-goal-v1","loop-guard-supervisor-v1"].includes(k)?false:v]));
 expect(finalsPreset({...preset,features:{...stateOnly,"state-only-decisions-v1":true} as typeof features},"exp","state",{},DEFAULT_FINALS).features["text-only-supervisor-v1"]).toBe(false);
 expect(finalsPreset(preset,"exp","whole",{"milestone-stall-stop-v1":true},DEFAULT_FINALS).features["milestone-stall-stop-v1"]).toBe(false);
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
 expect(()=>parseExperiment({...base,finals:{target:"PLAYER_BEDROOM_EXITED_AFTER_CLOCK"}})).toThrow(/finals target PLAYER_BEDROOM_EXITED_AFTER_CLOCK is measurement-only/);
 expect(()=>parseExperiment({...base,finals:{runsPerArm:2}})).toThrow(/Invalid experiment/);
});

const eight=(r:RunOutcome)=>Array.from({length:8},()=>r);

it("orders runs by the furthest main-path milestone, then by who got there first",()=>{
 expect(furthestIndex(none)).toBe(-1);
 expect(furthestIndex(upTo("RIVAL_MET"))).toBe(order.indexOf("RIVAL_MET"));
 // Off-path and unknown milestones do not move a run along the main path.
 expect(furthestIndex({reached:["FIRST_POKEMON_CAUGHT","NOT_A_MILESTONE"],milestoneMs:{}})).toBe(-1);
 expect(compareRuns(upTo("RIVAL_MET"),upTo("RIVAL_HOUSE_ENTERED",1))).toBe(1);
 expect(compareRuns(upTo("RIVAL_HOUSE_ENTERED",60_000),upTo("RIVAL_HOUSE_ENTERED",50_000))).toBe(-1);
 expect(compareRuns(upTo("RIVAL_HOUSE_ENTERED"),upTo("RIVAL_HOUSE_ENTERED"))).toBe(0);
 expect(compareRuns(none,none)).toBe(0);
 expect(compareRuns({reached:["RIVAL_MET"],milestoneMs:{}},upTo("RIVAL_MET"))).toBe(0);
});

it("measures the probability of superiority over every pair of runs, ties counting half",()=>{
 expect(superiority([upTo("RIVAL_MET"),none],[upTo("RIVAL_HOUSE_ENTERED"),none])).toEqual({share:0.625,wins:2,ties:1,pairs:4});
 expect(superiority([],[none])).toEqual({share:0.5,wins:0,ties:0,pairs:0});
});

it("ranks arms by how often their runs beat the incumbent arm's, so runs that go much further count",()=>{
 // both reaches the rival's house in all 4 runs and whole in only 3, but whole's runs go to Oldale:
 // greedy reach counting would rank both first.
 const arms:ArmRuns[]=[
  {arm:"control",runs:[upTo("RIVAL_HOUSE_ENTERED"),upTo("RIVAL_HOUSE_ENTERED"),none,none]},
  {arm:"whole",runs:[upTo("OLDALE_TOWN"),upTo("OLDALE_TOWN"),upTo("OLDALE_TOWN"),none]},
  {arm:"memory",runs:[none,none,none,none]},
  {arm:"both",runs:[upTo("RIVAL_HOUSE_ENTERED"),upTo("RIVAL_HOUSE_ENTERED"),upTo("RIVAL_HOUSE_ENTERED"),upTo("RIVAL_HOUSE_ENTERED")]},
 ];
 const ranked=rankArms(arms,"RIVAL_HOUSE_ENTERED","control");
 expect(ranked.map(r=>[r.arm,r.share,r.reached])).toEqual([["whole",0.8125,3],["both",0.75,4],["control",0.5,2],["memory",0.25,0]]);
 expect(()=>rankArms(arms,"RIVAL_HOUSE_ENTERED","nope")).toThrow("no incumbent arm nope");
 // Equal shares keep the order given.
 expect(rankArms([{arm:"control",runs:[none]},{arm:"a",runs:[none]},{arm:"b",runs:[none]}],"RIVAL_HOUSE_ENTERED","control").map(r=>r.arm)).toEqual(["control","a","b"]);
});

it("nominates at most three finalists, only arms that beat the incumbent arm in more than half their pairs",()=>{
 const r=(arm:string,share:number)=>({arm,runs:4,reached:0,share});
 expect(nominate([r("a",0.9),r("b",0.8),r("c",0.7),r("d",0.6),r("control",0.5)],"control")).toEqual(["a","b","c"]);
 expect(nominate([r("a",0.6),r("control",0.5),r("tie",0.5),r("d",0.2)],"control")).toEqual(["a"]);
 expect(nominate([r("control",0.5)],"control")).toEqual([]);
});

it("declares the finalist with the highest share at or above the large-effect cutoff",()=>{
 expect(WIN_SHARE).toBe(0.71);
 const incumbent=eight(upTo("RIVAL_HOUSE_ENTERED"));
 const d=decideFinals({incumbent,finalists:[{arm:"ok",runs:[...Array.from({length:6},()=>upTo("RIVAL_MET")),none,none]},{arm:"best",runs:eight(upTo("RIVAL_MET"))}]});
 expect(d.verdicts.map(v=>[v.arm,v.pass,v.share])).toEqual([["ok",true,0.75],["best",true,1]]);
 expect(d.winner).toBe("best");
 // Equal shares go to nomination order.
 expect(decideFinals({incumbent,finalists:[{arm:"a",runs:eight(upTo("RIVAL_MET"))},{arm:"b",runs:eight(upTo("RIVAL_MET"))}]}).winner).toBe("a");
});

it("keeps the incumbent when no finalist reaches the cutoff, saying how close it came",()=>{
 const incumbent=eight(upTo("RIVAL_HOUSE_ENTERED",60_000));
 // Same milestone: 5 runs faster, 1 tied, 2 that reach nothing: 40 wins and 8 ties of 64 pairs, 0.69.
 const near=[...Array.from({length:5},()=>upTo("RIVAL_HOUSE_ENTERED",50_000)),upTo("RIVAL_HOUSE_ENTERED",60_000),none,none];
 const d=decideFinals({incumbent,finalists:[{arm:"near",runs:near}]});
 expect(d.winner).toBeNull();
 expect(d.verdicts[0]).toMatchObject({pass:false,wins:40,ties:8,pairs:64});
 expect(d.verdicts[0]?.reasons[0]).toBe("better in 40 and tied in 8 of 64 pairs (0.69); a winner needs 0.71");
 expect(decideFinals({incumbent,finalists:[]}).winner).toBeNull();
 expect(decideFinals({incumbent:[],finalists:[{arm:"x",runs:[]}]}).verdicts[0]).toMatchObject({pass:false,pairs:0});
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
 const nomination={experiment:"exp",source:"cohort",cohort:"factorial",at:"t",incumbent:finalsPreset(preset,"exp","incumbent",{},DEFAULT_FINALS),finals:DEFAULT_FINALS,reusedIncumbent:[],ranking:[{arm:"whole",runs:8,reached:3,share:0.8}],finalists:[{arm:"whole",switches:{"full-map-navigation-v1":true}}],reason:"r"};
 expect(parseNomination(nomination).finalists[0]?.arm).toBe("whole");
 expect(()=>parseNomination({...nomination,finalists:[1,2,3,4].map(i=>({arm:`a${String(i)}`,switches:{}}))})).toThrow(/Invalid nomination/);
 expect(()=>parseNomination({...nomination,finalists:[{arm:"incumbent",switches:{}}]})).toThrow(/finalist cannot be named incumbent/);
 expect(()=>parseNomination({...nomination,finalists:[{arm:"whole",switches:{"not-a-switch":true}}]})).toThrow(/not-a-switch/);
 const {entries,problems}=parseFinalsLedger(`${JSON.stringify({type:"launch",trial:0,arm:"whole",run:"r",at:"t",model:"m",commit:"c".repeat(40)})}\nnope\n{"type":"x"}\n\n`);
 expect(entries).toHaveLength(1);expect(problems).toEqual(["line 2: not JSON","line 3: not a finals entry"]);
 const p=parsePromotions(`${JSON.stringify({id:"p",from:"exp",arm:"whole",features:{"full-map-navigation-v1":true},at:"t",finals:[]})}\n{}\nbad\n`);
 expect(p.promotions).toHaveLength(1);expect(p.problems).toHaveLength(2);
});
