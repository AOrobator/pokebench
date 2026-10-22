import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// faced-interaction-history-v1: a movement-plus-A batch that opened attributed dialogue counts as trying
// the exact faced target. Recorded case: 2026-10-18T01-30-48_qwen36-gpu1_cdb1, turn 84, seq 1537-1577.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {loopSupervisor} from "./play-wiring.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {IN_GAME} from "../test-support/events.js";

const ID="faced-interaction-history-v1";
const TV={kind:"background",x:4,y:1,elevation:0,activation:"A",availability:"conditional",facing:"up",local_id:null,destination:null,name:"television"} as const;
const PC={kind:"background",x:0,y:1,elevation:0,activation:"A",availability:"conditional",facing:"up",local_id:null,destination:null,name:"PC"} as const;
const MOM={kind:"object",x:4,y:1,elevation:0,activation:"A",availability:"conditional",facing:"up",local_id:7,destination:null,name:"MOM"} as const;
const MOVED_MOM={...MOM,x:3} as const;
const RIVAL={kind:"object",x:0,y:1,elevation:0,activation:"A",availability:"conditional",facing:"up",local_id:8,destination:null,name:"RIVAL"} as const;
const NORTH_TRIGGER={kind:"trigger",x:4,y:1,elevation:0,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null,name:"north path"} as const;
type Target=typeof PC|typeof TV|typeof MOM|typeof MOVED_MOM|typeof RIVAL|typeof NORTH_TRIGGER;
const features=(on:boolean,overrides:Partial<FeatureSet>={}):FeatureSet=>({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,...overrides,[ID]:on});
const ev=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"cdb1-tv",t:"2026-10-18T01:32:00.000-04:00",turn:84,seq,...body});
const state=(seq:number,x:number,y:number,facing:string,dialogue:string|null,targets:readonly Target[])=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"GREEN's HOUSE 2F",map_id:[1,1],position:{x,y},facing,field_controls_locked:dialogue!==null,interaction_targets:targets,world_context:{objects:[],triggers:[],dialogue}},seq);

interface TurnOptions {readonly finalTargets?:readonly Target[];readonly finalX?:number;readonly finalY?:number;readonly finalFacing?:string}
function recordedTurn(source:"faced_target"|"faced_sprite"|null,targets:readonly Target[]=[PC,TV],speaker="television",options:TurnOptions={}):RunEvent[]{
 const id="Y3g0PzeGK31YOYnrtFg2v44le8qgUA20";
 return [
  ev({type:"tool_call",id,name:"press",args:{buttons:["LEFT","LEFT","LEFT","UP","A"]}},1),
  state(2,7,2,"down",null,targets),
  ev({type:"button_press",tool_call_id:id,before_state_seq:2,buttons:["LEFT"],hold_frames:10,release_frames:8},3),
  state(4,4,2,"up",null,targets),
  ev({type:"button_press",tool_call_id:id,before_state_seq:4,buttons:["A"],hold_frames:10,release_frames:8},5),
  state(6,4,2,"up","MOM might like this program.\nBetter get going!",targets),
  ev({type:"dialogue_auto_advance",tool_call_id:id,tool:"press",requested:["LEFT","LEFT","LEFT","UP","A"],sent:["LEFT","LEFT","LEFT","UP","A"],dropped:[],auto_presses:2,pages:[{state_seq:6,map:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_display:"GREEN's HOUSE 2F",map_id:[1,1],position:{x:4,y:2},speaker:source===null?null:speaker,speaker_source:source,text:"MOM might like this program.\nBetter get going!"}],stop:"field_free",detail:"closed",duration_ms:1},7),
  state(8,options.finalX??4,options.finalY??2,options.finalFacing??"up",null,options.finalTargets??targets),
  ev({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"pressed LEFT, LEFT, LEFT, UP, A\nStory: player name confirmed; Mom clock instruction received",frames:[],state_seq:8},9),
 ];
}

function brief(on:boolean,source:"faced_target"|"faced_sprite"|null="faced_target",overrides:Partial<FeatureSet>={},targets:readonly Target[]=[PC,TV],speaker="television",options:TurnOptions={}):string {
 const supervisor=new SupervisorBriefing(features(on,overrides));
 for(const event of recordedTurn(source,targets,speaker,options))supervisor.observe(event);
 return supervisor.text("cycle",93);
}

