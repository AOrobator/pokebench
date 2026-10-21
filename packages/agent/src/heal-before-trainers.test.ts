import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// heal-before-trainers-v1: on the free field, when a trainer the player has not beaten is loaded on this map and the
// party is weak (a Pokémon fainted, the lead below half HP, or the lead's damaging moves out of PP), the tool result
// says so and names the nearest place that heals the party that the player has been to. The operator 2026-10-17: "I like the
// guidance to heal before trainer fights … I want to see what a simple V1 option would look like."
// States are run 2026-10-17T13-15-36_qwen36-gpu1_e046's recorded tool-result states (test-support/
// heal-before-trainers-e046.json): it beat the RICH_BOY on ROUTE104 at 14/38 HP, then talked to the LASS at (31,24)
// still at 14/38 and lost (whited out to OLDALE TOWN at seq 16828). Their heal_before_trainers field is the server's,
// replayed from each state's raw-RAM archive. The map table is the ROM's (test-support/story-destinations-places.json).
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {eventProblem,type RunEvent} from "./events.js";
import {formatEvent} from "./tail.js";
import {HealBeforeTrainers,healBeforeTrainers,healBeforeTrainersText,nearestHeal,weakParty,withLowHpTrainerWarning,warningText,lowHpTrainerWarning,storyBattleText,storyBattleWarning,type WarningRecorder} from "./low-hp-trainer-warning.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import type {PlacesBody} from "./story-destinations.js";
import {experimentArms,parseExperiment} from "./experiments.js";

const ID="heal-before-trainers-v1";
const E046=JSON.parse(readFileSync(new URL("../test-support/heal-before-trainers-e046.json",import.meta.url),"utf8")) as {harness_features:string[];states:{seq:number;turn:number;state:unknown}[]};
const PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody).places;
const BUNDLE:FeatureSet=featuresOf(E046.harness_features);
const ON:FeatureSet={...BUNDLE,"low-hp-trainer-warning-v1":true,[ID]:true};
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("missing");return value;};
const at=(seq:number):GameStateSnapshot=>parseGameState(E046.states.find(s=>s.seq===seq)?.state);
const CENTER=at(6851),BEFORE_RICH_BOY=at(16066),SPOTTED=at(16104),RICH_BOY_BATTLE=at(16137),AFTER=at(16287),WALK=at(16324),NEXT=at(16340),ADJACENT=at(16361),LASS_BATTLE=at(16399),WHITED_OUT=at(16828);
const SEQUENCE=[CENTER,BEFORE_RICH_BOY,SPOTTED,RICH_BOY_BATTLE,AFTER,WALK,NEXT,ADJACENT,LASS_BATTLE,WHITED_OUT];
const lead=must(AFTER.party[0]);
const withLead=(s:GameStateSnapshot,fields:Partial<typeof lead>):GameStateSnapshot=>({...s,party:s.party.map((m,i)=>i===0?{...m,...fields}:m)});
const facts=(s:GameStateSnapshot)=>must(s.heal_before_trainers);
const RUN="In a trainer battle the game says \"No! There's no running from a TRAINER battle!\"";
const NURSE="its nurse says \"We restore your tired POKéMON to full health.\"";
const OLDALE=`The nearest place you have been to that heals your party is the POKéMON CENTER in OLDALE TOWN (map 2/2), 4 map changes from here in the game's map table; ${NURSE}`;
const AFTER_TEXT=`SUPERVISOR: A trainer you have not beaten is on this map: object 3, sprite LASS, at (31,24). Your party is weak for a battle: TORCHIC, your lead, has 14/38 HP (below half). ${RUN} If your party faints, you black out: you lose half your money (₽2584 of ₽5168) and wake up back at the last POKéMON CENTER you entered, or at home. ${OLDALE}`;
const RICH_BOY_TEXT=`SUPERVISOR: A trainer you have not beaten is on this map: object 25, sprite RICH_BOY, at (21,25). Your party is weak for a battle: TORCHIC, your lead, has 17/38 HP (below half). ${RUN} If your party faints, you black out: you lose half your money (₽1884 of ₽3768) and wake up back at the last POKéMON CENTER you entered, or at home. ${OLDALE}`;

