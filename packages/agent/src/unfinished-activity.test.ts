import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {UNFINISHED_HEADER,UnfinishedActivity} from "./unfinished-activity.js";
import {playGameTools} from "./play-wiring.js";
import {StoryDestinations,type Place} from "./story-destinations.js";
import {goalLine} from "./harness-trust.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {RunEvent} from "./events.js";
import {recorded,recordedFeatures,stateAt,type RecordedState} from "../test-support/battle-facts.js";

// Checkpoint run 2026-10-19T20-53-55-875Z_qwen36-gpu0_petalburg2h-r10-whole-map, turns 0-420, trimmed by
// the test author: native_action, assistant, assistant_delta, turn_start, button_press, destination_citation,
// people_id_card, loop_guard and story_goal_away events dropped; tool_result text emptied; state events keep the
// fields this switch and BattleOutcomes read (battle trimmed to active/outcome/battle_type/battlers' species,
// party to species/level/hp/max_hp). Not parseEvent-valid.
const ID="unfinished-activity-v1";
const R10="unfinished-activity-r10.jsonl.gz";
const PLACES=(JSON.parse(readFileSync(fileURLToPath(new URL("../test-support/story-destinations-places.json",import.meta.url)),"utf8")) as {places:Place[]}).places;
type Result=Extract<RunEvent,{type:"tool_result"}>;
const GAME=new Set(["observe","press","navigate_to","battle_action"]);

const ROXANNE_WORDS=`"Hello, I am ROXANNE, the RUSTBORO POKéMON GYM LEADER." "I became a GYM LEADER so that I might apply what I learned at the POKéMON TRAINER'S SCHOOL in battle." "Would you kindly demonstrate how you battle, and with which POKéMON?"`;
const STARTED="- On RUSTBORO CITY GYM (map 11/3): turn 212 you came in; turn 220 you beat JOSH (trainer 320); turn 221 you left with TORCHIC at 7/37 HP; turn 239 your party was healed on RUSTBORO CITY POKEMON CENTER 1F (map 11/5); turn 255 you came back; turn 261 you lost to ROXANNE (trainer 265) and whited out; the game returned you to RUSTBORO CITY (map 0/3).";
const OPEN=`ROXANNE (trainer 265) on RUSTBORO CITY GYM (map 11/3): you lost at turn 261. Before that battle, at turn 259, the game showed: ${ROXANNE_WORDS}`;
const still=(turn:number)=>`- Still open: ${OPEN} The game last showed ROXANNE (trainer 265) not defeated (turn ${String(turn)}).`;
const TRIP_FULL="PETALBURG CITY GYM (map 8/1) door at (4,111) -> PETALBURG CITY (map 0/0) WEST edge -> ROUTE104 (map 0/19) door at (10,38) -> PETALBURG WOODS (map 24/11) door at (15,5) -> ROUTE104 (map 0/19) NORTH edge -> RUSTBORO CITY (map 0/3) door at (27,19) -> RUSTBORO CITY GYM (map 11/3).";

function lastState(events:readonly RunEvent[]):RecordedState{const s=events.findLast((e):e is RecordedState=>e.type==="state"&&"started" in e&&e.map_id!==null);if(s===undefined)throw new Error("no state");return s;}
function results(events:readonly RunEvent[]):Result[]{return events.filter((e):e is Result=>e.type==="tool_result"&&GAME.has(e.name)&&e.state_seq!==undefined);}
// The activity fold after every event before a result, and the block that result's own state gets.
function replay(events:readonly RunEvent[],features:FeatureSet,until=Infinity):{result:Result;block:string|null}[]{
 const fold=new UnfinishedActivity(features);
 const out:{result:Result;block:string|null}[]=[];
 for(const e of events){
  if(e.seq>until)break;
  if(e.type==="tool_result"&&GAME.has(e.name)&&e.state_seq!==undefined)out.push({result:e,block:fold.block(stateAt(events,e.state_seq) as unknown as GameStateSnapshot,PLACES)});
  fold.observe(e);
 }
 return out;
}
const at=(rows:readonly {result:Result;block:string|null}[],turn:number)=>{
 const row=rows.find(r=>r.result.turn===turn);
 if(row===undefined)throw new Error(`no result at turn ${String(turn)}`);
 return row.block;
};