function pushbackBrief(on:boolean):string {
 const supervisor=new SupervisorBriefing(features(on,{"briefing-exits-v1":false}));
 const id="pushback-without-auto";
 for(const event of [
  ev({type:"tool_call",id,name:"press",args:{buttons:["UP"]}},20),
  state(21,4,2,"up",null,[NORTH_TRIGGER]),
  ev({type:"button_press",tool_call_id:id,before_state_seq:21,buttons:["UP"],hold_frames:10,release_frames:8},22),
  state(23,4,2,"up","You cannot leave yet.",[NORTH_TRIGGER]),
  ev({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"pressed UP",frames:[],state_seq:23},24),
 ])supervisor.observe(event);
 return supervisor.text("cycle",93);
}

const untried=(text:string):string=>text.split("\n").find(line=>line.startsWith("- Listed here that you have not tried yet:"))??"";

describe("faced-interaction-history-v1",()=>{
 it("is registered without disturbing historical ordering, defaults off, remains off in control, and is flipped only by the bundle arm",()=>{
  expect(SWITCHABLE_FEATURES.at(-115)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-15)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,title:"FACED INTERACTION HISTORY"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(bundle.base.features[ID]).toBe(false);
  expect(bundle.switches).toContain(ID);
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/faced-interaction-history.json",import.meta.url),"utf8")) as {queuePosition?:number;blocked?:string;incumbent:{features:Record<string,boolean>}};
  expect(raw.queuePosition).toBeUndefined();
  expect(raw.blocked).toContain("do not queue");
  expect(Object.keys(raw.incumbent.features).sort()).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="coherent-battle-observation-v1"&&id!=="turn-drought-clock-v1"&&id!=="rejected-movement-prefix-v1"&&id!=="map-cycle-recovery-v1"&&id!=="away-note-buildings-v1"&&id!=="current-map-display-name-v1"&&id!=="window-escape-route-v1"&&id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="static-npc-template-approach-v1"&&id!=="owned-battle-context-v1"&&id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&id!=="boundary-crossing-facts-v1"&&id!=="npc-approach-feedback-v1"&&id!=="leader-loss-comparison-v1"&&id!=="rejected-movement-stride-v1"&&id!=="battle-move-learn-input-v1"&&id!=="explorer-family-guidance-v1"&&id!=="coherent-healing-feedback-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="birch-intro-pages-v1"&&id!=="shop-interface-v1"&&id!=="progress-aware-cycles-v1"&&id!=="mart-stock-readout-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="yes-no-answer-readout-v1"&&id!=="same-target-no-progress-v1"&&id!=="story-progress-clock-v1"&&id!=="story-battle-heal-gate-v1"&&id!=="duplicate-turn-collapse-v1"&&id!=="auto-talk-v1"&&id!=="positive-supervisor-v1"&&id!=="fixed-point-breaker-v1"&&id!=="story-character-stall-gate-v1"&&id!=="unfinished-activity-v1"&&id!=="exit-labels-v2"&&id!=="heal-before-trainers-v2"&&id!=="gym-heal-warning-v1"&&id!=="respawn-readout-v1"&&id!=="trainer-sight-check-v1"&&id!=="caught-nickname-prompt-v1"&&id!=="fail-open-input-v1"&&id!=="whiteout-healed-v1"&&id!=="field-move-gates-v1"&&id!=="gym-readiness-readout-v1"&&id!=="context-token-budget-v1"&&id!=="briefing-repeat-count-v1"&&id!=="navigate-already-here-v1"&&id!=="original-speed-pacing-v1"&&id!=="semantic-navigation-v2"&&id!=="evolution-decision-v1"&&id!=="observed-instructions-v1"&&id!=="starter-decision-salience-v1"&&id!=="safe-navigation-strides-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="battle-decision-ready-v1"&&id!=="battle-refusal-loop-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"&&id!=="just-in-time-prompt-v2"&&id!=="save-state-task-truth-v1"&&id!=="stale-story-goal-v2"&&id!=="visited-terrain-navigation-v1"&&id!=="exp-next-level-v1"&&id!=="pokedex-own-v1"&&id!=="exp-earned-ledger-v1"&&id!=="leader-attempt-ledger-v1"&&id!=="seen-trainers-ledger-v1"&&id!=="party-coverage-v1"&&id!=="said-type-matches-v1"&&id!=="story-goal-player-name-v1"&&id!=="cut-off-reply-feedback-v1"&&id!=="trainer-sight-check-v2"&&id!=="auto-talk-v2"&&id!=="map-wide-triggers-v1"&&id!=="drought-battle-heal-hold-v1"&&id!=="tool-prompt-docs-v1"&&id!=="field-ownership-feedback-v1"&&id!=="move-learn-loop-fingerprint-v1"&&id!=="stale-plan-fact-v1"&&id!=="post-battle-readout-v1"&&id!=="move-learn-tool-v1"&&id!=="move-learn-early-comparison-v1").sort());
  const {incumbent,candidate}=experimentArms(parseExperiment(raw));
  expect(incumbent.features[ID]).toBe(false);
  expect(candidate.features[ID]).toBe(true);
  expect(candidate.features["briefing-exits-v1"]).toBe(true);
  expect(SWITCHABLE_FEATURES.filter(id=>id!=="coherent-battle-observation-v1"&&id!=="turn-drought-clock-v1"&&id!=="rejected-movement-prefix-v1"&&id!=="map-cycle-recovery-v1"&&id!=="away-note-buildings-v1"&&id!=="current-map-display-name-v1"&&id!=="window-escape-route-v1"&&id!=="auto-talk-field-only-v1"&&id!=="auto-talk-v3"&&id!=="untalked-people-header-v1"&&id!=="static-npc-template-approach-v1"&&id!=="owned-battle-context-v1"&&id!=="reachable-section-alternatives-v1"&&id!=="delivered-place-evidence-v1"&&id!=="boundary-crossing-facts-v1"&&id!=="npc-approach-feedback-v1"&&id!=="leader-loss-comparison-v1"&&id!=="rejected-movement-stride-v1"&&id!=="battle-move-learn-input-v1"&&id!=="explorer-family-guidance-v1"&&id!=="coherent-healing-feedback-v1"&&id!=="menu-item-guidance-v1"&&id!=="factual-healing-guidance-v1"&&id!=="poison-readout-v1"&&id!=="berry-readout-v1"&&id!=="navigation-recovery-v1"&&id!=="milestone-drought-suppression-v1"&&id!=="milestone-instruction-memory-v1"&&id!=="trigger-navigation-boundary-v1"&&id!=="gym-evidence-v1"&&id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="progress-aware-cycles-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="battle-refusal-loop-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&incumbent.features[id]!==candidate.features[id])).toEqual([ID]);
 });

 it("OFF preserves the recorded cdb1 behavior: the already-read TV is still listed as untried",()=>{
  expect(untried(brief(false))).toContain("television at 4,1 (A)");
 });

 it("ON uses the exact attributed dialogue state rather than the final result state",()=>{
  const line=untried(brief(true,"faced_target",{},[PC,TV],"television",{finalX:0,finalY:2,finalFacing:"up"}));
  expect(line).not.toContain("television at 4,1");
  expect(line).toContain("PC at 0,1 (A)");
 });

 it("ON does not infer a faced interaction when the recorded page has no faced-target attribution",()=>{
  expect(untried(brief(true,null))).toContain("television at 4,1 (A)");
 });

 it("ON retains exact-state attribution when briefing exits are off",()=>{
  const line=untried(brief(true,"faced_target",{"briefing-exits-v1":false}));
  expect(line).not.toContain("television at 4,1");
  expect(line).toContain("PC at 0,1 (A)");
 });

 it("ON accepts production-shaped faced-sprite attribution for a person",()=>{
  const line=untried(brief(true,"faced_sprite",{"briefing-exits-v1":false},[RIVAL,MOM],"MOM"));
  expect(line).not.toContain("MOM at 4,1");
  expect(line).toContain("RIVAL at 0,1 (A)");
 });

 it("ON retains a faced person's map-local object identity after that person moves",()=>{
  const line=untried(brief(true,"faced_sprite",{},[RIVAL,MOM],"MOM",{finalTargets:[RIVAL,MOVED_MOM]}));
  expect(line).not.toContain("MOM at 3,1");
  expect(line).toContain("RIVAL at 0,1 (A)");
 });

 it("ON does not enable unrelated push-back inference when briefing exits are off",()=>{
  expect(pushbackBrief(true)).toBe(pushbackBrief(false));
  expect(untried(pushbackBrief(true))).toContain("north path at 4,1 (step)");
 });

 it("the production loop supervisor delivers the corrected history",()=>{
  const subscribers:((event:RunEvent)=>void)[]=[];
  const loop=loopSupervisor(features(true),{subscribe:(fn)=>{subscribers.push(fn);}});
  expect(loop).toBeDefined();
  expect(subscribers).toHaveLength(1);
  for(const event of recordedTurn("faced_target"))for(const subscriber of subscribers)subscriber(event);
  const line=untried(loop?.("cycle",93)??"");
  expect(line).not.toContain("television at 4,1");
  expect(line).toContain("PC at 0,1 (A)");
 });
});
