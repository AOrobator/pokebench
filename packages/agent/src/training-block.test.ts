import { IN_GAME } from "../test-support/events.js";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import type { RunEvent } from "./events.js";
import { ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON, type FeatureSet } from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false,"leader-loss-comparison-v1":false};
import type { GameStateSnapshot } from "./game-state.js";
import { playGameTools } from "./play-wiring.js";
import { withDialogueAutoAdvance, type AutoAdvanceRecorder } from "./dialogue-auto-advance.js";
import { pressTool } from "./game-tools.js";
import { TRAINING_HEADER, TrainingBlock } from "./training-block.js";

// Run 2026-10-21T04-27-11_qwen36-gpu1_fd95 (bundle arm), whole run, state events slimmed to the fields the folds
// read, every dialogue_auto_advance and milestone event: three ROXANNE losses (turns 501, 538, 591), JOSH, TOMMY
// and MARC beaten in between, and every "… gained … EXP. Points!" page the model was shown.
const SLIM_EVENTS=gunzipSync(readFileSync(new URL("./fixtures/training-fd95.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
// The original slim fixture omitted call IDs and results. Restore exact source dialogue rows and
// matching receipt metadata, selected and hashed in training-fd95-delivery.provenance.json.
const DELIVERY=gunzipSync(readFileSync(new URL("./fixtures/training-fd95-delivery.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
const EVENTS=[...new Map([...SLIM_EVENTS,...DELIVERY].map(e=>[e.seq,e])).values()].sort((a,b)=>a.seq-b.seq);
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
 it("new loss comparison is wired independently through playGameTools",async()=>{
  expect((await run({"leader-loss-comparison-v1":true})).join("\n")).toContain("Last observed loss to GYM LEADER ROXANNE");
 });
 it("ON appends the block to the observe result; OFF adds nothing",async()=>{
  const on=await run({"leader-attempt-ledger-v1":true});
  expect(on).toEqual(["Screen: overworld",[TRAINING_HEADER,...LEADER].join("\n")]);
  expect(await run({})).toEqual(["Screen: overworld"]);
 });
});


describe("leader-loss-comparison-v1",()=>{
 it("compares unchanged EXP and levels at the last observed loss without inventing moves",()=>{
  const text=fed(only({"leader-loss-comparison-v1":true})).block(at(GYM_FIELD))??"";
  expect(text).toContain("Last observed loss to GYM LEADER ROXANNE");
  expect(text).toContain("levels: unchanged");
  expect(text).toContain("EXP: unchanged");
  expect(text).toContain("moves: unchanged");
  expect(text).not.toMatch(/must|should|recommend|train before|cannot rematch/i);
 });
 it("reports EXP changes and unreadable current party separately",()=>{
  const block=fed(only({"leader-loss-comparison-v1":true}));
  const s=at(GYM_FIELD);
  expect(block.block({...s,party:s.party.map((m,i)=>i===0?{...m,experience:2300}:m)})).toContain("EXP: changed");
  expect(block.block({...s,party:[]})).toContain("levels: unknown");
  expect(block.block({...s,party:s.party.map(m=>({...m,moves:null}))})).toContain("moves: unknown");
 });
 it("OFF keeps the prior leader ledger byte identical",()=>{
  expect(fed(only({"leader-attempt-ledger-v1":true})).block(at(GYM_FIELD))).toBe([TRAINING_HEADER,...LEADER].join("\n"));
 });
});


describe("leader loss source delivery and party alignment",()=>{
 const features=only({"leader-loss-comparison-v1":true});
 const source=EVENTS.find((e):e is Extract<RunEvent,{type:"dialogue_auto_advance"}>=>e.seq===21842&&e.type==="dialogue_auto_advance");
 if(source===undefined)throw new Error("native source page");
 const page=source;
 const firstPage=page.pages[0];if(firstPage===undefined)throw new Error("native first page");
 const receipt=EVENTS.find((e):e is Extract<RunEvent,{type:"tool_result"}>=>e.type==="tool_result"&&e.id===page.tool_call_id);
 if(receipt===undefined||receipt.is_error)throw new Error("native successful receipt");
 const delivered=receipt;
 const battle=at(21811);
 const text=(block:TrainingBlock)=>block.block(at(GYM_FIELD))??"";
 const loss=(block:TrainingBlock)=>{
  block.observe({...battle,battle:{...battle.battle,outcome:"lost"}} as RunEvent);
  block.observe(at(GYM_FIELD) as State);
 };
 function pending():TrainingBlock {
  const b=new TrainingBlock(features);b.observe(battle as State);
  // Exact referenced state associates these pages with the battle, including after completion.
  b.observe(at(page.pages[0]?.state_seq??0) as State);b.observe(page);return b;
 }
 it("waits for matching successful result; pending, unrelated, wrong-tool and failed calls stay unknown",()=>{
  for(const result of [null,{...delivered,id:"unrelated"},{...delivered,name:"observe"},{...delivered,is_error:true}]){
   const b=pending();if(result!==null)b.observe(result);loss(b);
   expect(text(b)).toContain("Effectiveness pages delivered: unknown");
   expect(text(b)).toContain("Last battle pages delivered (up to 4; game words): unknown");
  }
  const b=pending();b.observe(delivered);loss(b);
  expect(text(b)).toContain("Effectiveness pages delivered: It's not very effective");
  expect(text(b)).toContain("TORCHIC used EMBER!");
 });
 it("retains multiple recorded page batches belonging to the same successful tool call",()=>{
  const b=pending();
  b.observe({...page,pages:[{...firstPage,text:"A later battle page."}]});b.observe(delivered);loss(b);
  expect(text(b)).toContain("Effectiveness pages delivered: It's not very effective");
  expect(text(b)).toContain("Last battle pages delivered (up to 4; game words): It's not very effective… | Foe GEODUDE used DEFENSE CURL! | Foe GEODUDE's DEFENSE rose! | A later battle page.");
 });
 it("a failed call is retired and an unrelated later success cannot revive its pages",()=>{
  const b=pending();b.observe({...delivered,is_error:true});b.observe(delivered);loss(b);
  expect(text(b)).toContain("Effectiveness pages delivered: unknown");
 });
 it("a successful call without a known source battle remains unknown",()=>{
  const b=new TrainingBlock(features);b.observe(battle as State);
  b.observe({...page,pages:page.pages.map(p=>({...p,state_seq:999999}))});b.observe(delivered);loss(b);
  expect(text(b)).toContain("Effectiveness pages delivered: unknown");
 });
 it("bounds one pending call's page lists before successful delivery",()=>{
  const b=new TrainingBlock(features);b.observe(battle as State);
  b.observe({...page,pages:Array.from({length:6},(_,i)=>({...firstPage,state_seq:21811,text:`It's super effective! ${String(i)}`}))});
  loss(b);expect(text(b)).toContain("Effectiveness pages delivered: unknown");
  b.observe(delivered);
  expect(text(b)).toContain("Effectiveness pages delivered: It's super effective! 2 | It's super effective! 3 | It's super effective! 4 | It's super effective! 5");
  expect(text(b)).not.toContain("It's super effective! 0");
 });
 it("binds late successful delivery to the original battle after field completion, not a new battle",()=>{
  const b=pending();loss(b);
  b.observe({...battle,trainer_opponent:{...battle.trainer_opponent,name:"BRAWLY"}} as RunEvent);
  b.observe(delivered);
  expect(text(b)).toContain("Effectiveness pages delivered: It's not very effective");
 });
 it("can associate source pages recorded after field completion through their original state",()=>{
  const b=new TrainingBlock(features);b.observe(battle as State);b.observe(at(page.pages[0]?.state_seq??0) as State);
  loss(b);b.observe(page);b.observe(delivered);
  expect(text(b)).toContain("Effectiveness pages delivered: It's not very effective");
 });
 it("retains at most four successful game pages and effectiveness pages",()=>{
  const b=new TrainingBlock(features);b.observe(battle as State);
  for(let i=0;i<6;i++){
   b.observe({...page,tool_call_id:`bound-${String(i)}`,pages:[{...firstPage,state_seq:21811,text:`It's super effective! ${String(i)}`} ]});
   b.observe({...delivered,id:`bound-${String(i)}`});
  }
  loss(b);
  const lines=text(b).split("\n");
  expect(lines.find(l=>l.includes("Effectiveness pages delivered:"))).toBe("  Effectiveness pages delivered: It's super effective! 2 | It's super effective! 3 | It's super effective! 4 | It's super effective! 5");
  expect(lines.find(l=>l.includes("Last battle pages delivered"))).toBe("  Last battle pages delivered (up to 4; game words): It's super effective! 2 | It's super effective! 3 | It's super effective! 4 | It's super effective! 5");
 });
 it("production dialogue finish records pages but a rejecting final observation never delivers them",async()=>{
  const b=new TrainingBlock(features);b.observe(battle as State);let seq=30000;let recorded:RunEvent|undefined;
  const emit=(body:Record<string,unknown>)=>{const e={v:1,run:"failure-injection",seq:++seq,t:page.t,turn:page.turn,...body} as RunEvent;b.observe(e);return e;};
  const recorder:AutoAdvanceRecorder={subscribe:()=>undefined,recordState:s=>emit({type:"state",...s}),recordDialogueAutoAdvance:body=>{recorded=emit({type:"dialogue_auto_advance",...body});return recorded;}};
  const nativeState=Object.fromEntries(Object.entries(battle).filter(([key])=>!["v","run","seq","t","type","turn"].includes(key)));
  const busy={...IN_GAME,...nativeState,battle:{...battle.battle,text_phase:"busy"}} as GameStateSnapshot;
  const ready={...IN_GAME,...nativeState,battle:{...battle.battle,text_phase:"input"}} as GameStateSnapshot;
  const observe:AgentTool={name:"observe",label:"Observe",description:"",parameters:{},execute:()=>Promise.reject(new Error("final observation failed"))};
  const press=pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},()=>Promise.reject(new Error("no inputs expected")));
  const action:AgentTool={name:"battle_action",label:"Battle",description:"",parameters:{},execute:()=>Promise.resolve({content:[],details:{state:busy}})};
  let journal=0;
  const tools=withDialogueAutoAdvance([observe,press,action],{...features,"dialogue-auto-advance-v1":true,"battle-text-auto-advance-v1":true,"battle-decision-ready-v1":false,"pending-field-dialogue-v1":false},{recorder,state:{read:()=>Promise.resolve(busy),battleWait:()=>Promise.resolve({reason:"input",frames:1,state:ready}),battleMessages:()=>Promise.resolve({frame:1,first_id:1,last_id:journal++===0?0:1,errors:0,last_error:null,entries:journal===1?[]:[{id:1,frame:1,recorded_ms:0,battle:1,battle_turn:1,text:"It's not very effective…",waited_for_input:true}]})}});
  const wrapped=tools.find(t=>t.name==="battle_action");if(wrapped===undefined)throw new Error("battle tool");
  await expect(wrapped.execute("fault",{})).rejects.toThrow("final observation failed");
  expect(recorded?.type).toBe("dialogue_auto_advance");
  expect(recorded!==undefined&&"pages"in recorded?recorded.pages.map(p=>p.text):[]).toEqual(["It's not very effective…"]);
  b.observe({...delivered,id:"fault",name:"battle_action",is_error:true});loss(b);
  expect(text(b)).toContain("Effectiveness pages delivered: unknown");
 });
 it("same stable members compare unchanged despite party reordering",()=>{
  const s=at(GYM_FIELD);const b=fed(features);
  expect(b.block({...s,party:[...s.party].reverse()})).toContain("party membership: unchanged; levels: unchanged; EXP: unchanged; moves: unchanged");
 });
 it("missing source or current levels remain unknown after stable-member reordering",()=>{
  const s=at(GYM_FIELD);
  for(const [missingSource,missingCurrent] of [[false,true],[true,false],[true,true]]){
   const b=new TrainingBlock(features);
   for(const event of EVENTS)if(event.seq<=GYM_FIELD){
    // Preserve actual identity and event ordering; inject an unreadable level only into
    // the second attempt's battle-start snapshot, or only into the current snapshot, and then into both.
    b.observe(missingSource&&event.type==="state"&&"started"in event&&event.turn===538?{...event,party:event.party.map((m,i)=>i===0?{...m,level:null}:m)}:event);
   }
   const party=[...s.party].reverse().map((m,i)=>missingCurrent&&i===1?{...m,level:null}:m);
   expect(b.block({...s,party})).toContain("party membership: unchanged; levels: unknown; EXP: unchanged; moves: unchanged");
  }
 });
 it("aligns changed per-member facts after reordering",()=>{
  const s=at(GYM_FIELD),b=fed(features);
  const party=[...s.party].reverse().map((m,i)=>i===1?{...m,level:(m.level??0)+1,experience:(m.experience??0)+1,moves:m.moves?.map((move,j)=>j===0?{...move,move_id:999}:move)??null}:m);
  expect(b.block({...s,party})).toContain("party membership: unchanged; levels: changed; EXP: changed; moves: changed");
 });
 it("missing or duplicate stable identities keep membership and comparisons unknown",()=>{
  const s=at(GYM_FIELD),b=fed(features);
  for(const party of [s.party.map(m=>({...m,identity:null})),s.party.map(m=>({...m,identity:s.party[0]?.identity??null}))])
   expect(b.block({...s,party})).toContain("party membership: unknown; levels: unknown; EXP: unknown; moves: unknown");
 });
});
