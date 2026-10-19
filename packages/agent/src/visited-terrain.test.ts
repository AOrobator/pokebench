import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import type {GameStateSnapshot} from "./game-state.js";
import {planNavigation} from "./navigation.js";
import {VisitedTerrain,withVisitedTerrain} from "./visited-terrain.js";
import {observeTool,pressTool} from "./game-tools.js";
import {flagFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {experimentArms,parseExperiment} from "./experiments.js";

type Tile=NonNullable<GameStateSnapshot["navigation_grid"]>["tiles"][number];
const tile=(x:number,y:number,collision=0,behavior=0,elevation=3):Tile=>({x,y,collision,behavior,elevation});
const field=(map_id:readonly [number,number],position:{x:number;y:number},tiles:readonly Tile[],objects:readonly {x:number;y:number}[]=[],warps:readonly {x:number;y:number}[]=[]):GameStateSnapshot=>({
 screen:"overworld",started:true,name:"A",location:"ROUTE",map_id:[...map_id],position,facing:"right",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,
 topology:{width:30,height:30,connections:[]},navigation_grid:{elevation:3,tiles:[...tiles],objects:[...objects],warps:[...warps]},
});
const result=(state:GameStateSnapshot):AgentToolResult<unknown>=>({content:[{type:"text",text:"State"}],details:{state}});

describe("visited-terrain-navigation-v1",()=>{
 it("starts empty, is keyed by map, and a fresh run/checkpoint gets no synthetic history",()=>{
  const memory=new VisitedTerrain();
  const a=field([0,16],{x:1,y:1},[tile(1,1),tile(2,1)]),b=field([0,17],{x:5,y:5},[tile(5,5)]);
  expect(memory.navigationState(a).navigation_grid?.tiles).toEqual([]);
  memory.delivered(a);memory.delivered(b);
  expect(memory.navigationState(a).navigation_grid?.tiles.map(t=>[t.x,t.y])).toEqual([[1,1],[2,1]]);
  expect(memory.navigationState(b).navigation_grid?.tiles.map(t=>[t.x,t.y])).toEqual([[5,5]]);
  expect(new VisitedTerrain().navigationState(a).navigation_grid?.tiles).toEqual([]);
 });

 it("remembers delivered terrain, overwrites a changed cell, and never ingests new cells from an internal read",()=>{
  const memory=new VisitedTerrain(),first=field([0,16],{x:1,y:1},[tile(1,1),tile(2,1,1)]);
  memory.delivered(first);
  const hidden=field([0,16],{x:2,y:1},[tile(1,1),tile(2,1,0),tile(3,1)]);
  const before=memory.navigationState(hidden).navigation_grid?.tiles;
  expect(before?.map(t=>[t.x,t.y,t.collision])).toEqual([[1,1,0],[2,1,0]]);
  expect(memory.knownCellCount([0,16])).toBe(2);
  memory.delivered(hidden);
  expect(memory.knownCellCount([0,16])).toBe(3);
 });

 it("renders every ledge in the direction the game permits the jump",()=>{
  const memory=new VisitedTerrain(),state=field([0,16],{x:0,y:0},[tile(1,1,0,0x38),tile(2,1,0,0x39),tile(3,1,0,0x3a),tile(4,1,0,0x3b)]);
  memory.delivered(state);
  // tile-rules.ts and the live-map readout define east, west, north, south.
  expect(memory.text(state)).toContain("><^v");
 });

 it("cannot turn remembered terrain into a navigable grid when the current live grid is unavailable",()=>{
  const memory=new VisitedTerrain(),shown=field([0,16],{x:1,y:1},[tile(1,1),tile(2,1)]);
  memory.delivered(shown);
  const unavailable={...shown,navigation_grid:null};
  expect(memory.navigationState(unavailable).navigation_grid).toBeNull();
  expect(planNavigation(memory.navigationState(unavailable),{x:2,y:1},{mode:"visited"})).toBeNull();
 });

 it("uses only current dynamic objects and current observations replace stale warp facts",()=>{
  const memory=new VisitedTerrain();
  memory.delivered(field([0,16],{x:1,y:1},[tile(1,1),tile(2,1)], [{x:2,y:1}],[{x:2,y:1}]));
  const current=field([0,16],{x:1,y:1},[tile(1,1),tile(2,1)],[],[]);
  memory.delivered(current);
  const grid=memory.navigationState(current).navigation_grid;
  expect(grid?.objects).toEqual([]);
  expect(grid?.warps).toEqual([]);
 });

 it("plans across stitched windows but does not plan through an undelivered cell",()=>{
  const memory=new VisitedTerrain();
  const first=field([0,16],{x:0,y:0},[tile(0,0),tile(1,0)]);
  memory.delivered(first);
  expect(planNavigation(memory.navigationState(field([0,16],{x:0,y:0},[tile(0,0),tile(1,0),tile(2,0)])),{x:3,y:0},{mode:"visited"})).toEqual(["RIGHT"]);
  memory.delivered(field([0,16],{x:1,y:0},[tile(1,0),tile(2,0),tile(3,0)]));
  expect(planNavigation(memory.navigationState(first),{x:3,y:0},{mode:"visited"})).toEqual(["RIGHT","RIGHT","RIGHT"]);
 });

 it("appends a bounded stitched map only after the result becomes model-visible",async()=>{
  const memory=new VisitedTerrain();
  const state=field([0,16],{x:1,y:1},[tile(1,1),tile(2,1,1),tile(1,2,0,2)]);
  const [tool]=withVisitedTerrain([{name:"observe",label:"Observe",description:"Observe",parameters:{},execute:()=>Promise.resolve(result(state))}],memory);
  if(tool===undefined)throw new Error("fixture");
  const shown=await tool.execute("call",{},undefined);
  expect(memory.knownCellCount([0,16])).toBe(3);
  expect(shown.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n")).toContain("Visited terrain on map 0/16; only cells shown to you this run");
  expect(shown.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n")).toContain("? unknown");
 });

 it("leaves non-state and malformed results byte-identical",async()=>{
  const plain:AgentToolResult<unknown>={content:[{type:"text",text:"unchanged"}],details:undefined};
  const [tool]=withVisitedTerrain([{name:"x",label:"x",description:"x",parameters:{},execute:()=>Promise.resolve(plain)}],new VisitedTerrain());
  if(tool===undefined)throw new Error("fixture");
  expect(await tool.execute("call",{},undefined)).toBe(plain);
 });

 it("the production play factory keeps OFF results exact, and ON wires both the stitched result and planner description",async()=>{
  const state=field([0,16],{x:1,y:1},[tile(1,1),tile(2,1)]),png=Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
  const fetchFn:typeof fetch=()=>Promise.resolve(new Response(JSON.stringify({state,state_text:"exact incumbent readout",screenshot_base64:png.toString("base64")})));
  const base=[observeTool("http://x",fetchFn),pressTool("http://x",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn)];
  const rec={recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1}),subscribe:()=>undefined,lowHpTrainerWarning:()=>undefined,peopleIdCard:()=>undefined,storyBattleWarning:()=>undefined,destinationCitation:()=>undefined};
  const incumbent={...flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false}),"bounded-navigation-v1":true};
  const make=(features:typeof incumbent)=>playGameTools(base,features,{read:()=>Promise.resolve(state)},rec);
  const off=make({...incumbent,"visited-terrain-navigation-v1":false}),on=make({...incumbent,"visited-terrain-navigation-v1":true});
  const observe=async(tools:ReturnType<typeof make>)=>{const tool=tools.find(candidate=>candidate.name==="observe");if(tool===undefined)throw new Error("observe");return tool.execute("o",{},undefined);};
  expect((await observe(off)).content.flatMap(p=>p.type==="text"?[p.text]:[])).toEqual(["exact incumbent readout"]);
  expect((await observe(on)).content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n")).toContain("Visited terrain on map 0/16");
  expect(on.find(tool=>tool.name==="navigate_to")?.description).toContain("only over terrain already shown to you this run");
  const whole=playGameTools(base,{...incumbent,"visited-terrain-navigation-v1":true,"full-map-navigation-v1":true},{read:()=>Promise.resolve(state)},rec);
  expect(whole.find(tool=>tool.name==="navigate_to")?.description).toContain("whole current map");
  expect((await observe(whole)).content.flatMap(p=>p.type==="text"?[p.text]:[])).toEqual(["exact incumbent readout"]);
 });

 it("the pending comparison follows main's automatic-running bundle and flips only visited terrain",()=>{
  const experiment=parseExperiment(JSON.parse(readFileSync(new URL("../../../experiments/visited-terrain-navigation.json",import.meta.url),"utf8")) as unknown);
  const {incumbent,candidate}=experimentArms(experiment);
  expect(incumbent.features["automatic-running-v1"]).toBe(true);
  expect(candidate.features["automatic-running-v1"]).toBe(true);
  expect(Object.keys(candidate.features).filter(id=>candidate.features[id as keyof typeof candidate.features]!==incumbent.features[id as keyof typeof incumbent.features])).toEqual(["visited-terrain-navigation-v1"]);
 });
});
