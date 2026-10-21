import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {gunzipSync} from "node:zlib";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {ConversationLedger,LEDGER_HEADER,withInstructionLedgerV2} from "./instruction-ledger-v2.js";
import {InstructionLedger} from "./instruction-ledger.js";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {dependencyProblems,featureInfo,playHarnessFeatures,stateOnlyProblems,SWITCHABLE_FEATURES,FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playGameTools,contextTools} from "./play-wiring.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import type {PlacesBody} from "./story-destinations.js";

// Recorded runs, cut down to the events the ledger reads (states without world context, every
// dialogue_auto_advance, tool results with their text kept only near the decision under test).
// Built by streaming each run's events.jsonl; see docs/worklogs/active/2026-10-17_instruction-ledger-v2.md.
type Run="93eb"|"0e05"|"e962"|"defa"|"2fb4"|"e0cc";
const load=(name:Run):RunEvent[]=>gunzipSync(readFileSync(new URL(`./fixtures/instruction-ledger-v2-${name}.jsonl.gz`,import.meta.url))).toString("utf8").trim().split("\n").map(line=>checkEvent(JSON.parse(line)));
const RUNS:Record<Run,RunEvent[]>={"93eb":load("93eb"),"0e05":load("0e05"),"e962":load("e962"),defa:load("defa"),"2fb4":load("2fb4"),e0cc:load("e0cc")};
type StateEvent=Extract<RunEvent,{type:"state";started:boolean}>;
type ToolResultEvent=Extract<RunEvent,{type:"tool_result"}>;
function snapshot(e:StateEvent):GameStateSnapshot {
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
}
const resultAt=(run:Run,seq:number):ToolResultEvent=>{const e=RUNS[run].find(x=>x.seq===seq);if(e?.type!=="tool_result")throw Error(`no tool result ${String(seq)} in ${run}`);return e;};
const stateAt=(run:Run,seq:number):GameStateSnapshot=>{const e=RUNS[run].find(x=>x.seq===seq);if(e?.type!=="state"||!("started" in e))throw Error(`no state ${String(seq)} in ${run}`);return snapshot(e);};
const OFF:FeatureSet=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as Record<(typeof SWITCHABLE_FEATURES)[number],boolean>;
// The bundle arm: everything on except the switches a play run never combines with it.
const ON:FeatureSet={...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":false,"instruction-ledger-v1":false,"dialogue-log-v1":false,"instruction-ledger-v2":true,"input-cuts-v1":false};
// The ledger as the model reads it in the result of the tool call that produced `seq`.
function ledgerAt(run:Run,seq:number,features:FeatureSet=ON):{ledger:ConversationLedger;result:ToolResultEvent;state:GameStateSnapshot} {
 const ledger=new ConversationLedger(features);const result=resultAt(run,seq);
 for(const e of RUNS[run]){if(e.seq>=seq)break;ledger.observe(e);}
 return {ledger,result,state:stateAt(run,result.state_seq ?? -1)};
}
const X0e05_1286=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person (MOM, INTERVIEWER, turn 74; BRED's HOUSE 1F (map 1/0)):",
 "- MOM: \"Oh! BRED, BRED! Quick! Come quickly!\"",
 "- MOM: \"Look! It's PETALBURG GYM! Maybe DAD will be on!\"",
 "- INTERVIEWER: \"…We brought you this report from in front of PETALBURG GYM.\"",
 "- MOM: \"Oh… It's over.\"",
 "- MOM: \"I think DAD was on, but we missed him. Too bad.\"",
 "- MOM: \"Oh, yes. One of DAD's friends lives in town.\"",
 "- MOM: \"PROF. BIRCH is his name.\"",
 "- MOM: \"He lives right next door, so you should go over and introduce yourself.\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- LITTLEROOT TOWN (map 0/9), here turn 76: last heard turn 62, MOM: \"And, you get your own room, BRED! Let's go inside.\"",
 "- BRED's HOUSE 1F (map 1/0), here turn 75: last heard turn 74, MOM: \"He lives right next door, so you should go over and introduce yourself.\"",
 "- BRED's HOUSE 2F (map 1/1), here turn 71: last heard turn 71, MOM: \"Oh, you should make sure that everything's all there on your desk.\"",
 "- INSIDE OF TRUCK (map 25/40), here turn 58: nothing heard",
].join("\n");
const X2fb4_6401=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person (the woman you talked to, turn 255; PROF. BIRCH'S HOUSE 1F (map 1/2)):",
 "- the woman you talked to: \"Oh, MAY went out to ROUTE 103 just a little while ago.\"",
 "- the woman you talked to: \"Like father, like child. MAY can't stay quietly at home.\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- PROF. BIRCH'S HOUSE 1F (map 1/2), here turn 256: last heard turn 255, the woman you talked to: \"Like father, like child. MAY can't stay quietly at home.\"",
 "- LITTLEROOT TOWN (map 0/9), here turn 252: last heard turn 250, the sign: \"PROF. BIRCH'S HOUSE\"",
 "- YROVE's HOUSE 1F (map 1/0), here turn 247: last heard turn 245, MOM: \"Take care, honey!\"",
 "- PROF. BIRCH'S POKéMON LAB (map 1/4), here turn 223: last heard turn 222, PROF. BIRCH: \"Get MAY to teach you what it means to be a TRAINER.\"",
 "- ROUTE101 (map 0/16), here turn 220: last heard turn 220, PROF. BIRCH: \"This is not the place to chat, so come by my POKéMON LAB later, okay?\"",
 "- PROF. BIRCH'S HOUSE 2F (map 1/3), here turn 170: last heard turn 170, the girl you talked to: \"YROVE, I'll catch you later!\"",
 "- YROVE's HOUSE 2F (map 1/1), here turn 129: last heard turn 129, MOM: \"Oh, you should make sure that everything's all there on your desk.\"",
 "- INSIDE OF TRUCK (map 25/40), here turn 89: last heard turn 84, the box: \"It's a POKéMON brand moving and delivery service.\"",
].join("\n");
const X2fb4_8319=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person (the man you talked to, turn 316; OLDALE TOWN (map 0/10)):",
 "- the man you talked to: \"Aaaaah! Wait! Please don't come in here.\"",
 "- the man you talked to: \"I just discovered the footprints of a rare POKéMON!\"",
 "- the man you talked to: \"Wait until I finish sketching them, okay?\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- ROUTE103 (map 0/18), here turn 320: nothing heard",
 "- OLDALE TOWN (map 0/10), here turn 319: last heard turn 316, the man you talked to: \"Wait until I finish sketching them, okay?\"",
 "- ROUTE101 (map 0/16), here turn 309: last heard turn 220, PROF. BIRCH: \"This is not the place to chat, so come by my POKéMON LAB later, okay?\"",
 "- LITTLEROOT TOWN (map 0/9), here turn 288: last heard turn 250, the sign: \"PROF. BIRCH'S HOUSE\"",
 "- PROF. BIRCH'S HOUSE 1F (map 1/2), here turn 257: last heard turn 255, the woman you talked to: \"Like father, like child. MAY can't stay quietly at home.\"",
 "- YROVE's HOUSE 1F (map 1/0), here turn 247: last heard turn 245, MOM: \"Take care, honey!\"",
 "- PROF. BIRCH'S POKéMON LAB (map 1/4), here turn 223: last heard turn 222, PROF. BIRCH: \"Get MAY to teach you what it means to be a TRAINER.\"",
 "- PROF. BIRCH'S HOUSE 2F (map 1/3), here turn 170: last heard turn 170, the girl you talked to: \"YROVE, I'll catch you later!\"",
 "- YROVE's HOUSE 2F (map 1/1), here turn 129: last heard turn 129, MOM: \"Oh, you should make sure that everything's all there on your desk.\"",
 "- INSIDE OF TRUCK (map 25/40), here turn 89: last heard turn 84, the box: \"It's a POKéMON brand moving and delivery service.\"",
].join("\n");
const X93eb_2771=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person (MOM, INTERVIEWER, turn 131; GREEENN's HOUSE 1F (map 1/0)):",
 "- MOM: \"Oh! GREEENN, GREEENN! Quick! Come quickly!\"",
 "- MOM: \"Look! It's PETALBURG GYM! Maybe DAD will be on!\"",
 "- INTERVIEWER: \"…We brought you this report from in front of PETALBURG GYM.\"",
 "- MOM: \"Oh… It's over.\"",
 "- MOM: \"I think DAD was on, but we missed him. Too bad.\"",
 "- MOM: \"Oh, yes. One of DAD's friends lives in town.\"",
 "- MOM: \"PROF. BIRCH is his name.\"",
 "- MOM: \"He lives right next door, so you should go over and introduce yourself.\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- LITTLEROOT TOWN (map 0/9), here turn 134: last heard turn 120, MOM: \"And, you get your own room, GREEENN! Let's go inside.\"",
 "- GREEENN's HOUSE 1F (map 1/0), here turn 132: last heard turn 131, MOM: \"He lives right next door, so you should go over and introduce yourself.\"",
 "- GREEENN's HOUSE 2F (map 1/1), here turn 129: last heard turn 128, MOM: \"Oh, you should make sure that everything's all there on your desk.\"",
 "- INSIDE OF TRUCK (map 25/40), here turn 115: last heard turn 112, the box: \"It's a POKéMON brand moving and delivery service.\"",
].join("\n");
const X93eb_892=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person: none yet; the latest field page, turn 57 in INSIDE OF TRUCK (map 25/40):",
 "- the box: \"It's a POKéMON brand moving and delivery service.\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- INSIDE OF TRUCK (map 25/40), here turn 57: last heard turn 57, the box: \"It's a POKéMON brand moving and delivery service.\"",
].join("\n");
const Xdefa_9920=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person (MAY, turn 402; ROUTE103 (map 0/18)):",
 "- MAY: \"I think I know why my dad has an eye out for you now.\"",
 "- MAY: \"I mean, you just got that POKéMON, but it already likes you.\"",
 "- MAY: \"You might be able to befriend any kind of POKéMON easily.\"",
 "- MAY: \"Well, it's time to head back to the LAB.\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- ROUTE103 (map 0/18), here turn 402: last heard turn 402, MAY: \"Well, it's time to head back to the LAB.\"",
 "- OLDALE TOWN (map 0/10), here turn 368: last heard turn 365, the man you talked to: \"Wait until I finish sketching them, okay?\"",
 "- OLDALE TOWN POKEMON CENTER 1F (map 2/2), here turn 361: last heard turn 293, no speaker shown: \"We hope to see you again!\"",
 "- ROUTE101 (map 0/16), here turn 279: last heard turn 127, PROF. BIRCH: \"This is not the place to chat, so come by my POKéMON LAB later, okay?\"",
 "- LITTLEROOT TOWN (map 0/9), here turn 265: last heard turn 115, the girl you talked to: \"Can you go see what's happening for me?\"",
 "- PROF. BIRCH'S POKéMON LAB (map 1/4), here turn 261: last heard turn 132, PROF. BIRCH: \"Get MAY to teach you what it means to be a TRAINER.\"",
 "- PROF. BIRCH'S HOUSE 1F (map 1/2), here turn 112: last heard turn 104, the woman you talked to: \"Our daughter is upstairs, I think.\"",
 "- PROF. BIRCH'S HOUSE 2F (map 1/3), here turn 110: last heard turn 110, the girl you talked to: \"GRREEN, I'll catch you later!\"",
 "- GRREEN's HOUSE 1F (map 1/0), here turn 88: last heard turn 87, MOM: \"He lives right next door, so you should go over and introduce yourself.\"",
 "- GRREEN's HOUSE 2F (map 1/1), here turn 83: last heard turn 83, MOM: \"Oh, you should make sure that everything's all there on your desk.\"",
 "- INSIDE OF TRUCK (map 25/40), here turn 63: nothing heard",
].join("\n");
const Xe962_10160=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person (MAY, turn 444; ROUTE103 (map 0/18)):",
 "- MAY: \"I think I know why my dad has an eye out for you now.\"",
 "- MAY: \"I mean, you just got that POKéMON, but it already likes you.\"",
 "- MAY: \"You might be able to befriend any kind of POKéMON easily.\"",
 "- MAY: \"Well, it's time to head back to the LAB.\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- ROUTE103 (map 0/18), here turn 445: last heard turn 444, MAY: \"Well, it's time to head back to the LAB.\"",
 "- OLDALE TOWN (map 0/10), here turn 402: last heard turn 399, the man you talked to: \"Wait until I finish sketching them, okay?\"",
 "- ROUTE101 (map 0/16), here turn 389: last heard turn 125, PROF. BIRCH: \"This is not the place to chat, so come by my POKéMON LAB later, okay?\"",
 "- LITTLEROOT TOWN (map 0/9), here turn 374: last heard turn 144, the sign: \"RRED's HOUSE\"",
 "- OLDALE TOWN POKEMON CENTER 1F (map 2/2), here turn 300: last heard turn 298, no speaker shown: \"We hope to see you again!\"",
 "- PROF. BIRCH'S POKéMON LAB (map 1/4), here turn 160: last heard turn 159, the scientist you talked to: \"The PROF enjoys MAY's help, too. There's a lot of love there.\"",
 "- RRED's HOUSE 1F (map 1/0), here turn 149: last heard turn 148, MOM: \"Take care, honey!\"",
 "- PROF. BIRCH'S HOUSE 1F (map 1/2), here turn 139: last heard turn 98, the girl you talked to: \"RRED, I'll catch you later!\"",
 "- PROF. BIRCH'S HOUSE 2F (map 1/3), here turn 137: nothing heard",
 "- RRED's HOUSE 2F (map 1/1), here turn 81: last heard turn 81, MOM: \"Oh, you should make sure that everything's all there on your desk.\"",
 "- INSIDE OF TRUCK (map 25/40), here turn 61: last heard turn 58, the box: \"It's a POKéMON brand moving and delivery service.\"",
].join("\n");
const Xe962_10341=[
 "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
 "Latest conversation with a person (MAY, turn 450; OLDALE TOWN (map 0/10)):",
 "- MAY: \"RRED! Over here! Let's hurry home!\"",
 "Rooms visited, newest first, with the last line heard in each:",
 "- OLDALE TOWN (map 0/10), here turn 450: last heard turn 450, MAY: \"RRED! Over here! Let's hurry home!\"",
 "- ROUTE103 (map 0/18), here turn 446: last heard turn 444, MAY: \"Well, it's time to head back to the LAB.\"",
 "- ROUTE101 (map 0/16), here turn 389: last heard turn 125, PROF. BIRCH: \"This is not the place to chat, so come by my POKéMON LAB later, okay?\"",
 "- LITTLEROOT TOWN (map 0/9), here turn 374: last heard turn 144, the sign: \"RRED's HOUSE\"",
 "- OLDALE TOWN POKEMON CENTER 1F (map 2/2), here turn 300: last heard turn 298, no speaker shown: \"We hope to see you again!\"",
 "- PROF. BIRCH'S POKéMON LAB (map 1/4), here turn 160: last heard turn 159, the scientist you talked to: \"The PROF enjoys MAY's help, too. There's a lot of love there.\"",
 "- RRED's HOUSE 1F (map 1/0), here turn 149: last heard turn 148, MOM: \"Take care, honey!\"",
 "- PROF. BIRCH'S HOUSE 1F (map 1/2), here turn 139: last heard turn 98, the girl you talked to: \"RRED, I'll catch you later!\"",
 "- PROF. BIRCH'S HOUSE 2F (map 1/3), here turn 137: nothing heard",
 "- RRED's HOUSE 2F (map 1/1), here turn 81: last heard turn 81, MOM: \"Oh, you should make sure that everything's all there on your desk.\"",
 "- INSIDE OF TRUCK (map 25/40), here turn 61: last heard turn 58, the box: \"It's a POKéMON brand moving and delivery service.\"",
].join("\n");

