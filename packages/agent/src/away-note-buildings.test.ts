// away-note-buildings-v1: harness-trust-v1's walk-away note does not count moves inside a building of the place the
// Story goal names. Recorded cases (story_goal_away events): bundle 2026-10-22T14-17-33_qwen36-gpu1_6bc3 seq 1053 (MOM's
// "Well, this is LITTLEROOT TOWN." while the player walked upstairs in RED's HOUSE 2F) and control
// 2026-10-22T10-26-35_qwen36-gpu0_da1c seq 14882 (DAD's line naming RUSTBORO CITY while the player walked in from
// RUSTBORO CITY GYM's door at (5,19) to (4,2)). Map table: test-support/story-destinations-places.json.
import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {CheckedPressTool} from "./game-tools.js";
import {FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {WalkAway,buildingOf,withHarnessTrust,type StoryGoalAwayFacts} from "./harness-trust.js";
import type {MapId,Place,PlacesBody,StoryGoal} from "./story-destinations.js";
import {playGameTools} from "./play-wiring.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";

const ID="away-note-buildings-v1";
interface Recording {readonly run:string;readonly events:readonly unknown[]}
const RECORDED=JSON.parse(readFileSync(new URL("../test-support/story-destinations-recorded.json",import.meta.url),"utf8")) as Record<"4caa",Recording>;
const PLACES=(JSON.parse(readFileSync(new URL("../test-support/story-destinations-places.json",import.meta.url),"utf8")) as PlacesBody).places;
const CAAA:RunEvent[]=RECORDED["4caa"].events.map(e=>checkEvent(e));
const BASE=((): GameStateSnapshot=>{
 const e=CAAA.find((x)=>x.type==="state"&&"started" in x&&x.started);
 if(e?.type!=="state"||!("started" in e))throw Error("no state");
 const envelope=new Set(["v","run","seq","t","type","turn"]);
 return parseGameState(Object.fromEntries(Object.entries(e).filter(([key])=>!envelope.has(key))));
})();
const place=(id:MapId):Place=>{const p=PLACES.find(q=>q.map_id[0]===id[0]&&q.map_id[1]===id[1]);if(p===undefined)throw Error(`no place ${String(id)}`);return p;};
const on=(id:MapId,x:number,y:number):GameStateSnapshot=>({...BASE,screen:"overworld",in_battle:false,field_controls_locked:false,map_id:[id[0],id[1]],location:place(id).name,location_display:place(id).display,position:{x,y},topology:{width:20,height:20,connections:[]}});
const goal=(speaker:string,text:string,target:MapId):StoryGoal=>({line:{turn:61,speaker,text,lives:null},resolved:[{quote:`"${place(target).display}"`,text:` = ${place(target).display}.`,target:place(target)}]});
const LITTLEROOT:MapId=[0,9],HOUSE_1F:MapId=[1,0],HOUSE_2F:MapId=[1,1],RUSTBORO:MapId=[0,3],GYM:MapId=[11,3],BRINEY:MapId=[17,0],ROUTE104:MapId=[0,19],WOODS:MapId=[24,11];
const MOM=goal("MOM","Well, this is LITTLEROOT TOWN.",LITTLEROOT);
const DAD=goal("DAD","Head for RUSTBORO CITY beyond this town.",RUSTBORO);

function notes(walk:WalkAway,g:StoryGoal,states:readonly GameStateSnapshot[]):(StoryGoalAwayFacts|null)[] {
 return states.map(s=>walk.observe(s,g,PLACES,true));
}

describe("buildingOf: a map with no edge connection whose doors lead out only to the place",()=>{
 it("houses and gyms belong to their town, through other buildings too",()=>{
  expect(buildingOf(HOUSE_1F,LITTLEROOT,PLACES)).toBe(true);
  expect(buildingOf(HOUSE_2F,LITTLEROOT,PLACES)).toBe(true);
  expect(buildingOf(GYM,RUSTBORO,PLACES)).toBe(true);
  expect(buildingOf([11,2],RUSTBORO,PLACES)).toBe(true);
 });
 it("not: a building of another place, the place itself, an outdoor map, a map the table lacks",()=>{
  expect(buildingOf(BRINEY,RUSTBORO,PLACES)).toBe(false);
  expect(buildingOf(BRINEY,ROUTE104,PLACES)).toBe(true);
  expect(buildingOf(GYM,LITTLEROOT,PLACES)).toBe(false);
  expect(buildingOf(LITTLEROOT,LITTLEROOT,PLACES)).toBe(false);
  expect(buildingOf(ROUTE104,RUSTBORO,PLACES)).toBe(false);
  expect(buildingOf([99,99],RUSTBORO,PLACES)).toBe(false);
  // A door to a map the table does not list: not provably only the town's.
  const odd=[...PLACES.filter(p=>!(p.map_id[0]===11&&p.map_id[1]===3)),{...place(GYM),warps:[...place(GYM).warps,{x:1,y:1,to:[77,77] as [number,number]}]}];
  expect(buildingOf(GYM,RUSTBORO,odd)).toBe(false);
  // Doors that only lead between buildings and never outside.
  const sealed=[...PLACES.filter(p=>!(p.map_id[0]===11&&p.map_id[1]===3)),{...place(GYM),warps:[]}];
  expect(buildingOf(GYM,RUSTBORO,sealed)).toBe(false);
 });
 it("PETALBURG WOODS opens only onto ROUTE104, so it counts as part of ROUTE104",()=>{
  expect(buildingOf(WOODS,ROUTE104,PLACES)).toBe(true);
 });
});

describe("the walk-away note",()=>{
 // 6bc3 / da1c shapes: two moves away from the building's door.
 const house=[on(HOUSE_1F,8,7),on(HOUSE_1F,8,5),on(HOUSE_1F,5,3)];
 const gym=[on(GYM,5,19),on(GYM,5,8),on(GYM,4,2)];
 it("OFF: fires inside the player's house on MOM's line and inside the gym on DAD's (today's behaviour)",()=>{
  expect(notes(new WalkAway(),MOM,house).at(-1)?.targets).toEqual([{name:"LITTLEROOT TOWN",map_id:[0,9]}]);
  expect(notes(new WalkAway(),DAD,gym).at(-1)?.targets).toEqual([{name:"RUSTBORO CITY",map_id:[0,3]}]);
 });
 it("ON: no note in a building of the named place",()=>{
  expect(notes(new WalkAway(false,true),MOM,house)).toEqual([null,null,null]);
  expect(notes(new WalkAway(false,true),DAD,gym)).toEqual([null,null,null]);
 });
 it("ON: a building with a door elsewhere still counts (ROUTE104 MR BRINEYS HOUSE for RUSTBORO CITY)",()=>{
  const briney=[on(BRINEY,5,7),on(BRINEY,5,5),on(BRINEY,5,2)];
  const off=notes(new WalkAway(),DAD,briney),onNotes=notes(new WalkAway(false,true),DAD,briney);
  expect(onNotes).toEqual(off);
  expect(onNotes.at(-1)).not.toBeNull();
 });
});

describe("registry, presets and the production factory",()=>{
 it("is a default-off switch that needs harness-trust-v1 and says what OFF does",()=>{
  expect(featureInfo(ID)).toMatchObject({switchable:true,needs:"harness-trust-v1",group:"guidance"});
  expect(featureInfo(ID).description).toContain(" Off: the note counts moves on every map other than the named place.");
  expect(FEATURES.filter(f=>f.id===ID)).toHaveLength(1);
  const older=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(older)[ID]).toBe(false);
  expect(playHarnessFeatures({...ALL_ON,[ID]:true},null)).toContain(ID);
 });
 it("withHarnessTrust passes buildings to its walk-away counter; playGameTools passes the switch",async()=>{
  type Details={state:GameStateSnapshot};
  let current=on(HOUSE_1F,8,7);
  const result=():Promise<AgentToolResult<Details>>=>Promise.resolve({content:[{type:"text",text:"Location: x"}],details:{state:current}});
  const press={name:"press",label:"p",description:"p",parameters:Type.Object({}),execute:result,executeChecked:result} as unknown as CheckedPressTool;
  const observe:AgentTool={name:"observe",label:"o",description:"o",parameters:Type.Object({}),execute:result};
  const page=(seq:number):RunEvent[]=>[
   checkEvent({v:1,run:"r",seq,t:"2026-10-22T14:20:00.000-04:00",type:"dialogue_auto_advance",turn:61,tool_call_id:"mom",tool:"press",requested:["A"],sent:["A"],dropped:[],auto_presses:1,pages:[{state_seq:null,map:"LITTLEROOT TOWN BRENDANS HOUSE 1F",map_id:[1,0],position:{x:8,y:7},speaker:"MOM",speaker_source:"name_prefix",text:"MOM: Well, this is LITTLEROOT TOWN."}],stop:"field_free",detail:"d",duration_ms:1}),
   checkEvent({v:1,run:"r",seq:seq+1,t:"2026-10-22T14:20:00.000-04:00",type:"tool_result",turn:61,id:"mom",name:"press",is_error:false,duration_ms:1,text:"x",frames:[]}),
  ];
  const run=async(features:FeatureSet,useFactory:boolean)=>{
   const subs:((e:RunEvent)=>void)[]=[];const away:StoryGoalAwayFacts[]=[];
   const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subs.push(fn);},recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),storyGoalAway:(_t:string,f:StoryGoalAwayFacts)=>{away.push(f);},destinationCitation:()=>undefined} as unknown as Parameters<typeof playGameTools>[3];
   const source={read:()=>Promise.resolve(current),places:()=>Promise.resolve({places:PLACES})};
   const tools=useFactory?playGameTools([observe,press],features,source,recorder):withHarnessTrust([observe,press],true,recorder,source,{supervisor:true,buildings:features[ID]});
   for(const e of page(1))for(const s of subs)s(e);
   const p=tools.find(t=>t.name==="press");if(p===undefined)throw Error("no press");
   for(const [i,s] of [on(HOUSE_1F,8,7),on(HOUSE_1F,8,5),on(HOUSE_1F,5,3)].entries()){current=s;await p.execute(`p${String(i)}`,{buttons:["UP"]});}
   return away.length;
  };
  const trustOnly:FeatureSet={...Object.fromEntries(Object.keys(ALL_ON).map(k=>[k,false])) as FeatureSet,"harness-trust-v1":true,"dialogue-auto-advance-v1":true,"story-destinations-v1":true};
  expect(await run({...trustOnly,[ID]:false},false)).toBe(1);
  expect(await run({...trustOnly,[ID]:true},false)).toBe(0);
  expect(await run({...trustOnly,[ID]:false},true)).toBe(1);
  expect(await run({...trustOnly,[ID]:true},true)).toBe(0);
 },30000);
});
