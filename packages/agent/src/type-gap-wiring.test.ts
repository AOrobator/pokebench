import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import type {RunEvent} from "./events.js";
import {ALL_ON,type FeatureSet} from "./features.js";
import {playGameTools} from "./play-wiring.js";
import {BATCH_DEFAULTS_OFF} from "../test-support/legacy-features.js";
import {IN_GAME} from "../test-support/events.js";
import {TYPE_GAP_HEADER} from "./type-gap-team.js";
import {UNTALKED_IN_GYM} from "./untalked-in-gym.js";

// The production path for type-gap-team-v1, supplies-v1 and untalked-in-gym-v1: playGameTools with each switch on
// and off, on the recorded states the unit tests use (d41e's whiteout result, 057c's first mart state, d41e's first
// RUSTBORO CITY GYM result).
const gz=(name:string):string=>gunzipSync(readFileSync(new URL(`./fixtures/${name}`,import.meta.url))).toString("utf8");
const EVENTS=gz("type-gap-d41e.jsonl.gz").trim().split("\n").map(l=>JSON.parse(l) as RunEvent);
const CHART=JSON.parse(readFileSync(new URL("./fixtures/type-chart-f3ae0881.json",import.meta.url),"utf8")) as [number,number,number][];
const MART=JSON.parse(gz("supplies-057c.json.gz")) as Record<string,unknown>;
const GYM=JSON.parse(gz("untalked-gym-d41e.json.gz")) as {state:Record<string,unknown>;readout:string};
type State=Extract<RunEvent,{type:"state";started:boolean}>;
const LOSS=EVENTS.find((e):e is State=>e.type==="state"&&e.seq===12769);
if(LOSS===undefined)throw new Error("fixture");
const LOSS_STATE={...IN_GAME,location:LOSS.location,map_id:LOSS.map_id,badges:[],money:LOSS.money,type_gap:{party:[{slot:0,species_types:[10,10],moves:[{move_id:10,name:"SCRATCH",move_type:0,power:40},{move_id:52,name:"EMBER",move_type:10,power:40}]}],type_chart:CHART,diagnostic:null}};

const OFF:Partial<FeatureSet>={"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"navigate-first-prompt-v1":false,"harness-trust-v1":false,"story-destinations-v1":false,"full-map-navigation-v1":false,"cited-destination-v1":false,"battle-move-tool-v1":false,"unfinished-activity-v1":false,"battle-loss-recap-v1":false,"low-hp-trainer-warning-v1":false,"story-battle-heal-gate-v1":false,"trainer-sight-check-v1":false,"visited-terrain-navigation-v1":false,"semantic-navigation-v2":false,"instruction-ledger-v2":false,"people-ledger-v1":false,"people-id-cards-v1":false,"untaken-exits-v1":false,"gym-readiness-readout-v1":false,"no-exit-here-v1":false,"blocked-exit-fact-v1":false,"heal-before-trainers-v1":false,"heal-before-trainers-v2":false,"bag-healing-items-v1":false,"starter-decision-salience-v1":false,"story-battle-heal-first-v1":false,"pending-field-dialogue-v1":false,"effectiveness-heard-v1":false,"game-said-goals-v1":false,"exp-next-level-v1":false,"exp-earned-ledger-v1":false,"leader-attempt-ledger-v1":false,"seen-trainers-ledger-v1":false,"pokedex-own-v1":false,"party-coverage-v1":false,"said-type-matches-v1":false,"type-gap-team-v1":false,"supplies-v1":false,"untalked-in-gym-v1":false};

async function run(features:Partial<FeatureSet>,state:unknown,readout:string,events:readonly RunEvent[]):Promise<string[]> {
 const observers:((e:RunEvent)=>void)[]=[];
 const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:()=>undefined};
 const observe:AgentTool={name:"observe",label:"Observe",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:readout}],details:{state}})};
 const press={name:"press",label:"Press",description:"d",parameters:{},execute:()=>Promise.reject(new Error("unused")),executeChecked:()=>Promise.reject(new Error("unused"))} as unknown as AgentTool;
 const tools=playGameTools([observe,press],{...ALL_ON,...BATCH_DEFAULTS_OFF,...OFF,...features},{read:()=>Promise.reject(new Error("unused")),places:()=>Promise.resolve({places:[]})},recorder);
 for(const e of events)for(const o of observers)o(e);
 const tool=tools.find(t=>t.name==="observe");if(tool===undefined)throw new Error("observe");
 const r:AgentToolResult<unknown>=await tool.execute("id",{});
 return r.content.flatMap(c=>c.type==="text"?[c.text]:[]);
}
const ENVELOPE=new Set(["v","run","seq","t","type","turn"]);
const strip=(e:Record<string,unknown>):Record<string,unknown>=>Object.fromEntries(Object.entries(e).filter(([k])=>!ENVELOPE.has(k)));

describe("production wiring of the type-gap, supplies and untalked-in-gym switches",()=>{
 it("type-gap-team-v1: ON appends the gym block to d41e's whiteout result; OFF adds nothing",async()=>{
  // The slim fixture's tool results carry no text; the fold reads only states and pages.
  const events=EVENTS.filter(e=>e.seq<12771&&e.type!=="tool_result");
  const on=await run({"type-gap-team-v1":true},LOSS_STATE,"Location: RUSTBORO CITY",events);
  expect(on).toHaveLength(2);
  expect(on[1]?.split("\n")[0]).toBe(TYPE_GAP_HEADER);
  expect(await run({},LOSS_STATE,"Location: RUSTBORO CITY",events)).toEqual(["Location: RUSTBORO CITY"]);
 });
 it("supplies-v1: ON appends the line on arrival at a map that sells things; OFF adds nothing",async()=>{
  const entered=[{...MART,seq:1,location:"PETALBURG CITY"},{...MART,seq:2}] as unknown as RunEvent[];
  expect(await run({"supplies-v1":true},{...IN_GAME,location:MART.location,money:MART.money},"Location: PETALBURG CITY MART",entered)).toEqual(["Location: PETALBURG CITY MART","Supplies: ₽3,440 · balls: none · healing and status items: none · party 1 of 6 · places on this map that sell things: PETALBURG CITY MART (this map)"]);
  expect(await run({},{...IN_GAME,location:MART.location,money:MART.money},"Location: PETALBURG CITY MART",entered)).toEqual(["Location: PETALBURG CITY MART"]);
 });
 it("untalked-in-gym-v1: ON puts the line first on a gym result; OFF adds nothing",async()=>{
  const on=await run({"untalked-in-gym-v1":true},strip(GYM.state),GYM.readout,[]);
  expect(on).toEqual([`${UNTALKED_IN_GYM} object 2, sprite YOUNGSTER, at (5,13); object 4, sprite MAN_2, at (3,18).`,GYM.readout]);
  expect(await run({},strip(GYM.state),GYM.readout,[])).toEqual([GYM.readout]);
 });
});
