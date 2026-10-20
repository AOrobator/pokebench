import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// low-hp-trainer-warning-v2: the v1 warning generalized to every story battle the game state can see (Route 103
// rival, Petalburg Woods TEAM AQUA grunt, Rustboro Gym Leader ROXANNE) and to any party Pokémon below its max HP.
// Operator 2026-10-16 2:43 PM EDT: "heal before story trainer battles at any HP below max". States are run 54a7's
// recorded T363 (test-support/trainer-heal-54a7.json) and copies of it moved to the woods and the gym.
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {eventProblem,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {StoryBattleWarning,storyBattleWarning,storyBattleText,warningText,lowHpTrainerWarning,withLowHpTrainerWarning,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {playSystemPrompt,playTools} from "./play-config.js";

const ID="low-hp-trainer-warning-v2";
const RUN54A7=JSON.parse(readFileSync(new URL("../test-support/trainer-heal-54a7.json",import.meta.url),"utf8")) as {harness_features:string[];states:{turn:number;state:unknown}[]};
const BUNDLE:FeatureSet=featuresOf(RUN54A7.harness_features);
const ON:FeatureSet={...BUNDLE,"low-hp-trainer-warning-v1":true,[ID]:true};
const at=(turn:number):GameStateSnapshot=>parseGameState(RUN54A7.states.find(s=>s.turn===turn)?.state);
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("missing");return value;};
const T363=at(363),T369=at(369),T371=at(371);
const story=(fields:Partial<NonNullable<GameStateSnapshot["story"]>>):NonNullable<GameStateSnapshot["story"]>=>({...must(T363.story),...fields});
const withHp=(s:GameStateSnapshot,hp:number):GameStateSnapshot=>({...s,party:s.party.map((m,i)=>i===0?{...m,hp}:m)});
const FULL=withHp(T363,21);
const WOODS:GameStateSnapshot={...T363,location:"PETALBURG WOODS",map_id:[24,11],world_context:{...must(T363.world_context),objects:[]},story:story({petalburg_woods_aqua_grunt_defeated:false})};
const GYM:GameStateSnapshot={...T363,location:"RUSTBORO CITY GYM",map_id:[11,3],world_context:{...must(T363.world_context),objects:[{local_id:1,map_id:[11,3],graphics_id:125,sprite_kind:"ROXANNE",x:5,y:2}]},story:story({roxanne_defeated:false})};
const TAIL="If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home. Heal to full before this battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.";
const T363_TEXT=`SUPERVISOR: A story battle is on this map: your rival MAY, at (10,3). Talking to her starts a trainer battle you cannot run from. Your party is not at full HP: TORCHIC 3/21. ${TAIL}`;

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
function replay(name:string,states:GameStateSnapshot[]):AgentTool {
 let i=0;
 return {name,label:name,description:name,parameters:{type:"object",properties:{}},execute:()=>{const state=states[i++];return Promise.resolve({content:[{type:"text",text:`${name} ok`}],details:state===undefined?{}:{state}});}};
}
type Calls={v1:unknown[][];v2:unknown[][]};
function recorder():Required<Pick<WarningRecorder,"lowHpTrainerWarning"|"storyBattleWarning">>&{calls:Calls}{
 const calls:Calls={v1:[],v2:[]};
 return {calls,lowHpTrainerWarning:(...args)=>{calls.v1.push(args);},storyBattleWarning:(...args)=>{calls.v2.push(args);}};
}
const run=async(tool:AgentTool,times:number):Promise<string[]>=>{const out:string[]=[];for(let i=0;i<times;i++)out.push(textOf(await tool.execute(`c${String(i)}`,{})));return out;};

describe("registry",()=>{
 it("is a default-off agent-side guard that needs v1, recorded right after the last switch before it",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"low-hp-trainer-warning-v1",switchable:true,title:"STORY BATTLE HEAL WARNING"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(T363_TEXT);
  expect(SWITCHABLE_FEATURES.at(-51)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-40)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"low-hp-trainer-warning-v1":false})).toContain(`${ID} needs low-hp-trainer-warning-v1`);
 });
 it("defaults OFF for presets that omit it and legacy flags; prompt and tools never change",()=>{
  const without=Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[ID]).toBe(false);
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt({...ON,[ID]:false},null));
  expect(playTools(ON)).toEqual(playTools({...ON,[ID]:false}));
 });
});

