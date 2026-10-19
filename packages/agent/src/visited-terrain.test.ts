import {describe,expect,it} from "vitest";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import type {GameStateSnapshot} from "./game-state.js";
import {planNavigation} from "./navigation.js";
import {VisitedTerrain,withVisitedTerrain} from "./visited-terrain.js";

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
  const plain:AgentToolResult<unknown>={content:[{type:"text",text:"unchanged"}]};
  const [tool]=withVisitedTerrain([{name:"x",label:"x",description:"x",parameters:{},execute:()=>Promise.resolve(plain)}],new VisitedTerrain());
  if(tool===undefined)throw new Error("fixture");
  expect(await tool.execute("call",{},undefined)).toBe(plain);
 });
});
