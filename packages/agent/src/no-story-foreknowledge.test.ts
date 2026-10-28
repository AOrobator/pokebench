// no-story-foreknowledge-v1 (narrow, the operator 2026-10-27): with it on, the model-facing copy names only the story characters
// the game has already shown in this run. The Story characters line stays (it stops the model placing characters that
// are not on the map), but its "Not on this map" list keeps only names the game has shown; the heal warnings keep
// their advice and use role words (your rival, the Gym Leader, a trainer, a researcher) until the game shows a name.
// Run 2026-10-21T13-33-36_qwen36-gpu1_d548 (seq 10001, turn 306) was told "a TEAM AQUA grunt. He stops you on the forest
// path when you reach the DEVON researcher" before any delivered page had shown TEAM AQUA or DEVON, and "Not on this map:
// PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN", three of which (BRENDAN, NORMAN, STEVEN) it had not
// been shown; MOM, PROF. BIRCH, MAY, WALLY and ROXANNE had been, by turns 56 to 257.
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import {checkEvent,type EventBody,type RunEvent} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {IN_GAME} from "../test-support/events.js";
import {DisprovedBeliefs} from "./disproved-beliefs.js";
import {healFirstText,type HealFirstFacts} from "./heal-first.js";
import {healBeforeTrainersV2Text,storyBattleText,warningText,withLowHpTrainerWarning,type HealBeforeTrainersFacts,type LowHpTrainerWarningFacts,type StoryBattleWarningFacts} from "./low-hp-trainer-warning.js";
import {storyCharacters} from "./people-ledger.js";
import {TRAINER_HEAL_SECTION,playSystemPrompt} from "./play-config.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {StoryCharacterGate} from "./stall-gate.js";
import {charactersLine} from "./harness-trust.js";
import {GymProgress} from "./gym-readiness.js";
import {ShownStoryNames,shownCast} from "./story-foreknowledge.js";

const ID="no-story-foreknowledge-v1" as const;
const NONE=():boolean=>false;
const ONLY=(...names:string[])=>(name:string):boolean=>names.includes(name);
const BLACKOUT="If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home.";
const HEALS="the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.";
const party=[{species:"TORCHIC",hp:28,max_hp:31}];
const story=(kind:StoryBattleWarningFacts["kind"],opponent:string,x:number|null,y:number|null):StoryBattleWarningFacts=>({kind,opponent,x,y,map_id:[24,11],party,money:3000,items:[{name:"POTION",quantity:2}]});
const TAIL=`Your party is not at full HP: TORCHIC 28/31. ${BLACKOUT} Heal to full before this battle: ${HEALS} Your BAG has POTION ×2; using one restores HP.`;

describe("low-hp-trainer-warning-v2: the story battle paragraph",()=>{
 const grunt=story("aqua_grunt","TEAM AQUA grunt",null,null),may=story("rival","MAY",10,3),roxanne=story("gym_leader","ROXANNE",5,2);
 it("OFF keeps the recorded d548 paragraph byte for byte",()=>{
  expect(storyBattleText(grunt)).toBe(`SUPERVISOR: A story battle is on this map: a TEAM AQUA grunt. He stops you on the forest path when you reach the DEVON researcher, and that trainer battle cannot be run from. ${TAIL}`);
  expect(storyBattleText(grunt,false,undefined)).toBe(storyBattleText(grunt));
 });
 it("ON keeps every sentence of advice and puts a role word where the game has not shown the name",()=>{
  expect(storyBattleText(grunt,false,NONE)).toBe(`SUPERVISOR: A story battle is on this map: a trainer. He stops you on the forest path when you reach a researcher, and that trainer battle cannot be run from. ${TAIL}`);
  expect(storyBattleText(grunt,false,ONLY("TEAM AQUA"))).toBe(`SUPERVISOR: A story battle is on this map: a TEAM AQUA grunt. He stops you on the forest path when you reach a researcher, and that trainer battle cannot be run from. ${TAIL}`);
  expect(storyBattleText(may,false,NONE)).toBe(`SUPERVISOR: A story battle is on this map: your rival, at (10,3). Talking to her starts a trainer battle you cannot run from. ${TAIL}`);
  expect(storyBattleText(roxanne,false,NONE)).toBe(`SUPERVISOR: A story battle is on this map: the Gym Leader, at (5,2). Talking to her starts a trainer battle you cannot run from. ${TAIL}`);
 });
 it("ON with every name shown is the OFF paragraph",()=>{
  for(const f of [grunt,may,roxanne])for(const factual of [false,true])expect(storyBattleText(f,factual,ONLY("TEAM AQUA","DEVON","MAY","ROXANNE"))).toBe(storyBattleText(f,factual));
 });
});

