import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// gym-heal-warning-v1: one SUPERVISOR paragraph on a free-field result while a party Pokémon is below max HP, when the
// current map is a GYM or has an exit to one (the operator 2026-10-20: "the supervisor warning for when it enters a gym without
// full HP is the right way to go"). Run b300 (test-support/heal-before-trainers-b300.json.gz) arrived in RUSTBORO CITY
// at TORCHIC 25/33 (result 14717, gym door at (27,19)), entered the gym still at 25/33 (14882) and after JOSH was at
// 11/35 (15198). Its saved last heal location was RED's HOUSE 2F (map 1/1). The map table is the ROM's
// (test-support/story-destinations-places.json, recorded with the player named RAED; the b300 player is RED, so the
// displayed house names are rewritten to RED's, as the server builds them from the player's name).
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {eventProblem,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {GymHealWarning,gymHealText,gymHealWarning,withLowHpTrainerWarning,type GymHealFacts,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import type {PlacesBody} from "./story-destinations.js";

const ID="gym-heal-warning-v1";
interface Recorded {seq:number;tool:string;text:string;state:unknown}
const B300=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:Recorded[]};
const PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody).places.map(p=>({...p,display:p.display.replace("RAED's","RED's")}));
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("missing");return value;};
const ON:FeatureSet={...featuresOf(B300.harness_features),"heal-before-trainers-v2":true,[ID]:true};
const ROWS=B300.results.map(r=>({seq:r.seq,text:r.text,state:parseGameState(r.state)}));
const at=(seq:number):GameStateSnapshot=>must(ROWS.find(r=>r.seq===seq)).state;
const CITY=at(14717),GYM=at(14882),AFTER_JOSH=at(15198);

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
function replay(rows:readonly {text:string;state:GameStateSnapshot|undefined}[]):AgentTool {
 let i=0;
 return {name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>{const r=rows[i++];return Promise.resolve({content:[{type:"text",text:r?.text??"press ok"}],details:r?.state===undefined?{}:{state:r.state}});}};
}
function recorder():Required<WarningRecorder>&{gym:[string,GymHealFacts,string][];heal:string[]}{
 const gym:[string,GymHealFacts,string][]=[];const heal:string[]=[];
 return {gym,heal,lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:(_tool,_facts,text)=>{heal.push(text);},gymHealWarning:(tool,facts,text)=>{gym.push([tool,facts,text]);}};
}
const places={places:()=>Promise.resolve({places:PLACES})};
async function added(features:FeatureSet,rows:readonly {seq:number;text:string;state:GameStateSnapshot}[]):Promise<[number,string][]> {
 const [tool]=withLowHpTrainerWarning([replay(rows)],features,recorder(),places);
 const out:[number,string][]=[];
 for(const r of rows){const text=textOf(await must(tool).execute("c",{}));if(text!==r.text)out.push([r.seq,text.slice(r.text.length+1)]);}
 return out;
}
const full=(s:GameStateSnapshot):GameStateSnapshot=>({...s,party:s.party.map(m=>({...m,hp:m.max_hp}))});

const RUN_HEAL="The nearest place you know of that heals your party is the POKéMON CENTER in RUSTBORO CITY (map 11/5)";
const NURSE="its nurse says \"We restore your tired POKéMON to full health.\"";
const CITY_TEXT=`SUPERVISOR: An exit on this map at (27,19) leads to RUSTBORO CITY GYM (map 11/3), and your party is not at full HP: TORCHIC 25/33. If your whole party faints in a battle, the game says "RED is out of usable POKéMON!" and "RED whited out!"; you lose half your money (₽3142 of ₽6284) and wake up in RED's HOUSE 2F (map 1/1), 8 map changes from here. ${RUN_HEAL}, 1 map change from here in the game's map table; you have not entered it; this result lists it as an exit at (16,38) on this map; ${NURSE}`;
const GYM_TEXT=`SUPERVISOR: You are in RUSTBORO CITY GYM (map 11/3), and your party is not at full HP: TORCHIC 25/33. If your whole party faints in a battle, the game says "RED is out of usable POKéMON!" and "RED whited out!"; you lose half your money (₽3142 of ₽6284) and wake up in RED's HOUSE 2F (map 1/1), 9 map changes from here. ${RUN_HEAL}, 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (16,38) in RUSTBORO CITY; ${NURSE}`;