const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
function replay(name:string,states:readonly GameStateSnapshot[]):AgentTool {
 let i=0;
 return {name,label:name,description:name,parameters:{type:"object",properties:{}},execute:()=>{const state=states[i++];return Promise.resolve({content:[{type:"text",text:`${name} ok`}],details:state===undefined?{}:{state}});}};
}
type Calls={v1:unknown[][];v2:unknown[][];heal:unknown[][]};
function recorder():Required<WarningRecorder>&{calls:Calls}{
 const calls:Calls={v1:[],v2:[],heal:[]};
 return {calls,gymHealWarning:()=>undefined,lowHpTrainerWarning:(...args)=>{calls.v1.push(args);},storyBattleWarning:(...args)=>{calls.v2.push(args);},healBeforeTrainersWarning:(...args)=>{calls.heal.push(args);}};
}
const places={places:()=>Promise.resolve({places:PLACES})};
const run=async(tool:AgentTool,times:number):Promise<string[]>=>{const out:string[]=[];for(let i=0;i<times;i++)out.push(textOf(await tool.execute(`c${String(i)}`,{})));return out;};

describe("registry",()=>{
 it("is a default-off guard that needs low-hp-trainer-warning-v1, applied by the game server too",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"guard",needs:"low-hp-trainer-warning-v1",switchable:true,title:"HEAL BEFORE TRAINERS"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain(AFTER_TEXT);
  expect(SWITCHABLE_FEATURES.at(-99)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-37)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"low-hp-trainer-warning-v1":false})).toContain(`${ID} needs low-hp-trainer-warning-v1`);
 });
 it("defaults OFF for presets that omit it and legacy flags; prompt and tools never change",()=>{
  const without=Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":false,"bag-healing-items-v1":false,"battle-menu-loop-v1":false,"clock-view-loop-v1":false,"stale-story-goal-v1":false,"stale-story-goal-v2":false,"input-cuts-v1":false,"loop-guard-screen-v1":false,"reopened-dialogue-loop-v1":false,"dialog-button-b-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":false,"jit-guide-reuse-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(presetFeatures(parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[ID]).toBe(false);
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt({...ON,[ID]:false},null));
  expect(playTools(ON)).toEqual(playTools({...ON,[ID]:false}));
 });
});

describe("weak party, from the state alone",()=>{
 it("run e046 after beating the RICH_BOY: TORCHIC, the lead, at 14/38 is below half",()=>{
  expect(weakParty(AFTER)).toEqual([{kind:"lead_below_half",species:"TORCHIC",hp:14,max_hp:38}]);
 });
 it("is not weak at half HP or more with PP left in a damaging move",()=>{
  expect(weakParty(withLead(AFTER,{hp:19}))).toEqual([]);
  expect(weakParty(withLead(AFTER,{hp:38}))).toEqual([]);
 });
 it("names any fainted Pokémon, the lead is the first one that can battle",()=>{
  const party=[{...lead,species:"WURMPLE",hp:0,max_hp:15},{...lead,hp:38}];
  expect(weakParty({...AFTER,party})).toEqual([{kind:"fainted",species:"WURMPLE",max_hp:15}]);
 });
 it("is weak when every damaging move of the lead is out of PP (SCRATCH and EMBER at 0), whatever its HP",()=>{
  const moves=must(lead.moves).map(m=>m.name==="SCRATCH"||m.name==="EMBER"?{...m,pp:0}:m);
  expect(weakParty(withLead(AFTER,{hp:38,moves}))).toEqual([{kind:"lead_no_pp",species:"TORCHIC",moves:["SCRATCH","EMBER"]}]);
 });
 it("is not weak on PP while one damaging move has PP left (SCRATCH 0, EMBER 13, as in e046's battle at seq 16609)",()=>{
  const moves=must(lead.moves).map(m=>m.name==="SCRATCH"?{...m,pp:0}:m);
  expect(weakParty(withLead(AFTER,{hp:38,moves}))).toEqual([]);
 });
 it("does not judge PP when a move's power is unknown, and is unreadable when a party Pokémon cannot be read",()=>{
  const moves=must(lead.moves).map(m=>({...m,pp:0}));
  const noPower={...AFTER,heal_before_trainers:{...facts(AFTER),move_power:facts(AFTER).move_power.filter(m=>m.move_id!==52)}};
  expect(weakParty(withLead(noPower,{hp:38,moves}))).toEqual([]);
  expect(weakParty({...AFTER,party:[lead,{...lead,species:"WURMPLE",hp:null,max_hp:null}]})).toBeNull();
  expect(weakParty({...AFTER,party:[lead,{...lead,species:"EGG",is_egg:true,hp:null,max_hp:null}]})).toEqual([{kind:"lead_below_half",species:"TORCHIC",hp:14,max_hp:38}]);
 });
});

