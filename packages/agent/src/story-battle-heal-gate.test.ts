// story-battle-heal-gate-v1 (the operator 2026-10-20 8:53 PM ET: "yes i also want the gate built", "the gate could also be useful
// for the gym"). Run 97a0 (2026-10-20T20-26-22_qwen36-gpu1_97a0): result 4541 (turn 156, state 4540) carried the story
// battle warning "TORCHIC 5/22 … Heal to full before this battle"; at turn 157 (seq 4549) the model called
// navigate_to_target {"kind":"object","local_id":2} (MAY), the rival battle started (seq 4671) and it whited out at
// 8:44:21 PM ET (seq 4780), ₽3000 → ₽1500. test-support/story-battle-heal-gate-97a0.json.gz holds results 4191 (OLDALE
// TOWN, listing its POKéMON CENTER as an exit) and 4541 with their states. Run b300 turn 501 (seq 15231): navigate_to
// (5,2) on map 11/3 from (5,15) at TORCHIC 11/35; its state is trainer-sight-b300.json's seq 15233 with the server's
// heal_before_trainers as heal-before-trainers-v2 replays it from raw RAM at result 15222 (ROXANNE and MARC not loaded).
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import {Value} from "typebox/value";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import { ALL_ON as PENDING_BASE_ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
const ALL_ON={...PENDING_BASE_ALL_ON,"menu-refusal-recovery-v1":false,"pending-field-dialogue-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {checkEvent,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {healArm,withLowHpTrainerWarning,type HealArm,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {navigationTool,withNavigation} from "./navigation.js";
import {playGameTools} from "./play-wiring.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {GATE_STATUS,GATE_TOOL_SENTENCE,StoryBattleHealGate,engagedAt,gateText,pressReaches,routeReaches,withStoryBattleHealGate,type GateDecision,type GatePorts} from "./story-battle-heal-gate.js";
import {SIGHT_TOOL_SENTENCE,parseTrainerSight,type TrainerSightCheck,type TrainerSightReply} from "./trainer-sight.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {RUN_START_META} from "../test-support/events.js";
import {AUTO_TALK_ID_PREFIX} from "./auto-talk.js";
import {LEGACY_ALL_ON} from "../test-support/legacy-features.js";

const ID="story-battle-heal-gate-v1";
interface Row {seq:number;turn?:number;tool:string;text:string;state:unknown}
const must=<T,>(v:T|null|undefined):T=>{if(v==null)throw new Error("missing");return v;};
const R97=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/story-battle-heal-gate-97a0.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:Row[]};
const HB=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:Row[]};
const TS=JSON.parse(readFileSync(new URL("../test-support/trainer-sight-b300.json",import.meta.url),"utf8")) as {states:{seq:number;state:Record<string,unknown>}[];replies:{turn501:{reply:unknown}}};
const RAW_PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as {places:{display:string}[]}).places;
const PLACES={places:()=>Promise.resolve({places:RAW_PLACES})};
const B300_PLACES={places:()=>Promise.resolve({places:RAW_PLACES.map(p=>({...p,display:p.display.replace("RAED's","RED's")}))})};

const row97=(seq:number):{text:string;state:GameStateSnapshot}=>{const r=must(R97.results.find(x=>x.seq===seq));return {text:r.text,state:parseGameState(r.state)};};
const OLDALE=row97(4191),ROUTE103=row97(4541),MAY_STATE=ROUTE103.state;
const hb=(seq:number):{text:string;state:GameStateSnapshot}=>{const r=must(HB.results.find(x=>x.seq===seq));return {text:r.text,state:parseGameState(r.state)};};
const RUSTBORO=hb(14717);
const GYM_STATE=parseGameState({...must(TS.states.find(s=>s.seq===15233)).state,heal_before_trainers:(must(HB.results.find(x=>x.seq===15222)).state as Record<string,unknown>).heal_before_trainers});
const TURN501=parseTrainerSight(TS.replies.turn501.reply);
const F97:FeatureSet={...featuresOf(R97.harness_features),[ID]:true};
const FB300:FeatureSet={...featuresOf(HB.harness_features),"heal-before-trainers-v2":true,"trainer-sight-check-v1":false,[ID]:true};
const texts=(r:AgentToolResult<unknown>):string[]=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]);

export const TURN157_TEXT=[
 "Battle not started: talking to your rival MAY (object 2, at (10,3)) starts a trainer battle, and your party is not at full HP: TORCHIC 5/22.",
 "In a trainer battle the game says \"No! There's no running from a TRAINER battle!\" If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home.",
 "Places you know of that heal your party, nearest first:",
 "- the POKéMON CENTER in OLDALE TOWN (map 2/2), 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (6,16) in OLDALE TOWN; its nurse says \"We restore your tired POKéMON to full health.\"",
 "- your house in LITTLEROOT TOWN (map 1/0), 4 map changes from here in the game's map table, where MOM says \"I think you should rest a bit.\" and heals your party.",
 "To talk anyway, call navigate_to_target again with the same map_id and target and confirm: true.",
].join("\n");
export const TURN501_GATE_TEXT=[
 "Battle not started: this walk would start a trainer battle, and your party is not at full HP: TORCHIC 11/35.",
 "- a trainer you have not beaten (object 5, sprite HIKER, at (1,6), not loaded now: the tile the map places it on): the walk would end at (1,7), next to it and facing it; talking to it there starts the battle.",
 "- object 3, sprite YOUNGSTER at (3,9) (loaded, its tile now), facing LEFT, sight 3 tiles: it can see (1,9), step 12 of 23 on the route.",
 "- object 5, sprite HIKER at (1,6) (not loaded; where the map places it, it may have moved), facing DOWN, sight 3 tiles: it can see (1,9), step 12 of 23 on the route.",
 "A trainer who sees you walks up to you and starts a battle. In a trainer battle the game says \"No! There's no running from a TRAINER battle!\" If your party faints, you black out: you lose half your money (₽3222 of ₽6444) and wake up back at the last POKéMON CENTER you entered, or at home.",
 "Places you know of that heal your party, nearest first:",
 "- the POKéMON CENTER in RUSTBORO CITY (map 11/5), 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (16,38) in RUSTBORO CITY; its nurse says \"We restore your tired POKéMON to full health.\"",
 "- your house in LITTLEROOT TOWN (map 1/0), 8 map changes from here in the game's map table, where MOM says \"I think you should rest a bit.\" and heals your party.",
 "To walk anyway, call navigate_to again with the same x, y and map_id and confirm: true.",
].join("\n");
const ROUTE103_CLEAR=parseTrainerSight({available:true,map_id:[0,18],trainers:[],sightings:[]});
const NAV_REFUSED="Navigation: not started: it would start a trainer battle you cannot run from while your party is not at full HP; 0 bounded movement actions.";

