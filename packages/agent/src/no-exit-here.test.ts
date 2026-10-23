import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
// no-exit-here-v1: a press into a map edge, or navigate_to aimed at or past one, on a side of the map with no map
// connection adds one line saying so, with the ways off the map the readout already lists.
// Fixture no-exit-here-states.json.gz: recorded state bodies (envelope stripped), the tool call and the tool result text
// the model was shown, streamed from runs/<id>/events.jsonl, and each run's harness_features. Runs and seqs:
// - 2026-10-17T13-15-36_qwen36-gpu1_e046: 18731 navigate_to (19,10), Oldale's east edge (the model then wrote "Oldale's
//   east exit to Petalburg", s18744); 17480 and 17549 navigate_to (10,0), Route 103's north edge, after "Route 103's
//   north exit to Rustboro" (s17437); 17409 press UP, UP onto Oldale's north edge (a connection); 17421 press UP across
//   it onto Route 103.
// - 2026-10-16T17-47-29_qwen36-gpu0_deb4: 11662 navigate_to (10,19) on LITTLEROOT TOWN after "SOUTH -> ROUTE116" (s11619);
//   11596 navigate_to (10,19) on ROUTE101 (a connection south).
// - 2026-10-16T21-49-19_qwen36-gpu0_9439: 14790 press DOWN at (10,19) and 16266 press DOWN at (7,19) on LITTLEROOT TOWN
//   (before and at T628 "SOUTH -> ROUTE116"); 14845 navigate_to (3,19); 4011 navigate_to (2,8), the exit mat of MAYS HOUSE 1F
//   (review round 1: a south arrow warp on the bottom row; TryArrowWarp in src/field_control_avatar.c runs before any
//   bump, so DOWN there leaves the map).
// Game grounding (pret/pokeemerald 731ad5bf): the step lands in the padded layout InitMapLayoutData (src/fieldmap.c)
// fills with MAPGRID_UNDEFINED where no map is connected, MapGridGetCollisionAt returns 1, GetCollisionAtCoords
// (src/event_object_movement.c) gives COLLISION_IMPASSABLE and PlayerNotOnBikeCollide (src/field_player_avatar.c) bumps
// and walks in place. No script or text runs, so the line states
// only the fact.
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,type FeatureSet} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {playGameTools} from "./play-wiring.js";
import {goalSides,noExitLine,pressSides,withNoExitHere} from "./no-exit-here.js";
import {IN_GAME} from "../test-support/events.js";

const ID="no-exit-here-v1";
interface Call {readonly name:string;readonly args:Record<string,unknown>}
interface Fixture {readonly harness_features:Record<string,string[]>;readonly states:Record<string,unknown>;readonly results:Record<string,string>;readonly calls:Record<string,Call>}
const FIXTURE=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/no-exit-here-states.json.gz",import.meta.url))).toString("utf8")) as Fixture;
const must=<T>(value:T|undefined,what:string):T=>{if(value===undefined)throw new Error(`missing ${what}`);return value;};
const recorded=(key:string):GameStateSnapshot=>parseGameState(must(FIXTURE.states[key],key));
const runFeatures=(key:string,on=true):FeatureSet=>({...featuresOf(must(FIXTURE.harness_features[key.split(":")[0]??""],key)),[ID]:on});
const call=(key:string):Call=>must(FIXTURE.calls[key],key);
const text=(key:string):string=>must(FIXTURE.results[key],key);
// The line this recorded result would have carried with the switch on.
function lineFor(key:string):string|null {
 const state=recorded(key),c=call(key);
 const sides=c.name==="press"?pressSides(state,c.args["buttons"] as string[]):goalSides(state,c.args as {x:number;y:number;map_id:[number,number]});
 return noExitLine(runFeatures(key),state,text(key),sides);
}