describe("low-hp-trainer-warning-v1: the Route 103 rival paragraph",()=>{
 const rival:LowHpTrainerWarningFacts={species:"TORCHIC",hp:3,max_hp:21,rival:"MAY",x:10,y:3,map_id:[0,18],money:3000,items:[{name:"POTION",quantity:1}]};
 const OFF=`SUPERVISOR: Your TORCHIC has 3/21 HP (below half), and your rival MAY is on this map at (10,3). Talking to her starts a trainer battle you cannot run from. ${BLACKOUT} Heal before you talk to her: ${HEALS} Your BAG has POTION ×1; using one on TORCHIC restores HP.`;
 it("OFF unchanged; ON says your rival until the game shows the name",()=>{
  expect(warningText(rival)).toBe(OFF);
  expect(warningText(rival,ONLY("MAY"))).toBe(OFF);
  expect(warningText(rival,NONE)).toBe(OFF.replace("your rival MAY is","your rival is"));
  expect(warningText({...rival,rival:"BRENDAN"},NONE)).toBe(OFF.replace("your rival MAY is","your rival is").replace(/\bher\b/g,"him"));
 });
});

describe("heal-before-trainers-v2: the story opponent",()=>{
 const facts:HealBeforeTrainersFacts={map_id:[11,3],trainers:[{local_id:1,x:5,y:2,sprite_kind:"ROXANNE",loaded:true,story:"ROXANNE"}],weak:[],heal:null,mom_heals:true,money:3000,hurt:party};
 it("OFF names the Gym Leader; ON drops only the name until the game shows it",()=>{
  const off=healBeforeTrainersV2Text(facts);
  expect(off).toContain("the Gym Leader ROXANNE, object 1, sprite ROXANNE, at (5,2)");
  expect(healBeforeTrainersV2Text(facts,false,ONLY("ROXANNE"))).toBe(off);
  expect(healBeforeTrainersV2Text(facts,false,NONE)).toBe(off.replace("the Gym Leader ROXANNE, ","the Gym Leader, "));
  expect(healBeforeTrainersV2Text(facts,true,NONE)).toBe(healBeforeTrainersV2Text(facts,true).replace("the Gym Leader ROXANNE, ","the Gym Leader, "));
 });
});

