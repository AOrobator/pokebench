import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "./events.js";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, type FeatureSet } from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import type { GameStateSnapshot } from "./game-state.js";
import { playGameTools } from "./play-wiring.js";
import { TRAINING_HEADER, TrainingBlock } from "./training-block.js";

// Run 2026-10-21T04-27-11_qwen36-gpu1_fd95 (bundle arm), whole run, state events slimmed to the fields the folds
// read, every dialogue_auto_advance and milestone event: three ROXANNE losses (turns 501, 538, 591), JOSH, TOMMY
// and MARC beaten in between, and every "… gained … EXP. Points!" page the model was shown.
const EVENTS=gunzipSync(readFileSync(new URL("./fixtures/training-fd95.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
type State=Extract<RunEvent,{type:"state";started:boolean}>;
const states=EVENTS.filter((e):e is State=>e.type==="state"&&"started" in e);
const at=(seq:number):GameStateSnapshot=>{const s=states.find(x=>x.seq===seq);if(s===undefined)throw new Error(String(seq));return s;};
// The last field state on RUSTBORO CITY GYM before the third ROXANNE battle.
const GYM_FIELD=24150;
const LEDGERS:Partial<FeatureSet>={"exp-next-level-v1":true,"exp-earned-ledger-v1":true,"leader-attempt-ledger-v1":true,"seen-trainers-ledger-v1":true};
const only=(on:Partial<FeatureSet>):FeatureSet=>({...ALL_ON,"exp-next-level-v1":false,"exp-earned-ledger-v1":false,"leader-attempt-ledger-v1":false,"seen-trainers-ledger-v1":false,...on});

function fed(features:FeatureSet,upTo=GYM_FIELD):TrainingBlock {
 const block=new TrainingBlock(features);
 for(const e of EVENTS)if(e.seq<=upTo)block.observe(e);
 return block;
}
const withNext=(s:GameStateSnapshot):GameStateSnapshot=>({...s,party_next_level:[355,6]});

const PARTY="- Party: TORCHIC Lv15 · EXP. POINTS 2180 · NEXT LV. 355; POOCHYENA Lv4 · EXP. POINTS 119 · NEXT LV. 6";
const EXP_HEAD="- EXP. Points the game printed (its \"… gained … EXP. Points!\" pages), the last 10 battles that printed any, oldest first:";
const LEADER=[
 "- Battles with GYM LEADER ROXANNE this run:",
 "  1. turn 501: TORCHIC Lv13 EXP. POINTS 1592, POOCHYENA Lv4 EXP. POINTS 119 · BAG POKé BALL ×4, GREAT BALL ×1 · ROXANNE's POKéMON: GEODUDE Lv12 HP 13/33 · you lost · money ₽6920 → ₽3460",
 "  2. turn 538: TORCHIC Lv15 EXP. POINTS 2180, POOCHYENA Lv4 EXP. POINTS 119 · BAG POKé BALL ×4, GREAT BALL ×1 · ROXANNE's POKéMON: GEODUDE Lv12 HP 2/33 · you lost · money ₽3908 → ₽1954",
 "  Now: TORCHIC Lv15 EXP. POINTS 2180, POOCHYENA Lv4 EXP. POINTS 119 · BAG WAILMER PAIL ×1, POKé BALL ×4, GREAT BALL ×1 · money ₽1954",
];

describe("training block (exp-next-level-v1, exp-earned-ledger-v1, leader-attempt-ledger-v1, seen-trainers-ledger-v1)",()=>{
 it("lays the four parts out under one header on the gym field",()=>{
  const lines=(fed(only(LEDGERS)).block(withNext(at(GYM_FIELD)))??"").split("\n");
  expect(lines[0]).toBe(TRAINING_HEADER);
  expect(lines[1]).toBe(PARTY);
  expect(lines[2]).toBe(EXP_HEAD);
  expect(lines.slice(3,13)).toEqual([
   "  turn 409 · LYLE (trainer) on PETALBURG WOODS: TORCHIC 34, TORCHIC 34, TORCHIC 34, TORCHIC 34",
   "  turn 419 · wild POOCHYENA Lv6 on PETALBURG WOODS: TORCHIC 47",
   "  turn 443 · GRUNT (trainer) on PETALBURG WOODS: TORCHIC 105",
   "  turn 447 · wild SLAKOTH Lv5 on PETALBURG WOODS: TORCHIC 59",
   "  turn 451 · JAMES (trainer) on PETALBURG WOODS: TORCHIC 82, TORCHIC 82",
   "  turn 462 · WINSTON (trainer) on ROUTE104: TORCHIC 90",
   "  turn 467 · GINA & MIA (trainer) on ROUTE104: TORCHIC 46, POOCHYENA 46, TORCHIC 46, POOCHYENA 46",
   "  turn 491 · JOSH (trainer) on RUSTBORO CITY GYM: TORCHIC 183",
   "  turn 517 · TOMMY (trainer) on RUSTBORO CITY GYM: TORCHIC 147, TORCHIC 147",
   "  turn 525 · MARC (trainer) on RUSTBORO CITY GYM: TORCHIC 147, TORCHIC 147",
  ]);
  expect(lines[13]).toBe("  Per page this run: trainer battles 34–183 · wild POKéMON 15–59");
  expect(lines.slice(14,18)).toEqual(LEADER);
  expect(lines[18]).toBe("- Trainers the readout listed on maps you stood on this run (the game's trainer flags):");
  expect(lines.filter(l=>/^ {2}ROUTE102: LASS at \(\d+,\d+\) not beaten; 3 beaten \(CALVIN, RICK, ALLEN\)$/.test(l))).toHaveLength(1);
  expect(lines).toContain("  PETALBURG WOODS: 2 beaten (LYLE, JAMES)");
  expect(lines).toContain("  RUSTBORO CITY GYM: ROXANNE battled, not beaten; 3 beaten (JOSH, TOMMY, MARC)");
  expect(lines.filter(l=>l.startsWith("  ROUTE101")||l.startsWith("  LITTLEROOT"))).toEqual([]);
 });
 it("each switch alone adds only its own part",()=>{
  const gym=withNext(at(GYM_FIELD));
  expect(fed(only({"exp-next-level-v1":true})).block(gym)).toBe(`${TRAINING_HEADER}\n${PARTY}`);
  const exp=fed(only({"exp-earned-ledger-v1":true})).block(gym)??"";
  expect(exp.split("\n")[1]).toBe(EXP_HEAD);
  expect(exp).not.toContain("NEXT LV.");
  expect(fed(only({"leader-attempt-ledger-v1":true})).block(gym)).toBe([TRAINING_HEADER,...LEADER].join("\n"));
  const seen=fed(only({"seen-trainers-ledger-v1":true})).block(gym)??"";
  expect(seen.split("\n")[1]).toBe("- Trainers the readout listed on maps you stood on this run (the game's trainer flags):");
  expect(fed(only({})).block(gym)).toBeNull();
 });
 it("party line needs the server's NEXT LV. numbers",()=>{
  expect(fed(only({"exp-next-level-v1":true})).block(at(GYM_FIELD))).toBeNull();
 });
 it("shows on the field only; the leader part also at a battle decision against the leader",()=>{
  const block=fed(only(LEDGERS),24400);
  const decision=states.find(s=>s.seq>GYM_FIELD&&s.in_battle&&s.trainer_opponent?.battle_active===true&&s.battle?.ready===true);
  if(decision===undefined)throw new Error("fixture");
  const text=block.block(decision)??"";
  expect(text.split("\n")[0]).toBe(TRAINING_HEADER);
  expect(text).toContain("- Battles with GYM LEADER ROXANNE this run:");
  expect(text).not.toContain("EXP. Points the game printed");
  expect(text).not.toContain("Trainers the readout listed");
  const wild=states.find(s=>s.in_battle&&s.trainer_opponent?.battle_active!==true&&s.battle?.ready===true);
  if(wild===undefined)throw new Error("fixture");
  expect(block.block(wild as unknown as GameStateSnapshot)).toBeNull();
  expect(block.block({...at(GYM_FIELD),started:false})).toBeNull();
 });
 it("names the leader by name, whoever the leader is",()=>{
  const renamed=EVENTS.map<RunEvent>(e=>e.type==="state"&&"started" in e&&e.trainer_opponent?.name==="ROXANNE"?{...e,trainer_opponent:{...e.trainer_opponent,name:"BRAWLY"}}:e);
  const block=new TrainingBlock(only({"leader-attempt-ledger-v1":true}));
  for(const e of renamed)if(e.seq<=GYM_FIELD)block.observe(e);
  const text=block.block(at(GYM_FIELD))??"";
  expect(text).toContain("- Battles with GYM LEADER BRAWLY this run:");
  expect(text).toContain("· BRAWLY's POKéMON: GEODUDE Lv12 HP 13/33 ·");
  expect(text).not.toMatch(/\bher\b/);
 });
 it("a trainer battle whose opponent was not read is never counted as wild",()=>{
  const block=new TrainingBlock(only({"exp-earned-ledger-v1":true}));
  const trainerBattle=states.find(s=>s.in_battle&&s.trainer_opponent?.name==="ROXANNE");
  const fieldState=states.find(s=>s.screen==="overworld"&&!s.in_battle&&s.started);
  if(trainerBattle===undefined||fieldState===undefined)throw new Error("fixture");
  block.observe({...fieldState,seq:1});
  block.observe({...trainerBattle,seq:2,trainer_opponent:null,battle:{...trainerBattle.battle,battle_type:8}} as RunEvent);
  block.observe({type:"dialogue_auto_advance",seq:3,turn:7,pages:[{state_seq:2,text:"TORCHIC gained\n220 EXP. Points!",battle_turn:1,battle_message_id:1,map:null,map_id:null,position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  const text=block.block(at(GYM_FIELD))??"";
  expect(text).toContain("turn 7 · a trainer (name not read) on RUSTBORO CITY GYM: TORCHIC 220");
  expect(text).toContain("Per page this run: trainer battles 220–220 · wild POKéMON none yet");
 });
 it("keeps attributing pages after more battle states than it remembers",()=>{
  const block=new TrainingBlock(only({"exp-earned-ledger-v1":true}));
  const battle=states.find(s=>s.in_battle&&s.trainer_opponent?.battle_active!==true&&(s.battle?.battlers?.length??0)>1);
  if(battle===undefined)throw new Error("fixture");
  for(let i=0;i<600;i+=1)block.observe({...battle,seq:1_000_000+i});
  block.observe({type:"dialogue_auto_advance",seq:2_000_000,turn:900,pages:[{state_seq:1_000_599,text:"TORCHIC gained\n41 EXP. Points!",battle_turn:1,battle_message_id:1,map:null,map_id:null,position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  block.observe({type:"dialogue_auto_advance",seq:2_000_001,turn:900,pages:[{state_seq:1_000_000,text:"TORCHIC gained\n99 EXP. Points!",battle_turn:1,battle_message_id:2,map:null,map_id:null,position:null,speaker:null,speaker_source:null}]} as unknown as RunEvent);
  const text=block.block(at(GYM_FIELD))??"";
  expect(text).toContain("TORCHIC 41");
  expect(text).not.toContain("TORCHIC 99");
 });
 it("off the gym, the leader part is left out",()=>{
  const route=states.find(s=>s.seq<GYM_FIELD&&s.location==="ROUTE104"&&s.screen==="overworld"&&!s.in_battle);
  if(route===undefined)throw new Error("fixture");
  expect(fed(only({"leader-attempt-ledger-v1":true})).block(route as unknown as GameStateSnapshot)).toBeNull();
 });
 it("a page whose state was not recorded is dropped, not guessed",()=>{
  const block=new TrainingBlock(only({"exp-earned-ledger-v1":true}));
  block.observe({...EVENTS.find(e=>e.type==="dialogue_auto_advance"&&JSON.stringify(e).includes("EXP. Points"))} as RunEvent);
  expect(block.block(at(GYM_FIELD))).toBeNull();
 });
 it("says nothing that tells the model what to do",()=>{
  const text=fed(only(LEDGERS),states.at(-1)?.seq).block(withNext(at(GYM_FIELD)))??"";
  expect(text).not.toMatch(/\b(should|recommend|evolve|go to|need to|must|try)\b/i);
 });
});

describe("production wiring of the training block",()=>{
 async function run(features:Partial<FeatureSet>):Promise<string[]> {
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
  const state=withNext(at(GYM_FIELD));
  const observe:AgentTool={name:"observe",label:"Observe",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"Screen: overworld"}],details:{state}})};
  const press={name:"press",label:"Press",description:"d",parameters:{},execute:()=>Promise.reject(new Error("unused")),executeChecked:()=>Promise.reject(new Error("unused"))} as unknown as AgentTool;
  const base:FeatureSet={...only({}),"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"navigate-first-prompt-v1":false,"harness-trust-v1":false,"story-destinations-v1":false,"full-map-navigation-v1":false,"cited-destination-v1":false,"battle-move-tool-v1":false,"unfinished-activity-v1":false,"battle-loss-recap-v1":false,"low-hp-trainer-warning-v1":false,"story-battle-heal-gate-v1":false,"trainer-sight-check-v1":false,"visited-terrain-navigation-v1":false,"semantic-navigation-v2":false,"instruction-ledger-v2":false,"people-ledger-v1":false,"people-id-cards-v1":false,"untaken-exits-v1":false,"gym-readiness-readout-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"heal-before-trainers-v1":false,"heal-before-trainers-v2":false,"bag-healing-items-v1":false,"starter-decision-salience-v1":false,"story-battle-heal-first-v1":false,"pending-field-dialogue-v1":false,"effectiveness-heard-v1":false,"game-said-goals-v1":false,"party-coverage-v1":false,"said-type-matches-v1":false,"pokedex-own-v1":false,...features};
  const tools=playGameTools([observe,press],base,{read:()=>Promise.reject(new Error("unused")),places:()=>Promise.resolve({places:[]})},recorder);
  for(const e of EVENTS)if(e.seq<=GYM_FIELD)for(const o of observers)o(e);
  const tool=tools.find(t=>t.name==="observe");if(tool===undefined)throw new Error("observe");
  const r:AgentToolResult<unknown>=await tool.execute("id",{});
  return r.content.flatMap(c=>c.type==="text"?[c.text]:[]);
 }
 it("ON appends the block to the observe result; OFF adds nothing",async()=>{
  const on=await run({"leader-attempt-ledger-v1":true});
  expect(on).toEqual(["Screen: overworld",[TRAINING_HEADER,...LEADER].join("\n")]);
  expect(await run({})).toEqual(["Screen: overworld"]);
 });
});