describe("unfinished-activity-v1 on r10 (beat JOSH at T220, healed, lost to ROXANNE at T261, never came back)",()=>{
 const events=recorded(R10),features=recordedFeatures(events,{[ID]:true});
 const rows=replay(events,features);
 it("nothing is open before the ROXANNE loss",()=>{
  for(const row of rows)if(row.result.turn<261)expect(row.block).toBeNull();
 });
 it("at T323, after the training detour and the stall briefing, the block keeps what was started, the open battle and the agent's own last walk there from an exit it can reach now",()=>{
  expect(at(rows,323)).toBe([UNFINISHED_HEADER,STARTED,still(323),"- Your own last walk to RUSTBORO CITY GYM (map 11/3), from an exit of this map you can reach on foot now (turns 162-255): ROUTE104 (map 0/19) NORTH edge -> RUSTBORO CITY (map 0/3) door at (27,19) -> RUSTBORO CITY GYM (map 11/3)."].join("\n"));
 });
 it("on the south half of ROUTE104 (T400) the walk starts at the door it used into PETALBURG WOODS, not the unreachable NORTH edge",()=>{
  expect(at(rows,400)).toBe([UNFINISHED_HEADER,STARTED,still(400),"- Your own last walk to RUSTBORO CITY GYM (map 11/3), from an exit of this map you can reach on foot now (turns 70-255): ROUTE104 (map 0/19) door at (10,38) -> PETALBURG WOODS (map 24/11) door at (15,5) -> ROUTE104 (map 0/19) NORTH edge -> RUSTBORO CITY (map 0/3) door at (27,19) -> RUSTBORO CITY GYM (map 11/3)."].join("\n"));
 });
 it("in PETALBURG CITY (T390) the walk starts at its WEST edge",()=>{
  expect(at(rows,390)).toContain("(turns 31-255): PETALBURG CITY (map 0/0) WEST edge -> ROUTE104 (map 0/19) door at (10,38) -> ");
 });
 it("stays on every game result from the loss to the end of the fixture, through every detour",()=>{
  const after=rows.filter(r=>r.result.turn>261);
  expect(after.length).toBeGreaterThan(150);
  for(const row of after)expect(row.block).toContain(`- Still open: ${OPEN}`);
 });
 it("a map the agent's own walk never left from gets the whole walk",()=>{
  const fold=new UnfinishedActivity(features);
  for(const e of events)fold.observe(e);
  const elsewhere={...lastState(events),map_id:[0,10],location:"OLDALE TOWN",position:{x:5,y:5}} as unknown as GameStateSnapshot;
  expect(fold.block(elsewhere,PLACES)).toContain(`- Your own last walk to RUSTBORO CITY GYM (map 11/3) (turns 21-255): ${TRIP_FULL}`);
 });
 it("retires only when the game shows the trainer defeated, and says nothing about other trainers",()=>{
  const fold=new UnfinishedActivity(features);
  for(const e of events)fold.observe(e);
  const last=lastState(events);
  const other={...last,trainer_opponent:{trainer_id:320,trainer_class:37,name:"JOSH",defeated:true,battle_active:false}} as unknown as GameStateSnapshot;
  expect(fold.block(other,PLACES)).toContain(`- Still open: ${OPEN} The game last showed`);
  const beaten={...last,turn:999,trainer_opponent:{trainer_id:265,trainer_class:32,name:"ROXANNE",defeated:true,battle_active:false}} as RecordedState;
  fold.observe(beaten);
  expect(fold.block(beaten as unknown as GameStateSnapshot,PLACES)).toBeNull();
  expect(fold.changes().map(c=>c.change)).toEqual(["opened","retired"]);
 });
 it("never tells the agent what to do",()=>{
  for(const row of rows)if(row.block!==null)expect(row.block).not.toMatch(/\b(go|fight|challenge|return|head|should|must|try)\b/i);
 });
});

describe("unfinished-activity-v1 story line: heard, reached, and a line that names no map",()=>{
 const events=recorded(R10);
 function goalAt(turn:number,on:boolean):string{
  const story=new StoryDestinations(false,on);
  const result=results(events).find(r=>r.turn===turn);
  if(result===undefined)throw new Error("no result");
  for(const e of events){if(e.seq>=result.seq)break;story.observe(e);}
  const state=stateAt(events,result.state_seq ?? -1) as unknown as GameStateSnapshot;
  if(state.map_id===null)throw new Error("no map");
  return goalLine(story.goal(state.map_id,state.name,result.id,PLACES),PLACES,true);
 }
 const HEARD=`Story line heard (DAD, turn 20): "Head for RUSTBORO CITY beyond this town." Reached: RUSTBORO CITY (map 0/3), first entered at turn 162.`;
 it("inside RUSTBORO CITY GYM at T215 DAD's line reads as heard and reached, not as the goal",()=>{
  expect(goalAt(215,true)).toBe(HEARD);
  expect(goalAt(215,false)).toContain(`Story goal: "Head for RUSTBORO CITY beyond this town." (DAD, turn 20) -> "RUSTBORO CITY" = RUSTBORO CITY (map 0/3). Way in: ROUTE104 (map 0/19) NORTH edge;`);
 });
 it("ROXANNE's TRAINER'S SCHOOL line, which names no map, does not replace DAD's line (T300)",()=>{
  expect(goalAt(300,true)).toBe(HEARD);
  expect(goalAt(300,false)).toContain(`Story goal: "I became a GYM LEADER so that I might apply what I learned at the POKéMON TRAINER'S SCHOOL in battle." (ROXANNE, turn 259) -> "POKéMON TRAINER'S SCHOOL": not resolved`);
 });
 it("DAD's newer line at T387 names RUSTBORO CITY again; entered before it was said, so it is not reached",()=>{
  expect(goalAt(390,true)).toBe(goalAt(390,false));
  expect(goalAt(390,true)).toContain(`Story goal: "Hm? Aren't you going to the POKéMON GYM in RUSTBORO CITY?" (DAD, turn 387)`);
 });
});