describe("story-battle-heal-first-v1: the lead line",()=>{
 const heard={turn:40,speaker:"MOM",person:true,place:"LITTLEROOT TOWN",map_id:[0,9] as const,text:"I think you should rest a bit."};
 const facts=(kind:HealFirstFacts["kind"],opponent:string,h:HealFirstFacts["heard"]=null):HealFirstFacts=>({kind,opponent,pronoun:kind==="rival"||kind==="gym_leader"?{object:"her",subject:"she"}:{object:"him",subject:"he"},map_id:[24,11],party,heard:h,exit:null});
 it("OFF keeps the opponent's name",()=>{
  expect(healFirstText(facts("aqua_grunt","TEAM AQUA grunt"))).toBe("TORCHIC has 28/31 HP. The TEAM AQUA grunt's battle cannot be run from, so heal before he stops you on the forest path.");
  expect(healFirstText(facts("rival","MAY",heard),false,ONLY("MAY"))).toBe(healFirstText(facts("rival","MAY",heard)));
 });
 it("ON keeps the advice and the heard heal line, with a role word for an unshown name",()=>{
  expect(healFirstText(facts("aqua_grunt","TEAM AQUA grunt"),false,NONE)).toBe("TORCHIC has 28/31 HP. The trainer's battle cannot be run from, so heal before he stops you on the forest path.");
  expect(healFirstText(facts("rival","MAY",heard),false,NONE)).toBe("TORCHIC has 28/31 HP. Your rival's battle cannot be run from, so heal before talking to her. MOM in LITTLEROOT TOWN told you: \"I think you should rest a bit.\"");
  expect(healFirstText(facts("gym_leader","ROXANNE"),false,NONE)).toBe("TORCHIC has 28/31 HP. The Gym Leader's battle cannot be run from, so heal before talking to her.");
  expect(healFirstText(facts("gym_leader","ROXANNE"),true,NONE)).toBe("TORCHIC has 28/31 HP. The Gym Leader's battle cannot be run from. HP alone does not establish whether you will win.");
  expect(healFirstText(facts("aqua_grunt","TEAM AQUA grunt"),true,NONE)).toBe("TORCHIC has 28/31 HP. The trainer's battle cannot be run from. HP alone does not establish whether you will win.");
 });
});

describe("trainer-heal-guidance-v1: the system-prompt section stays whole",()=>{
 it("keeps the rival sentence with the switch on",()=>{
  const base:FeatureSet={...ALL_ON,"trainer-heal-guidance-v1":true,"whiteout-healed-v1":false,[ID]:false};
  expect(playSystemPrompt(base,null)).toContain("Your rival usually battles you when you talk to them.");
  expect(playSystemPrompt({...base,[ID]:true},null)).toBe(playSystemPrompt(base,null));
  expect(TRAINER_HEAL_SECTION).toContain("Your rival usually battles you when you talk to them.");
 });
});

const PYTHON="Story characters here (from this map's own object list): MAY at 10,3 (navigate_to_target target 2), PROF. BIRCH (on this map, out of view). Not on this map: BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.";
const LEDGER="Story characters here: MAY at 10,3 (navigate_to_target target 2), PROF. BIRCH (on this map, out of view). Not on this map: BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN.";

describe("character presence: the Not on this map list",()=>{
 it("keeps the line and every present character, and lists only absent names the game has shown",()=>{
  const out=shownCast(["Location: ROUTE103",PYTHON,LEDGER].join("\n"),ONLY("MOM","NORMAN"));
  expect(out.split("\n")).toEqual([
   "Location: ROUTE103",
   "Story characters here (from this map's own object list): MAY at 10,3 (navigate_to_target target 2), PROF. BIRCH (on this map, out of view). Not on this map: MOM, NORMAN. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.",
   "Story characters here: MAY at 10,3 (navigate_to_target target 2), PROF. BIRCH (on this map, out of view). Not on this map: MOM, NORMAN.",
  ]);
 });
 it("says none named in dialogue yet when it has shown none of them",()=>{
  expect(shownCast("Story characters here (from this map's own object list): none. Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.",NONE))
   .toBe("Story characters here (from this map's own object list): none. Not on this map: none named in dialogue yet. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.");
  expect(shownCast("Story characters here: none. Not on this map: PROF. BIRCH, MAY.",NONE)).toBe("Story characters here: none. Not on this map: none named in dialogue yet.");
 });
 it("leaves every other line, and a line with every name shown, byte for byte",()=>{
  const text=`MAY: Hi!\nStory characters on this map (from its own object list): ROXANNE at 5,2.\n${PYTHON}`;
  expect(shownCast(text,()=>true)).toBe(text);
 });
 it("every reader of the line still parses the rewritten line the same way (review B1 of the min branch)",()=>{
  expect(storyCharacters(shownCast(PYTHON,NONE))).toEqual(storyCharacters(PYTHON));
  expect(storyCharacters(shownCast(LEDGER,NONE))).toEqual(storyCharacters(LEDGER));
  // harness-trust-v1's copy and gym-readiness' leader evidence read only the "here" list too.
  expect(charactersLine(shownCast(PYTHON,NONE))).toBe(charactersLine(PYTHON));
  const gym="Story characters here (from this map's own object list): ROXANNE at 5,2. Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, STEVEN. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.";
  const known=(text:string)=>{const g=new GymProgress();g.observe(checkEvent({v:1,run:"r",seq:1,t:"2026-10-27T20:00:00.000-04:00",type:"tool_result",turn:1,id:"c1",name:"observe",is_error:false,duration_ms:1,text:`Location: RUSTBORO CITY GYM\n${text}`,frames:[]}));return g.block({...IN_GAME,story:{...(IN_GAME.story as NonNullable<GameStateSnapshot["story"]>),rustboro_gym_complete:false,roxanne_defeated:false}});};
  expect(known(gym)).toContain("ROXANNE not defeated");
  expect(known(shownCast(gym,NONE))).toBe(known(gym));
 });
});

