import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// whiteout-healed-v1: pokeemerald DoWhiteOut (src/overworld.c) halves the money, then HealPlayerParty(), then
// warps to the last heal location. Run 2026-10-20T16-14-34_qwen36-gpu1_c6c2 lost to MAY at turn 256 (result
// seq 6924, state 6922), read TORCHIC 20/20 and still planned for seven turns to heal it at a POKéMON CENTER.
// battle-facts-c6c2.jsonl.gz is that run's seq 6700-8000 (plus run_start and milestones), made by the test
// author: tool calls and results whole, state events trimmed to the battle-facts fields plus party
// (species, level, hp, max_hp, is_egg, nickname), party_owner and money; other event types dropped.
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {BattleOutcomes} from "./battle-outcomes.js";
import {TRAINER_HEAL_SECTION,playSystemPrompt,stableJitPrompts} from "./play-config.js";
import {playGameTools} from "./play-wiring.js";
import type {RunEvent} from "./events.js";
import {recorded,recordedFeatures,stateAt,type RecordedState} from "../test-support/battle-facts.js";

const ID="whiteout-healed-v1";
const C6C2="battle-facts-c6c2.jsonl.gz";
const LOSS1="Battle recap: you lost to MAY (trainer 535) on ROUTE103 (map 0/18) at turn 256 and whited out; the game returned you to GREE's HOUSE 2F (map 1/1). The game shows MAY (trainer 535) has not been defeated.";
const LOSS2=LOSS1.replace("turn 256","turn 277");
const HEALED=" Whiting out restored your whole party: TORCHIC 20/20 HP.";
const SENTENCE="If every Pokémon in your party faints, you black out: you lose half your money and wake up back at the last POKéMON CENTER you entered, or at home, far from where you were.";
const HEALED_SENTENCE="If every Pokémon in your party faints, you black out: you lose half your money and wake up back at the last POKéMON CENTER you entered, or at home, far from where you were, with your whole party healed.";

type Result=Extract<RunEvent,{type:"tool_result"}>;
const GAME=new Set(["observe","press","navigate_to","battle_action","navigate_to_target"]);
function replay(events:readonly RunEvent[],features:FeatureSet):{result:Result;recap:string|null}[]{
 const outcomes=new BattleOutcomes(features);
 const out:{result:Result;recap:string|null}[]=[];
 for(const e of events){
  if(e.type==="tool_result"&&GAME.has(e.name)&&e.state_seq!==undefined)out.push({result:e,recap:outcomes.recap(stateAt(events,e.state_seq))});
  outcomes.observe(e);
 }
 return out;
}
const recordedRecap=(r:Result):string|null=>r.text.split("\n").find(l=>l.startsWith("Battle recap: "))??null;

describe("whiteout-healed-v1 on run c6c2 (whited out to MAY at turns 256 and 277)",()=>{
 const events=recorded(C6C2);
 it("ON: the turn-256 whiteout result's recap names the healed party the state after the warp read",()=>{
  const at=replay(events,recordedFeatures(events,{[ID]:true})).find(r=>r.result.seq===6924);
  expect(at?.recap).toBe(LOSS1+HEALED);
 });
 it("ON: every later result repeats the party as the state after that whiteout's warp read it, and the second whiteout replaces it",()=>{
  const results=replay(events,recordedFeatures(events,{[ID]:true}));
  for(const {result,recap} of results){
   const was=recordedRecap(result);
   if(result.seq<6924)expect(recap).toBeNull();
   else expect(recap).toBe(`${was??""}${HEALED}`);
   if(result.seq>=6924)expect(was?.startsWith(result.seq<7944?LOSS1.slice(0,90):LOSS2.slice(0,90))).toBe(true);
  }
  expect(results.find(r=>r.result.seq===7944)?.recap).toBe(LOSS2+HEALED);
 });
 it("OFF: every recap is byte for byte the line the run recorded",()=>{
  const results=replay(events,recordedFeatures(events,{[ID]:false}));
  expect(results.filter(r=>r.recap!==null).length).toBeGreaterThan(20);
  for(const {result,recap} of results)expect(recap).toBe(recordedRecap(result));
 });
});