const OLDALE_EAST="There is no way off OLDALE TOWN to the east; the ways off this map are: NORTH edge -> ROUTE103 (map 0/18); SOUTH edge -> ROUTE101 (map 0/16); WEST edge -> ROUTE102 (map 0/17); (5,7) -> OLDALE TOWN HOUSE1 (map 2/0); (15,16) -> OLDALE TOWN HOUSE2 (map 2/1); (6,16) -> OLDALE TOWN POKEMON CENTER 1F (map 2/2); (14,6) -> OLDALE TOWN MART (map 2/4)";
const ROUTE103_NORTH="There is no way off ROUTE103 to the north; the ways off this map are: SOUTH edge -> OLDALE TOWN (map 0/10); EAST edge -> ROUTE110 (map 0/25) (crosses water you cannot cross yet); (45,6) -> ALTERING CAVE (map 24/106) (crosses water you cannot cross yet)";
const LITTLEROOT_SOUTH_DEB4="There is no way off LITTLEROOT TOWN to the south; the ways off this map are: NORTH edge -> ROUTE101 (map 0/16); (14,8) -> PROF. BIRCH'S HOUSE 1F (map 1/2); (5,8) -> A's HOUSE 1F (map 1/0); (7,16) -> PROF. BIRCH'S POKéMON LAB (map 1/4)";
const LITTLEROOT_SOUTH_9439="There is no way off LITTLEROOT TOWN to the south; the ways off this map are: NORTH edge -> ROUTE101 (map 0/16); (14,8) -> PROF. BIRCH'S HOUSE 1F (map 1/2); (5,8) -> BREDON's HOUSE 1F (map 1/0); (7,16) -> PROF. BIRCH'S POKéMON LAB (map 1/4)";