describe("instruction-ledger-v2 on recorded runs",()=>{
 it("93eb T134: pins Mom's whole TV conversation (MOM, INTERVIEWER, turn 131) with \"He lives right next door\", and each room's last line",()=>{
  const {ledger,result,state}=ledgerAt("93eb",2771);
  expect(ledger.block(state,result.id)).toBe(X93eb_2771);
  expect(X93eb_2771.startsWith(LEDGER_HEADER)).toBe(true);
 });
 it("93eb T134: the block sits right under the readout's Story line; nothing else changes and nothing is clipped",()=>{
  const {ledger,result,state}=ledgerAt("93eb",2771);
  const text=ledger.annotate(result.text,state,result.id);
  expect(text).toContain(`\nStory: player name confirmed; Mom clock instruction received; clock set; Mom told you PROF. BIRCH lives next door (after the Petalburg Gym TV report)\n${X93eb_2771}\nPlayer: GREEENN\nLocation: LITTLEROOT TOWN\n`);
  expect(text.replace(`${X93eb_2771}\n`,"")).toBe(result.text);
  // Inside the result, not after it: the readout's own lines still follow the ledger.
  expect(text.indexOf(X93eb_2771)).toBeLessThan(text.indexOf("Play time:"));
 });
 it("0e05 T76: the same conversation in another run, with this run's player name",()=>{
  const {ledger,result,state}=ledgerAt("0e05",1286);
  expect(ledger.block(state,result.id)).toBe(X0e05_1286);
 });
 it("e962 T445: pins MAY's four post-battle pages (MAY, turn 444); battle text never counts",()=>{
  const {ledger,result,state}=ledgerAt("e962",10160);
  const block=ledger.block(state,result.id);
  expect(block).toBe(Xe962_10160);
  expect(block).not.toContain("fainted");
  expect(block).not.toContain("Wow! That's great!");
 });
 it("e962 T450: a newer MAY line replaces the pin, and ROUTE 103 keeps \"head back to the LAB\" as its last line heard",()=>{
  const {ledger,result,state}=ledgerAt("e962",10341);
  const block=ledger.block(state,result.id);
  expect(block).toBe(Xe962_10341);
  expect(block).toContain("- ROUTE103 (map 0/18), here turn 446: last heard turn 444, MAY: \"Well, it's time to head back to the LAB.\"");
  expect(block).toContain("- OLDALE TOWN (map 0/10), here turn 450: last heard turn 450, MAY: \"RRED! Over here! Let's hurry home!\"");
 });
 it("defa T402: the result that delivers MAY's pages already pins them, and \"last heard\" fills from the auto-advance pages (v1 stays \"nothing heard\")",()=>{
  const {ledger,result,state}=ledgerAt("defa",9920);
  expect(ledger.block(state,result.id)).toBe(Xdefa_9920);
  // The v1 bug: its room line compares the newest page's seq (9911) with the result's state (9918).
  const v1=new InstructionLedger({...ON,"instruction-ledger-v1":true});
  for(const e of RUNS.defa){if(e.seq>9920)break;v1.observe(e);}
  expect(v1.text()).toMatch(/^ROUTE103 \(map 0\/18\) \(first turn \d+\): nothing heard$/m);
 });
 it("2fb4 T256: the woman in PROF. BIRCH'S HOUSE 1F (\"went out to ROUTE 103\", RivalsHouse_1F_Text_WentOutToRoute103, no NAME: prefix) is pinned while she is the latest person",()=>{
  const {ledger,result,state}=ledgerAt("2fb4",6401);
  expect(ledger.block(state,result.id)).toBe(X2fb4_6401);
 });
 it("2fb4 T321 (MAY visible on ROUTE 103): newer person filler replaces it (operator's choice); the woman's line stays as that room's last line; signs never pin",()=>{
  const {ledger,result,state}=ledgerAt("2fb4",8319);
  const block=ledger.block(state,result.id) ?? "";
  expect(block).toBe(X2fb4_8319);
  expect(block).toContain("last heard turn 255, the woman you talked to: \"Like father, like child. MAY can't stay quietly at home.\"");
  expect(block).toContain("last heard turn 250, the sign: \"PROF. BIRCH'S HOUSE\"");
  expect(block).not.toMatch(/WOMAN_4|RIVAL_MAY|MANIAC|MOVING_BOX|sprite kind/);
 });
 it("93eb T57: before any conversation with a person, the latest field page (the box) stands in, labelled as such",()=>{
  const {ledger,result,state}=ledgerAt("93eb",892);
  expect(ledger.block(state,result.id)).toBe(X93eb_892);
 });
});

