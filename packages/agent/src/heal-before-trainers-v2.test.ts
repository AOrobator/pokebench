import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// heal-before-trainers-v2: trainers from the map's whole object list, loaded or not; heal places include every
// POKéMON CENTER a delivered result listed as an exit; a story battle's opponent is named below full HP.
// Run 2026-10-20T13-54-28_qwen36-gpu0_b300 (test-support/heal-before-trainers-b300.json.gz: its tool results 14698-15600,
// texts without the recorded warning paragraphs, states with heal_before_trainers replayed from raw RAM with v2 on).
// Result 14717 arrives in RUSTBORO CITY at TORCHIC 25/33 and lists "(16,38) -> RUSTBORO CITY POKEMON CENTER 1F
// (map 11/5)"; 14882 enters the gym; 15198 follows the JOSH battle at 11/35. v1 named only TOMMY (MARC and ROXANNE were
// not loaded) and the house in LITTLEROOT TOWN, 8 map changes away (recorded warning, seq 15195).
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {eventProblem,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {HealBeforeTrainers,healBeforeTrainers,healBeforeTrainersV2Text,nearestHeal,shownCenters,withLowHpTrainerWarning,type HealBeforeTrainersFacts,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import type {PlacesBody} from "./story-destinations.js";

const ID="heal-before-trainers-v2";
interface Recorded {seq:number;tool:string;text:string;state:unknown}
const B300=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/heal-before-trainers-b300.json.gz",import.meta.url))).toString("utf8")) as {harness_features:string[];results:Recorded[]};
const PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody).places;
const BUNDLE:FeatureSet=featuresOf(B300.harness_features);
const ON:FeatureSet={...BUNDLE,[ID]:true};
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("missing");return value;};
const result=(seq:number):Recorded=>must(B300.results.find(r=>r.seq===seq));
const at=(seq:number):GameStateSnapshot=>parseGameState(result(seq).state);
// What the server sends with v2 off: only loaded trainers, without loaded.
const asV1=(s:GameStateSnapshot):GameStateSnapshot=>s.heal_before_trainers===undefined?s:{...s,heal_before_trainers:{...s.heal_before_trainers,trainers:s.heal_before_trainers.trainers.filter(t=>t.loaded!==false).map(t=>({local_id:t.local_id,x:t.x,y:t.y,graphics_id:t.graphics_id,sprite_kind:t.sprite_kind,trainer_id:t.trainer_id,defeated:t.defeated}))}};
const CITY=at(14717),GYM=at(14882),AFTER_JOSH=at(15198);

const RUN="In a trainer battle the game says \"No! There's no running from a TRAINER battle!\"";
const CENTER="The nearest place you know of that heals your party is the POKéMON CENTER in RUSTBORO CITY (map 11/5), 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (16,38) in RUSTBORO CITY; its nurse says \"We restore your tired POKéMON to full health.\"";
const NOT_LOADED="(not loaded now: the tile the map places it on)";
const ROXANNE=`the Gym Leader ROXANNE, object 1, sprite ROXANNE, at (5,2) ${NOT_LOADED}`;
const GYM_TEXT=`SUPERVISOR: A trainer you have not beaten is on this map: ${ROXANNE}. Your party is not at full HP: TORCHIC 25/33. Heal to full before a story battle. ${RUN} If your party faints, you black out: you lose half your money (₽3142 of ₽6284) and wake up back at the last POKéMON CENTER you entered, or at home. ${CENTER}`;
const AFTER_JOSH_TEXT=`SUPERVISOR: Trainers you have not beaten are on this map: ${ROXANNE}; object 3, sprite YOUNGSTER, at (3,9); object 5, sprite HIKER, at (1,6) ${NOT_LOADED}. Your party is not at full HP: TORCHIC 11/35. Heal to full before a story battle. Your party is weak for a battle: TORCHIC, your lead, has 11/35 HP (below half). ${RUN} If your party faints, you black out: you lose half your money (₽3222 of ₽6444) and wake up back at the last POKéMON CENTER you entered, or at home. ${CENTER}`;
// heal-before-trainers-v1's recorded paragraph at b300 seq 15195.
const V1_RECORDED="SUPERVISOR: A trainer you have not beaten is on this map: object 3, sprite YOUNGSTER, at (3,9). Your party is weak for a battle: TORCHIC, your lead, has 11/35 HP (below half). In a trainer battle the game says \"No! There's no running from a TRAINER battle!\" If your party faints, you black out: you lose half your money (₽3222 of ₽6444) and wake up back at the last POKéMON CENTER you entered, or at home. The nearest place you have been to that heals your party is your house in LITTLEROOT TOWN (map 1/0), 8 map changes from here in the game's map table, where MOM says \"I think you should rest a bit.\" and heals your party.";

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
function replay(rows:readonly {text:string;state:GameStateSnapshot|undefined}[]):AgentTool {
 let i=0;
 return {name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>{const r=rows[i++];return Promise.resolve({content:[{type:"text",text:r?.text??"press ok"}],details:r?.state===undefined?{}:{state:r.state}});}};
}
function recorder():Required<WarningRecorder>&{heal:[string,HealBeforeTrainersFacts,string][]}{
 const heal:[string,HealBeforeTrainersFacts,string][]=[];
 return {heal,lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:(tool,facts,text)=>{heal.push([tool,facts,text]);}};
}
const places={places:()=>Promise.resolve({places:PLACES})};
const ROWS=B300.results.map(r=>({seq:r.seq,text:r.text,state:parseGameState(r.state)}));
async function added(features:FeatureSet,rows:readonly {seq:number;text:string;state:GameStateSnapshot}[]):Promise<Map<number,string>> {
 const [tool]=withLowHpTrainerWarning([replay(rows)],features,recorder(),places);
 const out=new Map<number,string>();
 for(const r of rows){const text=textOf(await must(tool).execute("c",{}));if(text!==r.text)out.set(r.seq,text.slice(r.text.length+1));}
 return out;
}

