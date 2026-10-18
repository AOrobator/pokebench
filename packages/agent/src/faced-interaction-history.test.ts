// faced-interaction-history-v1: a movement-plus-A batch that opened attributed dialogue counts as trying
// the exact faced target. Recorded case: 2026-10-18T01-30-48_qwen36-gpu1_cdb1, turn 84, seq 1537-1577.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {ALL_ON,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {checkEvent,type RunEvent} from "./events.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {loopSupervisor} from "./play-wiring.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {IN_GAME} from "../test-support/events.js";

const ID="faced-interaction-history-v1";
const TV={kind:"background",x:4,y:1,elevation:0,activation:"A",availability:"conditional",facing:"up",local_id:null,destination:null,name:"television"} as const;
const PC={kind:"background",x:0,y:1,elevation:0,activation:"A",availability:"conditional",facing:"up",local_id:null,destination:null,name:"PC"} as const;
const features=(on:boolean):FeatureSet=>({...ALL_ON,[ID]:on});
const ev=(body:Record<string,unknown>,seq:number):RunEvent=>checkEvent({v:1,run:"cdb1-tv",t:"2026-10-18T01:32:00.000-04:00",turn:84,seq,...body});
const state=(seq:number,x:number,y:number,facing:string,dialogue:string|null)=>ev({type:"state",...IN_GAME,started:true,screen:"overworld",location:"GREEN's HOUSE 2F",map_id:[1,1],position:{x,y},facing,field_controls_locked:dialogue!==null,interaction_targets:[PC,TV],world_context:{objects:[],triggers:[],dialogue}},seq);

function recordedTurn(source:"faced_target"|null):RunEvent[]{
 const id="Y3g0PzeGK31YOYnrtFg2v44le8qgUA20";
 return [
  ev({type:"tool_call",id,name:"press",args:{buttons:["LEFT","LEFT","LEFT","UP","A"]}},1),
  state(2,7,2,"down",null),
  ev({type:"button_press",tool_call_id:id,before_state_seq:2,buttons:["LEFT"],hold_frames:10,release_frames:8},3),
  state(4,4,2,"up",null),
  ev({type:"button_press",tool_call_id:id,before_state_seq:4,buttons:["A"],hold_frames:10,release_frames:8},5),
  state(6,4,2,"up","MOM might like this program.\nBetter get going!"),
  ev({type:"dialogue_auto_advance",tool_call_id:id,tool:"press",requested:["LEFT","LEFT","LEFT","UP","A"],sent:["LEFT","LEFT","LEFT","UP","A"],dropped:[],auto_presses:2,pages:[{state_seq:6,map:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_display:"GREEN's HOUSE 2F",map_id:[1,1],position:{x:4,y:2},speaker:source===null?null:"television",speaker_source:source,text:"MOM might like this program.\nBetter get going!"}],stop:"field_free",detail:"closed",duration_ms:1},7),
  state(8,4,2,"up",null),
  ev({type:"tool_result",id,name:"press",is_error:false,duration_ms:1,text:"pressed LEFT, LEFT, LEFT, UP, A\nStory: player name confirmed; Mom clock instruction received",frames:[],state_seq:8},9),
 ];
}

function brief(on:boolean,source:"faced_target"|null="faced_target"):string {
 const supervisor=new SupervisorBriefing(features(on));
 for(const event of recordedTurn(source))supervisor.observe(event);
 return supervisor.text("cycle",93);
}

const untried=(text:string):string=>text.split("\n").find(line=>line.startsWith("- Listed here that you have not tried yet:"))??"";

describe("faced-interaction-history-v1",()=>{
 it("is registered without disturbing historical ordering, defaults off, remains off in control, and is flipped only by the bundle arm",()=>{
  expect(SWITCHABLE_FEATURES.at(0)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(0)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,title:"FACED INTERACTION HISTORY"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
  expect(bundle.base.features[ID]).toBe(false);
  expect(bundle.switches.at(-1)).toBe(ID);
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/faced-interaction-history.json",import.meta.url),"utf8")) as {queuePosition?:number;blocked?:string;incumbent:{features:Record<string,boolean>}};
  expect(raw.queuePosition).toBeUndefined();
  expect(raw.blocked).toContain("do not queue");
  expect(Object.keys(raw.incumbent.features).sort()).toEqual([...SWITCHABLE_FEATURES].sort());
  const {incumbent,candidate}=experimentArms(parseExperiment(raw));
  expect(incumbent.features[ID]).toBe(false);
  expect(candidate.features[ID]).toBe(true);
  expect(candidate.features["briefing-exits-v1"]).toBe(true);
  expect(SWITCHABLE_FEATURES.filter(id=>incumbent.features[id]!==candidate.features[id])).toEqual([ID]);
 });

 it("OFF preserves the recorded cdb1 behavior: the already-read TV is still listed as untried",()=>{
  expect(untried(brief(false))).toContain("television at 4,1 (A)");
 });

 it("ON uses the attributed dialogue state to mark the TV tried without marking another object",()=>{
  const line=untried(brief(true));
  expect(line).not.toContain("television at 4,1");
  expect(line).toContain("PC at 0,1 (A)");
 });

 it("ON does not infer a faced interaction when the recorded page has no faced-target attribution",()=>{
  expect(untried(brief(true,null))).toContain("television at 4,1 (A)");
 });

 it("the production loop supervisor delivers the corrected history",()=>{
  const subscribers:((event:RunEvent)=>void)[]=[];
  const loop=loopSupervisor(features(true),{subscribe:(fn)=>{subscribers.push(fn);}});
  for(const event of recordedTurn("faced_target"))for(const subscriber of subscribers)subscriber(event);
  expect(untried(loop?.("cycle",93)??"")).not.toContain("television at 4,1");
 });
});