describe("condition, from the state alone",()=>{
 it("fires on run 54a7's T363 like v1, with the v2 text",()=>{
  expect(storyBattleWarning(T363)).toMatchObject({kind:"rival",opponent:"MAY",x:10,y:3,map_id:[0,18],party:[{species:"TORCHIC",hp:3,max_hp:21}],money:3000,items:[]});
  expect(storyBattleText(must(storyBattleWarning(T363)))).toBe(T363_TEXT);
 });
 it("fires at any HP below max (20/21), and not at full HP",()=>{
  expect(storyBattleWarning(withHp(T363,20))?.party).toEqual([{species:"TORCHIC",hp:20,max_hp:21}]);
  expect(lowHpTrainerWarning(withHp(T363,20))).toBeNull();
  expect(storyBattleWarning(FULL)).toBeNull();
 });
 it("lists every party Pokémon below max, fainted ones too, and skips eggs and full ones",()=>{
  const lead=must(T363.party[0]);
  const party=[{...lead,hp:21},{...lead,species:"WURMPLE",hp:0,max_hp:15},{...lead,species:"EGG",is_egg:true,hp:1,max_hp:10},{...lead,species:"ZIGZAGOON",hp:7,max_hp:18}];
  const facts=must(storyBattleWarning({...T363,party}));
  expect(facts.party).toEqual([{species:"WURMPLE",hp:0,max_hp:15},{species:"ZIGZAGOON",hp:7,max_hp:18}]);
  expect(storyBattleText(facts)).toContain("Your party is not at full HP: WURMPLE 0/15, ZIGZAGOON 7/18.");
 });
 it("covers the Rustboro Gym Leader ROXANNE while unbeaten and loaded",()=>{
  const facts=must(storyBattleWarning(withHp(GYM,15)));
  expect(facts).toMatchObject({kind:"gym_leader",opponent:"ROXANNE",x:5,y:2,map_id:[11,3]});
  expect(storyBattleText(facts)).toBe(`SUPERVISOR: A story battle is on this map: the Gym Leader ROXANNE, at (5,2). Talking to her starts a trainer battle you cannot run from. Your party is not at full HP: TORCHIC 15/21. ${TAIL}`);
  expect(storyBattleWarning({...GYM,story:story({roxanne_defeated:true})})).toBeNull();
  expect(storyBattleWarning({...GYM,story:story({roxanne_defeated:null})})).toBeNull();
  expect(storyBattleWarning({...GYM,world_context:{...must(GYM.world_context),objects:[]}})).toBeNull();
 });
 it("covers the Petalburg Woods TEAM AQUA grunt from the map and flag alone (his object has no talk script; coord events start the battle)",()=>{
  const facts=must(storyBattleWarning(WOODS));
  expect(facts).toMatchObject({kind:"aqua_grunt",opponent:"TEAM AQUA grunt",x:null,y:null,map_id:[24,11]});
  expect(storyBattleText(facts)).toBe(`SUPERVISOR: A story battle is on this map: a TEAM AQUA grunt. He stops you on the forest path when you reach the DEVON researcher, and that trainer battle cannot be run from. Your party is not at full HP: TORCHIC 3/21. ${TAIL}`);
  expect(storyBattleWarning({...WOODS,story:story({petalburg_woods_aqua_grunt_defeated:true})})).toBeNull();
 });
 it("is silent on the free-field, owner, battle and won-flag checks v1 uses, and on maps with no story battle",()=>{
  expect(storyBattleWarning({...T363,field_controls_locked:true})).toBeNull();
  expect(storyBattleWarning({...T363,field_controls_locked:null})).toBeNull();
  expect(storyBattleWarning({...T363,party_owner:"tutorial"})).toBeNull();
  expect(storyBattleWarning(T369)).toBeNull();
  expect(storyBattleWarning(T371)).toBeNull();
  expect(storyBattleWarning({...T363,story:story({rival_battle_won:true})})).toBeNull();
  expect(storyBattleWarning({...T363,map_id:[0,10],location:"OLDALE TOWN"})).toBeNull();
  expect(storyBattleWarning({...T363,story:null})).toBeNull();
 });
 it("does not fire while any party Pokémon cannot be read, since the paragraph lists every hurt one",()=>{
  const lead=must(T363.party[0]);
  expect(storyBattleWarning({...T363,party:[lead,{...lead,species:"WURMPLE",hp:null,max_hp:null}]})).toBeNull();
  expect(storyBattleWarning({...T363,party:[lead,{...lead,species:null,hp:5,max_hp:15}]})).toBeNull();
  expect(storyBattleWarning({...T363,party:[lead,{...lead,species:"EGG",is_egg:true,hp:null,max_hp:null}]})?.party).toEqual([{species:"TORCHIC",hp:3,max_hp:21}]);
 });
 it("names an item only when a hurt Pokémon can use it: no REVIVE for a conscious party, no POTION for a fainted one",()=>{
  const lead=must(T363.party[0]);
  const bag=(...names:string[])=>({...must(T363.resources),bag:names.map((name,slot)=>({slot,item_id:13,quantity:1,pocket:"items",name}))});
  expect(must(storyBattleWarning({...withHp(T363,20),resources:bag("REVIVE")})).items).toEqual([]);
  expect(storyBattleText(must(storyBattleWarning({...withHp(T363,20),resources:bag("REVIVE")})))).not.toContain("BAG");
  const fainted={...T363,party:[{...lead,hp:21},{...lead,species:"WURMPLE",hp:0,max_hp:15}]};
  expect(must(storyBattleWarning({...fainted,resources:bag("POTION")})).items).toEqual([]);
  expect(must(storyBattleWarning({...fainted,resources:bag("POTION","REVIVE")})).items).toEqual([{name:"REVIVE",quantity:1}]);
  expect(must(storyBattleWarning({...withHp(T363,20),resources:bag("POTION","REVIVE")})).items).toEqual([{name:"POTION",quantity:1}]);
 });
 it("names revival medicine too, for fainted Pokémon (v1's item list is unchanged)",()=>{
  const lead=must(T363.party[0]);
  const bag=[{slot:0,item_id:24,quantity:1,pocket:"items",name:"REVIVE"},{slot:1,item_id:13,quantity:2,pocket:"items",name:"POTION"}];
  const state={...T363,party:[lead,{...lead,species:"WURMPLE",hp:0,max_hp:15}],resources:{...must(T363.resources),bag}};
  const facts=must(storyBattleWarning(state));
  expect(facts.items).toEqual([{name:"REVIVE",quantity:1},{name:"POTION",quantity:2}]);
  expect(storyBattleText(facts)).toMatch(/ Your BAG has REVIVE ×1 and POTION ×2; using one restores HP\.$/);
  expect(must(lowHpTrainerWarning(state)).items).toEqual([{name:"POTION",quantity:2}]);
 });
 it("names healing items in the bag",()=>{
  const bag=[{slot:0,item_id:13,quantity:2,pocket:"items",name:"POTION"}];
  expect(storyBattleText(must(storyBattleWarning({...T363,resources:{...must(T363.resources),bag}})))).toMatch(/ Your BAG has POTION ×2; using one restores HP\.$/);
 });
});