describe("registry",()=>{
 it("is a default-off guard that needs heal-before-trainers-v1, applied by the game server too",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"heal-before-trainers-v1",switchable:true,title:"HEAL BEFORE TRAINERS V2"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(AFTER_JOSH_TEXT);
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).at(-1)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null)).not.toContain(ID);
  expect(SERVER_FEATURES).toContain(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:true}).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"heal-before-trainers-v1":false})).toContain(`${ID} needs heal-before-trainers-v1`);
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
 it("OFF: heal-before-trainers-v1's recorded paragraph at seq 15195, byte for byte, and nothing else",async()=>{
  const got=await added({...ON,[ID]:false},ROWS.map(r=>({...r,state:asV1(r.state)})));
  expect([...got]).toEqual([[15198,V1_RECORDED]]);
 });
 it("ON: names ROXANNE on entering the gym at 25/33, then ROXANNE, TOMMY and MARC after JOSH, with the RUSTBORO CITY POKéMON CENTER",async()=>{
  const got=await added(ON,ROWS);
  expect([...got]).toEqual([[14882,GYM_TEXT],[15198,AFTER_JOSH_TEXT]]);
 });
 it("records each paragraph with loaded, story, hurt and the exit that showed the center",async()=>{
  const rec=recorder();
  const [tool]=withLowHpTrainerWarning([replay(ROWS)],ON,rec,places);
  for(let i=0;i<ROWS.length;i++)await must(tool).execute("c",{});
  expect(rec.heal.map(h=>h[2])).toEqual([GYM_TEXT,AFTER_JOSH_TEXT]);
  const [,gym]=must(rec.heal[0]);
  expect(gym).toEqual({map_id:[11,3],trainers:[{local_id:1,x:5,y:2,sprite_kind:"ROXANNE",loaded:false,story:"ROXANNE"}],weak:[],heal:{kind:"pokemon_center",town:"RUSTBORO CITY",map_id:[11,5],hops:2,shown:{map_id:[0,3],map:"RUSTBORO CITY",x:16,y:38}},mom_heals:true,money:6284,hurt:[{species:"TORCHIC",hp:25,max_hp:33}]});
 });
});

