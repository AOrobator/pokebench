import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {GameStateSnapshot} from "./game-state.js";
import {attachLoopGuard,Governor} from "./harness.js";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures} from "./features.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,normalizeFeatures,presetFeatures,parsePlayPreset} from "./play-preset.js";
import type {FeatureSet} from "./features.js";
import {LOOP_POLICY,LoopDetector,type CompletedCall,type LoopNotice} from "./loop-detection.js";
import type {RunEvent} from "./events.js";

const ID="clock-view-loop-v1" as const;

const story=(set:boolean):NonNullable<GameStateSnapshot["story"]>=>({
 name_confirmed:true,intro_stage:6,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,
 clock_set:set,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,
 starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false,
});
const bedroom=(x=5):GameStateSnapshot=>({
 screen:"overworld",started:true,name:"KENNY",location:"LITTLEROOT TOWN KENNY'S HOUSE 2F",map_id:[1,1],
 position:{x,y:2},facing:"up",field_controls_locked:false,in_battle:false,party:[],money:0,badges:[],play_time_s:600,
 world_context:{objects:[],triggers:[],dialogue:null,message:null},story:story(true),
});
const transition=(minute:string):GameStateSnapshot=>({
 ...bedroom(),screen:"clock",field_controls_locked:null,
 active_ui:{phase:"clock_transition",selected:null,ready:false,controls:"Clock transition; selection input is not active",diagnostic:null,value:minute},
});
const adjustment=():GameStateSnapshot=>({
 ...bedroom(),screen:"clock",field_controls_locked:null,
 active_ui:{phase:"clock_adjustment",selected:null,ready:true,controls:"LEFT/RIGHT changes time; A opens confirmation",diagnostic:null,value:"10:00 AM"},
});
const press=(before:GameStateSnapshot,after:GameStateSnapshot):CompletedCall=>({
 name:"press",args:{buttons:["A"]},isError:false,text:"ok",state:after,beforeState:before,
});
const walked=(before:GameStateSnapshot,after:GameStateSnapshot):CompletedCall=>({
 name:"navigate_to",args:{map_id:after.map_id,x:after.position?.x,y:after.position?.y},isError:false,text:"ok",state:after,beforeState:before,acted:true,
});

function detector(on:boolean){
 const notices:LoopNotice[]=[];
 const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",true,()=>"SUPERVISOR",false,false,false,false,false,false,on);
 return {d,notices};
}

// Recorded shape of 2026-10-17T21-38-43_qwen36-gpu1_c18f turns 114-138: A opens the clock and the
// result is the clock transition (the minute ticks); the next A closes it back to the same tile.
function look(d:LoopDetector,minute:string):void {
 d.complete(press(bedroom(),transition(minute)));
 d.complete(press(transition(minute),bedroom()));
}

