import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {ALL_ON} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {Place} from "./story-destinations.js";
import {SELLING_MAPS,Supplies,sellingHere,suppliesLine,withSupplies} from "./supplies.js";

// Run 2026-10-25T19-32-47_qwen36-gpu0_057c, slimmed to the fields the line reads: its first state in PETALBURG CITY
// (seq 9822, turn 252) and its first state inside PETALBURG CITY MART (seq 12438, turn 298).
// supplies-places.json: eight maps of the game's map table (name, warps, connections), from the vendored pret map data
// env/vendor/continual-harness/pokemon_env/porymap/data/maps (the same table the game server reads from the ROM).
const gz=(name:string)=>JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/${name}`,import.meta.url))).toString("utf8")) as GameStateSnapshot;
const TOWN=gz("supplies-057c-town.json.gz");
const MART=gz("supplies-057c.json.gz");
const PLACES=(JSON.parse(readFileSync(new URL("./fixtures/supplies-places.json",import.meta.url),"utf8")) as {places:Place[]}).places;
export const SUPPLIES_057C_TOWN="Supplies: ₽1,992 · balls: POKé BALL ×5 · healing and status items: none · party 1 of 6 · places on this map that sell things: PETALBURG CITY MART, door at (25,12)";
export const SUPPLIES_057C_MART="Supplies: ₽3,440 · balls: POKé BALL ×5 · healing and status items: none · party 1 of 6 · places on this map that sell things: PETALBURG CITY MART (this map)";
const state=(over:Partial<GameStateSnapshot>):GameStateSnapshot=>({...TOWN,...over});
const shop={phase:"shop_menu",selected:"POKé BALL",ready:true,controls:"",diagnostic:null};
const ROUTE104={location:"ROUTE104",map_id:[0,19] as [number,number]};
const SLATEPORT={location:"SLATEPORT CITY",map_id:[0,1] as [number,number]};

describe("supplies-v1",()=>{
 it("shows 057c's line on its first PETALBURG CITY result, naming the mart door from the map table",()=>{
  expect(new Supplies().block(TOWN,PLACES)).toBe(SUPPLIES_057C_TOWN);
 });
 it("names the map itself when it sells things, and both for a map with its own stalls and a mart door",()=>{
  expect(new Supplies().block(MART,PLACES)).toBe(SUPPLIES_057C_MART);
  expect(sellingHere(SLATEPORT,PLACES)).toEqual(["SLATEPORT CITY (this map)","SLATEPORT CITY MART, door at (13,26)"]);
 });
 it("is silent on arrival where nothing is sold, and lists every tile of a double door",()=>{
  expect(new Supplies().block(state(ROUTE104),PLACES)).toBeNull();
  const two=PLACES.map(p=>p.name==="PETALBURG CITY"?{...p,warps:[...p.warps,{x:26,y:12,to:[8,6] as [number,number]}]}:p);
  expect(sellingHere(TOWN,two)).toEqual(["PETALBURG CITY MART, door at (25,12), (26,12)"]);
 });
 it("falls back to the current map's own name without the map table",()=>{
  expect(new Supplies().block(TOWN,null)).toBeNull();
  expect(new Supplies().block(MART,null)).toBe(SUPPLIES_057C_MART);
  expect(new Supplies().block({...MART,map_id:null},null)).toBe(SUPPLIES_057C_MART);
  expect(sellingHere({location:null,map_id:null},null)).toEqual([]);
 });
 it("shows once per arrival, at the first field result, and again whenever the buy list opens",()=>{
  const s=new Supplies();
  expect(s.block(state({in_battle:true}),PLACES)).toBeNull();
  expect(s.block(TOWN,PLACES)).toBe(SUPPLIES_057C_TOWN);
  expect(s.block(TOWN,PLACES)).toBeNull();
  expect(s.block(MART,PLACES)).toBe(SUPPLIES_057C_MART);
  expect(s.block({...MART,active_ui:shop},PLACES)).toBe(SUPPLIES_057C_MART);
  expect(s.block({...MART,active_ui:shop},PLACES)).toBeNull();
  expect(s.block(MART,PLACES)).toBeNull();
  expect(s.block({...MART,active_ui:shop},PLACES)).toBe(SUPPLIES_057C_MART);
  expect(s.block(TOWN,PLACES)).toBe(SUPPLIES_057C_TOWN);
  expect(s.block(state({started:false}),PLACES)).toBeNull();
 });
 it("lists healing and status items by the game's names and unknown money",()=>{
  const bag=[...(MART.resources?.bag??[]),{slot:0,item_id:13,quantity:2,pocket:"items",name:"POTION"},{slot:1,item_id:14,quantity:1,pocket:"items",name:"ANTIDOTE"},{slot:2,item_id:86,quantity:1,pocket:"items",name:"REPEL"},{slot:0,item_id:139,quantity:1,pocket:"berries",name:"ORAN BERRY"}];
  expect(suppliesLine(state({money:null,resources:{...MART.resources,bag}} as Partial<GameStateSnapshot>))).toBe("Supplies: unknown · balls: POKé BALL ×5 · healing and status items: POTION ×2, ANTIDOTE ×1, ORAN BERRY ×1 · party 1 of 6");
  expect(suppliesLine(state({resources:null}))).toBe("Supplies: ₽1,992 · balls: none · healing and status items: none · party 1 of 6");
 });
 it("names only maps that are in the game's map table",()=>{
  const dir=new URL("../../../env/vendor/continual-harness/pokemon_env/porymap/data/maps/",import.meta.url);
  const groups=JSON.parse(readFileSync(new URL("map_groups.json",dir),"utf8")) as {group_order:string[]}&Record<string,string[]>;
  const table=new Set(groups.group_order.flatMap(g=>groups[g]??[]).map(folder=>(JSON.parse(readFileSync(new URL(`${folder}/map.json`,dir),"utf8")) as {id:string}).id.replace(/^MAP_/,"").replaceAll("_"," ")));
  for(const name of SELLING_MAPS)expect(table.has(name),name).toBe(true);
 });
 it("is wired only when the switch is on, reads the map table once and survives a failed read",async()=>{
  const observe:AgentTool={name:"observe",label:"observe",description:"",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"readout"}],details:{state:TOWN}})};
  const other:AgentTool={...observe,name:"battle_action_unrelated"};
  let reads=0;
  const source={places:()=>{reads+=1;return Promise.resolve({places:PLACES});}};
  expect(withSupplies([observe],{...ALL_ON,"supplies-v1":false},source)[0]).toBe(observe);
  const [tool,untouched]=withSupplies([observe,other],{...ALL_ON,"supplies-v1":true},source);
  expect(untouched).toBe(other);
  expect((await tool?.execute("id",{}))?.content).toEqual([{type:"text",text:"readout"},{type:"text",text:SUPPLIES_057C_TOWN}]);
  expect((await tool?.execute("id",{}))?.content).toEqual([{type:"text",text:"readout"}]);
  expect(reads).toBe(1);
  let fails=0;
  const [failing]=withSupplies([observe],{...ALL_ON,"supplies-v1":true},{places:()=>{fails+=1;return Promise.reject(new Error("down"));}});
  expect((await failing?.execute("id",{}))?.content).toEqual([{type:"text",text:"readout"}]);
  expect(fails).toBe(1);
  const [none]=withSupplies([observe],{...ALL_ON,"supplies-v1":true},{});
  expect((await none?.execute("id",{}))?.content).toEqual([{type:"text",text:"readout"}]);
  const [bad]=withSupplies([observe],{...ALL_ON,"supplies-v1":true},{places:()=>Promise.resolve({wrong:true})});
  expect((await bad?.execute("id",{}))?.content).toEqual([{type:"text",text:"readout"}]);
  const noState:AgentTool={...observe,execute:()=>Promise.resolve({content:[{type:"text",text:"x"}],details:{}})};
  const [plain]=withSupplies([noState],{...ALL_ON,"supplies-v1":true},source);
  expect((await plain?.execute("id",{}))?.content).toEqual([{type:"text",text:"x"}]);
 });
});