describe("condition and text",()=>{
 it("fires on e046 seq 16287 with the LASS at (31,24) and names OLDALE TOWN's POKéMON CENTER",()=>{
  const got=must(healBeforeTrainers(AFTER,{entered:new Set(),places:PLACES,skip:null}));
  expect(got).toEqual({map_id:[0,19],trainers:[{local_id:3,x:31,y:24,sprite_kind:"LASS"}],weak:[{kind:"lead_below_half",species:"TORCHIC",hp:14,max_hp:38}],heal:{kind:"pokemon_center",town:"OLDALE TOWN",map_id:[2,2],hops:4},mom_heals:true,money:5168});
  expect(healBeforeTrainersText(got)).toBe(AFTER_TEXT);
 });
 it("is silent when the party is not weak",()=>{
  expect(healBeforeTrainers(withLead(AFTER,{hp:38}),{entered:new Set(),places:PLACES,skip:null})).toBeNull();
 });
 it("is silent with no unbeaten trainer loaded: e046 back in OLDALE TOWN, and ROUTE104 with every trainer beaten",()=>{
  expect(healBeforeTrainers(withLead(WHITED_OUT,{hp:5}),{entered:new Set(),places:PLACES,skip:null})).toBeNull();
  const beaten={...AFTER,heal_before_trainers:{...facts(AFTER),trainers:facts(AFTER).trainers.map(t=>({...t,defeated:true}))}};
  expect(healBeforeTrainers(beaten,{entered:new Set(),places:PLACES,skip:null})).toBeNull();
 });
 it("is silent off the free field, for another party owner, and without the server's facts",()=>{
  const ctx={entered:new Set<string>(),places:PLACES,skip:null};
  expect(healBeforeTrainers(SPOTTED,ctx)).toBeNull();
  expect(healBeforeTrainers(RICH_BOY_BATTLE,ctx)).toBeNull();
  expect(healBeforeTrainers({...AFTER,field_controls_locked:null},ctx)).toBeNull();
  expect(healBeforeTrainers({...AFTER,party_owner:"tutorial"},ctx)).toBeNull();
  const bare=parseGameState(Object.fromEntries(Object.entries(AFTER).filter(([key])=>key!=="heal_before_trainers")));
  expect(healBeforeTrainers(bare,ctx)).toBeNull();
 });
 it("lists every unbeaten trainer loaded here and names each weakness",()=>{
  const two={...AFTER,heal_before_trainers:{...facts(AFTER),trainers:[...facts(AFTER).trainers,{local_id:9,x:4,y:5,graphics_id:36,sprite_kind:null,trainer_id:20,defeated:false}]}};
  const party=[{...lead,moves:must(lead.moves).map(m=>({...m,pp:0}))},{...lead,species:"WURMPLE",hp:0,max_hp:15}];
  const text=healBeforeTrainersText(must(healBeforeTrainers({...two,party},{entered:new Set(),places:PLACES,skip:null})));
  expect(text).toContain("Trainers you have not beaten are on this map: object 3, sprite LASS, at (31,24); object 9, sprite unknown, at (4,5).");
  expect(text).toContain("Your party is weak for a battle: TORCHIC, your lead, has 14/38 HP (below half); TORCHIC, your lead, has no PP left for its damaging moves (SCRATCH, EMBER), and the game says \"There's no PP left for this move!\"; WURMPLE has fainted (0/15 HP).");
 });
});