describe("the names the game has shown",()=>{
 let seq=0;
 const ev=(body:EventBody):RunEvent=>checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-27T20:00:00.000-04:00",...body});
 const advance=(id:string,text:string,speaker:string|null=null)=>ev({type:"dialogue_auto_advance",turn:1,tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"RUSTBORO CITY GYM",map_id:[11,3],position:{x:5,y:3},speaker,speaker_source:speaker===null?null:"name_prefix",text}],stop:"field_free",detail:"",duration_ms:1});
 const result=(id:string,is_error=false)=>ev({type:"tool_result",turn:1,id,name:"press",is_error,duration_ms:1,text:"",frames:[]});
 it("counts delivered pages, the call being written, a NAME: prefix and battle text; not an errored call's pages",()=>{
  const names=new ShownStoryNames();
  expect(names.shows("ROXANNE")).toBe(false);
  names.observe(advance("c1","I'm ROXANNE, the GYM LEADER."));
  expect(names.shows("ROXANNE")).toBe(false);
  expect(names.shows("ROXANNE","c1")).toBe(true);
  names.observe(result("c1"));
  expect(names.shows("ROXANNE")).toBe(true);
  names.observe(advance("c2","Hi!","MAY"));names.observe(result("c2",true));
  expect(names.shows("MAY")).toBe(false);
  names.observe(advance("c3","Hi!","MAY"));names.observe(result("c3"));
  expect(names.shows("MAY")).toBe(true);
  names.observe(advance("c4","TEAM AQUA GRUNT would like to battle!"));names.observe(result("c4"));
  expect(names.shows("TEAM AQUA")).toBe(true);
  // Inside a longer upper-case word is not the name.
  names.observe(advance("c5","DEVONSHIRE"));names.observe(result("c5"));
  expect(names.shows("DEVON")).toBe(false);
 });
});