describe("registry",()=>{
 it("is a default-off, agent-side guard that needs heal-before-trainers-v2, recorded last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"heal-before-trainers-v2",switchable:true,title:"GYM HEAL WARNING"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(CITY_TEXT);
  expect(SWITCHABLE_FEATURES.at(-26)).toBe(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,"heal-before-trainers-v2":true,[ID]:true},null).at(-1)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null)).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true})).toContain(`${ID} needs heal-before-trainers-v2`);
  expect(dependencyProblems({...ALL_ON,"heal-before-trainers-v2":true,[ID]:true})).toEqual([]);
 });
 it("defaults OFF for presets that omit it and legacy flags; prompt and tools never change",()=>{
  const without=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt({...ON,[ID]:false},null));
  expect(playTools(ON)).toEqual(playTools({...ON,[ID]:false}));
 });
});

describe("b300 replay",()=>{
 it("OFF: heal-before-trainers-v2's paragraphs only, as before",async()=>{
  const off=await added({...ON,[ID]:false},ROWS);
  expect(off.map(([seq])=>seq)).toEqual([14882,15198]);
  expect(off.every(([,text])=>!text.includes("whited out"))).toBe(true);
 });
 it("ON: warns in RUSTBORO CITY (gym door on the map) and again on entering the gym, and not after JOSH (same map entry, never at full HP)",async()=>{
  const on=await added(ON,ROWS);
  const off=new Map(await added({...ON,[ID]:false},ROWS));
  expect(on).toEqual([[14717,CITY_TEXT],[14882,`${must(off.get(14882))}\n${GYM_TEXT}`],[15198,must(off.get(15198))]]);
 });
 it("records each paragraph with its facts",async()=>{
  const rec=recorder();
  const [tool]=withLowHpTrainerWarning([replay(ROWS)],ON,rec,places);
  for(let i=0;i<ROWS.length;i++)await must(tool).execute("c",{});
  expect(rec.gym.map(g=>[g[0],g[2]])).toEqual([["press",CITY_TEXT],["press",GYM_TEXT]]);
  expect(must(rec.gym[1])[1]).toEqual({map_id:[11,3],gym:{name:"RUSTBORO CITY GYM",map_id:[11,3],here:true,x:null,y:null},hurt:[{species:"TORCHIC",hp:25,max_hp:33}],player:"RED",money:6284,wake:{name:"RED's HOUSE 2F",map_id:[1,1],hops:9},heal:{kind:"pokemon_center",town:"RUSTBORO CITY",map_id:[11,5],hops:2,shown:{map_id:[0,3],map:"RUSTBORO CITY",x:16,y:38}},listed_now:false,mom_heals:true});
  // Result 14717 is the first b300 result that lists the center door (16,38), so it says so, not "an earlier result".
  expect(must(rec.gym[0])[1].listed_now).toBe(true);
  expect(must(rec.gym[0])[2]).not.toContain("earlier result");
 });
 it("needs a recorder that can record its event",()=>{
  expect(()=>withLowHpTrainerWarning([replay([])],ON,{lowHpTrainerWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,storyBattleWarning:()=>undefined},places)).toThrow("gym_heal_warning");
 });
});

describe("condition",()=>{
 it("needs the free field, the player's party, a readable party, a party Pokémon below max HP and the server's facts",()=>{
  expect(gymHealWarning(GYM,PLACES,null)).not.toBeNull();
  expect(gymHealWarning({...GYM,in_battle:true},PLACES,null)).toBeNull();
  expect(gymHealWarning({...GYM,screen:"battle"},PLACES,null)).toBeNull();
  expect(gymHealWarning({...GYM,started:false},PLACES,null)).toBeNull();
  expect(gymHealWarning({...GYM,field_controls_locked:true},PLACES,null)).toBeNull();
  expect(gymHealWarning({...GYM,party_owner:"tutorial"},PLACES,null)).toBeNull();
  expect(gymHealWarning({...GYM,map_id:null},PLACES,null)).toBeNull();
  expect(gymHealWarning(full(GYM),PLACES,null)).toBeNull();
  expect(gymHealWarning({...GYM,party:[{...must(GYM.party[0]),hp:null}]},PLACES,null)).toBeNull();
  const bare=parseGameState(Object.fromEntries(Object.entries(GYM).filter(([key])=>key!=="heal_before_trainers")));
  expect(gymHealWarning(bare,PLACES,null)).toBeNull();
 });
 it("needs a GYM: this map's name, or a warp of this map to one; ROUTE104 has neither",()=>{
  expect(gymHealWarning({...CITY,map_id:[0,19],location:"ROUTE104"},PLACES,null)).toBeNull();
  const unknown={...GYM,map_id:[99,9] as [number,number]};
  expect(gymHealWarning(unknown,PLACES,null)?.gym).toEqual({name:"RUSTBORO CITY GYM",map_id:[99,9],here:true,x:null,y:null});
  expect(gymHealWarning({...unknown,location:null},PLACES,null)).toBeNull();
  expect(gymHealWarning({...unknown,location:"GYMNASIUM"},PLACES,null)).toBeNull();
 });
 it("states what it cannot read without guessing: no name, no money, no saved heal place, no map table route",()=>{
  const f=must(gymHealWarning(GYM,PLACES,null));
  const facts=must(GYM.heal_before_trainers);
  expect(f.listed_now).toBe(false);
  expect(gymHealText({...f,player:null,money:null,wake:null})).toContain("If your whole party faints in a battle, you white out; you lose half your money. Heal before you battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.");
  expect(gymHealText({...f,mom_heals:false})).toMatch(/heals your whole party\.$/);
  expect(gymHealText({...f,wake:{name:"X",map_id:[1,1],hops:null}})).toContain("wake up in X (map 1/1).");
  expect(gymHealText({...f,wake:{name:"X",map_id:[11,3],hops:0}})).toContain("wake up in X (map 11/3), this map.");
  expect(gymHealText({...f,wake:{name:"X",map_id:[0,3],hops:1}})).toContain("wake up in X (map 0/3), 1 map change from here.");
  expect(gymHealWarning({...GYM,heal_before_trainers:{...facts,last_heal:null}},PLACES,null)?.wake).toBeNull();
  expect(gymHealWarning({...GYM,heal_before_trainers:{...facts,last_heal:[99,99]}},PLACES,null)?.wake).toBeNull();
 });
});

