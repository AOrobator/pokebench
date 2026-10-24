import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
// same-target-no-progress-v1 (the operator approved the guard 2026-10-20). Run 2026-10-20T16-14-34_qwen36-gpu0_a8f9 from
// turn 1282 (tool_call seq 41089) called navigate_to (29,16) on RUSTURF TUNNEL 39 times; every call ended on one of
// six tiles next to (4,9), a third of them in a wild battle, and no loop guard fired.
// same-target-a8f9.jsonl.gz is that run's run_start plus seq 41060-43000, made by the test author: state, tool_call,
// tool_result, button_press, milestone, loop_guard, turn_start and telemetry_error events whole, except that tool
// results drop `frames` and states drop `raw_ram` and `resources.berry_trees`; other event types dropped.
import {describe,expect,it} from "vitest";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {recorded} from "../test-support/battle-facts.js";
import {checkEvent,type RunEvent} from "./events.js";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
const RAW_PROGRESS_PENDING_BASE_CURRENT_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"coherent-battle-observation-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
const PENDING_BASE_CURRENT_ON={...RAW_PROGRESS_PENDING_BASE_CURRENT_ON,"progress-aware-cycles-v1":false};
const CURRENT_ON={...PENDING_BASE_CURRENT_ON,"pending-field-dialogue-v1":false};
import type {GameStateSnapshot} from "./game-state.js";
import {readFileSync} from "node:fs";
import {Governor,attachLoopGuard} from "./harness.js";
import {LoopCoordinator} from "./loop/coordinator.js";
import {SAME_TARGET_CALLS,SAME_TARGET_TILES,SameTargetNoProgress} from "./loop/same-target.js";
import type {CompletedCall,LoopNotice} from "./loop-detection.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {loopSupervisor} from "./play-wiring.js";
import type {RunRecorder} from "./recorder.js";