// Live bundle run 2026-10-17T15-16-43_qwen36-gpu0_e0cc (pin f5742c0, instruction-ledger-v1 ON): its recorded
// ledgers said "nothing heard" for rooms where dialogue was shown (3419 of 3493 room lines). v1 sets a room's line
// only when the newest page's seq equals the tool result's state seq, which auto-advance pages never do.
describe("room lines regression, recorded run e0cc (May's house)",()=>{
 const MOM_1F="- PROF. BIRCH'S HOUSE 1F (map 1/2), here turn 70: last heard turn 70, the woman you talked to: \"Our daughter is upstairs, I think.\"";
 const recorded=(seq:number)=>{const e=RUNS.e0cc.find(x=>x.seq===seq);if(e?.type!=="ledger_context")throw Error(`no ledger ${String(seq)}`);return e.text;};
 it("T71 result (v1 ledger 1576): v2 gives May's house 1F the mom's last line with its speaker; v1 recorded and still replays \"nothing heard\"",()=>{
  const {ledger,result,state}=ledgerAt("e0cc",1573);
  expect(ledger.block(state,result.id)).toContain(MOM_1F);
  expect(recorded(1576)).toContain("PROF. BIRCH'S HOUSE 1F (map 1/2) (first turn 68): nothing heard");
  const v1=new InstructionLedger({...ON,"instruction-ledger-v1":true});
  for(const e of RUNS.e0cc){if(e.seq>1573)break;v1.observe(e);}
  expect(v1.text()).toContain("PROF. BIRCH'S HOUSE 1F (map 1/2) (first turn 68): nothing heard");
 });
 it("T79 result (v1 ledger 1835): 2F keeps MAY's last line after her twelve pages; 1F keeps the mom's",()=>{
  const {ledger,result,state}=ledgerAt("e0cc",1832);
  const block=ledger.block(state,result.id);
  expect(block).toContain("- PROF. BIRCH'S HOUSE 2F (map 1/3), here turn 78: last heard turn 76, the girl you talked to: \"GREEN, I'll catch you later!\"");
  expect(block).toContain(MOM_1F.replace("here turn 70","here turn 79"));
  expect(recorded(1835)).toContain("PROF. BIRCH'S HOUSE 2F (map 1/3) (first turn 71): nothing heard");
 });
 it("T134 result at the May fork (v1 ledger 3528): May's house 1F still shows the mom's line",()=>{
  const {ledger,result,state}=ledgerAt("e0cc",3525);
  expect(ledger.block(state,result.id)).toContain(MOM_1F.replace("here turn 70","here turn 134"));
  expect(recorded(3528)).toContain("PROF. BIRCH'S HOUSE 1F (map 1/2) (first turn 68): nothing heard");
 });
});