describe("clock-view-loop-v1",()=>{
 it("is registered second to last, default off, and the bundle arm is the one that turns it on",()=>{
  expect(SWITCHABLE_FEATURES.at(-34)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-23)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true,title:"CLOCK VIEW LOOP"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("Bundle arm only");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  const without=Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"scripted-place-guidance-v1":false,"trigger-script-loop-v1":false,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as FeatureSet;
  expect(presetFeatures(parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[ID]).toBe(false);
  const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(bundle.base.features[ID]).toBe(false);
  expect(bundle.switches).toContain(ID);
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/clock-view-loop.json",import.meta.url),"utf8")) as {queuePosition?:number;incumbent:{features:Record<string,boolean>}};
  expect(raw.queuePosition).toBeUndefined();
  expect(Object.keys(raw.incumbent.features)).toEqual(SWITCHABLE_FEATURES.filter(id=>id!=="positive-supervisor-v1"&&id!=="fixed-point-breaker-v1"&&id!=="story-character-stall-gate-v1"&&id!=="context-token-budget-v1"&&id!=="briefing-repeat-count-v1"&&id!=="navigate-already-here-v1"&&id!=="original-speed-pacing-v1"&&id!=="semantic-navigation-v2"&&id!=="evolution-decision-v1"&&id!=="observed-instructions-v1"&&id!=="starter-decision-salience-v1"&&id!=="safe-navigation-strides-v1"&&id!=="ineffective-navigation-v2"&&id!=="supervisor-briefing-v2"&&id!=="reachable-story-guidance-v1"&&id!=="text-only-supervisor-v2"&&id!=="battle-decision-ready-v1"&&id!=="battle-refusal-loop-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1"&&id!=="just-in-time-prompt-v2"&&id!=="faced-interaction-history-v1"&&id!=="cache-aligned-window-v1"&&id!=="jit-guide-reuse-v1"&&id!=="stale-story-goal-v2"&&id!=="visited-terrain-navigation-v1"));
  const {incumbent,candidate}=experimentArms(parseExperiment(raw));
  expect(incumbent.features[ID]).toBe(false);
  expect(candidate.features[ID]).toBe(true);
  expect(incumbent.features["interaction-loop-detection-v1"]).toBe(true);
 });

 it("OFF: thirteen opens of the set clock raise no cycle notice",()=>{
  const {d,notices}=detector(false);
  for(const minute of ["9:58 AM","9:59 AM","10:00 AM","10:01 AM","10:02 AM","10:03 AM","10:04 AM","10:05 AM","10:06 AM","10:07 AM","10:08 AM","10:09 AM","10:10 AM"]) look(d,minute);
  expect(notices.filter(n=>n.kind==="cycle")).toEqual([]);
 });

 it("ON: the third opening at the same tile warns, and the minute changing does not reset it",()=>{
  const {d,notices}=detector(true);
  look(d,"9:58 AM");
  look(d,"9:59 AM");
  expect(notices).toEqual([]);
  d.complete(press(bedroom(),transition("10:02 AM")));
  expect(notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);
  expect(notices[0]).toMatchObject({kind:"cycle",mode:"enforced"});
  expect(notices[1]?.message).toBe("SUPERVISOR");
 });

 it("ON: an observation between clock looks does not reset the action loop",()=>{
  const {d,notices}=detector(true);
  look(d,"9:58 AM");
  look(d,"9:59 AM");
  d.complete({name:"observe",args:{},isError:false,text:"ok",state:bedroom(7)});
  d.complete(press(bedroom(),transition("10:00 AM")));
  expect(notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);
 });

 it("ON: setting the clock, one look, and a look after leaving the tile do not count",()=>{
  const setting=detector(true);
  for(let i=0;i<8;i++) setting.d.complete(press(bedroom(),adjustment()));
  expect(setting.notices).toEqual([]);
  const once=detector(true);
  look(once.d,"9:58 AM");
  expect(once.notices).toEqual([]);
  const moved=detector(true);
  look(moved.d,"9:58 AM");
  look(moved.d,"9:59 AM");
  moved.d.complete(press(bedroom(),{...bedroom(7),facing:"right"}));
  look(moved.d,"10:00 AM");
  look(moved.d,"10:01 AM");
  expect(moved.notices.filter(n=>n.kind==="cycle")).toEqual([]);
 });

 it("ON: navigate_to off the tile clears the count, and turning on the tile does not",()=>{
  const left=detector(true);
  look(left.d,"9:58 AM");
  look(left.d,"9:59 AM");
  left.d.complete(walked(bedroom(),{...bedroom(7),facing:"down"}));
  left.d.complete(walked({...bedroom(7),facing:"down"},bedroom()));
  look(left.d,"10:00 AM");
  look(left.d,"10:01 AM");
  expect(left.notices.filter(n=>n.kind==="cycle")).toEqual([]);
  const turned=detector(true);
  look(turned.d,"9:58 AM");
  look(turned.d,"9:59 AM");
  turned.d.complete(press(bedroom(),{...bedroom(),facing:"left"}));
  turned.d.complete(press({...bedroom(),facing:"left"},bedroom()));
  turned.d.complete(press(bedroom(),transition("10:00 AM")));
  expect(turned.notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);
 });

 it("ON: the opening transition before the clock is set does not count",()=>{
  const {d,notices}=detector(true);
  const unset={...bedroom(),story:story(false)};
  d.complete(press(unset,{...transition("9:00 AM"),story:story(false)}));
  look(d,"9:58 AM");
  look(d,"9:59 AM");
  expect(notices.filter(n=>n.kind==="cycle")).toEqual([]);
  d.complete(press(bedroom(),transition("10:00 AM")));
  expect(notices.map(n=>n.phase)).toEqual(["warning","supervisor"]);
 });

 it("ON: the cycle warning does not claim a message reopened",()=>{
  const notices:LoopNotice[]=[];
  const d=new LoopDetector(n=>notices.push(n),LOOP_POLICY,"enforced",true,()=>"SUPERVISOR",false,false,false,true,false,false,true);
  look(d,"9:58 AM");
  look(d,"9:59 AM");
  d.complete(press(bedroom(),transition("10:00 AM")));
  expect(notices[0]?.message).toContain("The same interaction or input pattern is repeating");
  expect(notices[0]?.message).not.toContain("Reopening the same message");
  expect(d.context()).toBe("SUPERVISOR");
 });

 it("the production path reads the clock transition on the press result and honors the switch",()=>{
  const live=readFileSync(new URL("./live.ts",import.meta.url),"utf8");
  const probe=readFileSync(new URL("./decision-probe.ts",import.meta.url),"utf8");
  expect(live).toContain('features["clock-view-loop-v1"]');
  expect(probe).toContain('features["clock-view-loop-v1"]');
  const play=(on:boolean)=>{
   const notices:LoopNotice[]=[];
   const observers:((e:RunEvent)=>void)[]=[];
   const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordLoopGuard:(n:LoopNotice)=>{notices.push(n);}};
   const governor=new Governor({limits:{maxTurns:50,maxWallMs:60_000,failureLimit:3},retry:()=>undefined,abort:()=>undefined,now:()=>0});
   attachLoopGuard(recorder,governor,undefined,"enforced",true,()=>"SUPERVISOR",false,false,false,false,false,false,on);
   let seq=0;
   const emit=(body:Record<string,unknown>)=>{
    seq+=1;
    const event={v:1,run:"r",t:"2026-10-17T21:50:00.000-04:00",seq,turn:1,...body} as RunEvent;
    for(const o of observers)o(event);
   };
   for(let i=0;i<3;i++){
    const id=`a${String(i)}`;
    emit({type:"tool_call",id,name:"press",args:{buttons:["A"]}});
    emit({type:"state",...bedroom()});
    const before=seq;
    emit({type:"button_press",tool_call_id:id,buttons:["A"],before_state_seq:before});
    emit({type:"state",...transition(`${String(9+i)}:58 AM`)});
    emit({type:"tool_result",id,name:"press",is_error:false,text:"Screen: clock",state_seq:seq});
    if(i<2){
     const close=`b${String(i)}`;
     emit({type:"tool_call",id:close,name:"press",args:{buttons:["A"]}});
     emit({type:"state",...transition(`${String(9+i)}:58 AM`)});
     const beforeClose=seq;
     emit({type:"button_press",tool_call_id:close,buttons:["A"],before_state_seq:beforeClose});
     emit({type:"state",...bedroom()});
     emit({type:"tool_result",id:close,name:"press",is_error:false,text:"Screen: overworld",state_seq:seq});
    }
   }
   return notices;
  };
  expect(play(false).filter(n=>n.kind==="cycle")).toEqual([]);
  expect(play(true).some(n=>n.kind==="cycle"&&n.phase==="warning")).toBe(true);
 });
});
