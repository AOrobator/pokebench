import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {dependencyProblems,featureInfo,playHarnessFeatures,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {UNFINISHED_HEADER,UnfinishedActivity,withUnfinishedActivity} from "./unfinished-activity.js";
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
  if(e.type==="tool_result"&&GAME.has(e.name)&&e.state_seq!==undefined)out.push({result:e,block:fold.block(stateAt(events,e.state_seq),PLACES)});
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
 it("the positive supervisor's note and the focused briefing carry the same line",()=>{
  const opened:RunEvent={v:1,run:"r",seq:7300,t:"t",type:"unfinished_activity",turn:262,change:"opened",trainer_id:265,trainer:"ROXANNE",map_id:[11,3],text:OPEN} as unknown as RunEvent;
  for(const extra of [{"positive-supervisor-v1":true},{"supervisor-briefing-v2":true}] as const){
   const b=new SupervisorBriefing({...recordedFeatures(events,{[ID]:true}),...extra});
   let sent=false;
   for(const e of events){if(e.seq>8600)break;b.observe(e);if(!sent&&e.seq>=7299){b.observe(opened);sent=true;}}
   expect(b.stallText({kind:"milestone_drought",minutes:10},323)).toContain(`\n- Unfinished activity (what you did and what the game recorded): ${OPEN}\n`);
  }
  const retired:RunEvent={...opened,seq:8000,change:"retired"} as unknown as RunEvent;
  const b=new SupervisorBriefing({...recordedFeatures(events,{[ID]:true}),"positive-supervisor-v1":true});
  for(const e of events){if(e.seq>8600)break;b.observe(e);if(e.seq===events.find(x=>x.seq>=7299)?.seq)b.observe(opened);}
  b.observe(retired);
  expect(b.stallText({kind:"milestone_drought",minutes:10},323)).not.toContain("Unfinished activity");
 });
});

