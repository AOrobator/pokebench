import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {BattleOutcomes} from "./battle-outcomes.js";
import {ALL_ON,featureInfo,playHarnessFeatures,type FeatureSet,SWITCHABLE_FEATURES} from "./features.js";
import type {RunEvent} from "./events.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {recorded,stateAt,type RecordedState} from "../test-support/battle-facts.js";

const ID="trainer-observed-party-v1";
const events=recorded("trainer-observed-0d5d.jsonl.gz");
const first=stateAt(events,138418);
const home=stateAt(events,142425);
const flags=(on=true)=>({...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"ram-state-v1":true,"battle-loss-recap-v1":true,[ID]:on}) as FeatureSet;
const result=(s:RecordedState,text="Battler 1 WINGULL Lv18 HP 43/43",is_error=false):Extract<RunEvent,{type:"tool_result"}>=>({v:1,run:s.run,seq:s.seq+1,t:s.t,type:"tool_result",turn:s.turn,id:`r${String(s.seq)}`,name:"press",state_seq:s.seq,is_error,text,duration_ms:1,frames:[]});
function battleOf(s:RecordedState){if(s.battle==null)throw new Error("fixture battle missing");return s.battle;}
function battlersOf(s:RecordedState){const b=battleOf(s).battlers;if(b==null)throw new Error("fixture battlers missing");return b;}
function opponentOf(s:RecordedState){if(s.trainer_opponent==null)throw new Error("fixture trainer missing");return s.trainer_opponent;}
function trainer(s:RecordedState,id:number,name="MAY",slot=0,species="WINGULL",position=1):RecordedState {
 if(s.battle?.battlers==null||s.trainer_opponent==null)throw new Error("fixture has trainer battlers");
 return {...s,trainer_opponent:{...s.trainer_opponent,trainer_id:id,name},battle:{...s.battle,battlers:s.battle.battlers.map(b=>b.position%2===1?{...b,party_slot:slot,species,position,battler:position}:b)}};
}
const fold=(on=true)=>{const o=new BattleOutcomes(flags(on));for(const e of events)o.observe(e);return o;};
const MEMORY="Previously observed against MAY (trainer 530): WINGULL Lv18 (last observed fainted), GROVYLE Lv20. Full party not established by these observations.";