const result=(state:GameStateSnapshot,text="readout"):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text}],details:{state}});
const noWarnings:Required<WarningRecorder>={lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,gymHealWarning:()=>undefined};

function gateWith(arm:HealArm,reply:TrainerSightReply|Error=TURN501):{gate:StoryBattleHealGate;records:GateDecision[];asked:number[]} {
 const records:GateDecision[]=[],asked:number[]=[];
 const heal=must(arm.heal);
 const ports:GatePorts={places:arm.table,heal:s=>heal.known(s),check:(_m,tiles)=>{asked.push(tiles.length);return reply instanceof Error?Promise.reject(reply):Promise.resolve(reply);},record:d=>{records.push(d);}};
 return {gate:new StoryBattleHealGate(ports),records,asked};
}

// The model-facing press and navigate_to_target as the warnings wrap them, on 97a0's two results.
function wrapped97(state:GameStateSnapshot=MAY_STATE){
 const arm=healArm(F97,PLACES);const {gate,records}=gateWith(arm);
 const calls:{tool:string;params:unknown}[]=[];let reads=0;
 const queue=[OLDALE];
 const press={name:"press",label:"press",description:"Press buttons.",parameters:Type.Object({buttons:Type.Array(Type.String())},{additionalProperties:false}),execute:(_id:string,params:unknown)=>{calls.push({tool:"press",params});const r=queue.shift()??{text:"pressed",state};return Promise.resolve(result(r.state,r.text));}} as AgentTool;
 const observe={name:"observe",label:"observe",description:"Observe.",parameters:Type.Object({}),execute:()=>Promise.resolve(result(state))} as AgentTool;
 const target={name:"navigate_to_target",label:"target",description:"Go to a target.",parameters:Type.Object({map_id:Type.Array(Type.Integer()),target:Type.Object({kind:Type.String(),local_id:Type.Optional(Type.Integer())})},{additionalProperties:false}),execute:(_id:string,params:unknown)=>{calls.push({tool:"navigate_to_target",params});return Promise.resolve(result(state,"walked"));}} as AgentTool;
 const tools=withLowHpTrainerWarning(withStoryBattleHealGate([press,observe,target],gate,{read:()=>{reads++;return Promise.resolve(state);}}),F97,noWarnings,PLACES,arm);
 const tool=(name:string):AgentTool=>must(tools.find(t=>t.name===name));
 return {tool,records,calls,reads:()=>reads};
}