describe("delivery",()=>{
 it("v2 OFF leaves the v1 warning exactly as it was",async()=>{
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",[T363])],{...ON,[ID]:false},rec);
  expect(await run(must(press),1)).toEqual([`press ok\n${warningText(must(lowHpTrainerWarning(T363)))}`]);
  expect(rec.calls.v1).toHaveLength(1);
  expect(rec.calls.v2).toHaveLength(0);
 });
 it("v2 ON replaces the v1 paragraph and event with the story-battle ones, once per arm",async()=>{
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",[T363,T363,FULL,withHp(T363,20),WOODS,WOODS])],ON,rec);
  const texts=await run(must(press),6);
  expect(texts.map(t=>t.includes("SUPERVISOR: A story battle"))).toEqual([true,false,false,true,true,false]);
  expect(texts[0]).toBe(`press ok\n${T363_TEXT}`);
  expect(rec.calls.v1).toHaveLength(0);
  expect(rec.calls.v2.map(c=>c[0])).toEqual(["press","press","press"]);
 });
 it("does not re-arm on a party whose HP cannot be read: full HP needs every HP read and at max",()=>{
  const unreadable=parseGameState({...T363,party:T363.party.map(m=>({...m,hp:null,max_hp:null}))});
  const watch=new StoryBattleWarning();
  expect(watch.observe(T363)).not.toBeNull();
  expect(watch.observe(unreadable)).toBeNull();
  expect(watch.observe(T363)).toBeNull();
  const lead=must(T363.party[0]);
  expect(watch.observe({...T363,party:[{...lead,hp:21},{...lead,species:"WURMPLE",hp:null,max_hp:15}]})).toBeNull();
  expect(watch.observe(T363)).toBeNull();
  expect(watch.observe(FULL)).toBeNull();
  expect(watch.observe(T363)).not.toBeNull();
 });
 it("re-arms on a party read at full HP even when a species name cannot be read: full HP needs only every HP read and at max",()=>{
  const watch=new StoryBattleWarning();
  expect(watch.observe(T363)).not.toBeNull();
  expect(watch.observe(parseGameState({...FULL,party:FULL.party.map(m=>({...m,species:null}))}))).toBeNull();
  expect(watch.observe(T363)).not.toBeNull();
 });
 it("re-arms when the player leaves the map and fires again on return while still hurt",()=>{
  const watch=new StoryBattleWarning();
  expect(watch.observe(T363)).not.toBeNull();
  expect(watch.observe(T363)).toBeNull();
  expect(watch.observe({...T363,map_id:[0,10],location:"OLDALE TOWN"})).toBeNull();
  expect(watch.observe(T363)).not.toBeNull();
 });
 it("needs a recorder that can record the v2 event",()=>{
  expect(()=>withLowHpTrainerWarning([replay("press",[])],ON,{lowHpTrainerWarning:()=>undefined})).toThrow("story_battle_warning");
 });
 it("re-arms only on full HP, another map or the battle won",()=>{
  const watch=new StoryBattleWarning();
  expect(watch.observe(T363)).not.toBeNull();
  expect(watch.observe(T369)).toBeNull();
  expect(watch.observe(T363)).toBeNull();
  expect(watch.observe({...T363,story:story({rival_battle_won:true})})).toBeNull();
  expect(watch.observe(T363)).not.toBeNull();
  expect(watch.observe(undefined)).toBeNull();
 });
});

