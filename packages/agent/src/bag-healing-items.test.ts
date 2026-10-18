// bag-healing-items-v1: the heal-before-trainers-v1 paragraph also names the BAG items that answer the weakness it
// names, with their counts and the game's own item descriptions (pokeemerald src/data/text/item_descriptions.h), and
// how the game uses them (gText_MenuBag "BAG", gMenuText_Use "USE", gText_UseOnWhichPokemon "Use on which POKéMON?").
// Evidence: run 2026-10-17T13-15-36_qwen36-gpu1_e046 talked to the LASS on ROUTE104 at 14/38 HP with POTION ×1 in its
// BAG (readout "Bag: POTION ×1; POKé BALL ×5; GREAT BALL ×1; TM09 ×1"; raw-RAM archive 00008958 decodes item 13 ×1)
// and never used it; the only heal advice it got named the nurse and MOM.
import {mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {checkEvent,eventProblem,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {BAG_ITEM_DESCRIPTIONS,HealBeforeTrainers,bagHealingItems,healBeforeTrainers,healBeforeTrainersText,weakParty,withLowHpTrainerWarning,type HealBeforeTrainersFacts,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import type {PlacesBody} from "./story-destinations.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {RUN_START_META} from "../test-support/events.js";

const ID="bag-healing-items-v1";
const HBT="heal-before-trainers-v1";
const E046=JSON.parse(readFileSync(new URL("../test-support/heal-before-trainers-e046.json",import.meta.url),"utf8")) as {harness_features:string[];states:{seq:number;turn:number;state:unknown}[]};
const PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody).places;
const BUNDLE:FeatureSet=featuresOf(E046.harness_features);
const HBT_ON:FeatureSet={...BUNDLE,"low-hp-trainer-warning-v1":true,[HBT]:true};
const ON:FeatureSet={...HBT_ON,[ID]:true};
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("missing");return value;};
const at=(seq:number):GameStateSnapshot=>parseGameState(E046.states.find(s=>s.seq===seq)?.state);
const CENTER=at(6851),BEFORE_RICH_BOY=at(16066),SPOTTED=at(16104),RICH_BOY_BATTLE=at(16137),AFTER=at(16287),WALK=at(16324),NEXT=at(16340),ADJACENT=at(16361),LASS_BATTLE=at(16399),WHITED_OUT=at(16828);
const SEQUENCE=[CENTER,BEFORE_RICH_BOY,SPOTTED,RICH_BOY_BATTLE,AFTER,WALK,NEXT,ADJACENT,LASS_BATTLE,WHITED_OUT];
const lead=must(AFTER.party[0]);
const withLead=(s:GameStateSnapshot,fields:Partial<typeof lead>):GameStateSnapshot=>({...s,party:s.party.map((m,i)=>i===0?{...m,...fields}:m)});
type Bag=NonNullable<NonNullable<GameStateSnapshot["resources"]>["bag"]>;
const withBag=(s:GameStateSnapshot,bag:Bag):GameStateSnapshot=>({...s,resources:{...must(s.resources),bag}});
const item=(slot:number,item_id:number,name:string,quantity:number,pocket="items"):Bag[number]=>({slot,item_id,quantity,pocket,name});

const RUN="In a trainer battle the game says \"No! There's no running from a TRAINER battle!\"";
const OLDALE="The nearest place you have been to that heals your party is the POKéMON CENTER in OLDALE TOWN (map 2/2), 4 map changes from here in the game's map table; its nurse says \"We restore your tired POKéMON to full health.\"";
const AFTER_TEXT=`SUPERVISOR: A trainer you have not beaten is on this map: object 3, sprite LASS, at (31,24). Your party is weak for a battle: TORCHIC, your lead, has 14/38 HP (below half). ${RUN} If your party faints, you black out: you lose half your money (₽2584 of ₽5168) and wake up back at the last POKéMON CENTER you entered, or at home. ${OLDALE}`;
const RICH_BOY_TEXT=`SUPERVISOR: A trainer you have not beaten is on this map: object 25, sprite RICH_BOY, at (21,25). Your party is weak for a battle: TORCHIC, your lead, has 17/38 HP (below half). ${RUN} If your party faints, you black out: you lose half your money (₽1884 of ₽3768) and wake up back at the last POKéMON CENTER you entered, or at home. ${OLDALE}`;
const USE="To use one, choose BAG (on the START menu, or on the battle menu in a battle), then the item and USE; the game asks \"Use on which POKéMON?\"";
const POTION_SENTENCE=`Your BAG has POTION ×1 ("Restores the HP of a POKéMON by 20 points."). ${USE}`;
const AFTER_ON=`${AFTER_TEXT} ${POTION_SENTENCE}`;
const RICH_BOY_ON=`${RICH_BOY_TEXT} ${POTION_SENTENCE}`;
const POTION={name:"POTION",quantity:1,description:"Restores the HP of a POKéMON by 20 points."};

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
function replay(name:string,states:readonly GameStateSnapshot[]):AgentTool {
 let i=0;
 return {name,label:name,description:name,parameters:{type:"object",properties:{}},execute:()=>{const state=states[i++];return Promise.resolve({content:[{type:"text",text:`${name} ok`}],details:state===undefined?{}:{state}});}};
}
function recorder():Required<WarningRecorder>&{heal:unknown[][]}{
 const heal:unknown[][]=[];
 return {heal,lowHpTrainerWarning:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:(...args)=>{heal.push(args);}};
}
const places={places:()=>Promise.resolve({places:PLACES})};
const run=async(tool:AgentTool,times:number):Promise<string[]>=>{const out:string[]=[];for(let i=0;i<times;i++)out.push(textOf(await tool.execute(`c${String(i)}`,{})));return out;};

describe("registry",()=>{
 it("is a default-off, agent-side guard that needs heal-before-trainers-v1, recorded last",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:HBT,switchable:true,title:"HEAL BEFORE TRAINERS: BAG ITEMS"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(POTION_SENTENCE);
  expect(SWITCHABLE_FEATURES.at(-2)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-2)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,[HBT]:false})).toContain(`${ID} needs ${HBT}`);
 });
 it("defaults OFF for presets that omit it and legacy flags; prompt and tools never change",()=>{
  const without=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[ID]).toBe(false);
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt(HBT_ON,null));
  expect(playTools(ON)).toEqual(playTools(HBT_ON));
 });
});