describe("97a0 turn 157: navigate_to_target to MAY at TORCHIC 5/22",()=>{
 it("is not started: the game's words, the hurt party, both heal places, nothing sent",async()=>{
  const t=wrapped97();
  await t.tool("press").execute("p",{buttons:["B"]});
  const out=await t.tool("navigate_to_target").execute("t157",{map_id:[0,18],target:{kind:"object",local_id:2}});
  expect(texts(out).slice(0,3)).toEqual([`Semantic navigation: ${GATE_STATUS}. Selected map object 2.`,TURN157_TEXT,"readout"]);
  expect(out.details).toMatchObject({semantic_navigation:{status:GATE_STATUS,selected:"map object 2",activation_attempted:false,target:{kind:"object",local_id:2}}});
  expect(t.calls.map(c=>c.tool)).toEqual(["press"]);
  expect(t.records).toEqual([{tool_call_id:"t157",tool:"navigate_to_target",map_id:[0,18],confirmed:false,outcome:"refused",reason:null,
   reached:[{kind:"rival",name:"MAY",local_id:2,sprite_kind:"RIVAL_MAY_NORMAL",x:10,y:3,loaded:true,via:"talk",tile:{x:14,y:10}}],sightings:[],hurt:[{species:"TORCHIC",hp:5,max_hp:22}],
   heal:[{kind:"pokemon_center",town:"OLDALE TOWN",map_id:[2,2],hops:2,shown:true},{kind:"home",town:"LITTLEROOT TOWN",map_id:[1,0],hops:4,shown:false}],text:TURN157_TEXT}]);
 });
 it("with confirm: true it talks to her as before, confirm taken off, and records confirmed",async()=>{
  const t=wrapped97();
  const out=await t.tool("navigate_to_target").execute("t",{map_id:[0,18],target:{kind:"object",local_id:2},confirm:true});
  expect(texts(out)[0]).toBe("walked");
  expect(t.calls).toEqual([{tool:"navigate_to_target",params:{map_id:[0,18],target:{kind:"object",local_id:2}}}]);
  expect(t.records.map(r=>[r.outcome,r.confirmed,r.text,r.heal.map(h=>h.town)])).toEqual([["confirmed",true,null,["LITTLEROOT TOWN"]]]);
 });
 it("another object, a warp or another map's id is not gated",async()=>{
  const t=wrapped97();
  await t.tool("navigate_to_target").execute("a",{map_id:[0,18],target:{kind:"object",local_id:10}});
  await t.tool("navigate_to_target").execute("b",{map_id:[0,18],target:{kind:"warp",x:45,y:6}});
  await t.tool("navigate_to_target").execute("c",{map_id:[0,10],target:{kind:"object",local_id:2}});
  expect(t.calls.map(c=>c.tool)).toEqual(["navigate_to_target","navigate_to_target","navigate_to_target"]);
  expect(t.records.map(r=>[r.tool_call_id,r.outcome,r.reached.length,r.heal.length])).toEqual([["a","clear",0,0]]);
  expect(t.reads()).toBe(2);
 });
 it("adds the confirm argument and one description sentence to press and navigate_to_target only",()=>{
  const t=wrapped97();
  expect(t.tool("press").description).toBe(`Press buttons. ${GATE_TOOL_SENTENCE}`);
  expect(t.tool("navigate_to_target").description).toBe(`Go to a target. ${GATE_TOOL_SENTENCE}`);
  expect(t.tool("observe").description).toBe("Observe.");
  expect(Value.Check(t.tool("press").parameters,{buttons:["A"],confirm:true})).toBe(true);
  expect(Value.Check(t.tool("press").parameters,{buttons:["A"],bogus:true})).toBe(false);
  expect(Object.keys((t.tool("navigate_to_target").parameters as {properties:object}).properties)).toEqual(["map_id","target","confirm"]);
  const open={name:"press",label:"press",description:"Press.",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.reject(new Error("no"))} as AgentTool;
  const observe={name:"observe",label:"o",description:"o",parameters:Type.Object({}),execute:()=>Promise.reject(new Error("no"))} as AgentTool;
  const [wrapped]=withStoryBattleHealGate([open,observe],gateWith(healArm(F97,PLACES)).gate,{read:()=>Promise.resolve(MAY_STATE)});
  expect(Value.Check(must(wrapped).parameters,{buttons:["A"],walking:true,confirm:true})).toBe(true);
 });
});

describe("press",()=>{
 const facing=(x:number,y:number,dir:string):GameStateSnapshot=>({...MAY_STATE,position:{x,y},facing:dir});
 it("A facing MAY, or a direction that turns toward her then A, is not sent",async()=>{
  for(const [state,buttons] of [[facing(10,4,"up"),["A"]],[facing(10,4,"left"),["UP","A"]],[facing(9,3,"down"),["RIGHT","A","A"]]] as const){
   const t=wrapped97(state);
   const out=await t.tool("press").execute("p",{buttons:[...buttons]});
   expect(texts(out)[0]).toBe("Press: not sent: it would start a trainer battle you cannot run from while your party is not at full HP; no buttons were pressed.");
   expect(texts(out)[1]?.startsWith(`Battle not started: this press of A talks to your rival MAY (object 2, at (10,3)) and starts a trainer battle, and your party is not at full HP: TORCHIC 5/22.`)).toBe(true);
   expect(texts(out)[1]?.endsWith("To press anyway, call press again with the same buttons and confirm: true.")).toBe(true);
   expect(t.calls).toEqual([]);
   expect(t.records[0]).toMatchObject({tool:"press",outcome:"refused",reached:[{via:"talk",tile:{x:state.position?.x,y:state.position?.y}}]});
  }
 });
 it("presses that do not face her are sent; a press without A is not checked",async()=>{
  for(const [state,buttons] of [[facing(10,4,"left"),["A"]],[facing(10,4,"left"),["LEFT","A"]],[facing(10,4,"up"),["START","A"]],[{...facing(10,4,"up"),facing:null},["A"]],[{...facing(10,4,"up"),facing:"north"},["A"]]] as const){
   const t=wrapped97(state);
   await t.tool("press").execute("p",{buttons:[...buttons]});
   expect(t.calls.length).toBe(1);
   expect(t.records.map(r=>r.outcome)).toEqual(["clear"]);
  }
  const t=wrapped97(facing(10,4,"up"));
  await t.tool("press").execute("p",{buttons:["UP"]});
  expect(t.reads()).toBe(0);expect(t.records).toEqual([]);
  await t.tool("press").execute("p",{buttons:["A"],confirm:true});
  expect(t.calls.map(c=>c.params)).toEqual([{buttons:["UP"]},{buttons:["A"]}]);
  expect(t.records.map(r=>r.outcome)).toEqual(["confirmed"]);
  await t.tool("press").execute("p","not an object");
  expect(t.calls.at(-1)?.params).toBe("not an object");
 });
 it("pressReaches needs a position",()=>{
  const e=must(engagedAt(MAY_STATE,null));
  expect(pressReaches({...MAY_STATE,position:null},["A"],e.opponents)).toBeNull();
 });
});