let seq=900000;
const ev=(body:Record<string,unknown>):RunEvent=>checkEvent({v:1,run:"r",t:"2026-10-17T16:00:00.000-04:00",turn:1,seq:++seq,...body});
const page=(text:string,speaker:string|null,source:"name_prefix"|"faced_sprite"|"faced_target"|null,extra:Record<string,unknown>={})=>({state_seq:null,map:"ROUTE103",map_id:[0,18],position:null,speaker,speaker_source:source,text,...extra});
const talk=(id:string,turn:number,pages:readonly object[])=>ev({type:"dialogue_auto_advance",turn,tool_call_id:id,tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages,stop:"field_free",detail:"d",duration_ms:1});
const delivered=(id:string,turn:number,is_error=false)=>ev({type:"tool_result",turn,id,name:"press",is_error,duration_ms:1,text:"pressed A",frames:[]});
const ROUTE=snapshotOf({screen:"overworld",started:true,name:"RAED",location:"ROUTE103",map_id:[0,18],position:{x:10,y:4},facing:"down",in_battle:false,party:[],money:0,badges:[],play_time_s:1,world_context:null,interaction_targets:null,navigation_grid:null});
function snapshotOf(body:Record<string,unknown>):GameStateSnapshot {return parseGameState(body);}

describe("instruction-ledger-v2 rules",()=>{
 it("an empty ledger says so and lists the room the player is in",()=>{
  const ledger=new ConversationLedger(ON);
  ledger.observe(ev({type:"tool_call",turn:1,id:"c",name:"observe",args:{}}));
  expect(ledger.block(ROUTE,"c")).toBe([
   "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
   "Latest conversation with a person: none yet; no field dialogue shown yet.",
   "Rooms visited, newest first, with the last line heard in each:",
   "- ROUTE103 (map 0/18), here turn 1: nothing heard",
  ].join("\n"));
 });
 it("shows only on the free overworld of a started game, never in battle or on a menu screen",()=>{
  const ledger=new ConversationLedger(ON);
  for(const state of [{...ROUTE,in_battle:true},{...ROUTE,screen:"main_menu"},{...ROUTE,started:false}]){
   expect(ledger.block(state,"c")).toBeNull();
   expect(ledger.annotate("Story: x\nLocation: ROUTE103",state,"c")).toBe("Story: x\nLocation: ROUTE103");
  }
 });
 it("anchors after Location/Position when the readout has no Story line, and leaves a result without a readout alone",()=>{
  const ledger=new ConversationLedger(ON);
  const block=ledger.block(ROUTE,"c") ?? "";
  expect(ledger.annotate("Screen: overworld\nLocation: ROUTE103\nPosition: X=10, Y=4\nParty: none",ROUTE,"c")).toBe(`Screen: overworld\nLocation: ROUTE103\nPosition: X=10, Y=4\n${block}\nParty: none`);
  expect(ledger.annotate("Navigation: refused",ROUTE,"c")).toBe("Navigation: refused");
 });
 it("a page counts only once its result reached the model; an error result delivers nothing",()=>{
  const ledger=new ConversationLedger(ON);
  ledger.observe(talk("t1",5,[page("MAY: Hi!","MAY","name_prefix")]));ledger.observe(delivered("t1",5,true));
  expect(ledger.block(ROUTE,"next")).toContain("none yet; no field dialogue shown yet.");
  ledger.observe(talk("t2",6,[page("MAY: Hello again!","MAY","name_prefix")]));
  // Shown in the very result that delivers it...
  expect(ledger.block(ROUTE,"t2")).toContain("(MAY, turn 6; ROUTE103 (map 0/18)):\n- MAY: \"Hello again!\"");
  // ...but not in another call's result until it has been delivered.
  expect(ledger.block(ROUTE,"other")).toContain("none yet; no field dialogue shown yet.");
  ledger.observe(delivered("t2",6));
  expect(ledger.block(ROUTE,"other")).toContain("- MAY: \"Hello again!\"");
 });
 it("every line names who said it: the NAME: prefix, a faced person by how they look, a sign or object as such, never a raw sprite id",()=>{
  const ledger=new ConversationLedger(ON);
  ledger.observe(talk("a",2,[page("MOM: Go next door.","MOM","name_prefix")]));ledger.observe(delivered("a",2));
  ledger.observe(talk("b",3,[page("The clock is stopped…","Wall clock","faced_target"),page("PROF. BIRCH'S HOUSE",'Sign text "PROF. BIRCH\'S HOUSE"',"faced_target"),page("The box is printed with a POKéMON logo.","MOVING_BOX","faced_sprite"),page("We hope to see you again!",null,null)]));ledger.observe(delivered("b",3));
  const block=ledger.block(ROUTE,"c") ?? "";
  // Signs, objects and pages with no speaker never become the pinned conversation.
  expect(block).toContain("(MOM, turn 2; ROUTE103 (map 0/18)):\n- MOM: \"Go next door.\"\nRooms visited");
  expect(block).toContain("- ROUTE103 (map 0/18), here turn 3: last heard turn 3, no speaker shown: \"We hope to see you again!\"");
  for(const [id,who] of [["d","the wall clock"],["e","the sign"],["f","the box"]] as const){
   const p=id==="d"?page("The clock is stopped…","Wall clock","faced_target"):id==="e"?page("PROF. BIRCH'S HOUSE",'Sign text "PROF. BIRCH\'S HOUSE"',"faced_target"):page("The box is printed with a POKéMON logo.","MOVING_BOX","faced_sprite");
   ledger.observe(talk(id,4,[p]));ledger.observe(delivered(id,4));
   expect(ledger.block(ROUTE,"c")).toContain(`last heard turn 4, ${who}: "`);
  }
  expect(ledger.block(ROUTE,"c")).toContain("(MOM, turn 2;");
  // A faced person is a conversation with a person, described by how they look.
  for(const [kind,who] of [["MANIAC","the man you talked to"],["WOMAN_4","the woman you talked to"],["RIVAL_MAY_NORMAL","the girl you talked to"],["BRENDAN_NORMAL","the boy you talked to"],["OLD_MAN","the old man you talked to"],["SCIENTIST_1","the scientist you talked to"]] as const){
   const fresh=new ConversationLedger(ON);
   fresh.observe(talk("p",1,[page("Hello.",kind,"faced_sprite")]));fresh.observe(delivered("p",1));
   expect(fresh.block(ROUTE,"c")).toContain(`Latest conversation with a person (${who}, turn 1; ROUTE103 (map 0/18)):\n- ${who}: "Hello."`);
  }
  for(const [kind,who] of [["ITEM_BALL","the item ball"],["PIKACHU_DOLL","the doll"],["SPIN_CUSHION","the cushion"],["SUBMARINE_SHADOW","the shadow"],["ZIGZAGOON_1","the POKéMON"]] as const){
   const fresh=new ConversationLedger(ON);
   fresh.observe(talk("o",1,[page("…",kind,"faced_sprite")]));fresh.observe(delivered("o",1));
   expect(fresh.block(ROUTE,"c")).toContain(`none yet; the latest field page, turn 1 in ROUTE103 (map 0/18):\n- ${who}: "…"`);
  }
  const tv=new ConversationLedger(ON);
  tv.observe(talk("t",1,[page("It's a TV.","TV","faced_target")]));tv.observe(delivered("t",1));
  expect(tv.block(ROUTE,"c")).toContain("- the TV: \"It's a TV.\"");
 });
 it("a sprite the game names in the same conversation keeps that name on that map, and only there",()=>{
  const ledger=new ConversationLedger(ON);
  ledger.observe(talk("a",1,[page("MOM: See?","MOM","name_prefix"),page("Go check it out, dear!","MOM","faced_sprite")]));ledger.observe(delivered("a",1));
  ledger.observe(talk("b",2,[page("Don't forget to set it!","MOM","faced_sprite")]));
  expect(ledger.block(ROUTE,"b")).toContain("(MOM, turn 2; ROUTE103 (map 0/18)):\n- MOM: \"Don't forget to set it!\"");
  ledger.observe(talk("c",3,[page("Hi.","MOM","faced_sprite",{map:"OLDALE TOWN",map_id:[0,10]})]));
  expect(ledger.block(ROUTE,"c")).toContain("- the woman you talked to: \"Hi.\"");
  // Two names or two sprites in one conversation: no link.
  const two=new ConversationLedger(ON);
  two.observe(talk("x",1,[page("MAY: Hi.","MAY","name_prefix"),page("DAD: Hi.","DAD","name_prefix"),page("Yo.","WOMAN_4","faced_sprite")]));two.observe(delivered("x",1));
  two.observe(talk("y",2,[page("Yo.","WOMAN_4","faced_sprite")]));
  expect(two.block(ROUTE,"y")).toContain("- the woman you talked to: \"Yo.\"");
 });
 it("a conversation is every field page of one call, in order, with every person who spoke; battle pages are skipped",()=>{
  const ledger=new ConversationLedger(ON);
  ledger.observe(talk("a",9,[page("MAY: Let's battle!","MAY","name_prefix"),page("PKMN TRAINER MAY\nwould like to battle!",null,null,{battle_turn:1}),page("PROF. BIRCH: Well done!","PROF. BIRCH","name_prefix",{map:"OLDALE TOWN",map_id:[0,10]}),page("RAED received\nthe POTION!",null,null,{map:"OLDALE TOWN",map_id:[0,10]}),page("See you!","MAY","name_prefix",{map:"OLDALE TOWN",map_id:[0,10]})]));
  ledger.observe(delivered("a",9));
  expect(ledger.block(ROUTE,"c")).toContain([
   "Latest conversation with a person (MAY, PROF. BIRCH, turn 9; ROUTE103 (map 0/18), then OLDALE TOWN (map 0/10)):",
   "- MAY: \"Let's battle!\"",
   "- PROF. BIRCH: \"Well done!\"",
   "- no speaker shown: \"RAED received the POTION!\"",
   "- MAY: \"See you!\"",
   "Rooms visited, newest first, with the last line heard in each:",
   "- ROUTE103 (map 0/18), here turn 9: last heard turn 9, MAY: \"Let's battle!\"",
   "- OLDALE TOWN (map 0/10), here turn 9: last heard turn 9, MAY: \"See you!\"",
  ].join("\n"));
 });
 it("pages with no map join no room; a call with only battle text changes nothing; at most 16 undelivered calls are kept",()=>{
  const ledger=new ConversationLedger(ON);
  ledger.observe(talk("m",3,[page("MAY: Hi!","MAY","name_prefix",{map:null,map_id:null})]));ledger.observe(delivered("m",3));
  ledger.observe(talk("b",4,[page("Go! TORCHIC!",null,null,{battle_turn:1})]));
  expect(ledger.block(ROUTE,"b")).toBe([
   "Conversation ledger: game text you were shown, quoted whole; past text, the current screen overrides it.",
   "Latest conversation with a person (MAY, turn 3):",
   "- MAY: \"Hi!\"",
   "Rooms visited, newest first, with the last line heard in each:",
   "- ROUTE103 (map 0/18), here turn 4: nothing heard",
  ].join("\n"));
  const fresh=new ConversationLedger(ON);
  fresh.observe(talk("n",1,[page("…",null,null,{map:null,map_id:null})]));fresh.observe(delivered("n",1));
  expect(fresh.block(ROUTE,"c")).toContain("none yet; the latest field page, turn 1:\n- no speaker shown: \"…\"\n");
  const busy=new ConversationLedger(ON);
  for(let i=0;i<17;i++)busy.observe(talk(`k${String(i)}`,1,[page(`MAY: Line ${String(i)}.`,"MAY","name_prefix")]));
  busy.observe(delivered("k0",1));
  expect(busy.block(ROUTE,"c")).toContain("none yet; no field dialogue shown yet.");
  busy.observe(delivered("k16",1));
  expect(busy.block(ROUTE,"c")).toContain("- MAY: \"Line 16.\"");
 });
 it("names a room the way the readout does once a readout has shown it, and without the map id when navigation is off",()=>{
  const ledger=new ConversationLedger({...ON,"bounded-navigation-v1":false});
  ledger.observe(talk("a",1,[page("MOM: See?","MOM","name_prefix",{map:"LITTLEROOT TOWN BRENDANS HOUSE 1F",map_id:[1,0]})]));ledger.observe(delivered("a",1));
  const house={...ROUTE,location:"LITTLEROOT TOWN BRENDANS HOUSE 1F",location_display:"RAED's HOUSE 1F",map_id:[1,0] as [number,number]};
  expect(ledger.block({...ROUTE},"c")).toContain("- LITTLEROOT TOWN BRENDANS HOUSE 1F, here turn 1: last heard turn 1, MOM: \"See?\"");
  expect(ledger.block(house,"c")).toContain("(MOM, turn 1; RAED's HOUSE 1F):");
  ledger.observe(ev({type:"state",turn:2,...house}));ledger.observe(ev({type:"tool_result",turn:2,id:"o",name:"observe",is_error:false,duration_ms:1,text:"",frames:[],state_seq:seq}));
  expect(ledger.block(ROUTE,"c")).toContain("- RAED's HOUSE 1F, here turn 2: last heard turn 1, MOM: \"See?\"");
 });
});

