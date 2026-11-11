import {expect,it} from "vitest";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import {IN_GAME} from "../test-support/events.js";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,SERVER_FEATURES,type FeatureSet} from "./features.js";
import {normalizeFeatures,flagFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {LeagueStockUp,LEAGUE_LOBBY,leagueStockUpText,withLeagueStockUp} from "./league-stock-up.js";
import {Supplies,suppliesLine,sellingHere,withSupplies} from "./supplies.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {playGameTools} from "./play-wiring.js";
import {serverOff,serverOffWith} from "../test-support/server-features.js";

const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const bag=[
 {slot:0,item_id:19,quantity:2,pocket:"items",name:"FULL RESTORE"},
 {slot:1,item_id:110,quantity:1,pocket:"items",name:"NUGGET"},
 {slot:0,item_id:4,quantity:3,pocket:"poke_balls",name:"POKé BALL"},
];
const resources={bag,pc_items:null,storage:null,berry_trees:null,planted_berries:null,diagnostics:[],script_pc:null,script_mode:null,script_status:null,selected_tree_id:null,berry_script_owner:null};
const lobby:GameStateSnapshot=parseGameState({...IN_GAME,location:LEAGUE_LOBBY,map_id:[16,10],money:130696,resources});
const empty:GameStateSnapshot={...lobby,resources:{...resources,bag:[]}};
const outside:GameStateSnapshot={...lobby,location:"EVER GRANDE CITY",map_id:[0,15]};

const TEXT="POKéMON LEAGUE: past the north door the ELITE FOUR and then the CHAMPION are fought one after another, with no POKéMON CENTER in between, so until you win or lose the only healing is what is in your BAG. Each ELITE FOUR member carries 2 FULL RESTOREs and the CHAMPION carries 4. A loss sends you back to this lobby, takes half your money, and you start again from the first ELITE FOUR room. Becoming CHAMPION is the end goal of this game, so money kept back now has no later use. This lobby's POKéMON MART sells HYPER POTION ₽1,200, MAX POTION ₽2,500, FULL RESTORE ₽3,000, FULL HEAL ₽600 and REVIVE ₽1,500.";

it("states the lobby facts, the player's money and healing items, and leaves the amount to the model",()=>{
 expect(leagueStockUpText(lobby)).toBe(`${TEXT} You have ₽130,696; BAG healing and status items: FULL RESTORE ×2. How much to buy is your call.`);
 expect(leagueStockUpText(empty)).toBe(`${TEXT} You have ₽130,696; BAG healing and status items: none. How much to buy is your call.`);
 expect(leagueStockUpText({...lobby,money:null,resources:null})).toBe(`${TEXT} You have an unknown amount of money; BAG healing and status items: none. How much to buy is your call.`);
});

it("speaks once per arrival, on a field result, never in battle or before the game starts",()=>{
 const l=new LeagueStockUp();
 expect(l.block({...lobby,started:false})).toBeNull();
 expect(l.block({...lobby,in_battle:true})).toBeNull();
 expect(l.block({...lobby,screen:"start_menu"})).toBeNull();
 expect(l.block(lobby)).toBe(leagueStockUpText(lobby));
 expect(l.block(lobby)).toBeNull();
 expect(l.block(outside)).toBeNull();
 expect(l.block(empty)).toBe(leagueStockUpText(empty));
});

const observeOf=(states:GameStateSnapshot[]):AgentTool=>{
 let i=0;
 return {name:"observe",label:"Observe",description:"fixture",parameters:Type.Object({}),execute:()=>{const state=states[Math.min(i++,states.length-1)];return Promise.resolve({content:[{type:"text",text:"readout"}],details:{state}});}};
};
const texts=async(tool:AgentTool|undefined)=>{
 if(tool===undefined)throw new Error("no tool");
 const result=await tool.execute("id",{});
 return result.content.flatMap(p=>p.type==="text"?[p.text]:[]);
};

it("the wrapper leaves tools untouched when off and appends the paragraph when on",async()=>{
 const tools=[observeOf([lobby])];
 expect(withLeagueStockUp(tools,OFF)).toEqual(tools);
 const on=withLeagueStockUp([observeOf([lobby,lobby])],{...OFF,"league-stock-up-v1":true})[0];
 expect(await texts(on)).toEqual(["readout",leagueStockUpText(lobby)]);
 expect(await texts(on)).toEqual(["readout"]);
 const other:AgentTool={...observeOf([lobby]),name:"get_dialogue"};
 expect(withLeagueStockUp([other],{...OFF,"league-stock-up-v1":true})[0]).toBe(other);
});

it("checked presses carry the paragraph too",async()=>{
 const result={content:[{type:"text" as const,text:"pressed"}],details:{state:lobby}};
 const press={...observeOf([lobby]),name:"press",executeChecked:()=>Promise.resolve(result)} as unknown as CheckedPressTool;
 const [wrapped]=withLeagueStockUp([press],{...OFF,"league-stock-up-v1":true});
 if(wrapped===undefined||!isCheckedPress(wrapped))throw new Error("not a checked press");
 const out=await wrapped.executeChecked("id",{buttons:["A"]},()=>undefined);
 expect(out.content.flatMap(p=>p.type==="text"?[p.text]:[])).toEqual(["pressed",leagueStockUpText(lobby)]);
});

it("production playGameTools honors the switch",async()=>{
 for(const on of [false,true]){
  const rec={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:2,turn:1}),lowHpTrainerWarning:()=>undefined};
  const tools=playGameTools([observeOf([lobby])],{...OFF,"league-stock-up-v1":on},{read:()=>Promise.resolve(lobby)},rec as unknown as Parameters<typeof playGameTools>[3]);
  const out=await texts(tools.find(t=>t.name==="observe"));
  expect(out.includes(leagueStockUpText(lobby))).toBe(on);
 }
});