describe("calls auto-talk makes for itself are never gated (non-goal: harness-initiated talking)",()=>{
 it("auto-talk's press of A facing MAY is sent and its walk to (9,3) runs, with nothing recorded",async()=>{
  const t=wrapped97({...MAY_STATE,position:{x:10,y:4},facing:"up"});
  await t.tool("press").execute(`${AUTO_TALK_ID_PREFIX}3-talk`,{buttons:["A"]});
  await t.tool("navigate_to_target").execute(`${AUTO_TALK_ID_PREFIX}4-walk`,{map_id:[0,18],target:{kind:"object",local_id:2},confirm:true});
  expect(t.calls).toEqual([{tool:"press",params:{buttons:["A"]}},{tool:"navigate_to_target",params:{map_id:[0,18],target:{kind:"object",local_id:2}}}]);
  expect(t.reads()).toBe(0);expect(t.records).toEqual([]);
  const {gate,records}=gateWith(healArm(F97,PLACES));
  const walk=navTools(MAY_STATE,F97,gate,ROUTE103_CLEAR,true);
  await walk.navigate.execute(`${AUTO_TALK_ID_PREFIX}5-walk`,{x:9,y:3,map_id:[0,18]});
  expect(walk.pressed.length).toBeGreaterThan(0);expect(records).toEqual([]);
 });
});

describe("never a battle the game forces, never at full HP",()=>{
 const cases:[string,GameStateSnapshot][]=[
  ["locked controls (a trainer who spotted you, any script)",{...MAY_STATE,field_controls_locked:true}],
  ["controls unknown",{...MAY_STATE,field_controls_locked:null}],
  ["in battle",{...MAY_STATE,in_battle:true}],
  ["battle screen",{...MAY_STATE,screen:"battle"}],
  ["not started",{...MAY_STATE,started:false}],
  ["tutorial party",{...MAY_STATE,party_owner:"tutorial"}],
  ["no map",{...MAY_STATE,map_id:null}],
  ["full HP",{...MAY_STATE,party:MAY_STATE.party.map(m=>({...m,hp:m.max_hp}))}],
  ["unreadable HP",{...MAY_STATE,party:MAY_STATE.party.map(m=>({...m,hp:null}))}],
  ["rival beaten",{...MAY_STATE,story:{...must(MAY_STATE.story),rival_battle_won:true}}],
  ["rival not loaded",{...MAY_STATE,world_context:{...must(MAY_STATE.world_context),objects:[]}}],
 ];
 it.each(cases)("%s: not engaged, nothing recorded",async(_name,state)=>{
  expect(engagedAt(state,null)).toBeNull();
  const t=wrapped97({...state,position:{x:10,y:4},facing:"up"});
  await t.tool("press").execute("p",{buttons:["A"]});
  await t.tool("navigate_to_target").execute("t",{map_id:[0,18],target:{kind:"object",local_id:2}});
  expect(t.calls.length).toBe(2);expect(t.records).toEqual([]);
 });
 it("an egg below max HP does not count; BRENDAN is him",()=>{
  const egg={...MAY_STATE,party:[...MAY_STATE.party.map(m=>({...m,hp:m.max_hp})),{...must(MAY_STATE.party[0]),is_egg:true,hp:1}]};
  expect(engagedAt(egg,null)).toBeNull();
  const brendan={...MAY_STATE,world_context:{...must(MAY_STATE.world_context),objects:[{local_id:2,map_id:[0,18] as [number,number],graphics_id:100,sprite_kind:"RIVAL_BRENDAN_NORMAL",x:10,y:3},{local_id:9,map_id:[0,16] as [number,number],graphics_id:105,sprite_kind:"RIVAL_MAY_NORMAL",x:1,y:1}]}};
  const e=must(engagedAt(brendan,null));
  expect(e.opponents.map(o=>[o.name,o.local_id])).toEqual([["BRENDAN",2]]);
  const reached=must(routeReaches({x:8,y:3},["RIGHT"],[{x:9,y:3}],e.opponents));
  expect(gateText({tool:"navigate_to",reached,sightings:[],steps:1,opponents:e.opponents,map_id:e.map_id,hurt:e.hurt,money:null,items:[{name:"POTION",quantity:2}],heal:[],mom_heals:false})).toBe([
   "Battle not started: this walk would start a trainer battle, and your party is not at full HP: TORCHIC 5/22.",
   "- your rival BRENDAN (object 2, at (10,3)): the walk would end at (9,3), next to him and facing him; talking to him there starts the battle.",
   "In a trainer battle the game says \"No! There's no running from a TRAINER battle!\" If your party faints, you black out: you lose half your money and wake up back at the last POKéMON CENTER you entered, or at home. Your BAG has POTION ×2; using one restores HP.",
   "Heal before you battle: the nurse at a POKéMON CENTER heals your whole party.",
   "To walk anyway, call navigate_to again with the same x, y and map_id and confirm: true.",
  ].join("\n"));
 });
});

// navigate_to through withNavigation with ordinary press and observe stand-ins whose press moves along the route.
function navTools(state:GameStateSnapshot,features:FeatureSet,gate:StoryBattleHealGate|undefined,sight?:TrainerSightReply|Error,walk=false){
 let current=state;const pressed:string[][]=[],sightRecords:TrainerSightCheck[]=[];
 const step=(button:string):void=>{const p=current.position;if(p===null)return;const [dx,dy]:[number,number]=button==="UP"?[0,-1]:button==="DOWN"?[0,1]:button==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:p.x+dx,y:p.y+dy}};};
 const press={name:"press",label:"press",description:"press",parameters:{} as never,execute:()=>Promise.reject(new Error("unchecked press")),
  executeChecked:(_id:string,params:{buttons:string[]},check:(s:GameStateSnapshot)=>void)=>{check(current);pressed.push([...params.buttons]);step(params.buttons[0]??"");return Promise.resolve(result(current,"pressed"));}} as unknown as AgentTool;
 const observe={name:"observe",label:"observe",description:"observe",parameters:{} as never,execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
 const trainerSight=sight===undefined?undefined:{check:()=>sight instanceof Error?Promise.reject(sight):Promise.resolve(sight),record:(c:TrainerSightCheck)=>{sightRecords.push(c);}};
 const navigate=must(withNavigation([press,observe],walk?{...features,"safe-navigation-strides-v1":false}:features,{read:()=>Promise.resolve(current)},undefined,trainerSight,gate).find(t=>t.name==="navigate_to"));
 return {navigate,pressed,sightRecords};
}