describe("disproved-beliefs-v1 still reads the whole absent cast",()=>{
 let seq=0;
 const ev=(body:Record<string,unknown>,turn=1):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-27T20:00:00.000-04:00",seq:++seq,turn,...body});
 const story={name_confirmed:true,intro_stage:7,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:true,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
 const FILTERED="Story characters here (from this map's own object list): none. Not on this map: none named in dialogue yet. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.";
 const run=(on:boolean)=>{
  const l=new DisprovedBeliefs({...ALL_ON,[ID]:on});
  l.observe(ev({type:"tool_call",id:"o1",name:"observe",args:{}}));
  const s=ev({type:"state",...IN_GAME,location:"LAB",map_id:[1,4],position:{x:5,y:5},facing:"up",field_controls_locked:false,story,world_context:{objects:[],triggers:[],dialogue:null}});
  l.observe(s);
  l.observe(ev({type:"tool_result",id:"o1",name:"observe",is_error:false,duration_ms:1,text:FILTERED,frames:[],state_seq:s.seq}));
  l.observe(ev({type:"assistant",thinking:"Prof. Birch is at (3,3).",text:"",tool_calls:[{id:"a2",name:"navigate_to",args:{x:3,y:3,map_id:[1,4]}}],usage:{input:1,output:1,cache_read:0},latency_ms:1,ttft_ms:1,stop_reason:"toolUse"},2));
  return l.text();
 };
 it("with the switch on, a model that places an unshown character still gets the entry",()=>{
  expect(run(false)).toBeNull();
  expect(run(true)).toContain("- PROF. BIRCH on LAB (map 1/4)");
 });
});

describe("registry and factory",()=>{
 it("is a default-off agent-side observation switch appended last",()=>{
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true,title:"NO STORY FOREKNOWLEDGE"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  const without=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(normalizeFeatures({...without,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });

 // The production game tools over a recorder fan-out; ROUTE103 with MAY loaded at (10,3).
 const ROUTE103:GameStateSnapshot={...IN_GAME,location:"ROUTE103",map_id:[0,18],position:{x:14,y:10},facing:"up",interaction_targets:[{kind:"object",name:"RIVAL_MAY_NORMAL",x:10,y:3,elevation:3,activation:"A",availability:"live",facing:"down",local_id:2,destination:null}]};
 const LINE="Story characters here (from this map's own object list): MAY at 10,3. Not on this map: PROF. BIRCH, BRENDAN, MOM. Sprite kinds such as SCIENTIST_1 or FAT_MAN are not these characters.";
 async function play(on:boolean,before:readonly EventBody[]=[]):Promise<string> {
  const subscribers:((e:RunEvent)=>void)[]=[];
  let seq=0;
  const send=(body:EventBody)=>{const e=checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-27T20:00:00.000-04:00",...body});for(const s of subscribers)s(e);};
  const result=():AgentToolResult<unknown>=>({content:[{type:"text",text:`Screen: overworld\n${LINE}`}],details:{state:ROUTE103}});
  const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve(result())};
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const features:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),[ID]:on};
  const tool=playGameTools([observe],features,{read:()=>Promise.resolve(ROUTE103)},recorder).find(t=>t.name==="observe");
  if(tool===undefined)throw new Error("observe missing");
  for(const body of before)send(body);
  return (await tool.execute("c9",{})).content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
 }
 const heardMom:EventBody[]=[
  {type:"dialogue_auto_advance",turn:1,tool_call_id:"c1",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"LITTLEROOT TOWN",map_id:[0,9],position:{x:5,y:3},speaker:"MOM",speaker_source:"name_prefix",text:"MOM: We're here, honey!"}],stop:"field_free",detail:"",duration_ms:1},
  {type:"tool_result",turn:1,id:"c1",name:"press",is_error:false,duration_ms:1,text:"",frames:[]},
 ];
 it("the production game tools filter the list only with the switch on",async()=>{
  expect(await play(false)).toContain(LINE);
  expect(await play(true)).toContain(LINE.replace("PROF. BIRCH, BRENDAN, MOM","none named in dialogue yet"));
  expect(await play(true,heardMom)).toContain(LINE.replace("PROF. BIRCH, BRENDAN, MOM","MOM"));
 });
 it("story-character-stall-gate-v1 records the same roster from the recorded ON result (the min branch's B1)",async()=>{
  for(const on of [false,true]){
   const text=await play(on);
   expect(storyCharacters(text)).toEqual([{name:"MAY",tile:{x:10,y:3},text:"MAY at 10,3"}]);
   let seq=0;
   const ev=(body:EventBody):RunEvent=>checkEvent({v:1,run:"r",seq:++seq,t:"2026-10-27T20:00:00.000-04:00",...body});
   const gate=new StoryCharacterGate({recordStallGate:()=>undefined});
   const state=ev({type:"state",turn:1,...ROUTE103});
   gate.observe(state);
   gate.observe(ev({type:"tool_result",turn:1,id:"c9",name:"observe",is_error:false,duration_ms:1,text,frames:[],state_seq:state.seq}));
   expect(gate.holds()).toEqual({reason:"untalked",character:"MAY",map_id:[0,18]});
   expect(gate.untalked()).toEqual(["MAY at 10,3"]);
  }
 });
 // coherent-healing-feedback-v1 (on in the current recipe's bundle arm) names the story opponent in its own clause.
 it("coherent healing keeps \"trainer battle\" and swaps only the name (54a7 T363)",async()=>{
  const fixture=JSON.parse(readFileSync(new URL("../test-support/trainer-heal-54a7.json",import.meta.url),"utf8")) as {harness_features:string[];states:{turn:number;state:unknown}[]};
  const state=parseGameState(fixture.states.find(s=>s.turn===363)?.state);
  const tool:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Screen: overworld"}],details:{state}})};
  const texts:string[]=[];
  const recorder={lowHpTrainerWarning:()=>undefined,storyBattleWarning:(_:string,__:unknown,text:string)=>{texts.push(text);}};
  const features:FeatureSet={...featuresOf(fixture.harness_features),"low-hp-trainer-warning-v1":true,"low-hp-trainer-warning-v2":true,"coherent-healing-feedback-v1":true,"heal-before-trainers-v1":false,"gym-heal-warning-v1":false};
  const names=new ShownStoryNames();
  for(const [on,id] of [[true,"c1"],[false,"c2"]] as const)await withLowHpTrainerWarning([tool],{...features,[ID]:on},recorder,{},undefined,names)[0]?.execute(id,{});
  expect(texts[1]).toContain(" MAY's trainer battle cannot be run from. ");
  expect(texts[0]).toBe(texts[1]?.replace(" MAY's trainer battle"," Your rival's trainer battle"));
 });
 // Run 2026-10-16T04-51-03_qwen36-gpu0_54a7 T363: TORCHIC at 3/21 HP with MAY at (10,3) on Route 103.
 it("the warnings in the production chain use role words until the game shows the name (54a7 T363)",async()=>{
  const fixture=JSON.parse(readFileSync(new URL("../test-support/trainer-heal-54a7.json",import.meta.url),"utf8")) as {harness_features:string[];states:{turn:number;state:unknown}[]};
  const state=parseGameState(fixture.states.find(s=>s.turn===363)?.state);
  const tool:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Screen: overworld"}],details:{state}})};
  const texts:string[]=[];
  const recorder={lowHpTrainerWarning:(_:string,__:unknown,text:string)=>{texts.push(text);}};
  const features:FeatureSet={...featuresOf(fixture.harness_features),"low-hp-trainer-warning-v1":true};
  const names=new ShownStoryNames();
  for(const [on,id] of [[true,"c1"],[false,"c2"]] as const)await withLowHpTrainerWarning([tool],{...features,[ID]:on},recorder,{},undefined,names)[0]?.execute(id,{});
  expect(texts[0]).toContain("and your rival is on this map at (10,3).");
  expect(texts[1]).toContain("and your rival MAY is on this map at (10,3).");
  names.observe(checkEvent({v:1,run:"r",seq:1,t:"2026-10-27T20:00:00.000-04:00",type:"dialogue_auto_advance",turn:1,tool_call_id:"c3",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"ROUTE103",map_id:[0,18],position:{x:10,y:4},speaker:"MAY",speaker_source:"name_prefix",text:"MAY: Hi!"}],stop:"field_free",detail:"",duration_ms:1}));
  await withLowHpTrainerWarning([tool],{...features,[ID]:true},recorder,{},undefined,names)[0]?.execute("c3",{});
  expect(texts[2]).toBe(texts[1]);
 });
});