describe("no-exit-here-v1 on the recorded invented exits",()=>{
 it("e046 s18731: navigate_to arrived on Oldale's east edge, where OLDALE TOWN has no connection",()=>{
  expect(lineFor("e046:18731")).toBe(OLDALE_EAST);
 });
 it("e046 s17480 and s17549: navigate_to (10,0) on Route 103's north edge, walked and refused; water exits are marked, not hidden",()=>{
  expect(lineFor("e046:17480")).toBe(ROUTE103_NORTH);
  expect(lineFor("e046:17549")).toBe(ROUTE103_NORTH);
 });
 it("deb4 s11662: navigate_to (10,19) on LITTLEROOT TOWN, which has only a north connection",()=>{
  expect(lineFor("deb4:11662")).toBe(LITTLEROOT_SOUTH_DEB4);
 });
 it("9439 s14790 and s16266: press DOWN on Littleroot's south edge; s14845 navigate_to (3,19)",()=>{
  expect(lineFor("9439:14790")).toBe(LITTLEROOT_SOUTH_9439);
  expect(lineFor("9439:16266")).toBe(LITTLEROOT_SOUTH_9439);
  expect(lineFor("9439:14845")).toBe(LITTLEROOT_SOUTH_9439);
 });
 it("says nothing on a side that has a connection, or after crossing one (e046 s17409, s17421; deb4 s11596)",()=>{
  expect(lineFor("e046:17409")).toBeNull();
  expect(lineFor("e046:17421")).toBeNull();
  expect(lineFor("deb4:11596")).toBeNull();
 });
 it("names no place the readout did not name",()=>{
  for(const key of ["e046:18731","e046:17480","deb4:11662","9439:14790"]){
   const line=must(lineFor(key)??undefined,key);
   for(const m of line.matchAll(/-> ([^;()]+?) \(map/g))expect(text(key)).toContain(must(m[1],key));
   expect(line).not.toMatch(/PETALBURG|RUSTBORO|ROUTE116|ROUTE119/);
  }
 });
});

describe("no-exit-here-v1 on a map edge with a warp (review round 1)",()=>{
 const mat=recorded("9439:4011");
 it("9439 s4011: navigate_to (2,8) and a press DOWN on May's house exit mat say nothing, since DOWN there leaves through the warp",()=>{
  expect(lineFor("9439:4011")).toBeNull();
  expect(pressSides(mat,["DOWN"])).toEqual([]);
  expect(goalSides(mat,{x:2,y:8,map_id:[1,2]})).toEqual([]);
 });
 it("drops any side whose edge row or column holds a warp, wherever the player stands on it",()=>{
  expect(goalSides(mat,{x:5,y:8,map_id:[1,2]})).toEqual([]);
  expect(goalSides(mat,{x:5,y:20,map_id:[1,2]})).toEqual([]);
  expect(pressSides({...mat,position:{x:6,y:8}},["DOWN"])).toEqual([]);
  expect(goalSides(mat,{x:0,y:8,map_id:[1,2]})).toEqual(["WEST"]);
  expect(goalSides(mat,{x:5,y:0,map_id:[1,2]})).toEqual(["NORTH"]);
 });
 it("says nothing when the state lists no interaction targets (warps unknown)",()=>{
  expect(goalSides({...mat,interaction_targets:null},{x:5,y:0,map_id:[1,2]})).toEqual([]);
  expect(pressSides({...recorded("9439:14790"),interaction_targets:null},["DOWN"])).toEqual([]);
 });
});

// Review round 2: warps are named as the readout's own "Warp destination at (x,y): NAME" lines name them, which the readout
// prints with world destinations whether or not world targets adds the "Warp to" lines, and which name a dynamic warp.
// The truck readout is cook #2 (2026-10-16T02-23-17_qwen36-gpu1_sh02) tool result seq 761 on state seq 760.
describe("no-exit-here-v1 warp names from the readout's Warp destination lines (review round 2)",()=>{
 it("keeps OLDALE TOWN HOUSE1 when the readout has only its Warp destination line (world targets off)",()=>{
  const oldale=recorded("e046:18731");
  const only=text("e046:18731").split("\n").filter(l=>!l.startsWith("Warp to ")&&!l.startsWith("Warps: ")&&!l.startsWith("Exits here")).join("\n");
  expect(only).toContain("Warp destination at (5,7): OLDALE TOWN HOUSE1");
  expect(only).not.toContain("-> OLDALE TOWN HOUSE1");
  expect(noExitLine(runFeatures("e046:18731"),oldale,only,["EAST"])).toBe(OLDALE_EAST);
 });
 it("names the truck's dynamic warp as the readout does, not as dynamic destination (sh02 s761)",()=>{
  const events=gunzipSync(readFileSync(new URL("./fixtures/briefing-sh02.jsonl.gz",import.meta.url))).toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as {seq:number;type:string;text?:string;harness_features?:string[]});
  const start=must(events.find(e=>e.type==="run_start")?.harness_features,"run_start");
  // The fixture keeps only the fields its suites read; the rest come from the shared in-game snapshot.
  const truck=parseGameState({...IN_GAME,...Object.fromEntries(Object.entries(must(events.find(e=>e.seq===760&&e.type==="state"),"760")).filter(([k])=>!["v","run","seq","t","type","turn","raw_ram","settle"].includes(k)))});
  const readout=must(events.find(e=>e.seq===761&&e.type==="tool_result")?.text,"761");
  const features={...featuresOf(start),[ID]:true,"world-destinations-v1":true};
  expect(goalSides(truck,{x:2,y:0,map_id:must(truck.map_id??undefined,"map")})).toEqual(["NORTH"]);
  expect(goalSides(truck,{x:4,y:2,map_id:must(truck.map_id??undefined,"map")})).toEqual([]);
  expect(noExitLine(features,truck,readout,["NORTH"])).toBe("There is no way off INSIDE OF TRUCK to the north; the ways off this map are: (4,1) or (4,2) or (4,3) -> PETALBURG CITY (dynamic warp; map 0/0)");
 });
 it("drops the readout's own reach notes from a name and skips unknown maps, marking cuts its own way",()=>{
  const warp=(x:number,y:number,destination:[number,number,number])=>({kind:"warp" as const,x,y,elevation:0,activation:"movement",availability:"conditional" as const,facing:null,local_id:null,destination,name:"w"});
  const state:GameStateSnapshot={...IN_GAME,started:true,screen:"overworld",in_battle:false,location:"CAVE",map_id:[3,3],position:{x:5,y:5},facing:"up",interaction_targets:[warp(5,5,[4,4,0]),warp(6,6,[8,8,0])],topology:{width:10,height:10,connections:[]},surf_gate:{can_surf:false,balance_badge:false,party_surf:false,surfing:false,warps:[{x:5,y:5}],connections:[]}};
  const readout="Warp destination at (5,5): DEEP HALL (not an exit you can use now: across water, needs Surf)\nWarp destination at (6,6): unknown map 8/8";
  expect(noExitLine({...ALL_ON,"battle-decision-ready-v1":false,"surf-gated-exits-v1":true},state,readout,["NORTH"])).toBe("There is no way off CAVE to the north; the ways off this map are: (5,5) -> DEEP HALL (map 4/4) (crosses water you cannot cross yet); (6,6) -> map 8/8");
 });
});