describe("recorded event",()=>{
 it("is accepted by the run log and renders one SUPERVISOR tail line",()=>{
  const facts=must(storyBattleWarning(WOODS));
  const event={v:1,run:"r",seq:9,t:"2026-10-16T05:27:04.000-04:00",type:"story_battle_warning",turn:500,tool:"navigate_to",...facts,map_id:[24,11],party:facts.party.map(p=>({...p})),items:[],text:storyBattleText(facts)} as RunEvent;
  expect(eventProblem(event)).toBeNull();
  expect(eventProblem({...event,kind:"route_trainer"})).not.toBeNull();
  expect(formatEvent(event)).toBe("05:27:04 t500 SUPERVISOR story battle warning · TEAM AQUA grunt · TORCHIC 3/21");
 });
});

describe("pending experiment",()=>{
 it("lists every switch registered up to v2 in its raw incumbent, with v1 on (v2 needs it), and flips only v2",()=>{
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/low-hp-trainer-warning-v2.json",import.meta.url),"utf8")) as {changedFeature:string;activationMilestone:string;queuePosition?:number;incumbent:{features:Record<string,boolean>}};
  const historical=SWITCHABLE_FEATURES.filter(id=>id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1");
  expect(Object.keys(raw.incumbent.features)).toEqual(historical.slice(0,historical.indexOf(ID)+1));
  expect(raw.changedFeature).toBe(ID);
  expect(raw.incumbent.features[ID]).toBe(false);
  expect(raw.incumbent.features["low-hp-trainer-warning-v1"]).toBe(true);
  expect(raw.activationMilestone).toBe("ROUTE_103");
  expect(raw.queuePosition).toBeUndefined();
 });
});
