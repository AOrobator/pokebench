import { readFileSync } from "node:fs";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { EffectivenessHeard, battleDecision, moveLearningChoice, withEffectivenessHeard } from "./effectiveness-heard.js";
import type { RunEvent } from "./events.js";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON } from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};
import type { GameStateSnapshot } from "./game-state.js";
const must=<T,>(value:T|null|undefined):T=>{if(value==null)throw new Error("fixture");return value;};

// Recorded events from run 2026-10-20T20-26-22_qwen36-gpu1_97a0: turn 153 (wild WINGULL's WATER GUN was
// super effective on TORCHIC), turns 715-716 (TORCHIC's EMBER on ROXANNE's GEODUDE: "It's not very
// effective…"), the ready battle decision at turn 716 and the evolution move-learning box at turn 781.
const FIXTURE=JSON.parse(readFileSync(new URL("./fixtures/move-learn-97a0.json",import.meta.url),"utf8")) as {events:RunEvent[];move_learning_state:GameStateSnapshot;battle_decision_state:GameStateSnapshot};
const ON={...ALL_ON,"effectiveness-heard-v1":true};

function fed():EffectivenessHeard {
 const heard=new EffectivenessHeard();
 for(const event of FIXTURE.events)heard.observe(event);
 return heard;
}
const BLOCK=[
 "What the game said right after your moves this run (its own words):",
 "- EMBER on GEODUDE: \"It's not very effective…\" (turns 715, 716)",
].join("\n");

describe("effectiveness-heard-v1",()=>{
 it("records the game's words after the player's moves only, by move and foe, with turns",()=>{
  expect(fed().block(FIXTURE.battle_decision_state)).toBe(BLOCK);
 });
 it("shows at ready battle decisions and move-learning choices only",()=>{
  const heard=fed();
  expect(heard.block(FIXTURE.move_learning_state)).toBe(BLOCK);
  const busy={...FIXTURE.battle_decision_state,battle:{...must(FIXTURE.battle_decision_state.battle),ready:false}};
  expect(heard.block(busy)).toBeNull();
  expect(heard.block({...FIXTURE.move_learning_state,active_ui:null})).toBeNull();
 });
 it("shows nothing before the game has said anything",()=>{
  expect(new EffectivenessHeard().block(FIXTURE.battle_decision_state)).toBeNull();
 });
 it("ignores a foe's move, a page in another battle turn and doubles",()=>{
  const heard=new EffectivenessHeard();
  const [wingull]=FIXTURE.events.filter(e=>e.type==="dialogue_auto_advance"&&e.turn===153);
  const states=FIXTURE.events.filter(e=>e.type==="state");
  for(const s of states)heard.observe(s);
  heard.observe(must(wingull));
  expect(heard.block(FIXTURE.battle_decision_state)).toBeNull();
  const ember=FIXTURE.events.find(e=>e.type==="dialogue_auto_advance"&&e.turn===715);
  if(ember?.type!=="dialogue_auto_advance")throw new Error("fixture");
  const split={...ember,pages:ember.pages.map((p,i)=>i===1?{...p,battle_turn:9}:p)};
  heard.observe(split);
  expect(heard.block(FIXTURE.battle_decision_state)).toBeNull();
  const doubles=new EffectivenessHeard();
  for(const s of states){
   if(!("started" in s))continue;
   const battle=s.battle;
   if(battle==null)continue;
   const battlers=battle.battlers??[];
   doubles.observe({...s,battle:{...battle,battlers:[...battlers,...battlers.filter(b=>b.position===1).map(b=>({...b,position:3,battler:3}))]}});
  }
  doubles.observe(ember);
  expect(doubles.block(FIXTURE.battle_decision_state)).toBeNull();
 });
 it("keeps a no-effect line in the game's words",()=>{
  const heard=fed();
  const ember=FIXTURE.events.find(e=>e.type==="dialogue_auto_advance"&&e.turn===715);
  if(ember?.type!=="dialogue_auto_advance")throw new Error("fixture");
  heard.observe({...ember,turn:900,pages:ember.pages.map((p,i)=>i===1?{...p,text:"It doesn't affect\nFoe GEODUDE…"}:p)});
  expect(heard.block(FIXTURE.battle_decision_state)).toBe(`${BLOCK}\n- EMBER on GEODUDE: "It doesn't affect Foe GEODUDE…" (turn 900)`);
 });
 it("knows the decision screens",()=>{
  expect(battleDecision(FIXTURE.battle_decision_state)).toBe(true);
  expect(moveLearningChoice(FIXTURE.move_learning_state)).toBe(true);
  expect(moveLearningChoice({...FIXTURE.move_learning_state,active_ui:{...must(FIXTURE.move_learning_state.active_ui),phase:"summary_move_forget"}})).toBe(true);
  const prompt={kind:"stop_learning_move" as const,ready:true,selected:"YES" as const};
  expect(moveLearningChoice({...FIXTURE.battle_decision_state,active_ui:null,battle:{...must(FIXTURE.battle_decision_state.battle),prompt}})).toBe(true);
  expect(moveLearningChoice({...FIXTURE.battle_decision_state,active_ui:null,battle:{...must(FIXTURE.battle_decision_state.battle),prompt:{...prompt,ready:false}}})).toBe(false);
 });
});

describe("withEffectivenessHeard",()=>{
 const listeners:((e:RunEvent)=>void)[]=[];
 const recorder={subscribe:(f:(e:RunEvent)=>void)=>{listeners.push(f);}};
 const tool=(name:string,state:GameStateSnapshot):AgentTool=>({name,label:name,description:name,parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"readout"}],details:{state}})});
 it("appends the block as its own text part on game tools when on, and changes nothing when off",async()=>{
  const tools=[tool("battle_action",FIXTURE.battle_decision_state),tool("get_dialogue",FIXTURE.battle_decision_state)];
  expect(withEffectivenessHeard(tools,{...ON,"effectiveness-heard-v1":false},recorder)).toEqual(tools);
  const wrapped=withEffectivenessHeard(tools,ON,recorder);
  for(const e of FIXTURE.events)for(const l of listeners)l(e);
  const [battle,other]=wrapped;
  const result=await must(battle).execute("id",{});
  expect(result.content).toEqual([{type:"text",text:"readout"},{type:"text",text:BLOCK}]);
  expect((await must(other).execute("id",{})).content).toEqual([{type:"text",text:"readout"}]);
 });
});