describe("no-exit-here-v1 sides",()=>{
 const oldale=recorded("e046:18731"),littleroot=recorded("9439:14790");
 it("a press counts only when its last button is a direction pointing off the map from the tile it ends on, facing it",()=>{
  expect(pressSides(oldale,["RIGHT"])).toEqual(["EAST"]);
  expect(pressSides(oldale,["DOWN","RIGHT"])).toEqual(["EAST"]);
  expect(pressSides(oldale,["RIGHT","A"])).toEqual([]);
  expect(pressSides(oldale,["UP"])).toEqual([]);
  expect(pressSides({...oldale,facing:"up"},["RIGHT"])).toEqual([]);
  expect(pressSides({...oldale,facing:null},["RIGHT"])).toEqual(["EAST"]);
  expect(pressSides(littleroot,["DOWN"])).toEqual(["SOUTH"]);
  expect(pressSides({...littleroot,position:{x:0,y:5},facing:"left"},["LEFT"])).toEqual(["WEST"]);
  expect(pressSides({...littleroot,position:{x:5,y:0},facing:"up"},["UP"])).toEqual([]);
 });
 it("a goal on or past an edge with no connection, on the result's own map; a corner names each side without one",()=>{
  const map:[number,number]=[0,9];
  expect(goalSides(littleroot,{x:10,y:19,map_id:map})).toEqual(["SOUTH"]);
  expect(goalSides(littleroot,{x:10,y:25,map_id:map})).toEqual(["SOUTH"]);
  expect(goalSides(littleroot,{x:0,y:19,map_id:map})).toEqual(["SOUTH","WEST"]);
  expect(goalSides(littleroot,{x:30,y:0,map_id:map})).toEqual(["EAST"]);
  expect(goalSides(littleroot,{x:-1,y:5,map_id:map})).toEqual(["WEST"]);
  expect(goalSides(littleroot,{x:10,y:0,map_id:map})).toEqual([]);
  expect(goalSides(littleroot,{x:10,y:10,map_id:map})).toEqual([]);
  expect(goalSides(littleroot,{x:10,y:19,map_id:[0,10]})).toEqual([]);
  expect(goalSides(oldale,{x:20,y:10,map_id:[0,10]})).toEqual(["EAST"]);
 });
 it("nothing without a started overworld state with a map, a position and topology",()=>{
  for(const s of [{...littleroot,started:false},{...littleroot,screen:"battle"},{...littleroot,in_battle:true},{...littleroot,topology:null},{...littleroot,map_id:null},{...littleroot,position:null}] as GameStateSnapshot[]){
   expect(pressSides(s,["DOWN"])).toEqual([]);
   expect(goalSides(s,{x:10,y:19,map_id:[0,9]})).toEqual([]);
  }
 });
});