interface Details {readonly state:GameStateSnapshot}
function fakeObserve(state:GameStateSnapshot,text:string):AgentTool {
 return {name:"observe",label:"Observe",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"image",data:"x",mimeType:"image/png"},{type:"text",text}],details:{state}} satisfies AgentToolResult<Details>)};
}
function fakePress(state:GameStateSnapshot,text:string):CheckedPressTool {
 const result=():Promise<AgentToolResult<Details>>=>Promise.resolve({content:[{type:"text",text}],details:{state}});
 return {name:"press",label:"Press",description:"d",parameters:Type.Object({buttons:Type.Array(Type.String())}),execute:result,executeChecked:result} as unknown as CheckedPressTool;
}
const textOf=(r:AgentToolResult<unknown>)=>r.content.map(c=>c.type==="text"?c.text:"").join("|");
const empty={content:[],details:undefined};

describe("instruction-ledger-v2 switch",()=>{
 const result=resultAt("93eb",2771);
 const state=stateAt("93eb",result.state_seq ?? -1);
 const replayInto=(subs:readonly ((e:RunEvent)=>void)[])=>{for(const e of RUNS["93eb"]){if(e.seq>=2771)break;for(const fn of subs)fn(e);}};
 it("OFF hands back the very same tools and subscribes to nothing",async()=>{
  const subs:unknown[]=[];const tools=[fakeObserve(state,result.text),fakePress(state,result.text)];
  const out=withInstructionLedgerV2(tools,{...ON,"instruction-ledger-v2":false},{subscribe:fn=>{subs.push(fn);}});
  expect(out).toHaveLength(2);out.forEach((t,i)=>{expect(t).toBe(tools[i]);});
  expect(subs).toHaveLength(0);
  expect(textOf(await out[0]?.execute("x",{}) ?? empty)).toBe(`|${result.text}`);
 });
 it("ON adds the block to observe, press and navigate_to results, keeps press checkable and leaves other tools alone",async()=>{
  const subs:((e:RunEvent)=>void)[]=[];
  const other:AgentTool={name:"get_dialogue",label:"g",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:"Story: x\nLocation: y"}],details:{state}})};
  const nav:AgentTool={...other,name:"navigate_to",execute:()=>Promise.resolve({content:[{type:"text",text:result.text}],details:{state}})};
  const out=withInstructionLedgerV2([fakeObserve(state,result.text),fakePress(state,result.text),nav,other],ON,{subscribe:fn=>{subs.push(fn);}});
  expect(subs).toHaveLength(1);
  replayInto(subs);
  const expected=`|${result.text.replace("\nPlayer: GREEENN\n",`\n${X93eb_2771}\nPlayer: GREEENN\n`)}`;
  expect(textOf(await out[0]?.execute(result.id,{}) ?? empty)).toBe(expected);
  const press=out[1];
  if(press===undefined||!isCheckedPress(press))throw Error("press lost executeChecked");
  expect(textOf(await press.execute(result.id,{buttons:["A"]}))).toBe(expected.slice(1));
  expect(textOf(await press.executeChecked(result.id,{buttons:["A"]},()=>undefined))).toBe(expected.slice(1));
  expect(textOf(await out[2]?.execute(result.id,{}) ?? empty)).toBe(expected.slice(1));
  expect(out[3]).toBe(other);
  const noReadout:AgentTool={...other,name:"navigate_to",execute:()=>Promise.resolve({content:[{type:"text",text:"Navigation: refused"}],details:{state}})};
  const [n]=withInstructionLedgerV2([noReadout],ON,{subscribe:()=>undefined});
  expect(textOf(await n?.execute("n",{}) ?? empty)).toBe("Navigation: refused");
  // A result without state passes through untouched.
  const bare:AgentTool={...other,name:"observe",execute:()=>Promise.resolve({content:[{type:"text",text:"Story: x"}],details:undefined})};
  const [b]=withInstructionLedgerV2([bare],ON,{subscribe:()=>undefined});
  expect(textOf(await b?.execute("b",{}) ?? empty)).toBe("Story: x");
 });
 it("the production factory honors the switch: ON puts the block in the result, OFF is byte-identical",async()=>{
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const reader={read:()=>Promise.resolve(state)};
  const only={...OFF,"instruction-ledger-v2":true};
  const on=playGameTools([fakeObserve(state,result.text)],only,reader,recorder);
  replayInto(subs);
  // Navigation is off here, so rooms carry no map ids; otherwise the same block as T134 above.
  const block=X93eb_2771.replace(/ \(map \d+\/\d+\)/g,"");
  expect(ledgerAt("93eb",2771,only).ledger.block(state,result.id)).toBe(block);
  expect(textOf(await on[0]?.execute(result.id,{}) ?? empty)).toBe(`|${result.text.replace("\nPlayer: GREEENN\n",`\n${block}\nPlayer: GREEENN\n`)}`);
  const count=subs.length;
  const off=playGameTools([fakeObserve(state,result.text)],{...only,"instruction-ledger-v2":false},reader,recorder);
  expect(subs.length).toBe(count);
  expect(textOf(await off[0]?.execute(result.id,{}) ?? empty)).toBe(`|${result.text}`);
 });
 it("with story destinations on, the ledger is right under the Story line and the story-destinations block follows unchanged",async()=>{
  const PLACES=JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody;
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const reader={read:()=>Promise.resolve(state),places:()=>Promise.resolve(PLACES)};
  const both={...OFF,"instruction-ledger-v2":true,"story-destinations-v1":true};
  const [withLedger]=playGameTools([fakeObserve(state,result.text)],both,reader,recorder);
  const [without]=playGameTools([fakeObserve(state,result.text)],{...both,"instruction-ledger-v2":false},reader,recorder);
  replayInto(subs);
  const plain=textOf(await without?.execute(result.id,{}) ?? empty);
  expect(plain).toContain("Latest story line naming a place");
  const block=X93eb_2771.replace(/ \(map \d+\/\d+\)/g,"");
  expect(textOf(await withLedger?.execute(result.id,{}) ?? empty)).toBe(plain.replace("(after the Petalburg Gym TV report)\n",`(after the Petalburg Gym TV report)\n${block}\n`));
 });
 it("registers no tool, no prompt line and no ledger_context event: the tool result carries the record",()=>{
  expect(playTools(ON)).toEqual(playTools({...ON,"instruction-ledger-v2":false}));
  expect(playTools(ON)).not.toContain("note_contradiction");
  expect(playSystemPrompt(ON,null)).toBe(playSystemPrompt({...ON,"instruction-ledger-v2":false},null));
  const recorded:unknown[]=[];
  const recorder={subscribe:()=>undefined,recordNavigationContext:()=>undefined,recordLedgerContext:(b:unknown)=>{recorded.push(b);},recordMilestoneHint:()=>undefined,recordLoopBreaker:()=>undefined,recordBeliefLedger:()=>undefined};
  const wiring=contextTools({...OFF,"instruction-ledger-v2":true},recorder,m=>Promise.resolve(m));
  expect(wiring.tools).toEqual([]);
  expect(recorded).toEqual([]);
 });
 it("is registered last, default-off, an observation that needs dialogue auto-advance",()=>{
  const id="instruction-ledger-v2";
  expect(SWITCHABLE_FEATURES.at(-79)).toBe(id);
  expect(FEATURES.filter(f=>f.switchable).at(-79)?.id).toBe(id);
  expect(featureInfo(id)).toMatchObject({group:"observation",title:"CONVERSATION LEDGER",needs:"dialogue-auto-advance-v1",switchable:true});
  expect(featureInfo(id).description).toContain(" Off: ");
  // The switchboard copy describes the shipped rule (review round 1: it still described the NAME:-only pin).
  const copy=featureInfo(id).description;
  for(const phrase of ["the latest conversation with a person","Every line names who said it","the game's own NAME: prefix","\"the woman you talked to\"","the name the game printed for that same sprite on that map","\"the sign\"","never become the pinned conversation","keyed on each dialogue page's own map","Internal sprite ids are never printed"])expect(copy,phrase).toContain(phrase);
  for(const stale of ["names the speaker","sprite kind, not a name","NAME: prefix decides"])expect(copy,stale).not.toContain(stale);
  expect(dependencyProblems({...OFF,[id]:true})).toContain(`${id} needs dialogue-auto-advance-v1`);
  expect(playHarnessFeatures(ALL_ON,null).at(-27)).toBe(id);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[id]:false},null)).not.toContain(id);
  expect(stateOnlyProblems({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":true})).toContain(`state-only-decisions-v1 requires ${id} OFF`);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[id]).toBe(false);
  const without=Object.fromEntries(Object.entries({...ALL_ON,"battle-decision-ready-v1":false,"state-only-decisions-v1":false}).filter(([k])=>k!==id));
  const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without});
  expect(presetFeatures(preset)[id]).toBe(false);
  expect(Object.keys(normalizeFeatures(without as Parameters<typeof normalizeFeatures>[0])).at(-79)).toBe(id);
  // instruction-ledger-v1 is unchanged: same title, tool and description.
  expect(featureInfo("instruction-ledger-v1").title).toBe("INSTRUCTION LEDGER");
 });
});

describe("the pending experiment",()=>{
 it("is pending, flips only instruction-ledger-v2, and both arms record dialogue pages",()=>{
  const entry=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/instruction-ledger-v2.json",import.meta.url),"utf8")));
  expect(entry.queuePosition).toBeUndefined();
  expect(entry.changedFeature).toBe("instruction-ledger-v2");
  const {incumbent,candidate}=experimentArms(entry);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof typeof candidate.features]!==incumbent.features[id as keyof typeof incumbent.features])).toEqual(["instruction-ledger-v2"]);
  expect(candidate.features["instruction-ledger-v2"]).toBe(true);
  for(const arm of [incumbent,candidate]){expect(arm.features["dialogue-auto-advance-v1"]).toBe(true);expect(arm.features["instruction-ledger-v1"]).toBe(false);expect(arm.features["dialogue-log-v1"]).toBe(false);}
  expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
  expect(entry.hypothesis).toContain("latest conversation with a person");
  expect(entry.hypothesis).not.toContain("names the speaker");
 });
});