// The loop guard exactly as live.ts and decision-probe.ts attach it (the source test below pins those calls).
function playLoopGuard(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLoopGuard">,governor:Governor){
 return attachLoopGuard(recorder,governor,undefined,"enforced",features["interaction-loop-detection-v1"],loopSupervisor(features,recorder),features["transition-loop-detection-v1"],features["pushback-loop-detection-v1"],features["battle-observation-loop-v1"],features["navigation-truth-v1"],features["ineffective-loops-v1"],features["battle-menu-loop-v1"],features["clock-view-loop-v1"],features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"],features["same-target-no-progress-v1"]);
}

const ID="same-target-no-progress-v1";
const at=(x:number,y:number,extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>({screen:"overworld",started:true,name:"A",location:"RUSTURF TUNNEL",map_id:[24,4],position:{x,y},facing:"up",field_controls_locked:false,in_battle:false,party:[],money:0,badges:[],play_time_s:0,...extra});
const battle=(x:number,y:number):GameStateSnapshot=>at(x,y,{screen:"battle",in_battle:true,field_controls_locked:null});
const limit=(s:GameStateSnapshot):string=>`Navigation: command limit: stopped at (${String(s.position?.x)},${String(s.position?.y)}) after 8 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (29,16); 8 ordinary button attempts.`;
const INTERRUPTED="Navigation: walk interrupted: field controls were locked; after auto-advance: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT; 1 ordinary button attempts.";
function walk(seq:number,from:GameStateSnapshot,to:GameStateSnapshot,target:{x:number;y:number}={x:29,y:16},extra:Partial<CompletedCall>={}):CompletedCall{
 return {name:"navigate_to",args:{...target,map_id:[24,4]},isError:false,text:`${to.in_battle?INTERRUPTED:limit(to)}\nScreen: overworld`,startState:from,beforeState:from,state:to,seq,acted:true,...extra};
}
const fight=(seq:number,s:GameStateSnapshot):CompletedCall=>({name:"battle_action",args:{action:"fight",move:"EMBER"},isError:false,text:"Battle: ...",state:s,seq});

describe("SameTargetNoProgress counter",()=>{
 it("fires on the 4th counted call of the a8f9 shape: one target, small displacement, a battle in between",()=>{
  const g=new SameTargetNoProgress(true);
  expect(SAME_TARGET_CALLS).toBe(4);expect(SAME_TARGET_TILES).toBe(3);
  expect(g.complete(walk(10,at(4,9),at(5,8)),1282,null).warning).toBeNull();
  expect(g.complete(walk(20,at(5,8),at(4,7)),1283,null).warning).toBeNull();
  expect(g.complete(walk(30,at(4,7),battle(4,8)),1284,null).warning).toBeNull();
  expect(g.complete(fight(40,at(4,8)),1285,null).warning).toBeNull();
  const fired=g.complete(walk(50,at(4,8),at(5,9)),1286,null).warning;
  expect(fired).not.toBeNull();
  expect(fired?.evidence).toEqual([10,50]);
  expect(fired?.calls).toBe(4);
  expect(fired?.text).toBe(`SUPERVISOR: Since turn 1282, when you were at (4,9), 4 of your navigate_to calls to (29,16) on RUSTURF TUNNEL (map 24/4) have ended within 3 tiles of (4,9). The latest 4 ended at (5,8), (4,7), (4,8) when a battle began, and (5,9). Their results said: "${limit(at(5,8))}"; "${limit(at(4,7))}"; "${INTERRUPTED}"; "${limit(at(5,9))}".`);
 });
 it("quotes each result once, names a locked field, has no SUPERVISOR head without the supervisor, and says the map when the place is unknown",()=>{
  const g=new SameTargetNoProgress(false);
  const plain=(x:number,y:number):GameStateSnapshot=>at(x,y,{location:null});
  const same=(seq:number,to:GameStateSnapshot):CompletedCall=>walk(seq,plain(4,9),to,{x:29,y:16},{text:"Navigation: no route\nScreen: overworld"});
  g.complete(same(1,plain(4,9)),5,null);g.complete(same(2,plain(4,8)),5,null);
  g.complete(same(3,plain(4,8)),6,null);
  const fired=g.complete(same(4,at(4,7,{location:null,field_controls_locked:true})),7,null).warning;
  expect(fired?.text).toBe("Since turn 5, when you were at (4,9), 4 of your navigate_to calls to (29,16) on map 24/4 have ended within 3 tiles of (4,9). The latest 4 ended at (4,9), (4,8), (4,8), and (4,7) when field controls were locked. Their results said: \"Navigation: no route\".");
 });
 it("re-arms after 4 more counted calls and then counts the battles among all of them",()=>{
  const g=new SameTargetNoProgress(true);
  const ends=[at(5,8),at(4,7),battle(4,8),at(5,9),battle(5,9),at(5,7),battle(5,7),at(4,8)];
  const warnings=ends.map((to,i)=>g.complete(walk(i+1,i===0?at(4,9):(ends[i-1]??at(4,9)),to),1282+i,null).warning);
  expect(warnings.map(w=>w!==null)).toEqual([false,false,false,true,false,false,false,true]);
  const second=warnings[7];
  expect(second?.calls).toBe(8);expect(second?.evidence).toEqual([1,8]);
  expect(second?.text).toContain("Since turn 1282, when you were at (4,9), 8 of your navigate_to calls to (29,16)");
  expect(second?.text).toContain("The latest 4 ended at (5,9) when a battle began, (5,7), (5,7) when a battle began, and (4,8).");
  expect(second?.text).toMatch(/ 3 of the 8 stopped when a battle began\.$/);
 });
 it("a counted call ending 4 or more tiles from the anchor resets that target; the next call anchors again",()=>{
  const g=new SameTargetNoProgress(true);
  g.complete(walk(1,at(4,9),at(5,8)),1,null);g.complete(walk(2,at(5,8),at(4,7)),1,null);g.complete(walk(3,at(4,7),at(4,8)),1,null);
  const far=g.complete(walk(4,at(4,8),at(8,9)),1,"29,16@24,4");
  expect(far.warning).toBeNull();expect(far.cleared).toBe(true);
  for(let i=5;i<8;i++)expect(g.complete(walk(i,at(8,9),at(8,9-(i%2))),1,null).warning).toBeNull();
  expect(g.complete(walk(8,at(8,9),at(7,9)),2,null).warning?.text).toContain("when you were at (8,9), 4 of your");
 });
 it("a walk to the warned target that ends 4 tiles away resets it without anchoring itself",()=>{
  const g=new SameTargetNoProgress(true);
  for(let i=1;i<=4;i++)g.complete(walk(i,at(4,9),at(4,8)),1,null);
  expect(g.complete(walk(5,at(6,9),at(8,9)),2,"29,16@24,4").cleared).toBe(true);
  for(let i=6;i<9;i++)expect(g.complete(walk(i,at(8,9),at(8,8)),3,null).warning).toBeNull();
  expect(g.complete(walk(9,at(8,9),at(8,8)),3,null).warning?.text).toContain("Since turn 3, when you were at (8,9), 4 of your");
 });
 it("map changes, story milestones, story-state changes, the target reached and an explicit reset clear every target",()=>{
  const three=(g:SameTargetNoProgress):void=>{for(let i=1;i<=3;i++)g.complete(walk(i,at(4,9),at(4,8)),1,null);};
  const fourth=(g:SameTargetNoProgress):boolean=>g.complete(walk(9,at(4,9),at(4,8)),1,null).warning!==null;
  const map=new SameTargetNoProgress(true);three(map);
  expect(map.state(at(4,9,{map_id:null}))).toBe(false);
  expect(map.state(at(4,9))).toBe(false);
  expect(map.state(at(4,9,{map_id:[0,31],location:"ROUTE116"}))).toBe(true);
  expect(map.state(at(4,9,{map_id:[0,31]}))).toBe(false);
  expect(fourth(map)).toBe(false);
  const story=new SameTargetNoProgress(true);
  story.state(at(4,9,{story:{...STORY,clock_set:true}}));three(story);
  expect(story.state(at(4,9,{story:null}))).toBe(false);
  expect(story.state(at(4,9,{story:{...STORY,clock_set:null}}))).toBe(false);
  expect(story.state(at(4,9,{story:{...STORY,clock_set:true,route116_joey_defeated:true}}))).toBe(false);
  expect(story.state(at(4,9,{story:{...STORY,clock_set:true,route116_joey_defeated:false}}))).toBe(true);
  expect(fourth(story)).toBe(false);
  const reset=new SameTargetNoProgress(true);three(reset);reset.reset();expect(fourth(reset)).toBe(false);
  const reached=new SameTargetNoProgress(true);three(reached);
  expect(reached.complete(walk(5,at(4,9),at(29,16)),1,"29,16@24,4").cleared).toBe(true);
  expect(fourth(reached)).toBe(false);
  const kept=new SameTargetNoProgress(true);three(kept);
  expect(kept.state(battle(4,8))).toBe(false);
  expect(kept.state(at(4,8,{screen:"evolution",in_battle:true}))).toBe(false);
  kept.complete(fight(4,at(4,8)),1,null);
  kept.complete({name:"observe",args:{},isError:false,text:"",state:at(4,8),seq:5},1,null);
  kept.complete({name:"press",args:{buttons:["B"]},isError:false,text:"",state:at(4,8),seq:6},1,null);
  expect(fourth(kept)).toBe(true);
 });
 it("keeps separate counts for two alternating targets",()=>{
  const g=new SameTargetNoProgress(true);const A={x:29,y:16},B={x:18,y:20};
  const fired:string[]=[];
  for(let i=0;i<8;i++){
   const w=g.complete(walk(i+1,at(4,9),at(4,8+(i%2)),i%2===0?A:B),100+i,null).warning;
   if(w!==null)fired.push(`${String(i+1)}:${w.key}`);
  }
  expect(fired).toEqual(["7:29,16@24,4","8:18,20@24,4"]);
 });
 it("does not count errors, unknown or transition end states, other maps or unknown starts, and does not reset on them",()=>{
  const g=new SameTargetNoProgress(true);
  g.complete(walk(1,at(4,9),at(4,8)),1,null);
  expect(g.complete(walk(2,at(4,8),at(4,8),{x:29,y:16},{isError:true}),1,null).warning).toBeNull();
  expect(g.complete(walk(3,at(4,8),at(4,8,{screen:"field_transition",position:null})),1,null).warning).toBeNull();
  expect(g.complete(walk(4,at(4,8),at(4,8,{field_controls_locked:null})),1,null).warning).toBeNull();
  expect(g.complete(walk(5,at(4,8),at(4,8),{x:29,y:16},{state:undefined}),1,null).warning).toBeNull();
  expect(g.complete(walk(6,at(4,8),at(4,8,{started:false})),1,null).warning).toBeNull();
  expect(g.complete(walk(7,at(4,8),at(4,8,{map_id:[0,31]})),1,null).warning).toBeNull();
  expect(g.complete({...walk(8,at(4,8),at(4,8)),args:{x:29,y:16,map_id:[0,31]}},1,null).warning).toBeNull();
  expect(g.complete({...walk(9,at(4,8),at(4,8)),args:{x:"29",y:16}},1,null).warning).toBeNull();
  const fresh=new SameTargetNoProgress(true);
  expect(fresh.complete(walk(1,at(4,9,{position:null}),at(4,8)),1,null).warning).toBeNull();
  expect(fresh.complete(walk(2,at(4,9),at(4,8),{x:29,y:16},{startState:undefined,beforeState:undefined}),1,null).warning).toBeNull();
  g.complete(walk(10,at(4,8),at(4,9)),1,null);g.complete(walk(11,at(4,9),at(4,8)),1,null);
  expect(g.complete(walk(12,at(4,8),at(4,7)),1,null).warning?.evidence).toEqual([1,12]);
 });
 it("keys navigate_to_target by its resolved tile, falls back to the current map and leaves connections untracked",()=>{
  const g=new SameTargetNoProgress(true);
  const objects={objects:[{local_id:3,map_id:[24,4] as [number,number],graphics_id:1,sprite_kind:"ITEM_BALL",x:3,y:1}],triggers:[],dialogue:"",message:null};
  const start=at(4,9,{world_context:objects as unknown as NonNullable<GameStateSnapshot["world_context"]>});
  const target=(seq:number,t:Record<string,unknown>):CompletedCall=>({...walk(seq,start,at(4,8)),name:"navigate_to_target",args:{map_id:[24,4],target:t},text:"Target: stopped\nScreen: overworld"});
  for(let i=1;i<=3;i++)expect(g.complete(target(i,{kind:"object",local_id:3}),1,null).warning).toBeNull();
  const fired=g.complete(walk(4,start,at(4,8),{x:3,y:1},{text:"Target: stopped"}),1,null).warning;
  expect(fired?.key).toBe("3,1@24,4");
  expect(fired?.text).toContain("4 of your navigate_to_target and navigate_to calls to (3,1)");
  expect(fired?.text).not.toContain("Their results said");
  const other=new SameTargetNoProgress(true);
  for(let i=1;i<=4;i++)expect(other.complete(target(i,{kind:"connection",direction:"NORTH"}),1,null).warning).toBeNull();
  for(let i=1;i<=4;i++)expect(other.complete(target(i,{kind:"object",local_id:9}),1,null).warning).toBeNull();
  for(let i=1;i<=4;i++)expect(other.complete({...target(i,{kind:"warp",x:4,y:10}),state:at(4,8)},1,null).warning===null).toBe(i<4);
  const near=new SameTargetNoProgress(true);
  expect(near.complete({...target(1,{kind:"interaction",interaction_kind:"sign",x:4,y:7}),state:at(4,8)},1,"4,7@24,4").cleared).toBe(true);
  const listed=new SameTargetNoProgress(true);
  const shown=at(4,9,{interaction_targets:[{name:null,kind:"object",x:6,y:5,elevation:3,activation:"talk",availability:"available",facing:null,local_id:7,destination:null}] as unknown as NonNullable<GameStateSnapshot["interaction_targets"]>});
  for(let i=1;i<=3;i++)listed.complete({...walk(i,shown,at(4,8)),name:"navigate_to_target",args:{map_id:[24,4],target:{kind:"object",local_id:7}}},1,null);
  expect(listed.complete({...walk(4,shown,at(4,8)),name:"navigate_to_target",args:{map_id:[24,4],target:{kind:"object",local_id:7}}},1,null).warning?.key).toBe("6,5@24,4");
  const bare=new SameTargetNoProgress(true);
  for(let i=1;i<=3;i++)bare.complete({...walk(i,at(4,9),at(4,8)),args:{x:29,y:16}},1,null);
  expect(bare.complete({...walk(4,at(4,9),at(4,8)),args:{x:29,y:16}},1,null).warning?.key).toBe("29,16@24,4");
 });
 it("a free-field call ending 4 or more tiles from the warned target's anchor clears it, whatever the call",()=>{
  const g=new SameTargetNoProgress(true);
  for(let i=1;i<=4;i++)g.complete(walk(i,at(4,9),at(4,8)),1,null);
  expect(g.complete({name:"press",args:{buttons:["RIGHT"]},isError:false,text:"",state:at(6,8),seq:5},1,"29,16@24,4").cleared).toBe(false);
  expect(g.complete({name:"press",args:{buttons:["RIGHT"]},isError:false,text:"",state:battle(9,9),seq:6},1,"29,16@24,4").cleared).toBe(false);
  expect(g.complete({name:"press",args:{buttons:["RIGHT"]},isError:false,text:"",state:at(9,9),seq:7},1,"29,16@24,4").cleared).toBe(true);
  for(let i=8;i<11;i++)expect(g.complete(walk(i,at(9,9),at(9,8)),1,null).warning).toBeNull();
 });
});

const STORY={name_confirmed:true,intro_stage:7,rival_stage:4,birch_lab_stage:5,petalburg_gym_stage:2,woods_stage:1,clock_set:true,rival_battle_won:true,pokedex_received:true,running_shoes_received:true,starter_tutorial_complete:true,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false} as NonNullable<GameStateSnapshot["story"]>;

describe("LoopCoordinator with same-target-no-progress-v1",()=>{
 const run=(on:boolean,supervisor=true)=>{
  const notices:LoopNotice[]=[];
  const c=new LoopCoordinator(n=>{notices.push(n);},{sameTargetNoProgress:on,...(supervisor?{supervisor:(kind:string)=>`SUPERVISOR: generic ${kind}`}:{})});
  return {c,notices};
 };
 const shape=[at(5,8),at(4,7),battle(4,8),at(5,9)];
 const drive=(c:LoopCoordinator,ends:readonly GameStateSnapshot[],first=1):void=>{
  ends.forEach((to,i)=>{c.complete(walk(first+i,i===0?at(4,9):(ends[i-1]??at(4,9)),to));});
 };
 it("OFF never fires on the a8f9 shape, and the context stays empty",()=>{
  const {c,notices}=run(false);drive(c,[...shape,...shape,...shape]);
  expect(notices).toEqual([]);expect(c.context()).toBeNull();
 });
 it("ON opens one episode on the 4th counted call whose briefing is the factual note, shielded from novel-state recovery",()=>{
  const {c,notices}=run(true);drive(c,shape);
  expect(notices.map(n=>`${n.kind}:${n.phase}`)).toEqual(["same_target_no_progress:warning","same_target_no_progress:supervisor"]);
  expect(notices[1]?.message).toMatch(/^SUPERVISOR: Since turn 0, when you were at \(4,9\), 4 of your navigate_to calls to \(29,16\)/);
  expect(notices[1]?.evidence).toEqual([1,4]);
  expect(c.context()).toBe(notices[1]?.message);
  c.complete(walk(5,at(5,9),at(5,7)));c.complete({name:"press",args:{buttons:["A"]},isError:false,text:"",state:at(5,7,{money:9}),seq:6});
  c.complete({name:"observe",args:{},isError:false,text:"",state:at(5,7,{money:10}),seq:7});
  for(let i=8;i<20;i++)c.complete({name:"press",args:{buttons:["UP"]},isError:false,text:"",state:at(5,8,{money:i}),seq:i});
  expect(notices.filter(n=>n.phase==="recovered"||n.phase==="stop")).toEqual([]);
  expect(c.stopped).toBe(false);
  drive(c,[at(4,8),at(5,8),at(4,7)],20);
  expect(notices.at(-1)?.phase).toBe("supervisor");expect(notices.at(-1)?.message).toContain("8 of your navigate_to calls");
 });
 it("closes the episode with a recovered notice on a map change, and without the supervisor wraps the note as a LOOP GUARD",()=>{
  const {c,notices}=run(true,false);drive(c,shape);
  expect(notices.map(n=>n.phase)).toEqual(["warning"]);
  expect(c.context()).toMatch(/^LOOP GUARD \(same_target_no_progress\): Since turn 0, when you were at \(4,9\)/);
  c.observe(stateEvent(100,at(4,10,{map_id:[0,31],location:"ROUTE116"})));
  expect(notices.map(n=>n.phase)).toEqual(["warning","recovered"]);
  expect(c.context()).toBeNull();
 });
 it("closes the open note when the target is reached, a walk to it ends 4 tiles away, or any call leaves the player 4 tiles away",()=>{
  const cases:readonly CompletedCall[]=[walk(5,at(5,9),at(29,16)),walk(5,at(5,9),at(8,9)),{name:"press",args:{buttons:["RIGHT"]},isError:false,text:"",state:at(9,9),seq:5}];
  for(const close of cases){
   const {c,notices}=run(true);drive(c,shape);
   expect(c.context()).not.toBeNull();
   c.complete(close);
   expect(notices.at(-1)?.phase).toBe("recovered");
   expect(c.context()).toBeNull();
  }
 });
 it("a story milestone closes it; a navigation milestone does not",()=>{
  const {c,notices}=run(true);drive(c,shape);
  c.observe({...stateEvent(100,at(5,9)),type:"milestone",name:"RUSTURF_TUNNEL",kind:"navigation",origin:"observed",server_timestamp:1} as unknown as RunEvent);
  expect(notices.at(-1)?.phase).toBe("supervisor");
  c.observe({...stateEvent(101,at(5,9)),type:"milestone",name:"ROXANNE_DEFEATED",kind:"story",origin:"observed",server_timestamp:1} as unknown as RunEvent);
  expect(notices.at(-1)?.phase).toBe("recovered");
 });
 it("does not replace another open loop episode",()=>{
  const {c,notices}=run(true);
  for(let i=1;i<=6;i++)c.complete({name:"observe",args:{},isError:false,text:"",state:at(4,9),seq:i});
  expect(notices.map(n=>n.kind)).toContain("observation");
  for(let i=0;i<8;i++)c.complete(walk(10+i,at(4,9),at(4,9)));
  expect(c.context()).toBe("SUPERVISOR: generic observation");
  const held=notices.filter(n=>n.kind==="same_target_no_progress");
  expect(held.map(n=>`${n.mode}:${n.phase}:${String(n.evidence)}`)).toEqual(["diagnostic:would_warn:10,13","diagnostic:would_warn:10,17"]);
  expect(held[0]?.message).toMatch(/^Not sent \(another loop episode is open\): SUPERVISOR: Since turn 0, when you were at \(4,9\), 4 of your navigate_to calls/);
 });
 it("a diagnostic coordinator only would_warn",()=>{
  const notices:LoopNotice[]=[];
  const c=new LoopCoordinator(n=>{notices.push(n);},{sameTargetNoProgress:true,mode:"diagnostic"});
  drive(c,shape);
  expect(notices.map(n=>`${n.kind}:${n.phase}`)).toEqual(["same_target_no_progress:would_warn"]);
  expect(c.context()).toBeNull();
 });
});

function stateEvent(seq:number,s:GameStateSnapshot):RunEvent{
 return {v:1,run:"r",seq,t:"2026-10-20T18:42:00.000-04:00",type:"state",turn:1,...s} as unknown as RunEvent;
}

describe("same-target-no-progress-v1 on run a8f9 (RUSTURF TUNNEL, navigate_to (29,16) from turn 1282)",()=>{
 const A8F9="same-target-a8f9.jsonl.gz";
 type Guard=Extract<RunEvent,{type:"loop_guard"}>;
 const replay=(features:FeatureSet)=>{
  const events=recorded(A8F9);
  const subscribers:((e:RunEvent)=>void)[]=[];const guards:Guard[]=[];const contexts=new Map<number,string|null>();
  let current:RunEvent=events[0] as RunEvent;
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordLoopGuard:(n:LoopNotice)=>{guards.push(checkEvent({v:1,run:current.run,seq:current.seq,t:current.t,turn:current.turn,type:"loop_guard",...n,evidence:[...n.evidence]}) as Guard);}};
  const governor=new Governor({limits:{maxTurns:5000,maxWallMs:1e12,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  const detector=playLoopGuard(features,recorder,governor);
  for(const e of events){
   if(e.type==="loop_guard"||e.type==="run_start")continue;
   current=e;
   for(const s of subscribers)s(e);
   if(e.type==="turn_start")contexts.set(e.turn,detector.context());
  }
  return {guards,contexts};
 };
 const start=recorded(A8F9).find(e=>e.type==="run_start");
 const RUN=featuresOf(start?.type==="run_start"?start.harness_features:[]);
 const result=(seq:number):string=>{
  const e=recorded(A8F9).find(x=>x.seq===seq);
  if(e?.type!=="tool_result")throw new Error(`no result ${String(seq)}`);
  return (e.text.split("\n")[0])??"";
 };
 it("records no loop guard with the switch off, as the run did",()=>{
  expect(RUN[ID as keyof FeatureSet]).toBe(false);
  expect(RUN["loop-guard-supervisor-v1"]).toBe(true);
  expect(replay(RUN).guards).toEqual([]);
 });
 it("warns at the 4th counted (29,16) call after turn 1282 (result 41310, turn 1286) with a note that matches the state",()=>{
  const {guards,contexts}=replay({...RUN,[ID]:true});
  const first=guards[0];
  expect(first).toMatchObject({kind:"same_target_no_progress",phase:"warning",seq:41310,turn:1286,evidence:[41131,41310],mode:"enforced"});
  const note=`SUPERVISOR: Since turn 1282, when you were at (4,9), 4 of your navigate_to calls to (29,16) on RUSTURF TUNNEL (map 24/4) have ended within 3 tiles of (4,9). The latest 4 ended at (5,8), (4,7), (4,8) when a battle began, and (5,9). Their results said: "${result(41131)}"; "${result(41178)}"; "${result(41204)}"; "${result(41310)}".`;
  expect(result(41131)).toBe("Navigation: command limit: stopped at (5,8) after 8 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (29,16); 8 ordinary button attempts.");
  expect(result(41204)).toBe("Navigation: walk interrupted: field controls were locked; after auto-advance: the battle action menu is ready (FIGHT, BAG, POKEMON, RUN); highlighted FIGHT; 1 ordinary button attempts.");
  expect(guards[1]).toMatchObject({kind:"same_target_no_progress",phase:"supervisor",seq:41310,message:note});
  expect(contexts.get(1286)).toBeNull();
  expect(contexts.get(1287)).toBe(note);
  const second=guards[2];
  expect(second).toMatchObject({phase:"supervisor",seq:41605,turn:1292,evidence:[41131,41605]});
  expect(second?.message).toBe(`SUPERVISOR: Since turn 1282, when you were at (4,9), 8 of your navigate_to calls to (29,16) on RUSTURF TUNNEL (map 24/4) have ended within 3 tiles of (4,9). The latest 4 ended at (5,9) when a battle began, (5,7), (5,7) when a battle began, and (4,8). Their results said: "${result(41336)}"; "${result(41448)}"; "${result(41499)}"; "${result(41605)}". 3 of the 8 stopped when a battle began.`);
  expect(guards.every(g=>g.kind==="same_target_no_progress"&&g.phase!=="stop"&&g.phase!=="recovered")).toBe(true);
  expect(guards.filter(g=>g.phase==="supervisor").map(g=>[g.turn,g.seq])).toEqual([[1286,41310],[1292,41605],[1296,41793],[1302,42098],[1308,42403],[1318,42758]]);
 });
});

describe("same-target-no-progress-v1 registry and wiring",()=>{
 it("registers a default-off guard that needs the deterministic loop guard, appended last",()=>{
  expect(SWITCHABLE_FEATURES.at(-92)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-92)?.id).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"deterministic-loop-guard-v1",switchable:true,title:"SAME TARGET, NO PROGRESS"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(withoutFrontierTreatments(CURRENT_ON),null).at(-51)).toBe(ID);
  expect(playHarnessFeatures({...CURRENT_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...CURRENT_ON,"deterministic-loop-guard-v1":false})).toContain(`${ID} needs deterministic-loop-guard-v1`);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(ALL_ON[ID]).toBe(false);
 });
 it("is registered as a pending one-switch experiment and joins only the bundle arm of the fixed experiments",()=>{
  for(const name of ["bundle-v-control","bundle-cook-1h"]){
   const fixed=JSON.parse(readFileSync(new URL(`../../../experiments/fixed/${name}.json`,import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
   expect(fixed.base.features[ID]).toBe(false);expect(fixed.switches).toContain(ID);
   expect(fixed.base.features["deterministic-loop-guard-v1"]).toBe(true);
  }
 });
 it("live play and the decision probe pass the switch as the loop guard's last argument",()=>{
  for(const file of ["live.ts","decision-probe.ts"]){
   const source=readFileSync(new URL(`./${file}`,import.meta.url),"utf8");
   const call=source.slice(source.indexOf("attachLoopGuard("));
   expect(call.slice(0,call.indexOf(");")).endsWith(`features["ineffective-navigation-v2"],features["${ID}"],features`),file).toBe(true);
  }
 });
 it("records a held warning as a schema-valid diagnostic loop_guard event through the production recorder path",()=>{
  type Guard=Extract<RunEvent,{type:"loop_guard"}>;
  const recorded:Guard[]=[];const subs:((e:RunEvent)=>void)[]=[];
  const governor=new Governor({limits:{maxTurns:50,maxWallMs:1e12,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
  const d=attachLoopGuard({subscribe:fn=>{subs.push(fn);},recordLoopGuard:n=>{recorded.push(checkEvent({v:1,run:"r",seq:100+recorded.length,t:"2026-10-20T18:42:00.000-04:00",turn:1,type:"loop_guard",...n,evidence:[...n.evidence]}) as Guard);}},governor,undefined,"enforced",false,(kind)=>`SUPERVISOR: generic ${kind}`,false,false,false,false,false,false,false,false,false,false,false,true);
  for(let i=1;i<=6;i++)d.complete({name:"observe",args:{},isError:false,text:"",state:at(4,9),seq:i});
  const context=d.context();
  expect(context).toBe("SUPERVISOR: generic observation");
  for(let i=0;i<8;i++)d.complete(walk(10+i,at(4,9),at(4,9)));
  const held=recorded.filter(g=>g.kind==="same_target_no_progress");
  expect(held.map(g=>"mode" in g?`${g.mode}:${g.phase}:${String(g.evidence)}`:"")).toEqual(["diagnostic:would_warn:10,13","diagnostic:would_warn:10,17"]);
  expect(held.every(g=>g.message.startsWith("Not sent (another loop episode is open): SUPERVISOR: Since turn 0"))).toBe(true);
  expect(d.context()).toBe(context);
 });
 it("the production loop guard honors the switch",()=>{
  const build=(on:boolean)=>{
   const notices:LoopNotice[]=[];const subs:((e:RunEvent)=>void)[]=[];
   const governor=new Governor({limits:{maxTurns:50,maxWallMs:1e12,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
   const d=playLoopGuard({...ALL_ON,[ID]:on,"loop-guard-supervisor-v1":false},{subscribe:fn=>{subs.push(fn);},recordLoopGuard:n=>{notices.push(n);}},governor);
   [at(5,8),at(4,7),battle(4,8),at(5,9)].forEach((to,i)=>{d.complete(walk(i+1,at(4,9),to));});
   return notices.map(n=>n.kind);
  };
  expect(build(true)).toEqual(["same_target_no_progress"]);
  expect(build(false)).toEqual([]);
 });
});