describe("the BAG items that answer each weakness, from the state alone",()=>{
 it("e046 seq 16287: TORCHIC below half and POTION ×1 in the BAG; the balls and TM09 are not named",()=>{
  expect(bagHealingItems(AFTER,must(weakParty(AFTER)))).toEqual([POTION]);
 });
 it("quotes the game's descriptions with its line breaks as spaces",()=>{
  expect(BAG_ITEM_DESCRIPTIONS.POTION).toBe("Restores the HP of a POKéMON by 20 points.");
  expect(BAG_ITEM_DESCRIPTIONS["SUPER POTION"]).toBe("Restores the HP of a POKéMON by 50 points.");
  expect(BAG_ITEM_DESCRIPTIONS.REVIVE).toBe("Revives a fainted POKéMON with half its HP.");
  expect(BAG_ITEM_DESCRIPTIONS.ETHER).toBe("Restores the PP of a selected move by 10.");
  expect(BAG_ITEM_DESCRIPTIONS["ORAN BERRY"]).toBe("A hold item that restores 10 HP in battle.");
  expect(Object.keys(BAG_ITEM_DESCRIPTIONS)).toHaveLength(22);
 });
 it("names HP items for a lead below half, in BAG order, and nothing for an empty BAG",()=>{
  const bag=[item(0,22,"SUPER POTION",2),item(1,13,"POTION",3),item(2,139,"ORAN BERRY",1,"berries"),item(3,24,"REVIVE",1)];
  expect(bagHealingItems(withBag(AFTER,bag),must(weakParty(AFTER))).map(i=>`${i.name} ×${String(i.quantity)}`)).toEqual(["SUPER POTION ×2","POTION ×3","ORAN BERRY ×1"]);
  expect(bagHealingItems(withBag(AFTER,[]),must(weakParty(AFTER)))).toEqual([]);
  expect(bagHealingItems({...AFTER,resources:null},must(weakParty(AFTER)))).toEqual([]);
 });
 it("names revival items only for a fainted Pokémon, and PP items only for a lead out of PP",()=>{
  const bag=[item(0,13,"POTION",1),item(1,24,"REVIVE",1),item(2,34,"ETHER",2),item(3,138,"LEPPA BERRY",1,"berries")];
  const fainted=[{...lead,hp:38},{...lead,species:"WURMPLE",hp:0,max_hp:15}];
  const s1=withBag({...AFTER,party:fainted},bag);
  expect(bagHealingItems(s1,must(weakParty(s1))).map(i=>i.name)).toEqual(["REVIVE"]);
  const s2=withBag(withLead(AFTER,{hp:38,moves:must(lead.moves).map(m=>({...m,pp:0}))}),bag);
  expect(bagHealingItems(s2,must(weakParty(s2))).map(i=>i.name)).toEqual(["ETHER","LEPPA BERRY"]);
 });
 it("skips an item the state could not name",()=>{
  expect(bagHealingItems(withBag(AFTER,[{slot:0,item_id:13,quantity:1,pocket:"items",name:null}]),must(weakParty(AFTER)))).toEqual([]);
 });
});

