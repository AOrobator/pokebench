import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// loop-guard-screen-v1: the loop guard's own note quotes the open screen.
// Control run 2026-10-18T01-30-48_qwen36-gpu1_cdb1, turns 93-213: twenty-one cycle notes
// briefed the bedroom while the clock adjustment was ready.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,normalizeFeatures,presetFeatures,parsePlayPreset} from "./play-preset.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {loopSupervisor} from "./play-wiring.js";
import {checkEvent,type RunEvent} from "./events.js";
import {IN_GAME} from "../test-support/events.js";

const ID="loop-guard-screen-v1" as const;
const ADJUST="LEFT/RIGHT changes time; A opens confirmation";
const CONFIRM="UP/DOWN selects; A accepts selection; B returns to adjustment";
const features=(on:boolean):FeatureSet=>({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,[ID]:on});
const ev=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"screen",t:"2026-10-18T01:30:00.000-04:00",turn:93,seq,...body});
const field=(seq:number)=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"GREEN's HOUSE 2F",map_id:[1,1],position:{x:7,y:2},facing:"down",field_controls_locked:false,interaction_targets:[],world_context:{objects:[],triggers:[],dialogue:null}},seq);
const clock=(seq:number,ui:Record<string,unknown>)=>ev({type:"state",...IN_GAME,started:true,screen:"clock",location:"GREEN's HOUSE 2F",map_id:[1,1],position:{x:7,y:2},facing:"down",field_controls_locked:null,active_ui:ui,world_context:{objects:[],triggers:[],dialogue:null}},seq);
const result=(seq:number,stateSeq:number)=>ev({type:"tool_result",id:"p",name:"press",is_error:false,duration_ms:1,text:"ok",frames:[],state_seq:stateSeq},seq);

function brief(on:boolean,ui:Record<string,unknown>):string {
 const b=new SupervisorBriefing(features(on));
 b.observe(field(1));
 b.observe(result(2,1));
 b.observe(clock(3,ui));
 b.observe(result(4,3));
 return b.text("cycle",93);
}

const adjustment={phase:"clock_adjustment",selected:null,ready:true,controls:ADJUST,diagnostic:null,value:"10:00 AM"};
const confirmation={phase:"clock_confirmation",selected:"NO",ready:true,controls:CONFIRM,diagnostic:null,value:"10:00 AM"};
const transition={phase:"clock_transition",selected:null,ready:false,controls:"Clock transition; selection input is not active",diagnostic:null,value:"10:00 AM"};

