import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { COVERAGE_HEADER, PartyCoverage, SAID_HEADER, SaidTypeMatches, TYPE_NAMES } from "./catching-block.js";
import type { RunEvent } from "./events.js";
import { ALL_ON, type FeatureSet } from "./features.js";
import type { GameStateSnapshot } from "./game-state.js";
import { playGameTools } from "./play-wiring.js";

// Run 2026-10-21T02-26-37_qwen36-gpu1_6abf (control arm), whole run, state events slimmed to the fields the folds
// read, every dialogue_auto_advance and milestone event: the RUSTBORO GYM GUIDE's ROCK/WATER/GRASS lines (turn 689),
// four ROXANNE losses, and a wild SHROOMISH (ABSORB, STUN SPORE) on its first battle decision at seq 30081.
const EVENTS=gunzipSync(readFileSync(new URL("./fixtures/catching-6abf.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
type State=Extract<RunEvent,{type:"state";started:boolean}>;
const states=EVENTS.filter((e):e is State=>e.type==="state"&&"started" in e);
const at=(seq:number):GameStateSnapshot=>{const s=states.find(x=>x.seq===seq);if(s===undefined)throw new Error(String(seq));return s;};
const SHROOMISH=30081;
const GUIDE='"The ROCK type is very durable, but it can\'t stand WATER-type and GRASS-type moves."';
function feed<T extends {observe(e:RunEvent):void}>(fold:T,upTo:number):T{for(const e of EVENTS)if(e.seq<=upTo)fold.observe(e);return fold;}
const decisionAfter=(seq:number,pred:(s:State)=>boolean):State=>{const s=states.find(x=>x.seq>seq&&x.in_battle&&x.battle?.ready===true&&pred(x));if(s===undefined)throw new Error("fixture");return s;};

describe("party-coverage-v1",()=>{
 it("lists, by foe type, each move's uses and the effectiveness line the game printed, then the types with no super effective hit",()=>{
  expect(feed(new PartyCoverage(),SHROOMISH).block(at(SHROOMISH))).toBe([
   COVERAGE_HEADER,
   "- BUG (WURMPLE, CASCOON): EMBER used 1, \"It's super effective!\" 1; SCRATCH used 18 (no effectiveness line printed)",
   "- WATER (MUDKIP, MARILL, MAGIKARP): EMBER used 6, \"It's not very effective…\" 6; SCRATCH used 7 (no effectiveness line printed)",
   "- GRASS (SHROOMISH): SCRATCH used 3 (no effectiveness line printed)",
   "- ROCK/GROUND (GEODUDE): EMBER used 11, \"It's not very effective…\" 11; SCRATCH used 4, \"It's not very effective…\" 4",
   "- Foe types met this run that none of your moves has drawn \"It's super effective!\" against: NORMAL, DARK, WATER/FLYING, WATER, NORMAL/FLYING, PSYCHIC, GRASS, ROCK/GROUND, FIGHTING",
  ].join("\n"));
 });
 it("shows at battle decisions only",()=>{
  const fold=feed(new PartyCoverage(),SHROOMISH);
  const fieldState=states.find(s=>s.seq<SHROOMISH&&s.screen==="overworld"&&!s.in_battle);
  if(fieldState===undefined)throw new Error("fixture");
  expect(fold.block(fieldState as unknown as GameStateSnapshot)).toBeNull();
  expect(new PartyCoverage().block(at(SHROOMISH))).toBeNull();
 });
 it("counts only the player's own POKéMON in single battles",()=>{
  const fold=new PartyCoverage();
  const tutorial=states.filter(s=>s.party_owner!=="player").map(s=>s.seq);
  expect(tutorial.length).toBeGreaterThan(0);
  feed(fold,SHROOMISH);
  expect(fold.block(at(SHROOMISH))).not.toContain("TACKLE");
 });
 it("names the game's types in the battle readout's own words",()=>{
  expect(TYPE_NAMES).toEqual(["NORMAL","FIGHTING","FLYING","POISON","GROUND","ROCK","BUG","GHOST","STEEL","???","FIRE","WATER","GRASS","ELECTRIC","PSYCHIC","ICE","DRAGON","DARK"]);
 });
});

describe("said-type-matches-v1",()=>{
 it("marks the foe's type and moves the gym guide's lines name, quoting them with the map",()=>{
  expect(feed(new SaidTypeMatches(),SHROOMISH).block(at(SHROOMISH))).toBe([
   SAID_HEADER,
   `- Foe SHROOMISH (GRASS): SHROOMISH is GRASS-type, ABSORB is GRASS-type, STUN SPORE is GRASS-type — said on RUSTBORO CITY GYM: ${GUIDE}`,
  ].join("\n"));
 });
 it("names ROXANNE's GEODUDE and its ROCK moves after the guide",()=>{
  const fold=feed(new SaidTypeMatches(),SHROOMISH);
  const roxanne=decisionAfter(26000,s=>s.trainer_opponent?.name==="ROXANNE"&&s.battle?.battlers?.some(b=>b.position%2===1&&b.moves.some(m=>m.name==="ROCK TOMB"))===true);
  expect(fold.block(roxanne as unknown as GameStateSnapshot)).toContain("- Foe GEODUDE (ROCK/GROUND): GEODUDE is ROCK-type, ROCK THROW is ROCK-type, ROCK TOMB is ROCK-type — said on RUSTBORO CITY GYM: \"ROXANNE, the GYM LEADER, is a user of ROCK-type POKéMON.\"");
 });
 it("says nothing before the game has printed a type line",()=>{
  const guide=EVENTS.find(e=>e.type==="dialogue_auto_advance"&&JSON.stringify(e).includes("WATER-type"));
  if(guide===undefined)throw new Error("fixture");
  const early=decisionAfter(0,s=>s.seq<guide.seq&&s.battle?.battlers?.some(b=>b.species==="WINGULL")===true);
  expect(feed(new SaidTypeMatches(),guide.seq-1).block(early as unknown as GameStateSnapshot)).toBeNull();
  expect(feed(new SaidTypeMatches(),SHROOMISH).block(early as unknown as GameStateSnapshot)).toContain("WATER GUN is WATER-type");
 });
 it("shows at battle decisions only",()=>{
  const fieldState=states.find(s=>s.seq>SHROOMISH&&s.screen==="overworld"&&!s.in_battle);
  if(fieldState===undefined)throw new Error("fixture");
  expect(feed(new SaidTypeMatches(),SHROOMISH).block(fieldState as unknown as GameStateSnapshot)).toBeNull();
 });
});

describe("guards on what the catching folds read",()=>{
 const decisionState=at(SHROOMISH);
 const wildSeq=SHROOMISH;
 it("party coverage ignores battles fought with someone else's POKéMON",()=>{
  const fold=new PartyCoverage();
  const base=states.find(s=>s.seq===wildSeq);if(base===undefined)throw new Error("fixture");
  fold.observe({...base,seq:1,party_owner:"tutorial"} as unknown as RunEvent);
  const lead=base.battle?.battlers?.find(b=>b.position%2===0)?.species??"";
  fold.observe({type:"dialogue_auto_advance",seq:2,turn:1,pages:[{state_seq:1,text:`${lead} used\nSCRATCH!`,battle_turn:1,battle_message_id:1,map:null,map_id:null,position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  expect(fold.block(decisionState)??"").not.toContain("SCRATCH used");
  const own=new PartyCoverage();
  own.observe({...base,seq:1});
  own.observe({type:"dialogue_auto_advance",seq:2,turn:1,pages:[{state_seq:1,text:`${lead} used\nSCRATCH!`,battle_turn:1,battle_message_id:1,map:null,map_id:null,position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  expect(own.block(decisionState)).toContain("SCRATCH used 1");
 });
 it("party coverage keeps attributing after more states than it remembers",()=>{
  const fold=new PartyCoverage();
  const base=states.find(s=>s.seq===wildSeq);if(base===undefined)throw new Error("fixture");
  for(let i=0;i<600;i+=1)fold.observe({...base,seq:1_000_000+i});
  const lead=base.battle?.battlers?.find(b=>b.position%2===0)?.species??"";
  fold.observe({type:"dialogue_auto_advance",seq:3_000_000,turn:1,pages:[{state_seq:1_000_000,text:`${lead} used\nGROWL!`,battle_turn:1,battle_message_id:1,map:null,map_id:null,position:null,speaker:null,speaker_source:null},{state_seq:1_000_599,text:`${lead} used\nSCRATCH!`,battle_turn:1,battle_message_id:2,map:null,map_id:null,position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  const text=fold.block(decisionState)??"";
  expect(text).toContain("SCRATCH used 1");
  expect(text).not.toContain("GROWL");
 });
 it("party coverage keeps a move's effectiveness line that arrives in the next auto-advance call",()=>{
  const base=states.find(s=>s.seq===wildSeq);if(base===undefined)throw new Error("fixture");
  const lead=base.battle?.battlers?.find(b=>b.position%2===0)?.species??"";
  const page=(text:string,id:number)=>({state_seq:1,text,battle_turn:2,battle_message_id:id,map:null,map_id:null,position:null,speaker:null,speaker_source:null});
  const split=new PartyCoverage();
  split.observe({...base,seq:1});
  split.observe({type:"dialogue_auto_advance",seq:2,turn:1,pages:[page(`${lead} used\nEMBER!`,1)]} as unknown as RunEvent);
  split.observe({type:"dialogue_auto_advance",seq:3,turn:2,pages:[page("It's super effective!",2)]} as unknown as RunEvent);
  expect(split.block(decisionState)).toContain("EMBER used 1, \"It's super effective!\" 1");
  const ended=new PartyCoverage();
  ended.observe({...base,seq:1});
  ended.observe({type:"dialogue_auto_advance",seq:2,turn:1,pages:[page(`${lead} used\nEMBER!`,1)]} as unknown as RunEvent);
  ended.observe({...base,seq:3,in_battle:false,screen:"overworld"});
  ended.observe({type:"dialogue_auto_advance",seq:4,turn:2,pages:[page("It's super effective!",2)]} as unknown as RunEvent);
  expect(ended.block(decisionState)).toContain("EMBER used 1 (no effectiveness line printed)");
 });
 it("said-type matches keep field pages only, never battle text",()=>{
  const fold=new SaidTypeMatches();
  fold.observe({type:"dialogue_auto_advance",seq:1,turn:1,pages:[{state_seq:null,text:"It can't stand GRASS-type moves.",battle_turn:1,battle_message_id:1,map:"ROUTE104",map_id:[0,19],position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  expect(fold.block(decisionState)).toBeNull();
  fold.observe({type:"dialogue_auto_advance",seq:2,turn:1,pages:[{state_seq:null,text:"It can't stand GRASS-type moves.",map:"ROUTE104",map_id:[0,19],position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  expect(fold.block(decisionState)).toContain("said on ROUTE104");
 });
 it("said-type matches wait for a ready battle decision",()=>{
  const fold=feed(new SaidTypeMatches(),SHROOMISH);
  const busy={...decisionState,battle:{...decisionState.battle,ready:false}} as unknown as GameStateSnapshot;
  expect(fold.block(busy)).toBeNull();
 });
});

describe("the catching blocks say nothing that tells the model what to do",()=>{
 it("has no advice words",()=>{
  const text=[feed(new PartyCoverage(),SHROOMISH).block(at(SHROOMISH)),feed(new SaidTypeMatches(),SHROOMISH).block(at(SHROOMISH))].join("\n");
  expect(text).not.toMatch(/\b(should|recommend|catch|evolve|go to|need to|must|try)\b/i);
 });
});

describe("production wiring of party-coverage-v1 and said-type-matches-v1",()=>{
 async function run(features:Partial<FeatureSet>):Promise<string[]> {
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
  const state=at(SHROOMISH);
  const observe:AgentTool={name:"observe",label:"Observe",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"Screen: battle"}],details:{state}})};
  const press={name:"press",label:"Press",description:"d",parameters:{},execute:()=>Promise.reject(new Error("unused")),executeChecked:()=>Promise.reject(new Error("unused"))} as unknown as AgentTool;
  const base:FeatureSet={...ALL_ON,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"navigate-first-prompt-v1":false,"harness-trust-v1":false,"story-destinations-v1":false,"full-map-navigation-v1":false,"cited-destination-v1":false,"battle-move-tool-v1":false,"unfinished-activity-v1":false,"battle-loss-recap-v1":false,"low-hp-trainer-warning-v1":false,"story-battle-heal-gate-v1":false,"trainer-sight-check-v1":false,"visited-terrain-navigation-v1":false,"semantic-navigation-v2":false,"instruction-ledger-v2":false,"people-ledger-v1":false,"people-id-cards-v1":false,"untaken-exits-v1":false,"gym-readiness-readout-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"heal-before-trainers-v1":false,"heal-before-trainers-v2":false,"bag-healing-items-v1":false,"starter-decision-salience-v1":false,"story-battle-heal-first-v1":false,"pending-field-dialogue-v1":false,"effectiveness-heard-v1":false,"game-said-goals-v1":false,"exp-next-level-v1":false,"exp-earned-ledger-v1":false,"leader-attempt-ledger-v1":false,"seen-trainers-ledger-v1":false,"pokedex-own-v1":false,"party-coverage-v1":false,"said-type-matches-v1":false,...features};
  const tools=playGameTools([observe,press],base,{read:()=>Promise.reject(new Error("unused")),places:()=>Promise.resolve({places:[]})},recorder);
  for(const e of EVENTS)if(e.seq<=SHROOMISH)for(const o of observers)o(e);
  const tool=tools.find(t=>t.name==="observe");if(tool===undefined)throw new Error("observe");
  const r:AgentToolResult<unknown>=await tool.execute("id",{});
  return r.content.flatMap(c=>c.type==="text"?[c.text]:[]);
 }
 it("ON appends each block to a battle decision's observe result; OFF adds nothing",async()=>{
  const both=await run({"party-coverage-v1":true,"said-type-matches-v1":true});
  expect(both).toHaveLength(3);
  expect(both[0]).toBe("Screen: battle");
  expect(both.slice(1).map(t=>t.split("\n")[0]).sort()).toEqual([COVERAGE_HEADER,SAID_HEADER].sort());
  expect(await run({"party-coverage-v1":true})).toHaveLength(2);
  expect(await run({"said-type-matches-v1":true})).toHaveLength(2);
  expect(await run({})).toEqual(["Screen: battle"]);
 });
});