describe("no-exit-here-v1 line",()=>{
 const warp=(x:number,y:number,destination:[number,number,number])=>({kind:"warp" as const,x,y,elevation:0,activation:"movement",availability:"conditional" as const,facing:null,local_id:null,destination,name:"w"});
 const base=(extra:Partial<GameStateSnapshot>):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,location:"HALL",map_id:[3,3],position:{x:9,y:5},facing:"right",interaction_targets:[warp(1,0,[4,4,0]),warp(2,0,[4,4,0]),warp(5,5,[127,127,0])],topology:{width:10,height:10,connections:[{direction:"NORTH",offset:0,destination:[7,7],destination_name:"UPSIDE"}]},...extra});
 it("groups a door pair, names maps only as the readout did, and falls back to the map id",()=>{
  expect(noExitLine(ALL_ON,base({}),"Location: GREAT HALL\n- NORTH -> UPSIDE (map 7/7), offset 0",["EAST"])).toBe("There is no way off GREAT HALL to the east; the ways off this map are: NORTH edge -> UPSIDE (map 7/7); (1,0) or (2,0) -> map 4/4; (5,5) -> dynamic destination");
 });
 it("uses the state's place name when the text has no Location line, and joins two sides",()=>{
  expect(noExitLine(ALL_ON,base({location_display:"THE HALL"}),"",["SOUTH","EAST"])).toBe("There is no way off THE HALL to the south or the east; the ways off this map are: NORTH edge -> map 7/7; (1,0) or (2,0) -> map 4/4; (5,5) -> dynamic destination");
  expect(noExitLine(ALL_ON,base({location:null}),"",["EAST"])).toBe("There is no way off this map to the east; the ways off this map are: NORTH edge -> map 7/7; (1,0) or (2,0) -> map 4/4; (5,5) -> dynamic destination");
 });
 it("says when nothing is listed, and lists no connections without world destinations",()=>{
  expect(noExitLine(ALL_ON,base({interaction_targets:[],topology:{width:10,height:10,connections:[]}}),"",["EAST"])).toBe("There is no way off HALL to the east; the ways off this map are: none are listed");
  expect(noExitLine({...ALL_ON,"battle-decision-ready-v1":false,"world-destinations-v1":false},base({}),"",["EAST"])).toBeNull();
 });
 it("marks an exit exit-reachability-v1 finds unreachable on foot",()=>{
  const reach={foot:{width:10,height:10,rows:Array.from({length:10},()=>"000")},warps:[{x:1,y:0,reach:"none" as const},{x:2,y:0,reach:"none" as const},{x:5,y:5,reach:"foot" as const}],connections:[{direction:"NORTH" as const,destination:[7,7] as [number,number],offset:0,reach:"foot" as const}]};
  expect(noExitLine({...ALL_ON,"battle-decision-ready-v1":false,"exit-reachability-v1":true},base({exit_reach:reach}),"",["EAST"])).toBe("There is no way off HALL to the east; the ways off this map are: NORTH edge -> map 7/7; (1,0) or (2,0) -> map 4/4 (cannot be reached on foot from where you stand); (5,5) -> dynamic destination");
 });
 it("no sides, no line",()=>{
  expect(noExitLine(ALL_ON,base({}),"",[])).toBeNull();
 });
});

const result=(state:GameStateSnapshot,texts:readonly string[]):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"image",data:"",mimeType:"image/png"},...texts.map(t=>({type:"text" as const,text:t}))],details:{state}});
const textOf=(r:AgentToolResult<unknown>):string=>r.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");
const fake=(name:string,out:AgentToolResult<unknown>):AgentTool=>({name,label:name,description:name,parameters:{},execute:()=>Promise.resolve(out)});