it("supplies-v1: one line on arrival where things are sold and when the buy list opens",async()=>{
 expect(suppliesLine(lobby,[`${LEAGUE_LOBBY} (this map)`])).toBe(`Supplies: ₽130,696 · balls: POKé BALL ×3 · healing and status items: FULL RESTORE ×2 · party 1 of 6 · places on this map that sell things: ${LEAGUE_LOBBY} (this map)`);
 expect(suppliesLine({...empty,money:null})).toBe("Supplies: unknown · balls: none · healing and status items: none · party 1 of 6");
 expect(sellingHere(lobby,null)).toEqual([`${LEAGUE_LOBBY} (this map)`]);
 const places=[{name:"EVER GRANDE CITY",display:"EVER GRANDE CITY",map_id:[0,15],warps:[{x:27,y:48,to:[16,10]},{x:3,y:3,to:[0,15]},{x:9,y:9,to:[9,9]}]},{name:LEAGUE_LOBBY,display:"POKéMON LEAGUE",map_id:[16,10],warps:[]}];
 expect(sellingHere(outside,places as never)).toEqual(["POKéMON LEAGUE, door at (27,48)"]);
 const s=new Supplies();
 expect(s.block({...lobby,started:false},null)).toBeNull();
 expect(s.block(outside,null)).toBeNull();
 expect(s.block(lobby,null)).toBe(suppliesLine(lobby,[`${LEAGUE_LOBBY} (this map)`]));
 expect(s.block(lobby,null)).toBeNull();
 expect(s.block({...lobby,active_ui:{phase:"shop_menu"}} as never,null)).toBe(suppliesLine(lobby,[`${LEAGUE_LOBBY} (this map)`]));
 expect(s.block({...lobby,active_ui:{phase:"shop_menu"}} as never,null)).toBeNull();
 const tools=[observeOf([lobby])];
 expect(withSupplies(tools,OFF,{})).toEqual(tools);
 const on=withSupplies([observeOf([lobby])],{...OFF,"supplies-v1":true},{places:()=>Promise.reject(new Error("no map table"))})[0];
 expect(await texts(on)).toEqual(["readout",suppliesLine(lobby,[`${LEAGUE_LOBBY} (this map)`])]);
});

it("registers three default-off switches in order, two of them server-side",()=>{
 const ids=["foe-item-recap-v1","foe-trainer-items-v1","league-stock-up-v1"] as const;
 expect(ids.map(id=>SWITCHABLE_FEATURES.indexOf(id))).toEqual([385,386,387]);
 for(const id of ids){
  expect(featureInfo(id).description).toContain(" Off: ");
  expect(normalizeFeatures(Object.fromEntries(SWITCHABLE_FEATURES.filter(f=>!ids.includes(f as never)).map(f=>[f,false])) as never)[id]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
  expect(playHarnessFeatures({...OFF,[id]:true},null)).toContain(id);
  expect(playHarnessFeatures(OFF,null)).not.toContain(id);
 }
 expect(SERVER_FEATURES).toContain("foe-item-recap-v1");
 expect(SERVER_FEATURES).toContain("foe-trainer-items-v1");
 expect(SERVER_FEATURES).not.toContain("league-stock-up-v1");
 const off=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,id==="ram-state-v1"])) as FeatureSet;
 expect(serverOff({...off,"foe-item-recap-v1":true})).toEqual(serverOffWith(off,{on:["foe-item-recap-v1"]}));
 expect(serverOff({...off,"foe-trainer-items-v1":true})).toEqual(serverOffWith(off,{on:["foe-trainer-items-v1"]}));
 expect(serverOff({...off,"league-stock-up-v1":true})).toEqual(serverOff(off));
});