describe("unfinished-activity-v1 in supervisor notes",()=>{
 const events=recorded(R10);
 it("an unfinished_activity event puts the open item in the stall briefing; OFF leaves the briefing unchanged",()=>{
  const opened:RunEvent={v:1,run:"r",seq:7300,t:"t",type:"unfinished_activity",turn:262,change:"opened",trainer_id:265,trainer:"ROXANNE",map_id:[11,3],text:OPEN} as unknown as RunEvent;
  const brief=(on:boolean)=>{
   const b=new SupervisorBriefing({...recordedFeatures(events,{[ID]:on}),"supervisor-briefing-v2":false});
   let sent=false;
   for(const e of events){if(e.seq>8600)break;b.observe(e);if(!sent&&e.seq>=7299){b.observe(opened);sent=true;}}
   return b.stallText({kind:"milestone_drought",minutes:10},323);
  };
  expect(brief(true)).toContain(`- Unfinished activity (what you did and what the game recorded): ${OPEN}\n`);
  expect(brief(false)).not.toContain("Unfinished activity");
  expect(brief(true).replace(`- Unfinished activity (what you did and what the game recorded): ${OPEN}\n`,"")).toBe(brief(false));
 });
});

// A recorded state as the game server sends it: no event envelope; fields the fixture trimmed get neutral values.
function body(s:RecordedState):Record<string,unknown>{
 const {v:_v,run:_r,seq:_s,t:_t,type:_y,turn:_n,...rest}=s as unknown as Record<string,unknown>;
 return {money:0,play_time_s:0,...rest};
}
describe("unfinished-activity-v1 through playGameTools",()=>{
 const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
 async function at323(on:boolean):Promise<{text:string;events:unknown[]}>{
  const events=recorded(R10);
  const observers:((e:RunEvent)=>void)[]=[];
  const recorded_:unknown[]=[];
  const recorder={subscribe:(o:(e:RunEvent)=>void)=>{observers.push(o);},recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,storyBattleWarning:()=>undefined,healBeforeTrainersWarning:()=>undefined,destinationCitation:()=>undefined,unfinishedActivity:(body:unknown)=>{recorded_.push(body);}};
  const result=results(events).find(r=>r.turn===324&&r.name==="navigate_to");
  if(result===undefined)throw new Error("fixture has T324");
  const observe:AgentTool={name:"observe",label:"Observe",description:"d",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"Location: ROUTE104"}],details:{state:body(stateAt(events,result.state_seq ?? -1))}})};
  const press={name:"press",label:"Press",description:"d",parameters:{},execute:()=>Promise.reject(new Error("unused")),executeChecked:()=>Promise.reject(new Error("unused"))} as unknown as AgentTool;
  const features:FeatureSet={...recordedFeatures(events,{[ID]:on}),"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"navigate-first-prompt-v1":false,"harness-trust-v1":false,"story-destinations-v1":false,"full-map-navigation-v1":false,"cited-destination-v1":false,"battle-move-tool-v1":false};
  const base=[observe,press];
  const tools=playGameTools(base,features,{read:()=>Promise.reject(new Error("unused")),places:()=>Promise.resolve({places:PLACES})},recorder);
  for(const e of events){if(e.seq>=result.seq)break;for(const o of observers)o(e);}
  const wrapped=tools.find(t=>t.name==="observe");
  if(wrapped===undefined)throw new Error("no observe");
  return {text:text(await wrapped.execute(result.id,{})),events:recorded_};
 }
 it("ON appends the block and records the item opening once; OFF adds nothing",async()=>{
  const on=await at323(true),off=await at323(false);
  expect(on.text).toContain(`\n${UNFINISHED_HEADER}\n${STARTED}\n`);
  expect(on.events).toEqual([{change:"opened",trainer_id:265,trainer:"ROXANNE",map_id:[11,3],text:OPEN}]);
  expect(off.text).not.toContain(UNFINISHED_HEADER);
  expect(off.events).toEqual([]);
 });
});

describe("unfinished-activity-v1 registry",()=>{
 it("is a guidance switch that needs ram-state-v1, default off",()=>{
  expect(SWITCHABLE_FEATURES).toContain(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"ram-state-v1",switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(dependencyProblems({...ALL_ON,[ID]:true,"ram-state-v1":false})).toContain(`${ID} needs ram-state-v1`);
 });
});