describe(ID,()=>{
 it("replays the actual May loss: remembers delivered Wingull and Grovyle, never unseen Slugma",()=>{
  expect(fold().recap(home)).toBe(`${fold(false).recap(home)??""} ${MEMORY}`);
  expect(fold().recap(home)).not.toContain("SLUGMA");
 });
 it("does not learn from internal polls, failed deliveries, missing state references or absent battlers",()=>{
  const o=new BattleOutcomes(flags());
  o.observe(first);o.observe(result(first,"WINGULL Lv18 HP 43/43",true));
  o.observe({...result(first),state_seq:999999});
  expect(o.recap(first)).toBeNull();
  if(first.battle?.battlers==null)throw new Error("battlers");
  const absent={...first,seq:200000,battle:{...first.battle,battlers:first.battle.battlers.map(b=>({...b,absent:true}))}};
  o.observe(absent);o.observe(result(absent));expect(o.recap(absent)).toBeNull();
  o.observe(result(first,"MAY sent out WINGULL!"));expect(o.recap(first)).toBeNull();
 });
 it("keeps ordinary trainers, leaders, identical names and repeated species in different slots distinct",()=>{
  const o=new BattleOutcomes(flags());
  for(const [id,slot] of [[530,0],[530,1],[42,0]] as const){
   const s=trainer({...first,seq:200000+id*10+slot},id,"MAY",slot);o.observe(s);o.observe(result(s));
  }
  expect(o.recap(first)).toBe("Previously observed against MAY (trainer 530): WINGULL Lv18, WINGULL Lv18. Full party not established by these observations.");
  const other=trainer(first,42);
  expect(o.recap(other)).toBe("Previously observed against MAY (trainer 42): WINGULL Lv18. Full party not established by these observations.");
  const leader={...trainer({...first,seq:300000},77,"ROXANNE"),trainer_opponent:{...opponentOf(first),trainer_id:77,name:"ROXANNE",trainer_class:24}};
  o.observe(leader);o.observe(result(leader));expect(o.recap(leader)).toContain("ROXANNE (trainer 77): WINGULL Lv18");
 });
 it("retains memory across milestones and retries, but never uses another trainer or wild battler",()=>{
  const o=fold();
  o.observe({v:1,run:first.run,seq:200000,t:first.t,type:"milestone",turn:1157,name:"FIRST_POKECENTER_HEAL",kind:"story",origin:"observed",server_timestamp:1,evidence:[]});
  expect(o.recap(home)).toBeNull();
  expect(o.recap(first)).toBe(MEMORY);
  expect(o.recap(trainer(first,533))).toBeNull();
  const wild={...first,seq:200001,trainer_opponent:null,battle:{...battleOf(first),battle_type:4}};
  o.observe(wild);o.observe(result(wild));expect(o.recap(wild)).toBeNull();
 });
 it("excludes two-opponent and multi battles where a single trainer ID cannot own both foes",()=>{
  for(const bit of [1<<15,1<<6]){
   const o=new BattleOutcomes(flags());const s={...first,battle:{...battleOf(first),battle_type:8|bit}};
   o.observe(s);o.observe(result(s));expect(o.recap(s)).toBeNull();
  }
 });
 it("accepts a delivered decision snapshot and remembers the right-side foe in one-trainer doubles",()=>{
  const o=new BattleOutcomes(flags());const s=trainer(first,530,"MAY",1,"WINGULL",3);
  o.observe(s);o.observe({v:1,run:s.run,seq:s.seq+1,t:s.t,type:"decision_input",turn:s.turn,decision_turn:s.turn+1,state_seq:s.seq,text:"Battler 3 WINGULL Lv18 HP 43/43",frames:[]});
  expect(o.recap(s)).toContain("WINGULL Lv18");
 });
 it("never learns an unseen opponent from the player's party line or an internal poll",()=>{
  const o=new BattleOutcomes(flags());const hidden=trainer(first,530,"MAY",1,"SLUGMA");
  o.observe(hidden);o.observe(result(hidden,"Party (player): SLUGMA Lv18 HP 43/43"));
  expect(o.recap(hidden)).toBeNull();
  o.observe(result(hidden,"Foe SLUGMA Lv18 HP 43/43"));
  expect(o.recap(hidden)).toBe("Previously observed against MAY (trainer 530): SLUGMA Lv18. Full party not established by these observations.");
 });
 it("requires a successful matching delivery for faint pages and never learns their unprinted levels",()=>{
  const o=new BattleOutcomes(flags());
  for(const e of events)o.observe(e.type==="tool_result"&&e.seq===138711?{...e,is_error:true}:e);
  expect(o.recap(home)).toBe(`${fold(false).recap(home)??""} ${MEMORY.replace(" (last observed fainted)","")}`);
  const unseen=new BattleOutcomes(flags());
  for(const e of events)unseen.observe(e.type==="tool_result"?{...e,text:e.text.split("\n").filter(line=>!line.startsWith("Battler 1 WINGULL Lv18 ")&&!line.startsWith("Foe WINGULL Lv18 ")).join("\n")}:e);
  expect(unseen.recap(home)).not.toContain("WINGULL");
 });
 it("updates a previously fainted Pokémon only after its fresh retry observation is delivered",()=>{
  const o=fold();const retry={...first,seq:200000};
  o.observe(retry);expect(o.recap(retry)).toContain("WINGULL Lv18 (last observed fainted)");
  o.observe(result(retry));expect(o.recap(retry)).toContain("WINGULL Lv18, GROVYLE Lv20");
  const wild={...retry,seq:200002,trainer_opponent:null,battle:{...battleOf(retry),battle_type:4,battlers:battlersOf(retry).map(b=>({...b,species:"SLUGMA"}))}};
  o.observe(wild);o.observe(result(wild,"Battler 1 SLUGMA Lv18 HP 43/43"));
  expect(o.recap(retry)).not.toContain("SLUGMA");
 });
 it("OFF leaves historical recaps unchanged",()=>{
  expect(fold(false).recap(home)).not.toContain("Previously observed");
 });
});

function requiredTool(tools:readonly AgentTool[]):AgentTool{const tool=tools[0];if(tool===undefined)throw new Error("missing observe tool");return tool;}
describe(`${ID} production wiring`,()=>{
 async function play(on:boolean){
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined};
  const base:AgentTool={name:"observe",label:"Observe",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"readout"}],details:{state:home}})};
  const tools=playGameTools([base],flags(on),{read:()=>Promise.reject(new Error("unused"))},recorder);
  for(const e of events)for(const observe of observers)observe(e);
  const r:AgentToolResult<unknown>=await requiredTool(tools).execute("id",{});
  return r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
 }
 it("appends remembered opponents through playGameTools only when ON",async()=>{
  expect(await play(true)).toBe(`${await play(false)} ${MEMORY}`);
 });
});

it("registers an optional default-OFF observation switch with its recap dependency",()=>{
 expect(SWITCHABLE_FEATURES).toContain(ID);
 expect(featureInfo(ID as typeof SWITCHABLE_FEATURES[number])).toMatchObject({group:"observation",needs:"battle-loss-recap-v1"});
 expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
 const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID));
 expect(normalizeFeatures(older as FeatureSet)[ID as keyof FeatureSet]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID as keyof FeatureSet]).toBe(false);
});