describe("navigate_to onto the tile next to MAY",()=>{
 it("a walk ending at (9,3) facing her is not started; (10,4) facing RIGHT and (11,3) facing UP walk",async()=>{
  const {gate,records}=gateWith(healArm(F97,PLACES));
  const refused=navTools(MAY_STATE,F97,gate,ROUTE103_CLEAR);
  const out=await refused.navigate.execute("n",{x:9,y:3,map_id:[0,18]});
  expect(refused.pressed).toEqual([]);
  expect(texts(out)[0]).toBe(NAV_REFUSED);
  expect(texts(out)[1]).toContain("- your rival MAY (object 2, at (10,3)): the walk would end at (9,3), next to her and facing her; talking to her there starts the battle.");
  for(const x of [10,11]){const walk=navTools(MAY_STATE,F97,gate,ROUTE103_CLEAR,true);await walk.navigate.execute("n",{x,y:x===10?4:3,map_id:[0,18]});expect(walk.pressed.length).toBeGreaterThan(0);}
  const confirmed=navTools(MAY_STATE,F97,gate,ROUTE103_CLEAR,true);
  await confirmed.navigate.execute("n",{x:9,y:3,map_id:[0,18],confirm:true});
  expect(confirmed.pressed.length).toBeGreaterThan(0);
  expect(records.map(r=>[r.tool,r.outcome,r.sightings.length])).toEqual([["navigate_to","refused",0],["navigate_to","clear",0],["navigate_to","clear",0],["navigate_to","confirmed",0]]);
 });
 it("off Route 103's rival (another map, full HP) navigate_to is not checked and the server is never asked",async()=>{
  const {gate,records,asked}=gateWith(healArm(F97,PLACES));
  const t=navTools({...MAY_STATE,party:MAY_STATE.party.map(m=>({...m,hp:m.max_hp}))},F97,gate,ROUTE103_CLEAR,true);
  await t.navigate.execute("n",{x:9,y:3,map_id:[0,18]});
  expect(t.pressed.length).toBeGreaterThan(0);expect(records).toEqual([]);expect(asked).toEqual([]);
 });
 it("a semantic (checked) walk is not checked; nor a state with no position",async()=>{
  const {gate,records}=gateWith(healArm(F97,PLACES));
  let current=MAY_STATE;
  const tool=navigationTool({read:()=>Promise.resolve(current),press:(_id,_p,_s,check)=>{check?.(current);current={...current,map_id:[0,0]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current)),fullMap:true,healGate:gate});
  await tool.executeChecked("n",{x:9,y:3,map_id:[0,18]},()=>null);
  expect(records).toEqual([]);
  const routeless=navigationTool({read:()=>Promise.resolve({...MAY_STATE,map_grid:null,navigation_grid:null}),press:()=>Promise.reject(new Error("no")),observe:()=>Promise.resolve(result(MAY_STATE)),healGate:gate});
  await routeless.execute("n",{x:9,y:3,map_id:[0,18]});
  expect(records).toEqual([]);
 });
});

async function b300Gate(reply:TrainerSightReply|Error=TURN501){
 const arm=healArm(FB300,B300_PLACES);
 await must(arm.heal).shownIn(RUSTBORO.state,RUSTBORO.text);
 return gateWith(arm,reply);
}