describe("the arm",()=>{
 const arm=():GymHealWarning=>new GymHealWarning({places:()=>Promise.resolve(PLACES),heal:()=>Promise.resolve(null)});
 it("fires once per map entry, and again on another map or after a state with the whole party at full HP",async()=>{
  const w=arm();
  expect((await w.observe(GYM))?.gym.here).toBe(true);
  expect(await w.observe(GYM)).toBeNull();
  expect(await w.observe(AFTER_JOSH)).toBeNull();
  expect(await w.observe(full(GYM))).toBeNull();
  expect(await w.observe(GYM)).not.toBeNull();
  expect((await w.observe(CITY))?.gym.here).toBe(false);
  expect(await w.observe(GYM)).not.toBeNull();
 });
 it("a state on a map with no GYM re-arms it too: GYM, ROUTE104, GYM fires twice",async()=>{
  const w=arm();
  expect(await w.observe(GYM)).not.toBeNull();
  expect(await w.observe({...CITY,map_id:[0,19],location:"ROUTE104"})).toBeNull();
  expect(await w.observe(GYM)).not.toBeNull();
 });
 it("is silent without a state, an unstarted game or a map table",async()=>{
  const w=arm();
  expect(await w.observe(undefined)).toBeNull();
  expect(await w.observe({...GYM,started:false})).toBeNull();
  const none=new GymHealWarning({places:()=>Promise.resolve(null),heal:()=>Promise.resolve(null)});
  expect(await none.observe(GYM)).toBeNull();
  expect(await none.observe({...GYM,map_id:null})).toBeNull();
 });
});

describe("recorded event",()=>{
 it("is accepted by the run log and renders one SUPERVISOR tail line",async()=>{
  const rec=recorder();
  const [tool]=withLowHpTrainerWarning([replay(ROWS)],ON,rec,places);
  for(let i=0;i<ROWS.length;i++)await must(tool).execute("c",{});
  const [name,f,text]=must(rec.gym[0]);
  const event={v:1,run:"r",seq:9,t:"2026-10-20T14:53:52.000-04:00",type:"gym_heal_warning",turn:491,tool:name,map_id:[0,3],gym:{name:f.gym.name,map_id:[11,3],here:false,x:27,y:19},hurt:[{species:"TORCHIC",hp:25,max_hp:33}],player:"RED",money:6284,wake:{name:"RED's HOUSE 2F",map_id:[1,1],hops:8},heal:{kind:"pokemon_center",town:"RUSTBORO CITY",map_id:[11,5],hops:1,shown:{map_id:[0,3],map:"RUSTBORO CITY",x:16,y:38}},listed_now:true,mom_heals:true,text} as RunEvent;
  expect(eventProblem(event)).toBeNull();
  expect(eventProblem({...event,hurt:[]})).not.toBeNull();
  expect(formatEvent(event)).toBe("14:53:52 t491 SUPERVISOR gym heal warning · RUSTBORO CITY GYM exit (27,19) · TORCHIC 25/33 · wake RED's HOUSE 2F · POKéMON CENTER in RUSTBORO CITY");
  expect(formatEvent({...event,gym:{...event.type==="gym_heal_warning"?event.gym:{name:"",map_id:[0,0],here:true,x:null,y:null},here:true},wake:null,heal:null} as RunEvent)).toBe("14:53:52 t491 SUPERVISOR gym heal warning · RUSTBORO CITY GYM · TORCHIC 25/33 · wake place unknown · no place named");
 });
});