describe("withNoExitHere",()=>{
 const littleroot=recorded("9439:14790");
 it("puts the line right under the Press result line, or under the pressed line without one",async()=>{
  const [press]=withNoExitHere([fake("press",result(littleroot,["pressed DOWN\nPress result: blocked\n\nScreen: overworld\nLocation: LITTLEROOT TOWN"]))],runFeatures("9439:14790"));
  expect(textOf(await must(press,"press").execute("p",{buttons:["DOWN"]}))).toBe("pressed DOWN\nPress result: blocked\nThere is no way off LITTLEROOT TOWN to the south; the ways off this map are: NORTH edge -> map 0/16; (14,8) -> map 1/2; (5,8) -> map 1/0; (7,16) -> map 1/4\n\nScreen: overworld\nLocation: LITTLEROOT TOWN");
  const [plain]=withNoExitHere([fake("press",result(littleroot,["pressed DOWN\nLocation: LITTLEROOT TOWN"]))],runFeatures("9439:14790"));
  expect(textOf(await must(plain,"press").execute("p",{buttons:["DOWN"]}))).toMatch(/^pressed DOWN\nThere is no way off LITTLEROOT TOWN to the south; /);
 });
 it("adds navigate_to's line as its own text part right after the Navigation part",async()=>{
  const state=recorded("deb4:11662");
  const [nav]=withNoExitHere([fake("navigate_to",result(state,["Navigation: command limit; 8 ordinary button attempts.",text("deb4:11662").slice(text("deb4:11662").indexOf("\n")+1)]))],runFeatures("deb4:11662"));
  const out=await must(nav,"nav").execute("n",{x:10,y:19,map_id:[0,9]});
  expect(out.content.map(c=>c.type==="text"?c.text.split("\n")[0]:c.type)).toEqual(["image","Navigation: command limit; 8 ordinary button attempts.",LITTLEROOT_SOUTH_DEB4,"Screen: overworld"]);
 });
 it("leaves results without a line, without a state or of other tools as they were; OFF returns the same tools",async()=>{
  const nothing=result(littleroot,["pressed UP"]);
  const [press,observe]=withNoExitHere([fake("press",nothing),fake("observe",result(littleroot,["Location: LITTLEROOT TOWN"]))],runFeatures("9439:14790"));
  expect(await must(press,"press").execute("p",{buttons:["UP"]})).toBe(nothing);
  const stateless={content:[{type:"text" as const,text:"pressed DOWN"}],details:{}};
  const [bare]=withNoExitHere([fake("press",stateless)],runFeatures("9439:14790"));
  expect(await must(bare,"press").execute("p",{buttons:["DOWN"]})).toBe(stateless);
  const noText=result(littleroot,[]);
  const [silent]=withNoExitHere([fake("press",noText)],runFeatures("9439:14790"));
  expect(textOf(await must(silent,"press").execute("p",{buttons:["DOWN"]}))).toMatch(/^There is no way off LITTLEROOT TOWN/);
  const tools=[fake("press",nothing),fake("observe",nothing)];
  expect(withNoExitHere(tools,runFeatures("9439:14790",false))).toEqual(tools);
  expect(withNoExitHere(tools,runFeatures("9439:14790",false))[0]).toBe(tools[0]);
  expect(must(observe,"observe").name).toBe("observe");
 });
 it("leaves a result alone when the call's arguments are not the shape the tool takes",async()=>{
  const out=result(littleroot,["pressed DOWN\nPress result: blocked"]);
  const [press,nav]=withNoExitHere([fake("press",out),fake("navigate_to",out)],runFeatures("9439:14790"));
  expect(await must(press,"press").execute("p",null)).toBe(out);
  expect(await must(press,"press").execute("p",{buttons:"DOWN"})).toBe(out);
  expect(await must(nav,"nav").execute("n",{x:10,y:19})).toBe(out);
 });
 it("keeps executeChecked on a checked press",async()=>{
  const out=result(littleroot,["pressed DOWN\nPress result: blocked"]);
  const checked={...fake("press",out),executeChecked:()=>Promise.resolve(out)} as unknown as AgentTool&{executeChecked:(id:string,params:unknown,check:()=>void)=>Promise<AgentToolResult<unknown>>};
  const [wrapped]=withNoExitHere([checked],runFeatures("9439:14790")) as (typeof checked)[];
  expect(textOf(await must(wrapped,"press").executeChecked("p",{buttons:["DOWN"]},()=>undefined))).toContain("There is no way off LITTLEROOT TOWN to the south;");
 });
});