describe("b300 turn 501: navigate_to (5,2) in RUSTBORO CITY GYM at TORCHIC 11/35",()=>{
 it("trainer-sight-check-v1 off: the gate asks the server itself and names the approach and both sightings",async()=>{
  const {gate,records,asked}=await b300Gate();
  const t=navTools(GYM_STATE,FB300,gate);
  const out=await t.navigate.execute("n501",{x:5,y:2,map_id:[11,3]});
  expect(t.pressed).toEqual([]);
  expect(asked).toEqual([23]);
  expect(texts(out).slice(0,3)).toEqual([NAV_REFUSED,TURN501_GATE_TEXT,"readout"]);
  expect(out.details).toMatchObject({navigation:{status:GATE_STATUS,commands:0}});
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({tool:"navigate_to",outcome:"refused",reached:[{kind:"gym_trainer",local_id:5,via:"approach",tile:{x:1,y:7},loaded:false}],hurt:[{species:"TORCHIC",hp:11,max_hp:35}],text:TURN501_GATE_TEXT});
  expect(records[0]?.sightings.map(s=>[s.local_id,s.tile.x,s.tile.y])).toEqual([[3,1,9],[5,1,9]]);
 });
 it("trainer-sight-check-v1 on: one request, one refusal (the gate's), no trainer_sight_check; confirm: true walks and confirms the sightings",async()=>{
  const {gate,records,asked}=await b300Gate();
  const t=navTools(GYM_STATE,{...FB300,"trainer-sight-check-v1":true},gate,TURN501);
  const out=await t.navigate.execute("n501",{x:5,y:2,map_id:[11,3]});
  expect(texts(out).slice(0,2)).toEqual([NAV_REFUSED,TURN501_GATE_TEXT]);
  expect(texts(out).some(x=>x.startsWith("Trainer sight:"))).toBe(false);
  expect(asked).toEqual([]);expect(t.sightRecords).toEqual([]);
  const go=navTools(GYM_STATE,{...FB300,"trainer-sight-check-v1":true},gate,TURN501,true);
  await go.navigate.execute("n501",{x:5,y:2,map_id:[11,3],confirm:true});
  expect(go.pressed.length).toBeGreaterThan(0);
  expect(go.sightRecords.map(r=>[r.outcome,r.confirmed,r.sightings.length])).toEqual([["confirmed",true,2]]);
  expect(records.map(r=>r.outcome)).toEqual(["refused","confirmed"]);
 });
 it("at full HP the gate is silent and trainer-sight refuses as before",async()=>{
  const {gate,records}=await b300Gate();
  const full={...GYM_STATE,party:GYM_STATE.party.map(m=>({...m,hp:m.max_hp}))};
  const t=navTools(full,{...FB300,"trainer-sight-check-v1":true},gate,TURN501);
  const out=await t.navigate.execute("n",{x:5,y:2,map_id:[11,3]});
  expect(texts(out)[0]).toBe("Navigation: not walked: a trainer you have not beaten can see the planned route; 0 bounded movement actions.");
  expect(records).toEqual([]);expect(t.sightRecords.map(r=>r.outcome)).toEqual(["refused"]);
 });
 it("a gym route only a trainer's sight crosses is not started; an unreadable sight walks and records unavailable",async()=>{
  const clearReply={...TURN501,sightings:(TURN501 as {sightings:{local_id:number}[]}).sightings.filter(s=>s.local_id===3)} as TrainerSightReply;
  const {gate,records}=await b300Gate(clearReply);
  const near={...GYM_STATE,position:{x:5,y:12}};
  const t=navTools(near,FB300,gate);
  const out=await t.navigate.execute("n",{x:4,y:12,map_id:[11,3]});
  expect(texts(out)[1]).toContain("- object 3, sprite YOUNGSTER at (3,9) (loaded, its tile now), facing LEFT, sight 3 tiles: it can see (1,9), step 12 of 1 on the route.");
  expect(records.at(-1)).toMatchObject({outcome:"refused",reached:[]});
  const broken=await b300Gate(new Error("Trainer sight returned HTTP 500"));
  const walk=navTools(near,FB300,broken.gate,undefined,true);
  await walk.navigate.execute("n",{x:4,y:12,map_id:[11,3]});
  expect(walk.pressed.length).toBeGreaterThan(0);
  expect(broken.records.map(r=>[r.outcome,r.reason])).toEqual([["unavailable","Trainer sight returned HTTP 500"]]);
  const none=await b300Gate({...TURN501,sightings:[]} as TrainerSightReply);
  const quiet=navTools(near,FB300,none.gate,undefined,true);
  await quiet.navigate.execute("n",{x:4,y:12,map_id:[11,3]});
  expect(none.records.map(r=>[r.outcome,r.reason])).toEqual([["clear",null]]);
 });
 it("names the Gym Leader by name, talked to or seeing the route",async()=>{
  const {gate,records}=await b300Gate();
  const out=await gate.target("t",[11,3],1,false,GYM_STATE);
  expect(must(out).split("\n")[0]).toBe("Battle not started: talking to the Gym Leader ROXANNE (object 1, sprite ROXANNE, at (5,2), not loaded now: the tile the map places it on) starts a trainer battle, and your party is not at full HP: TORCHIC 11/35.");
  expect(records[0]?.reached[0]).toMatchObject({kind:"gym_leader",name:"ROXANNE"});
  const e=must(engagedAt(GYM_STATE,null));
  const line=gateText({tool:"navigate_to",reached:null,sightings:[{local_id:1,sprite_kind:"ROXANNE",trainer_id:265,x:5,y:2,facing:"DOWN",sight:4,loaded:false,step:2,tile:{x:5,y:4},from:{x:5,y:2},seen_facing:"DOWN"}],steps:3,opponents:e.opponents,map_id:e.map_id,hurt:e.hurt,money:6444,items:[],heal:[],mom_heals:true}).split("\n")[1];
  expect(line).toBe("- the Gym Leader ROXANNE, object 1, sprite ROXANNE at (5,2) (not loaded; where the map places it, it may have moved), facing DOWN, sight 4 tiles: it can see (5,4), step 2 of 3 on the route.");
  expect(await gate.target("t",[11,3],2,false,GYM_STATE)).toBeNull();
  expect(await gate.target("t",[11,3],3,false,{...GYM_STATE,position:null})).toBeNull();
 });
 it("a GYM by the state's own location when the map table is unavailable; not a GYM by the table's name",()=>{
  expect(engagedAt(GYM_STATE,null)?.gym).toBe(true);
  expect(engagedAt({...GYM_STATE,location:"RUSTBORO CITY"},null)).toBeNull();
  expect(engagedAt({...GYM_STATE,location:null},null)).toBeNull();
 });
});