describe("loop-guard-screen-v1",()=>{
 it("is registered third from the end, default off, and the bundle arm is the one that turns it on",()=>{
  expect(SWITCHABLE_FEATURES.at(-65)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-20)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"loop-guard-supervisor-v1",switchable:true,title:"LOOP GUARD SCREEN"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("Bundle arm only");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  const without=Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as FeatureSet;
  expect(presetFeatures(parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[ID]).toBe(false);
  const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(bundle.base.features[ID]).toBe(false);
  expect(bundle.switches).toContain(ID);
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/loop-guard-screen.json",import.meta.url),"utf8")) as {queuePosition?:number;incumbent:{features:Record<string,boolean>}};
  expect(raw.queuePosition).toBeUndefined();
  expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="coherent-battle-observation-v1"&&id!=="mart-stock-readout-v1"&&id!=="gym-door-label-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="yes-no-answer-readout-v1"&&id!=="same-target-no-progress-v1"&&id!=="story-progress-clock-v1"&&id!=="story-battle-heal-gate-v1"&&id!=="duplicate-turn-collapse-v1"&&id!=="auto-talk-v1"&&id!=="positive-supervisor-v1"&&id!=="fixed-point-breaker-v1"&&id!=="story-character-stall-gate-v1"&&id!=="unfinished-activity-v1"&&id!=="exit-labels-v2"&&id!=="heal-before-trainers-v2"&&id!=="gym-heal-warning-v1"&&id!=="respawn-readout-v1"&&id!=="trainer-sight-check-v1"&&id!=="caught-nickname-prompt-v1"&&id!=="fail-open-input-v1"&&id!=="whiteout-healed-v1"&&id!=="field-move-gates-v1"&&id!=="gym-readiness-readout-v1"&&id!=="context-token-budget-v1"&&id!=="briefing-repeat-count-v1"&&id!=="navigate-already-here-v1"&&id!=="original-speed-pacing-v1"&&id!=="semantic-navigation-v2"&&id!=="evolution-decision-v1"&&id!=="observed-instructions-v1"&&id!=="starter-decision-salience-v1"&&id!=="safe-navigation-strides-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="battle-decision-ready-v1"&&id!=="battle-refusal-loop-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"&&id!=="stale-story-goal-v2"&&id!=="visited-terrain-navigation-v1"));
  const {incumbent,candidate}=experimentArms(parseExperiment(raw));
  expect(incumbent.features[ID]).toBe(false);
  expect(candidate.features[ID]).toBe(true);
  expect(candidate.features["loop-guard-supervisor-v1"]).toBe(true);
  expect(SWITCHABLE_FEATURES.filter(id=>id!=="coherent-battle-observation-v1"&&id!=="gym-door-label-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="battle-refusal-loop-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&incumbent.features[id]!==candidate.features[id])).toEqual([ID]);
 });
 it("OFF briefs the field while the clock adjustment is open",()=>{
  const text=brief(false,adjustment);
  expect(text).toContain("GREEN's HOUSE 2F (map 1/1) at 7,2 facing down");
  expect(text).toContain("Listed here that you have not tried yet");
  expect(text).not.toContain("Open interface");
  expect(text).not.toContain(ADJUST);
 });
 it("ON quotes the controls the game shows on the clock adjustment",()=>{
  const text=brief(true,adjustment);
  expect(text).toContain("in the clock adjustment interface (screen clock)");
  expect(text).toContain(`controls the game shows: ${ADJUST}`);
  expect(text).toContain("say how you will finish or leave this interface first");
  expect(text).not.toContain("Listed here that you have not tried yet");
 });
 it("ON quotes the highlighted choice on the clock confirmation",()=>{
  const text=brief(true,confirmation);
  expect(text).toContain("highlighted choice: NO");
  expect(text).toContain(`controls the game shows: ${CONFIRM}`);
 });
 it("ON keeps the field note when the result is the clock transition",()=>{
  const text=brief(true,transition);
  expect(text).toContain("Listed here that you have not tried yet");
  expect(text).not.toContain("Open interface");
 });
 it("the stall note still quotes the screen when this switch is off",()=>{
  const b=new SupervisorBriefing(features(false));
  b.observe(field(1));
  b.observe(result(2,1));
  b.observe(clock(3,adjustment));
  b.observe(result(4,3));
  expect(b.stallText({kind:"interface_dwell",name:"clock adjustment interface",calls:20},93)).toContain(`controls the game shows: ${ADJUST}`);
 });
 it("the production loop supervisor passes the switch through",()=>{
  const subscribers:((e:RunEvent)=>void)[]=[];
  const loop=loopSupervisor(features(true),{subscribe:(fn)=>{subscribers.push(fn);}});
  const events=[field(1),result(2,1),clock(3,adjustment),result(4,3)];
  for(const e of events) for(const fn of subscribers) fn(e);
  expect(loop?.("cycle",93)).toContain(`controls the game shows: ${ADJUST}`);
  const offSubs:((e:RunEvent)=>void)[]=[];
  const off=loopSupervisor(features(false),{subscribe:(fn)=>{offSubs.push(fn);}});
  for(const e of events) for(const fn of offSubs) fn(e);
  expect(off?.("cycle",93)).not.toContain("Open interface");
 });
});
