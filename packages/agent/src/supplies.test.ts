import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import type {RunEvent} from "./events.js";
import {ALL_ON} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {Supplies,suppliesLine,withSupplies} from "./supplies.js";

// Run 2026-10-25T19-32-47_qwen36-gpu0_057c, seq 12438 (turn 298): its first state inside PETALBURG CITY MART,
// slimmed to the fields the line reads.
const MART=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/supplies-057c.json.gz",import.meta.url))).toString("utf8")) as GameStateSnapshot&{seq:number;turn:number;type:"state"};
export const SUPPLIES_057C="Supplies: ₽3,440 · balls: POKé BALL ×5 · healing and status items: none · party 1 of 6";
const state=(over:Partial<GameStateSnapshot>):GameStateSnapshot=>({...MART,...over});
const event=(seq:number,location:string|null):RunEvent=>({...MART,seq,location} as unknown as RunEvent);
const shop={phase:"shop_menu",selected:"POKé BALL",ready:true,controls:"",diagnostic:null};

describe("supplies-v1",()=>{
 it("renders 057c's first PETALBURG CITY MART state",()=>{
  expect(suppliesLine(MART)).toBe(SUPPLIES_057C);
 });
 it("lists healing and status items by the game's names and unknown money",()=>{
  const bag=[...(MART.resources?.bag??[]),{slot:0,item_id:13,quantity:2,pocket:"items",name:"POTION"},{slot:1,item_id:14,quantity:1,pocket:"items",name:"ANTIDOTE"},{slot:2,item_id:86,quantity:1,pocket:"items",name:"REPEL"},{slot:0,item_id:139,quantity:1,pocket:"berries",name:"ORAN BERRY"}];
  expect(suppliesLine(state({money:null,resources:{...MART.resources,bag}} as Partial<GameStateSnapshot>))).toBe("Supplies: unknown · balls: POKé BALL ×5 · healing and status items: POTION ×2, ANTIDOTE ×1, ORAN BERRY ×1 · party 1 of 6");
  expect(suppliesLine(state({resources:null}))).toBe("Supplies: ₽3,440 · balls: none · healing and status items: none · party 1 of 6");
 });
 it("shows once per visit at the first field result in the mart, and again when the buy list opens",()=>{
  const s=new Supplies();
  s.observe(event(1,"PETALBURG CITY"));
  expect(s.block(state({location:"PETALBURG CITY"}))).toBeNull();
  s.observe(event(2,"PETALBURG CITY MART"));
  expect(s.block(state({in_battle:true}))).toBeNull();
  expect(s.block(MART)).toBe(SUPPLIES_057C);
  expect(s.block(MART)).toBeNull();
  expect(s.block(state({active_ui:shop}))).toBe(SUPPLIES_057C);
  expect(s.block(state({active_ui:shop}))).toBeNull();
  expect(s.block(MART)).toBeNull();
  expect(s.block(state({active_ui:shop}))).toBe(SUPPLIES_057C);
  s.observe(event(3,"PETALBURG CITY MART"));
  expect(s.block(MART)).toBeNull();
  s.observe(event(4,"PETALBURG CITY"));
  s.observe(event(5,null));
  s.observe({type:"milestone"} as unknown as RunEvent);
  s.observe(event(6,"PETALBURG CITY MART"));
  expect(s.block(state({started:false}))).toBeNull();
  expect(s.block(MART)).toBe(SUPPLIES_057C);
 });
 it("is wired only when the switch is on",async()=>{
  const observe:AgentTool={name:"observe",label:"observe",description:"",parameters:{},execute:()=>Promise.resolve({content:[{type:"text",text:"readout"}],details:{state:MART}})};
  const subs:((e:RunEvent)=>void)[]=[];
  const recorder={subscribe:(f:(e:RunEvent)=>void)=>{subs.push(f);}};
  expect(withSupplies([observe],{...ALL_ON,"supplies-v1":false},recorder)[0]).toBe(observe);
  expect(subs).toHaveLength(0);
  const [tool]=withSupplies([observe],{...ALL_ON,"supplies-v1":true},recorder);
  for(const f of subs)f(event(1,"PETALBURG CITY MART"));
  const result=await tool?.execute("id",{},undefined,undefined);
  expect(result?.content).toEqual([{type:"text",text:"readout"},{type:"text",text:SUPPLIES_057C}]);
 });
});