describe("switch OFF and wiring",()=>{
 const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),executeChecked:()=>Promise.reject(new Error("no")),execute:()=>Promise.reject(new Error("no"))} as unknown as AgentTool;
 const observe={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(MAY_STATE))} as unknown as AgentTool;
 it("withStoryBattleHealGate without a gate returns the tools unchanged; with one it needs observe",()=>{
  const tools=[press,observe];
  const out=withStoryBattleHealGate(tools,undefined,{read:()=>Promise.resolve(MAY_STATE)});
  expect(out).toEqual(tools);expect(out[0]).toBe(press);
  expect(()=>withStoryBattleHealGate([press],gateWith(healArm(F97,PLACES)).gate,{read:()=>Promise.resolve(MAY_STATE)})).toThrow("needs the observe tool");
 });
 it("navigate_to gains its confirm argument and sentence only with the gate, after trainer-sight's",()=>{
  const {gate}=gateWith(healArm(F97,PLACES));
  const base={read:()=>Promise.resolve(MAY_STATE),press:()=>Promise.reject(new Error("no")),observe:()=>Promise.resolve(result(MAY_STATE)),fullMap:true,automaticRunning:true};
  const sight={check:()=>Promise.resolve(TURN501),record:()=>{}};
  const off=navigationTool(base),on=navigationTool({...base,healGate:gate}),both=navigationTool({...base,healGate:gate,trainerSight:sight}),sighted=navigationTool({...base,trainerSight:sight});
  expect(on.description).toBe(`${off.description} ${GATE_TOOL_SENTENCE}`);
  expect(both.description).toBe(`${off.description} ${SIGHT_TOOL_SENTENCE} ${GATE_TOOL_SENTENCE}`);
  expect(Object.keys(off.parameters.properties)).toEqual(["x","y","map_id"]);
  expect(Object.keys(on.parameters.properties)).toEqual(["x","y","map_id","confirm"]);
  expect(Object.keys(both.parameters.properties)).toEqual(["x","y","map_id","confirm_trainer_sight","confirm"]);
  expect(sighted.parameters).toBe(navigationTool({...base,trainerSight:sight}).parameters);
  const press2={name:"press",executeChecked:()=>Promise.reject(new Error("no")),execute:()=>Promise.reject(new Error("no"))} as unknown as AgentTool;
  expect(()=>withNavigation([press2,observe],{...F97,"trainer-sight-check-v1":false},{read:()=>Promise.resolve(MAY_STATE)})).toThrow("story-battle-heal-gate-v1 needs the gate");
  const offTool=must(withNavigation([press2,observe],{...F97,"trainer-sight-check-v1":false,[ID]:false},{read:()=>Promise.resolve(MAY_STATE)},undefined,undefined,gate).find(t=>t.name==="navigate_to"));
  expect(offTool.description).not.toContain(GATE_TOOL_SENTENCE);
 });
 it("heal-before-trainers' shared arm must carry its list when that switch is on",()=>{
  expect(()=>withLowHpTrainerWarning([press],F97,noWarnings,PLACES,{table:()=>Promise.resolve(null),heal:null})).toThrow("heal-before-trainers-v1 needs its arm");
  expect(healArm({...F97,"heal-before-trainers-v1":false},PLACES).heal).toBeNull();
 });
});

// The run's switches, minus the wrappers that need the real game server.
const WIRE:FeatureSet={...F97,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false,"instruction-ledger-v2":false,"untaken-exits-v1":false,"people-ledger-v1":false,"people-id-cards-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"battle-move-tool-v1":false,"cited-destination-v1":false,"harness-trust-v1":false,"safe-navigation-strides-v1":false,"auto-talk-v1":false};

describe("production factory",()=>{
 it("playGameTools refuses 97a0's turn 157 with the switch on and records the event; off, MAY is talked to and nothing is recorded",async()=>{
  const root=mkdtempSync(join(tmpdir(),"pokebench-heal-gate-wire-"));
  try{
   for(const on of [true,false]){
    const log=RunLog.create(root,on?"on":"off");
    const recorder=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(MAY_STATE)}});
    await recorder.start(RUN_START_META);
    const pressed:unknown[]=[];
    const queue=[OLDALE];
    const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:(_id:string,params:unknown)=>{pressed.push(params);const r=queue.shift()??{text:"pressed",state:MAY_STATE};return Promise.resolve(result(r.state,r.text));},executeChecked:(_id:string,params:unknown,check:(s:GameStateSnapshot)=>void)=>{check(MAY_STATE);pressed.push(params);return Promise.resolve(result(MAY_STATE,"pressed"));}} as unknown as AgentTool;
    const observe={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(MAY_STATE))} as unknown as AgentTool;
    const tools=playGameTools([press,observe],{...WIRE,[ID]:on},{read:()=>Promise.resolve(MAY_STATE),places:PLACES.places,trainerSight:()=>Promise.resolve(TURN501)},recorder);
    await must(tools.find(t=>t.name==="press")).execute("p",{buttons:["B"]});
    const out=await must(tools.find(t=>t.name==="navigate_to_target")).execute("t157",{map_id:[0,18],target:{kind:"object",local_id:2}});
    recorder.end("budget");
    const events:RunEvent[]=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
    const gates=events.flatMap(e=>e.type==="story_battle_heal_gate"?[e]:[]);
    if(on){
     expect(texts(out).slice(0,2)).toEqual([`Semantic navigation: ${GATE_STATUS}. Selected map object 2.`,TURN157_TEXT]);
     expect(pressed).toEqual([{buttons:["B"]}]);
     expect(gates.map(g=>[g.tool,g.outcome,g.text])).toEqual([["navigate_to_target","refused",TURN157_TEXT]]);
     expect(formatEvent(must(gates[0]))).toContain("story battle heal gate · navigate_to_target · refused · MAY (10,3) by talk · TORCHIC 5/22");
    }else{
     expect(texts(out).join("\n")).not.toContain("Battle not started");
     expect(pressed.length).toBeGreaterThan(1);
     expect(gates).toEqual([]);
    }
   }
  }finally{rmSync(root,{recursive:true,force:true});}
 });
 it("playGameTools needs a recorder hook and a heal-before-trainers arm; a state source without the sight endpoint makes a gym sight check unavailable",async()=>{
  const press={name:"press",label:"press",description:"press",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:()=>Promise.resolve(result(GYM_STATE)),executeChecked:()=>Promise.reject(new Error("walked"))} as unknown as AgentTool;
  const observe={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result(GYM_STATE))} as unknown as AgentTool;
  const hooks=(gate:((d:GateDecision)=>void)|undefined)=>new Proxy({},{get:(_t,key)=>key==="storyBattleHealGate"?gate:key==="then"?undefined:()=>{}}) as unknown as Parameters<typeof playGameTools>[3];
  expect(()=>playGameTools([press,observe],WIRE,{read:()=>Promise.resolve(GYM_STATE)},hooks(undefined))).toThrow("story_battle_heal_gate");
  expect(()=>playGameTools([press,observe],{...WIRE,"heal-before-trainers-v1":false},{read:()=>Promise.resolve(GYM_STATE)},hooks(()=>{}))).toThrow("heal-before-trainers-v1's arm");
  const records:GateDecision[]=[];
  const tools=playGameTools([press,observe],{...WIRE,"trainer-sight-check-v1":false},{read:()=>Promise.resolve(GYM_STATE),places:B300_PLACES.places},hooks(d=>{records.push(d);}));
  await expect(must(tools.find(t=>t.name==="navigate_to")).execute("n",{x:4,y:12,map_id:[11,3]})).rejects.toThrow("walked");
  expect(records.map(r=>[r.outcome,r.reason])).toEqual([["unavailable","story-battle-heal-gate-v1 needs a game server that serves /pokebench/trainer-sight"]]);
 });
});

