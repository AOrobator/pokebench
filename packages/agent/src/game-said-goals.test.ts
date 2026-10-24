import {BATCH_DEFAULTS_OFF} from "../test-support/legacy-features.js";
import { readFileSync } from "node:fs";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "./events.js";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, type FeatureSet } from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,...BATCH_DEFAULTS_OFF,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import { GOALS_HEADER, GameSaidGoals } from "./game-said-goals.js";
import type { GameStateSnapshot } from "./game-state.js";
import { playGameTools } from "./play-wiring.js";
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("fixture");return value;};

// Run 2026-10-20T20-26-22_qwen36-gpu1_97a0: the gym guide's ROCK-type lines on RUSTBORO CITY GYM (turn 630) and
// the ROXANNE battle lost at turn 716 (state events slimmed to the fields the folds read), plus the recorded
// evolution move-learning box (turn 781), a ready battle decision (turn 716) and the J2 battle pages.
const GOALS=JSON.parse(readFileSync(new URL("./fixtures/game-said-goals-97a0.json",import.meta.url),"utf8")) as {events:RunEvent[]};
const LEARN=JSON.parse(readFileSync(new URL("./fixtures/move-learn-97a0.json",import.meta.url),"utf8")) as {events:RunEvent[];move_learning_state:GameStateSnapshot;battle_decision_state:GameStateSnapshot};
const ROXANNE=`- ROXANNE (trainer 265): you lost to ROXANNE on RUSTBORO CITY GYM (map 11/3) at turn 716, and the game has not recorded a win since. ROXANNE's POKéMON seen in battle this run: GEODUDE Lv12; any others not seen yet. Said on that map: "ROXANNE, the GYM LEADER, is a user of ROCK-type POKéMON." "The ROCK type is very durable, but it can't stand WATER-type and GRASS-type moves."`;

function fed(events:readonly RunEvent[]=GOALS.events):GameSaidGoals {
 const goals=new GameSaidGoals(ALL_ON);
 for(const e of events)goals.observe(e);
 return goals;
}

describe("game-said-goals-v1",()=>{
 it("lists the lost and not-yet-won leader battle with what the game showed and said, at a move-learning choice",()=>{
  expect(fed().block(LEARN.move_learning_state)).toBe(`${GOALS_HEADER}\n${ROXANNE}`);
 });
 it("shows at the evolution decision too, but not at a battle decision or on the field",()=>{
  const goals=fed();
  const decision={...LEARN.move_learning_state,active_ui:{...must(LEARN.move_learning_state.active_ui),phase:"evolution_decision"}};
  expect(goals.block(decision)).toBe(`${GOALS_HEADER}\n${ROXANNE}`);
  expect(goals.block(LEARN.battle_decision_state)).toBeNull();
  expect(goals.block({...LEARN.move_learning_state,active_ui:null})).toBeNull();
  expect(goals.block({...LEARN.move_learning_state,started:false})).toBeNull();
 });
 it("drops a battle once the game records a win against that trainer",()=>{
  const states=GOALS.events.filter((e):e is Extract<RunEvent,{type:"state";started:boolean}>=>e.type==="state"&&"started" in e);
  const battle=states.filter(s=>s.trainer_opponent?.battle_active===true&&s.in_battle);
  const after=must(states.at(-1));
  const last=Math.max(...GOALS.events.map(e=>e.seq));
  const rematch=battle.map((s,i)=>({...s,seq:last+1+i,turn:800,blackout_active:false,battle:s.battle==null?s.battle:{...s.battle,outcome:null}})) as unknown as RunEvent[];
  const won:RunEvent={...after,seq:last+1+rematch.length,turn:801,blackout_active:false,trainer_opponent:{...must(after.trainer_opponent),defeated:true}};
  expect(fed([...GOALS.events,...rematch,won]).block(LEARN.move_learning_state)).toBeNull();
 });
 it("names what a non-leader trainer sent out",()=>{
  const states=GOALS.events.filter((e):e is Extract<RunEvent,{type:"state";started:boolean}>=>e.type==="state"&&"started" in e);
  const moved=states.map(s=>({...s,map_id:s.map_id===null?null:[0,19] as [number,number],trainer_opponent:s.trainer_opponent==null?s.trainer_opponent:{...s.trainer_opponent,trainer_class:1,trainer_id:500,name:"IVAN"}})) as unknown as RunEvent[];
  const block=fed(moved).block(LEARN.move_learning_state);
  expect(block).toContain("- IVAN (trainer 500): you lost to IVAN on");
  expect(block).toContain("IVAN sent out GEODUDE.");
 });
 it("shows nothing when no battle is open",()=>{
  expect(new GameSaidGoals(ALL_ON).block(LEARN.move_learning_state)).toBeNull();
 });
});