let seq=0;
function state(turn:number,fields:Record<string,unknown>):RecordedState{
 seq++;
 return {v:1,run:"r",seq,t:"t",type:"state",turn,started:true,screen:"overworld",in_battle:false,location:"ROUTE101",map_id:[0,16],position:{x:5,y:5},facing:"up",battle:null,party:[],...fields} as unknown as RecordedState;
}
const battle=(outcome:string,type:number)=>({screen:"battle",in_battle:true,battle:{active:true,outcome,outcome_code:0,battle_type:type,battlers:[{battler:0,species:"TORCHIC"},{battler:1,species:"POOCHYENA"}]}});
const mon=(species:string|null,hp:number|null,max_hp:number|null,extra:Record<string,unknown>={})=>({species,level:5,hp,max_hp,...extra});
const opponent=(id:number,name:string,defeated:boolean,active:boolean)=>({trainer_opponent:{trainer_id:id,trainer_class:5,name,defeated,battle_active:active}});
const WILD="Battle recap: you lost to a wild POOCHYENA on ROUTE101 (map 0/16) at turn 11 and whited out; the game returned you to OLDALE TOWN POKEMON CENTER 1F (map 2/2).";

describe("whiteout-healed-v1 rules",()=>{
 const F:FeatureSet={...ALL_ON,"displayed-place-names-v1":false,[ID]:true};
 const fold=(events:readonly RunEvent[],features=F)=>{const o=new BattleOutcomes(features);for(const e of events)o.observe(e);return o;};
 const lose=(party:readonly unknown[])=>[state(10,{...battle("ongoing",4),party:[mon("TORCHIC",3,20)]}),state(11,{...battle("lost",4),party:[mon("TORCHIC",0,20)]}),state(12,{location:"OLDALE TOWN POKEMON CENTER 1F",map_id:[2,2],party})];
 it("lists every party Pokémon at max HP in party order",()=>{
  expect(fold(lose([mon("TORCHIC",20,20),mon("WURMPLE",15,15)])).recap(null)).toBe(`${WILD} Whiting out restored your whole party: TORCHIC 20/20 HP, WURMPLE 15/15 HP.`);
 });
 it("says what the state showed, never full, when a Pokémon is below max or its HP was not read",()=>{
  expect(fold(lose([mon("TORCHIC",20,20),mon("WURMPLE",9,15)])).recap(null)).toBe(`${WILD} After whiting out, the game state showed your party: TORCHIC 20/20 HP, WURMPLE 9/15 HP.`);
  expect(fold(lose([mon("TORCHIC",null,20)])).recap(null)).toBe(`${WILD} After whiting out, the game state showed your party: TORCHIC HP not read.`);
  expect(fold(lose([mon(null,20,20)])).recap(null)).toBe(`${WILD} Whiting out restored your whole party: a Pokémon whose species was not read 20/20 HP.`);
 });
 it("leaves out eggs, and says nothing when the state showed no Pokémon",()=>{
  expect(fold(lose([mon("TORCHIC",20,20),mon("EGG",10,10,{is_egg:true})])).recap(null)).toBe(`${WILD} Whiting out restored your whole party: TORCHIC 20/20 HP.`);
  expect(fold(lose([])).recap(null)).toBe(WILD);
 });
 it("reads the party from the result's own state when that state is the first after the warp",()=>{
  const events=lose([mon("TORCHIC",20,20)]);
  const after=events[2];
  if(after===undefined)throw new Error("three states");
  expect(fold(events.slice(0,2)).recap(after)).toBe(`${WILD}${HEALED}`);
 });
 it("adds nothing to a lost trainer battle without a whiteout, and nothing with the switch off",()=>{
  const trainer=fold([state(50,{...battle("lost",8),...opponent(1,"SAWYER",false,true)}),state(51,{...opponent(1,"SAWYER",false,false),party:[mon("TORCHIC",20,20)]})]);
  expect(trainer.recap(null)).toBe("Battle recap: you lost to SAWYER (trainer 1) on ROUTE101 (map 0/16) at turn 50.");
  expect(fold(lose([mon("TORCHIC",20,20)]),{...F,[ID]:false}).recap(null)).toBe(WILD);
 });
});