describe("the nearest place that heals",()=>{
 const ctx=(entered:readonly string[])=>({entered:new Set(entered),places:PLACES,skip:null});
 it("takes the POKéMON CENTER of the save's last heal town, or one entered this run, by fewest map changes",()=>{
  expect(nearestHeal(AFTER,ctx([]),PLACES)).toEqual({kind:"pokemon_center",town:"OLDALE TOWN",map_id:[2,2],hops:4});
  const elsewhere={...AFTER,heal_before_trainers:{...facts(AFTER),last_heal:[1,1] as [number,number]}};
  expect(nearestHeal(elsewhere,ctx(["8/4"]),PLACES)).toEqual({kind:"pokemon_center",town:"PETALBURG CITY",map_id:[8,4],hops:2});
 });
 it("falls back to MOM at home when no POKéMON CENTER was entered, and only while MOM heals",()=>{
  const home={...AFTER,heal_before_trainers:{...facts(AFTER),last_heal:[1,1] as [number,number]}};
  const got=must(nearestHeal(home,ctx([]),PLACES));
  expect(got).toEqual({kind:"home",town:"LITTLEROOT TOWN",map_id:[1,0],hops:6});
  const text=healBeforeTrainersText(must(healBeforeTrainers(home,ctx([]))));
  expect(text).toMatch(/ The nearest place you have been to that heals your party is your house in LITTLEROOT TOWN \(map 1\/0\), 6 map changes from here in the game's map table, where MOM says "I think you should rest a bit\." and heals your party\.$/);
  expect(nearestHeal({...home,heal_before_trainers:{...facts(home),mom_heals:false}},ctx([]),PLACES)).toBeNull();
 });
 it("counts one map change in the singular, prefers a POKéMON CENTER to home at the same distance, and skips a place the table cannot reach",()=>{
  const next={...AFTER,map_id:[0,0] as [number,number],location:"PETALBURG CITY"};
  expect(healBeforeTrainersText(must(healBeforeTrainers(next,{entered:new Set(["8/4"]),places:PLACES,skip:null})))).toContain("the POKéMON CENTER in PETALBURG CITY (map 8/4), 1 map change from here in the game's map table;");
  const house:typeof PLACES[number]={map_id:[1,0],name:"LITTLEROOT TOWN BRENDANS HOUSE 1F",display:"HOUSE",warps:[{x:0,y:0,to:[0,19]}],connections:[]};
  const near=[...PLACES.filter(p=>p.map_id[0]!==1||p.map_id[1]!==0),house];
  expect(nearestHeal({...AFTER,heal_before_trainers:{...facts(AFTER),last_heal:null}},{entered:new Set(["8/4"])},near)).toEqual({kind:"home",town:"LITTLEROOT TOWN",map_id:[1,0],hops:1});
  const tie=[...near,{map_id:[8,4] as [number,number],name:"PETALBURG CITY POKEMON CENTER 1F",display:"C",warps:[{x:0,y:0,to:[0,19] as [number,number]}],connections:[]}];
  expect(nearestHeal({...AFTER,heal_before_trainers:{...facts(AFTER),last_heal:null}},{entered:new Set(["8/4"])},tie.filter(p=>p.name!=="PETALBURG CITY POKEMON CENTER 1F"||p.display==="C"))?.kind).toBe("pokemon_center");
  const island=PLACES.map(p=>p.name==="OLDALE TOWN POKEMON CENTER 1F"?{...p,warps:[]}:{...p,warps:p.warps.filter(w=>w.to[0]!==2||w.to[1]!==2)});
  expect(nearestHeal(AFTER,{entered:new Set()},island)?.kind).toBe("home");
 });
 it("without a map table or any healing place, says where healing is without naming a place the player has not been",()=>{
  const none={...AFTER,heal_before_trainers:{...facts(AFTER),last_heal:null,mom_heals:false}};
  expect(healBeforeTrainersText(must(healBeforeTrainers(none,{entered:new Set(),places:PLACES,skip:null})))).toMatch(/at home\. Heal before you battle: the nurse at a POKéMON CENTER heals your whole party\.$/);
  expect(healBeforeTrainersText(must(healBeforeTrainers(AFTER,{entered:new Set(),places:null,skip:null})))).toMatch(/at home\. Heal before you battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home\.$/);
 });
});

describe("the arm",()=>{
 it("replays e046: warns before the RICH_BOY, then again after that trainer battle, before the LASS; silent in between and after the whiteout",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  const out:(string|null)[]=[];
  for(const s of SEQUENCE){const f=await watch.observe(s);out.push(f===null?null:healBeforeTrainersText(f));}
  expect(out).toEqual([null,RICH_BOY_TEXT,null,null,AFTER_TEXT,null,null,null,null,null]);
 });
 it("remembers a POKéMON CENTER it saw the player in",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  const petalburg={...CENTER,map_id:[8,4] as [number,number],location:"PETALBURG CITY POKEMON CENTER 1F"};
  expect(await watch.observe(petalburg)).toBeNull();
  expect((await watch.observe(AFTER))?.heal).toEqual({kind:"pokemon_center",town:"PETALBURG CITY",map_id:[8,4],hops:2});
 });
 it("re-arms when the party is no longer weak or the player leaves the map",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  expect(await watch.observe(AFTER)).not.toBeNull();
  expect(await watch.observe(AFTER)).toBeNull();
  expect(await watch.observe(withLead(AFTER,{hp:38}))).toBeNull();
  expect(await watch.observe(AFTER)).not.toBeNull();
  expect(await watch.observe(WHITED_OUT)).toBeNull();
  expect(await watch.observe(AFTER)).not.toBeNull();
  expect(await watch.observe(undefined)).toBeNull();
 });
 it("does not re-arm on an unreadable party",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  expect(await watch.observe(AFTER)).not.toBeNull();
  expect(await watch.observe({...AFTER,party:[{...lead,hp:null,max_hp:null}]})).toBeNull();
  expect(await watch.observe(AFTER)).toBeNull();
 });
 it("names a trainer that loads later on its own: A, then A and B, warns about B only (review round 1, GPT)",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  const both={...AFTER,heal_before_trainers:{...facts(AFTER),trainers:facts(AFTER).trainers.map(t=>({...t,defeated:false}))}};
  const first=must(await watch.observe(BEFORE_RICH_BOY));
  expect(first.trainers.map(t=>t.local_id)).toEqual([25]);
  const second=must(await watch.observe(both));
  expect(second.trainers).toEqual([{local_id:3,x:31,y:24,sprite_kind:"LASS"}]);
  expect(healBeforeTrainersText(second)).toContain("A trainer you have not beaten is on this map: object 3, sprite LASS, at (31,24).");
  expect(await watch.observe(both)).toBeNull();
  expect(await watch.observe(RICH_BOY_BATTLE)).toBeNull();
  expect((await watch.observe(both))?.trainers.map(t=>t.local_id)).toEqual([3,25]);
 });
 it("a wild battle is not a trainer battle: it does not repeat the warning",async()=>{
  const watch=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  expect(await watch.observe(AFTER)).not.toBeNull();
  expect(await watch.observe({...RICH_BOY_BATTLE,trainer_opponent:{...must(RICH_BOY_BATTLE.trainer_opponent),battle_active:false}})).toBeNull();
  expect(await watch.observe(AFTER)).toBeNull();
  expect(await watch.observe(LASS_BATTLE)).toBeNull();
  expect(await watch.observe(AFTER)).not.toBeNull();
 });
 it("with low-hp-trainer-warning-v2 on, leaves a story-battle opponent (ROXANNE) to the story warning",async()=>{
  const gym:GameStateSnapshot={...AFTER,location:"RUSTBORO CITY GYM",map_id:[11,3],story:{...must(AFTER.story),roxanne_defeated:false},
   world_context:{...must(AFTER.world_context),objects:[{local_id:1,map_id:[11,3],graphics_id:125,sprite_kind:"ROXANNE",x:5,y:2}]},
   heal_before_trainers:{...facts(AFTER),trainers:[{local_id:1,x:5,y:2,graphics_id:125,sprite_kind:"ROXANNE",trainer_id:265,defeated:false},{local_id:2,x:5,y:9,graphics_id:94,sprite_kind:"YOUNGSTER",trainer_id:600,defeated:false}]}};
  const story=new HealBeforeTrainers({skipStory:true,places:()=>Promise.resolve(PLACES)});
  expect((await story.observe(gym))?.trainers).toEqual([{local_id:2,x:5,y:9,sprite_kind:"YOUNGSTER"}]);
  const alone=new HealBeforeTrainers({skipStory:false,places:()=>Promise.resolve(PLACES)});
  expect((await alone.observe(gym))?.trainers.map(t=>t.local_id)).toEqual([1,2]);
 });
});