describe("production wiring of effectiveness-heard-v1 and game-said-goals-v1",()=>{
 async function run(features:Partial<FeatureSet>,state:GameStateSnapshot):Promise<string[]> {
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
  const observe:AgentTool={name:"observe",label:"Observe",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"Screen: evolution"}],details:{state}})};
  const choose:AgentTool={name:"choose_evolution",label:"Choose",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"Evolution decision"}],details:{state}})};
  const press={name:"press",label:"Press",description:"d",parameters:{},execute:()=>Promise.reject(new Error("unused")),executeChecked:()=>Promise.reject(new Error("unused"))} as unknown as AgentTool;
  const base:FeatureSet={...ALL_ON,"gym-evidence-v1":false,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"navigate-first-prompt-v1":false,"harness-trust-v1":false,"story-destinations-v1":false,"full-map-navigation-v1":false,"cited-destination-v1":false,"battle-move-tool-v1":false,"unfinished-activity-v1":false,"battle-loss-recap-v1":false,"low-hp-trainer-warning-v1":false,"story-battle-heal-gate-v1":false,"trainer-sight-check-v1":false,"visited-terrain-navigation-v1":false,"semantic-navigation-v2":false,"instruction-ledger-v2":false,"people-ledger-v1":false,"people-id-cards-v1":false,"untaken-exits-v1":false,"gym-readiness-readout-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"heal-before-trainers-v1":false,"heal-before-trainers-v2":false,"bag-healing-items-v1":false,"starter-decision-salience-v1":false,"story-battle-heal-first-v1":false,"pending-field-dialogue-v1":false,...features};
  const tools=playGameTools([observe,press],base,{read:()=>Promise.reject(new Error("unused")),places:()=>Promise.resolve({places:[]})},recorder,undefined,[choose]);
  for(const e of [...GOALS.events,...LEARN.events].sort((a,b)=>a.seq-b.seq))for(const o of observers)o(e);
  const parts=async(name:string)=>{const tool=tools.find(t=>t.name===name);if(tool===undefined)throw new Error(name);const r:AgentToolResult<unknown>=await tool.execute("id",{});return r.content.flatMap(c=>c.type==="text"?[c.text]:[]);};
  return [...await parts("observe"),...await parts("choose_evolution")];
 }
 it("ON appends both blocks to observe and choose_evolution results; OFF adds nothing",async()=>{
  const on=await run({"effectiveness-heard-v1":true,"game-said-goals-v1":true},LEARN.move_learning_state);
  const heard="What the game said right after your moves this run (its own words):\n- EMBER on GEODUDE: \"It's not very effective…\" (turns 715, 716)";
  const goals=`${GOALS_HEADER}\n${ROXANNE}`;
  expect(on).toEqual(["Screen: evolution",heard,goals,"Evolution decision",heard,goals]);
  const off=await run({"effectiveness-heard-v1":false,"game-said-goals-v1":false},LEARN.move_learning_state);
  expect(off).toEqual(["Screen: evolution","Evolution decision"]);
 });
});