describe("heal places shown in results",()=>{
 it("takes a POKéMON CENTER from a warp of the result's map whose map id the text names",()=>{
  expect([...shownCenters(CITY,result(14717).text,PLACES)]).toEqual([["11/5",{map_id:[0,3],map:"RUSTBORO CITY",x:16,y:38}]]);
  expect(shownCenters(CITY,result(14717).text.replaceAll("map 11/5","map 11/50"),PLACES).size).toBe(0);
  expect(shownCenters(CITY,"Exits: (16,38) -> map 11/5",PLACES).size).toBe(1);
  expect(shownCenters(GYM,result(14882).text,PLACES).size).toBe(0);
  expect(shownCenters({...CITY,map_id:null},result(14717).text,PLACES).size).toBe(0);
  expect(shownCenters({...CITY,map_id:[99,99]},result(14717).text,PLACES).size).toBe(0);
 });
 it("a center the player entered is named as entered, without the exit",()=>{
  const ctx={entered:new Set(["11/5"]),shown:shownCenters(CITY,result(14717).text,PLACES)};
  expect(nearestHeal(GYM,ctx,PLACES)).toEqual({kind:"pokemon_center",town:"RUSTBORO CITY",map_id:[11,5],hops:2});
 });
 it("on the map where the exit was listed, says on this map",()=>{
  const f=must(healBeforeTrainers({...CITY,party:AFTER_JOSH.party,heal_before_trainers:must(AFTER_JOSH.heal_before_trainers)},{entered:new Set(),places:PLACES,skip:null,shown:shownCenters(CITY,result(14717).text,PLACES),v2:true}));
  expect(healBeforeTrainersV2Text(f)).toContain("1 map change from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (16,38) on this map;");
 });
 it("a thrown tool call shows nothing, and a result with no state or no map table records nothing",async()=>{
  const watch=new HealBeforeTrainers({skipStory:true,places:()=>Promise.resolve(PLACES),v2:true});
  await watch.shownIn(undefined,result(14717).text);
  expect((await watch.observe(GYM))?.heal?.kind).toBe("home");
  const none=new HealBeforeTrainers({skipStory:true,places:()=>Promise.resolve(null),v2:true});
  await none.shownIn(CITY,result(14717).text);
  expect((await none.observe(GYM))?.heal).toBeNull();
  const off=new HealBeforeTrainers({skipStory:true,places:()=>Promise.resolve(PLACES)});
  await off.shownIn(CITY,result(14717).text);
  expect((await off.observe(asV1(AFTER_JOSH)))?.heal?.kind).toBe("home");
  let calls=0;
  const failing:AgentTool={name:"press",label:"press",description:"press",parameters:Type.Object({}),execute:()=>{calls++;return calls===1?Promise.reject(new Error("bad")):Promise.resolve({content:[{type:"text",text:"ok"}],details:{state:GYM}});}};
  const [tool]=withLowHpTrainerWarning([failing],ON,recorder(),places);
  await expect(must(tool).execute("c",{})).rejects.toThrow("bad");
  expect(textOf(await must(tool).execute("c",{}))).not.toContain("listed it as an exit");
 });
});

describe("thresholds",()=>{
 const ctx={entered:new Set<string>(),places:PLACES,skip:"story" as const,shown:new Map(),v2:true};
 it("a party below full HP but not weak names only the story opponent; a weak party names every unbeaten trainer",()=>{
  expect(must(healBeforeTrainers(GYM,ctx)).trainers.map(t=>t.local_id)).toEqual([1]);
  expect(must(healBeforeTrainers(AFTER_JOSH,ctx)).trainers.map(t=>t.local_id)).toEqual([1,3,5]);
 });
 it("at full HP nothing is named, and with ROXANNE beaten she is an ordinary trainer whose flag says beaten",()=>{
  const full={...AFTER_JOSH,party:AFTER_JOSH.party.map(m=>({...m,hp:m.max_hp}))};
  expect(healBeforeTrainers(full,ctx)).toBeNull();
  const facts=must(AFTER_JOSH.heal_before_trainers);
  const won={...AFTER_JOSH,story:{...must(AFTER_JOSH.story),roxanne_defeated:true},heal_before_trainers:{...facts,trainers:facts.trainers.map(t=>t.local_id===1?{...t,defeated:true}:t)}};
  expect(must(healBeforeTrainers(won,ctx)).trainers.map(t=>[t.local_id,t.story])).toEqual([[3,undefined],[5,undefined]]);
 });
 it("with low-hp-trainer-warning-v2 on and ROXANNE's object loaded, leaves her to that warning; without it names her",()=>{
  const loaded={...GYM,world_context:{...must(GYM.world_context),objects:[...must(GYM.world_context).objects,{local_id:1,map_id:[11,3] as [number,number],graphics_id:125,sprite_kind:"ROXANNE",x:5,y:2}]}};
  expect(healBeforeTrainers(loaded,ctx)).toBeNull();
  expect(must(healBeforeTrainers(loaded,{...ctx,skip:null})).trainers.map(t=>t.local_id)).toEqual([1]);
 });
 it("the rival is named as your rival, and an unreadable party names nobody",()=>{
  const facts=must(GYM.heal_before_trainers);
  const route103={...GYM,map_id:[0,18] as [number,number],story:{...must(GYM.story),rival_battle_won:false},heal_before_trainers:{...facts,trainers:[{local_id:2,x:10,y:3,graphics_id:105,sprite_kind:"RIVAL_MAY_NORMAL",trainer_id:520,defeated:false,loaded:false}]}};
  const f=must(healBeforeTrainers(route103,ctx));
  expect(healBeforeTrainersV2Text(f)).toContain("A trainer you have not beaten is on this map: your rival MAY, object 2, sprite RIVAL_MAY_NORMAL, at (10,3) (not loaded now");
  expect(healBeforeTrainers({...GYM,party:[{...must(GYM.party[0]),hp:null}]},ctx)).toBeNull();
 });
 it("without a healing place it says where healing is, naming no place",()=>{
  const facts=must(GYM.heal_before_trainers);
  const f=must(healBeforeTrainers({...GYM,heal_before_trainers:{...facts,mom_heals:false}},{...ctx,places:null}));
  expect(healBeforeTrainersV2Text(f)).toMatch(/at home\. Heal before you battle: the nurse at a POKéMON CENTER heals your whole party\.$/);
  expect(healBeforeTrainersV2Text({...f,mom_heals:true})).toMatch(/heals your whole party, and so does MOM at home\.$/);
 });
});