describe("delivery",()=>{
 it("OFF: v1 and v2 exactly as before, nothing recorded for this switch and no map table read",async()=>{
  let reads=0;
  const counted={places:()=>{reads++;return Promise.resolve({places:PLACES});}};
  for(const v2 of [false,true]){
   const rec=recorder();
   const [press]=withLowHpTrainerWarning([replay("press",SEQUENCE)],{...ON,"low-hp-trainer-warning-v2":v2,[ID]:false},rec,counted);
   const texts=await run(must(press),SEQUENCE.length);
   expect(texts).toEqual(SEQUENCE.map(s=>{
    if(v2){const f=storyBattleWarning(s);return f===null?"press ok":`press ok\n${storyBattleText(f)}`;}
    const f=lowHpTrainerWarning(s);return f===null?"press ok":`press ok\n${warningText(f)}`;
   }));
   expect(rec.calls.heal).toHaveLength(0);
  }
  expect(reads).toBe(0);
 });
 it("ON: the paragraph follows the result's text, recorded once per warning with the tool name",async()=>{
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",SEQUENCE)],ON,rec,places);
  const texts=await run(must(press),SEQUENCE.length);
  expect(texts.filter(t=>t!=="press ok")).toEqual([`press ok\n${RICH_BOY_TEXT}`,`press ok\n${AFTER_TEXT}`]);
  expect(rec.calls.heal.map(c=>[c[0],c[2]])).toEqual([["press",RICH_BOY_TEXT],["press",AFTER_TEXT]]);
 });
 it("ON without a map table still warns, with the general healing sentence",async()=>{
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",[AFTER])],ON,rec,{});
  expect((await run(must(press),1))[0]).toMatch(/at home\. Heal before you battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home\.$/);
 });
 it("retries a map table read that failed, and reads a malformed table as no table",async()=>{
  let calls=0;
  const flaky={places:()=>{calls++;return calls===1?Promise.reject(new Error("down")):Promise.resolve({places:PLACES});}};
  const rec=recorder();
  const [press]=withLowHpTrainerWarning([replay("press",[AFTER,withLead(AFTER,{hp:38}),AFTER])],ON,rec,flaky);
  const texts=await run(must(press),3);
  expect(texts[0]).toMatch(/Heal before you battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home\.$/);
  expect(texts[2]).toContain("the POKéMON CENTER in OLDALE TOWN (map 2/2)");
  expect(calls).toBe(2);
  const [bad]=withLowHpTrainerWarning([replay("press",[AFTER])],ON,recorder(),{places:()=>Promise.resolve({places:"no"})});
  expect((await run(must(bad),1))[0]).toMatch(/and so does MOM at home\.$/);
 });
 it("needs a recorder that can record its event",()=>{
  expect(()=>withLowHpTrainerWarning([replay("press",[])],ON,{lowHpTrainerWarning:()=>undefined},places)).toThrow("heal_before_trainers_warning");
 });
});