describe("text",()=>{
 const base=must(healBeforeTrainers(AFTER,{entered:new Set(),places:PLACES,skip:null}));
 it("appends the BAG sentence after the healing place: e046 seq 16287",()=>{
  expect(healBeforeTrainersText({...base,items:[POTION]})).toBe(AFTER_ON);
 });
 it("lists several items, each with its description",()=>{
  const two:HealBeforeTrainersFacts={...base,items:[POTION,{name:"REVIVE",quantity:1,description:"Revives a fainted POKéMON with half its HP."}]};
  expect(healBeforeTrainersText(two)).toBe(`${AFTER_TEXT} Your BAG has POTION ×1 ("Restores the HP of a POKéMON by 20 points.") and REVIVE ×1 ("Revives a fainted POKéMON with half its HP."). ${USE}`);
  const three:HealBeforeTrainersFacts={...two,items:[...two.items??[],{name:"ETHER",quantity:2,description:"Restores the PP of a selected move by 10."}]};
  expect(healBeforeTrainersText(three)).toContain("Your BAG has POTION ×1 (\"Restores the HP of a POKéMON by 20 points.\"), REVIVE ×1 (\"Revives a fainted POKéMON with half its HP.\") and ETHER ×2 (\"Restores the PP of a selected move by 10.\").");
 });
 it("is heal-before-trainers-v1's paragraph byte for byte with no item or without the field",()=>{
  expect(healBeforeTrainersText({...base,items:[]})).toBe(AFTER_TEXT);
  expect(healBeforeTrainersText(base)).toBe(AFTER_TEXT);
 });
});

describe("the arm",()=>{
 it("replays e046 with items on: both warnings name the POTION",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES),items:true});
  const out:(string|null)[]=[];
  for(const s of SEQUENCE){const f=await watch.observe(s);out.push(f===null?null:healBeforeTrainersText(f));}
  expect(out).toEqual([null,RICH_BOY_ON,null,null,AFTER_ON,null,null,null,null,null]);
 });
 it("with items off the facts have no items field",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  const f=must(await watch.observe(AFTER));
  expect("items" in f).toBe(false);
 });
 it("with items on and none in the BAG, records an empty list and adds no sentence",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES),items:true});
  const f=must(await watch.observe(withBag(AFTER,[item(0,4,"POKé BALL",5,"poke_balls")])));
  expect(f.items).toEqual([]);
  expect(healBeforeTrainersText(f)).toBe(AFTER_TEXT);
 });
});