describe("the arm",()=>{
 const watch=():HealBeforeTrainers=>new HealBeforeTrainers({skipStory:true,places:()=>Promise.resolve(PLACES),v2:true});
 it("names ROXANNE once while the party stays below full HP, and again after a state at full HP",async()=>{
  const w=watch();
  expect((await w.observe(GYM))?.trainers.map(t=>t.local_id)).toEqual([1]);
  expect(await w.observe(GYM)).toBeNull();
  const full={...GYM,party:GYM.party.map(m=>({...m,hp:m.max_hp}))};
  expect(await w.observe(full)).toBeNull();
  expect((await w.observe(GYM))?.trainers.map(t=>t.local_id)).toEqual([1]);
 });
 it("a party read as not weak re-arms the other trainers but not ROXANNE",async()=>{
  const w=watch();
  expect((await w.observe(AFTER_JOSH))?.trainers.map(t=>t.local_id)).toEqual([1,3,5]);
  expect(await w.observe(AFTER_JOSH)).toBeNull();
  const notWeak={...AFTER_JOSH,party:AFTER_JOSH.party.map(m=>({...m,hp:30}))};
  expect(await w.observe(notWeak)).toBeNull();
  expect((await w.observe(AFTER_JOSH))?.trainers.map(t=>t.local_id)).toEqual([3,5]);
 });
 it("leaving the map re-arms everything",async()=>{
  const w=watch();
  expect(await w.observe(GYM)).not.toBeNull();
  expect(await w.observe(CITY)).toBeNull();
  expect(await w.observe(GYM)).not.toBeNull();
 });
});

describe("recorded event",()=>{
 it("accepts v2's fields and an empty weak list, renders one SUPERVISOR tail line, and v1's shape is unchanged",async()=>{
  const rec=recorder();
  const [tool]=withLowHpTrainerWarning([replay(ROWS)],ON,rec,places);
  for(let i=0;i<ROWS.length;i++)await must(tool).execute("c",{});
  const [name,f,text]=must(rec.heal[0]);
  const event={v:1,run:"r",seq:9,t:"2026-10-20T14:54:10.000-04:00",type:"heal_before_trainers_warning",turn:492,tool:name,map_id:[11,3],trainers:f.trainers.map(t=>({...t})),weak:[],hurt:[{species:"TORCHIC",hp:25,max_hp:33}],heal:{kind:"pokemon_center",town:"RUSTBORO CITY",map_id:[11,5],hops:2,shown:{map_id:[0,3],map:"RUSTBORO CITY",x:16,y:38}},mom_heals:true,money:6284,text} as RunEvent;
  expect(eventProblem(event)).toBeNull();
  expect(eventProblem({...event,trainers:[]})).not.toBeNull();
  expect(formatEvent(event)).toBe("14:54:10 t492 SUPERVISOR heal before trainers · ROXANNE (5,2) · TORCHIC 25/33 below full · POKéMON CENTER in RUSTBORO CITY");
 });
});

describe("delivery",()=>{
 it("ON records the shown centers only from delivered results, and still reads the map table once",async()=>{
  let reads=0;
  const counted={places:()=>{reads++;return Promise.resolve({places:PLACES});}};
  const [tool]=withLowHpTrainerWarning([replay(ROWS)],ON,recorder(),counted);
  for(let i=0;i<ROWS.length;i++)await must(tool).execute("c",{});
  expect(reads).toBe(1);
 });
});