describe("registry and event",()=>{
 it("is a default-off guard that needs heal-before-trainers-v2, recorded last; prompt and tool list unchanged",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"heal-before-trainers-v2",switchable:true,title:"STORY BATTLE HEAL GATE"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(TURN157_TEXT.split("\n")[0]);
  expect(SWITCHABLE_FEATURES.at(-17)).toBe(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).at(-15)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"heal-before-trainers-v2":false,[ID]:true})).toContain(`${ID} needs heal-before-trainers-v2`);
  const without=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(LEGACY_ALL_ON[ID]).toBe(false);
  expect(playSystemPrompt(F97,null)).toBe(playSystemPrompt({...F97,[ID]:false},null));
  expect(playTools(F97)).toEqual(playTools({...F97,[ID]:false}));
 });
 it("is in the bundle arm only of both fixed bundles, and its pending experiment's incumbent is that arm with the switch off",()=>{
  const read=(path:string):unknown=>JSON.parse(readFileSync(new URL(`../../../${path}`,import.meta.url),"utf8"));
  for(const name of ["bundle-v-control","bundle-cook-1h"]){
   const fixed=read(`experiments/fixed/${name}.json`) as {base:{features:Record<string,boolean>};switches:string[]};
   expect(fixed.base.features[ID]).toBe(false);expect(fixed.switches).toContain(ID);
  }
  const fixed=read("experiments/fixed/bundle-v-control.json") as {base:{features:Record<string,boolean>};switches:string[]};
  const arm:Record<string,boolean>={...fixed.base.features,...Object.fromEntries(fixed.switches.map(s=>[s,true])),[ID]:false};
  const entry=read(`experiments/${ID}.json`) as {changedFeature:string;incumbent:{features:Record<string,boolean>};queuePosition?:number};
  expect(entry.changedFeature).toBe(ID);expect(entry.queuePosition).toBeUndefined();
  delete arm["pending-field-dialogue-v1"];
  delete arm["menu-refusal-recovery-v1"];
  delete arm["navigation-recovery-v1"];
  delete arm["mart-stock-readout-v1"];
  delete arm["navigation-tool-use-guard-v1"];delete arm["semantic-current-map-feedback-v1"];delete arm["story-battle-heal-first-v1"];
  // exit-labels-v3 and short-cycle-fixed-point-v1 joined the bundle arm after this pending experiment was pinned.
  expect({...entry.incumbent.features,"gym-door-label-v1":true,"navigation-refusal-reasons-v3":true,"exit-labels-v3":true,"short-cycle-fixed-point-v1":true}).toEqual(arm);
  expect(dependencyProblems(normalizeFeatures({...entry.incumbent.features,[ID]:true} as Parameters<typeof normalizeFeatures>[0]))).toEqual([]);
 });
 it("records a valid story_battle_heal_gate event",()=>{
  const event={v:1,run:"r",seq:1,t:"2026-10-20T20:43:24.172-04:00",type:"story_battle_heal_gate",turn:157,tool_call_id:"t157",tool:"navigate_to_target",map_id:[0,18],confirmed:false,outcome:"refused",reason:null,
   reached:[{kind:"rival",name:"MAY",local_id:2,sprite_kind:"RIVAL_MAY_NORMAL",x:10,y:3,loaded:true,via:"talk",tile:{x:14,y:10}}],sightings:[],hurt:[{species:"TORCHIC",hp:5,max_hp:22}],heal:[{kind:"home",town:"LITTLEROOT TOWN",map_id:[1,0],hops:4,shown:false}],text:TURN157_TEXT};
  expect(checkEvent(event)).toMatchObject({type:"story_battle_heal_gate",outcome:"refused"});
  expect(()=>checkEvent({...event,outcome:"maybe"})).toThrow();
 });
});