// A recorded state as the game server sends it: no event envelope; fields the fixture trimmed get neutral values.
function body(s:RecordedState):Record<string,unknown>{
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return {money:0,play_time_s:0,...Object.fromEntries(Object.entries(s).filter(([k])=>!envelope.has(k)))};
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

describe("unfinished-activity-v1 rules",()=>{
 const F:FeatureSet={...ALL_ON,[ID]:true,"bounded-navigation-v1":true,"displayed-place-names-v1":false};
 let seq=0;
 const st=(turn:number,fields:Record<string,unknown>={}):RecordedState=>({v:1,run:"r",seq:++seq,t:"t",type:"state",turn,started:true,screen:"overworld",in_battle:false,location:"ROUTE101",map_id:[0,16],position:{x:5,y:5},facing:"up",battle:null,party:[{species:"TORCHIC",level:5,hp:20,max_hp:20}],trainer_opponent:null,...fields} as unknown as RecordedState);
 const fight=(turn:number,outcome:string,id:number,name:string|null,defeated=false)=>st(turn,{screen:"battle",in_battle:true,battle:{active:true,outcome,battle_type:8,battlers:[{battler:0,species:"TORCHIC"},{battler:1,species:"ZIGZAGOON"}]},trainer_opponent:{trainer_id:id,trainer_class:5,name,defeated,battle_active:true}});
 const after=(turn:number,id:number,name:string|null,defeated:boolean)=>st(turn,{trainer_opponent:{trainer_id:id,trainer_class:5,name,defeated,battle_active:false}});
 const fold=(events:readonly RunEvent[])=>{const f=new UnfinishedActivity(F);for(const e of events)f.observe(e);return f;};
 it("a draw opens an item with no words when no dialogue was delivered; a later loss updates it; a win retires it",()=>{
  const f=fold([st(1),fight(2,"ongoing",1,"SAWYER"),fight(3,"drew",1,"SAWYER"),after(4,1,"SAWYER",false)]);
  const now=after(4,1,"SAWYER",false) as unknown as GameStateSnapshot;
  expect(f.block(now,null)).toBe([UNFINISHED_HEADER,"- On ROUTE101 (map 0/16): turn 1 you came in; turn 3 you drew with SAWYER (trainer 1).","- Still open: SAWYER (trainer 1) on ROUTE101 (map 0/16): you drew at turn 3. The game last showed SAWYER (trainer 1) not defeated (turn 4)."].join("\n"));
  for(const e of [fight(5,"ongoing",1,"SAWYER"),fight(6,"lost",1,"SAWYER"),after(7,1,"SAWYER",false)])f.observe(e);
  expect(f.block(now,null)).toContain("- Still open: SAWYER (trainer 1) on ROUTE101 (map 0/16): you lost at turn 6.");
  for(const e of [fight(8,"ongoing",1,"SAWYER"),fight(9,"won",1,"SAWYER")])f.observe(e);
  expect(f.changes().map(c=>c.change)).toEqual(["opened","updated"]);
  f.observe(after(10,1,"SAWYER",true));
  expect(f.changes().map(c=>c.change)).toEqual(["opened","updated","retired"]);
  expect(f.block(after(10,1,"SAWYER",true) as unknown as GameStateSnapshot,null)).toBeNull();
 });
 it("an unnamed trainer is named by its number; wild battles never open an item",()=>{
  const wild=st(3,{screen:"battle",in_battle:true,battle:{active:true,outcome:"lost",battle_type:4,battlers:[{battler:1,species:"POOCHYENA"}]}});
  const f=fold([st(1),st(2,{screen:"battle",in_battle:true,battle:{active:true,outcome:"ongoing",battle_type:4,battlers:null}}),wild,st(4),fight(5,"ongoing",7,null),fight(6,"lost",7,null),after(7,7,null,false)]);
  expect(f.changes()).toEqual([{change:"opened",trainer_id:7,trainer:"trainer 7",map_id:[0,16],text:"trainer 7 on ROUTE101 (map 0/16): you lost at turn 6."}]);
  expect(f.block(st(8,{trainer_opponent:null}) as unknown as GameStateSnapshot,null)).toContain("The game last showed trainer 7 not defeated (turn 7).");
 });
 it("no walk line without the map table, on the open item's own map, or when no walk reached it; a map the table lacks keeps the readout's name",()=>{
  const f=fold([st(1,{map_id:[9,9],location:"NOWHERE"}),st(2),fight(3,"ongoing",1,"SAWYER"),fight(4,"lost",1,"SAWYER"),after(5,1,"SAWYER",false)]);
  const here=after(5,1,"SAWYER",false) as unknown as GameStateSnapshot;
  expect(f.block(here,PLACES)).not.toContain("own last walk");
  const away={...here,map_id:[0,10],location:"OLDALE TOWN"} as unknown as GameStateSnapshot;
  expect(f.block(away,null)).not.toContain("own last walk");
  expect(f.block(away,PLACES)).not.toContain("own last walk");
  expect(f.block({...here,map_id:null},PLACES)).toBeNull();
 });
 it("a heal while on the open item's map is not listed as a heal elsewhere; the party's species may be unread",()=>{
  const heal:RunEvent={v:1,run:"r",seq:++seq,t:"t",type:"activity",turn:2,kind:"heal",count:1,evidence:[]} as unknown as RunEvent;
  const f=fold([st(1),heal,fight(3,"ongoing",1,"SAWYER"),fight(4,"lost",1,"SAWYER"),after(5,1,"SAWYER",false),st(5,{party:[{species:null,level:5,hp:3,max_hp:20}]}),st(6,{map_id:[0,10],location:"OLDALE TOWN"})]);
  const text=f.block(st(7,{map_id:[0,10],location:"OLDALE TOWN"}),null)??"";
  expect(text).not.toContain("healed");
  expect(text).toContain("turn 6 you left with unknown species at 3/20 HP");
 });
});

describe("withUnfinishedActivity edges",()=>{
 const F:FeatureSet={...ALL_ON,[ID]:true};
 const ok=(details:unknown):AgentToolResult<unknown>=>({content:[{type:"text",text:"x"}],details});
 const recorder=()=>({subscribe:()=>undefined});
 it("OFF returns the same tools; a non-game tool and a result without a state pass through; a missing or failing map table is no walk",async()=>{
  const tool:AgentTool={name:"observe",label:"o",description:"d",parameters:{},execute:()=>Promise.resolve(ok({}))};
  const other:AgentTool={name:"recall_dialogue",label:"r",description:"d",parameters:{},execute:()=>Promise.resolve(ok({}))};
  const tools=[tool,other];
  expect(withUnfinishedActivity(tools,{...F,[ID]:false},recorder(),{})).toBe(tools);
  const on=withUnfinishedActivity(tools,F,recorder(),{});
  expect(on[1]).toBe(other);
  expect((await on[0]?.execute("1",{}))?.content).toEqual([{type:"text",text:"x"}]);
  const failing=withUnfinishedActivity([{...tool,execute:()=>Promise.resolve(ok({state:{started:true,map_id:[0,16]}}))}],F,recorder(),{places:()=>Promise.reject(new Error("down"))});
  expect((await failing[0]?.execute("2",{}))?.content).toEqual([{type:"text",text:"x"}]);
 });
 it("a checked press is wrapped on both of its paths",async()=>{
  const press={name:"press",label:"p",description:"d",parameters:{},execute:()=>Promise.resolve(ok({})),executeChecked:()=>Promise.resolve(ok({}))} as unknown as AgentTool;
  const [wrapped]=withUnfinishedActivity([press],F,recorder(),{});
  expect(wrapped).not.toBe(press);
  const checked=wrapped as unknown as {executeChecked:(...a:unknown[])=>Promise<AgentToolResult<unknown>>};
  expect((await checked.executeChecked("1",{},()=>true)).content).toEqual([{type:"text",text:"x"}]);
 });
});