describe("recorded event",()=>{
 it("is accepted by the run log and renders one SUPERVISOR tail line",()=>{
  const f=must(healBeforeTrainers(AFTER,{entered:new Set(),places:PLACES,skip:null}));
  const event={v:1,run:"r",seq:9,t:"2026-10-17T14:20:00.000-04:00",type:"heal_before_trainers_warning",turn:582,tool:"press",...f,map_id:[0,19],trainers:f.trainers.map(t=>({...t})),weak:f.weak.map(w=>({...w})),heal:f.heal===null?null:{...f.heal,map_id:[2,2]},text:healBeforeTrainersText(f)} as RunEvent;
  expect(eventProblem(event)).toBeNull();
  // heal-before-trainers-v2 records weak: [] when it names only a story opponent below full HP; trainers stay required.
  expect(eventProblem({...event,trainers:[]})).not.toBeNull();
  expect(formatEvent(event)).toBe("14:20:00 t582 SUPERVISOR heal before trainers · LASS (31,24) · TORCHIC 14/38 below half · POKéMON CENTER in OLDALE TOWN");
 });
});

describe("the pending experiment",()=>{
 it("flips only heal-before-trainers-v1 over the finals incumbent with v1 on, lists every switch, and is not queued",()=>{
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/heal-before-trainers.json",import.meta.url),"utf8")) as {incumbent:{features:Record<string,boolean>}};
  // Every switch registered when the entry was written (through instruction-ledger-v2); later ones default off.
  const historical=SWITCHABLE_FEATURES.filter(id=>id!=="rejected-movement-step-v1"&&id!=="observed-field-dialogue-v1"&&id!=="progress-aware-cycles-v1"&&id!=="gym-door-label-v1"&&id!=="caught-dex-input-v1"&&id!=="menu-refusal-recovery-v1"&&id!=="pending-field-dialogue-v1"&&id!=="short-cycle-fixed-point-v1"&&id!=="move-learn-settle-v1"&&id!=="move-learn-question-v1"&&id!=="move-learn-comparison-v1"&&id!=="effectiveness-heard-v1"&&id!=="game-said-goals-v1"&&id!=="navigation-tool-use-guard-v1"&&id!=="semantic-current-map-feedback-v1"&&id!=="navigation-refusal-reasons-v3"&&id!=="exit-labels-v3"&&id!=="story-battle-heal-first-v1"&&id!=="party-item-confirmation-v1"&&id!=="observed-instructions-v1"&&id!=="evolution-decision-v1"&&id!=="safe-navigation-strides-v1"&&id!=="battle-decision-ready-v1"&&id!=="deterministic-warp-navigation-v1"&&id!=="battle-effective-damage-v1"&&id!=="scripted-place-guidance-v1"&&id!=="trigger-script-loop-v1");
  expect(Object.keys(raw.incumbent.features)).toEqual(historical.slice(0,historical.indexOf("instruction-ledger-v2")+1));
  const entry=parseExperiment(raw);
  expect(entry.queuePosition).toBeUndefined();
  expect(entry.changedFeature).toBe(ID);
  expect(entry.activationMilestone).toBe("ROUTE_102");
  const {incumbent,candidate}=experimentArms(entry);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof typeof candidate.features]!==incumbent.features[id as keyof typeof incumbent.features])).toEqual([ID]);
  expect(incumbent.features["low-hp-trainer-warning-v1"]).toBe(true);
  expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
 });
});