describe("delivery",()=>{
 it("OFF: heal-before-trainers-v1 exactly as before, its events with no items",async()=>{
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",SEQUENCE)],{...ON,[ID]:false},rec,places);
  const texts=await run(must(press),SEQUENCE.length);
  expect(texts.filter(t=>t!=="press ok")).toEqual([`press ok\n${RICH_BOY_TEXT}`,`press ok\n${AFTER_TEXT}`]);
  expect(rec.heal.map(c=>"items" in (c[1] as object))).toEqual([false,false]);
 });
 it("ON: the paragraph names the POTION, and the event carries the items",async()=>{
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",SEQUENCE)],ON,rec,places);
  const texts=await run(must(press),SEQUENCE.length);
  expect(texts.filter(t=>t!=="press ok")).toEqual([`press ok\n${RICH_BOY_ON}`,`press ok\n${AFTER_ON}`]);
  expect(rec.heal.map(c=>[(c[1] as HealBeforeTrainersFacts).items,c[2]])).toEqual([[[POTION],RICH_BOY_ON],[[POTION],AFTER_ON]]);
 });
 it("the production tools (playGameTools) honor the switch, and the run log records items only when ON",async()=>{
  const root=mkdtempSync(join(tmpdir(),"pokebench-bag-items-wire-"));
  try{
   for(const on of [true,false]){
    const log=RunLog.create(root,on?"on":"off");
    const rec=new RunRecorder({log,frames:new FrameStore(root),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(AFTER)}});
    await rec.start(RUN_START_META);
    const game:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text" as const,text:"observe: ROUTE104 readout"}],details:{state:AFTER}})};
    const base:FeatureSet={...HBT_ON,"bounded-navigation-v1":false,"navigate-first-prompt-v1":false,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false};
    const tools=playGameTools([game],{...base,[ID]:on},{read:()=>Promise.resolve(AFTER),places:()=>Promise.resolve({places:PLACES})},rec);
    const text=textOf(await must(tools.find(t=>t.name==="observe")).execute("c1",{}));
    rec.end("budget");
    const events:RunEvent[]=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
    const warning=must(events.find((e):e is Extract<RunEvent,{type:"heal_before_trainers_warning"}>=>e.type==="heal_before_trainers_warning"));
    if(on){
     expect(text).toContain(POTION_SENTENCE);
     expect(warning.items).toEqual([POTION]);
     expect(warning.text).toBe(AFTER_ON);
    }else{
     expect(text).not.toContain("Your BAG has");
     expect("items" in warning).toBe(false);
     expect(warning.text).toBe(AFTER_TEXT);
    }
   }
  }finally{rmSync(root,{recursive:true,force:true});}
 });
});

describe("recorded event",()=>{
 it("accepts items, rejects malformed ones, and keeps the SUPERVISOR tail line",()=>{
  const f=must(healBeforeTrainers(AFTER,{entered:new Set(),places:PLACES,skip:null}));
  const event={v:1,run:"r",seq:9,t:"2026-10-17T14:20:00.000-04:00",type:"heal_before_trainers_warning",turn:582,tool:"press",...f,map_id:[0,19],trainers:f.trainers.map(t=>({...t})),weak:f.weak.map(w=>({...w})),heal:f.heal===null?null:{...f.heal,map_id:[2,2]},items:[POTION],text:AFTER_ON} as RunEvent;
  expect(eventProblem(event)).toBeNull();
  expect(eventProblem({...event,items:[{name:"POTION",quantity:0,description:"x"}]})).not.toBeNull();
  expect(formatEvent(event)).toBe("14:20:00 t582 SUPERVISOR heal before trainers · LASS (31,24) · TORCHIC 14/38 below half · POKéMON CENTER in OLDALE TOWN · BAG POTION ×1");
 });
});

describe("the pending experiment",()=>{
 it("flips only bag-healing-items-v1 over the bundle-style incumbent with heal-before-trainers-v1 on, and is not queued",()=>{
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/bag-healing-items.json",import.meta.url),"utf8")) as {incumbent:{features:Record<string,boolean>}};
  expect(Object.keys(raw.incumbent.features)).toEqual([...SWITCHABLE_FEATURES]);
  const entry=parseExperiment(raw);
  expect(entry.queuePosition).toBeUndefined();
  expect(entry.changedFeature).toBe(ID);
  const {incumbent,candidate}=experimentArms(entry);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof typeof candidate.features]!==incumbent.features[id as keyof typeof incumbent.features])).toEqual([ID]);
  expect(incumbent.features[HBT]).toBe(true);
  expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
 });
});