// The production factory: playGameTools over fake ordinary tools serving the recorded state. navigate_to runs the real
// bounded navigation on e046 s17548 (Route 103 at (14,7), goal (10,0) refused as a wall), as at s17549.
describe("no-exit-here-v1 through playGameTools",()=>{
 const recorder={subscribe:():void=>undefined,recordState:()=>{throw new Error("unused");},recordDialogueAutoAdvance:()=>{throw new Error("unused");},lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyGoalAway:()=>undefined,destinationCitation:()=>undefined};
 const quiet=(key:string,on:boolean):FeatureSet=>({...runFeatures(key,on),"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"story-destinations-v1":false});
 const tools=(key:string,on:boolean):AgentTool[]=>{
  const state=recorded(key),out=result(state,[text(key)]);
  const press={...fake("press",out),executeChecked:()=>Promise.resolve(out)} as unknown as AgentTool;
  return playGameTools([fake("observe",out),press],quiet(key,on),{read:()=>Promise.resolve(state)},recorder);
 };
 it("ON: the 9439 s14790 press result carries the line; OFF: byte for byte ON without it",async()=>{
  const on=textOf(await must(tools("9439:14790",true).find(t=>t.name==="press"),"press").execute("p",{buttons:["DOWN"]}));
  expect(on).toContain(`Press result: blocked or unavailable (no movement/turn observed; snapshots cannot distinguish collision from ignored input)\n${LITTLEROOT_SOUTH_9439}\n`);
  const off=textOf(await must(tools("9439:14790",false).find(t=>t.name==="press"),"press").execute("p",{buttons:["DOWN"]}));
  expect(off).toBe(on.replace(`\n${LITTLEROOT_SOUTH_9439}`,""));
  expect(off).not.toContain("There is no way off");
 });
 it("ON: navigate_to (10,0) on Route 103 is refused and says there is no way off to the north; OFF says nothing",async()=>{
  const goal={x:10,y:0,map_id:[0,18],walking:true};
  const on=await must(tools("e046:17549",true).find(t=>t.name==="navigate_to"),"nav").execute("n",goal);
  const parts=on.content.flatMap(c=>c.type==="text"?[c.text]:[]);
  expect(parts[0]).toMatch(/^Navigation: \(10,0\) is a wall/);
  expect(parts[1]).toBe(ROUTE103_NORTH);
  const off=textOf(await must(tools("e046:17549",false).find(t=>t.name==="navigate_to"),"nav").execute("n",goal));
  expect(off).not.toContain("There is no way off");
 });
});

describe("no-exit-here-v1 registry",()=>{
 it("is appended last, a guidance switch that needs world destinations, default off, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-136)).toBe(ID);
  expect(playHarnessFeatures(withoutFrontierTreatments(ALL_ON),null).at(-26)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-136)?.id).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"world-destinations-v1",switchable:true,title:"NO EXIT HERE"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  expect(featureInfo(ID).description).toContain("There is no way off OLDALE TOWN to the east; the ways off this map are: NORTH edge -> ROUTE103 (map 0/18)");
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"world-destinations-v1":false})).toContain(`${ID} needs world-destinations-v1`);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
 });
 it("presets and flag presets leave it off when omitted",()=>{
  const omitted=Object.fromEntries(Object.entries(ALL_ON).filter(([k])=>k!==ID));
  expect(normalizeFeatures(omitted as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
 });
});