describe("whiteout-healed-v1 system prompt",()=>{
 const on:FeatureSet={...ALL_ON,"trainer-heal-guidance-v1":true,[ID]:true},off:FeatureSet={...on,[ID]:false};
 it("OFF keeps today's sentence; ON adds the heal before its period and changes nothing else",()=>{
  expect(TRAINER_HEAL_SECTION).toContain(SENTENCE);
  for(const scene of ["unknown","overworld","battle","core"] as const){
   const before=playSystemPrompt(off,null,scene),after=playSystemPrompt(on,null,scene);
   expect(after).toBe(before.replace(SENTENCE,HEALED_SENTENCE));
  }
  expect(playSystemPrompt(on,null,"unknown")).toContain(HEALED_SENTENCE);
  expect(playSystemPrompt(off,null,"unknown")).toContain(SENTENCE);
  expect(stableJitPrompts(on,null,"battle").guidance).toContain(HEALED_SENTENCE);
  expect(stableJitPrompts(off,null,"battle").guidance).toContain(SENTENCE);
 });
 it("without trainer-heal-guidance-v1 the prompt has no such sentence either way",()=>{
  const p=playSystemPrompt({...on,"trainer-heal-guidance-v1":false},null,"unknown");
  expect(p).not.toContain("you black out");
  expect(p).toBe(playSystemPrompt({...off,"trainer-heal-guidance-v1":false},null,"unknown"));
 });
});

describe("whiteout-healed-v1 through playGameTools",()=>{
 const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
 async function first(on:boolean):Promise<string>{
  const events=recorded(C6C2);
  const observers:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined};
  const result=events.find((e):e is Result=>e.type==="tool_result"&&e.seq===6924);
  if(result===undefined)throw new Error("fixture has seq 6924");
  const body=result.text.split("\n").filter(l=>!l.startsWith("Battle recap: ")).join("\n");
  const press:AgentTool={name:"press",label:"Press",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:body}],details:{state:stateAt(events,6922)}})};
  const features={...Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])),"ram-state-v1":true,"bounded-navigation-v1":true,"battle-loss-recap-v1":true,[ID]:on} as FeatureSet;
  const base=[{name:"observe",label:"Observe",description:"d",parameters:{},execute:()=>Promise.reject(new Error("unused"))} as AgentTool,{...press,executeChecked:(id:string,params:unknown)=>press.execute(id,params)} as AgentTool];
  const tools=playGameTools(base,features,{read:()=>Promise.reject(new Error("unused"))},recorder);
  for(const e of events){if(e.seq>=6922)break;for(const o of observers)o(e);}
  const wrapped=tools.find(t=>t.name==="press");
  if(wrapped===undefined)throw new Error("no press");
  const out=text(await wrapped.execute(result.id,{buttons:["A"]}));return out;
 }
 it("ON appends the healed party to the whiteout result's recap; OFF is the recorded recap",async()=>{
  expect((await first(true)).endsWith(`\n${LOSS1}${HEALED}`)).toBe(true);
  expect((await first(false)).endsWith(`\n${LOSS1}`)).toBe(true);
 });
});

describe("whiteout-healed-v1 registry",()=>{
 it("is the last switch: a default-off agent-side observation switch with no dependency",()=>{
  expect(SWITCHABLE_FEATURES.at(-10)).toBe(ID);
  expect(FEATURES.filter(f=>f.id===ID)).toHaveLength(1);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true,title:"WHITEOUT HEALED"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("Whiting out restored your whole party: TORCHIC 20/20 HP.");
  expect(featureInfo(ID).description).toContain(", with your whole party healed");
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null).at(-1)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,[ID]:true})).toEqual([]);
 });
 it("reads presets and legacy flags without the switch as OFF and keeps an explicit ON",()=>{
  const without=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(false);
  expect(normalizeFeatures({...without,[ID]:true})[ID]).toBe(true);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  const preset=parsePlayPreset({version:2,id:"p",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without});
  expect(presetFeatures(preset)[ID]).toBe(false);
 });
});
