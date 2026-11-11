// menu-option-null-id-v1 (the operator 2026-11-11): the START menu has no menu_id, and the prompt tells the model to copy null.
// pi-ai's validateToolArguments runs typebox Value.Convert on the arguments before execute, which turns menu_id null
// into 0, so the exact compare refused every START-menu call. Run 2026-11-10T15-37-43_opus-rayquaza-boot_67d7 had 32
// START-menu refusals and no success; its state at seq 184768 (turn 4013) is the START menu below.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {validateToolArguments,type ToolCall} from "@mariozechner/pi-ai";
import {Type} from "typebox";
import {describe,expect,it} from "vitest";
import type {Button} from "./events.js";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {MENU_OPTION_SECTION,menuOptionTool,menuOptionView} from "./menu-option-tool.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playGameTools} from "./play-wiring.js";
import {IN_GAME} from "../test-support/events.js";

const ID="menu-option-null-id-v1" as const;
const OPTIONS=["POKEDEX","POKEMON","BAG","POKENAV","PLAYER","SAVE","OPTIONS","EXIT"];
// The recorded 67d7 START menu (no menu_id key), with the highlight moved to index.
function startMenu(index:number):GameStateSnapshot {
 return {...IN_GAME,location:"EVER GRANDE CITY PHOEBES ROOM",field_controls_locked:true,active_ui:{phase:"start_menu",selected:OPTIONS[index]??null,ready:true,controls:"UP/DOWN selects; A accepts; B or START closes",diagnostic:null,value:null,details:{callback2:"0x08085E5D",task_ids:[0,1,2,3,4],task_functions:["0x080AB1B1","0x0809D88D","0x0809E639","0x0809D909","0x0809FA35"],selected_index:index,options:OPTIONS}}};
}
function multichoice(id:number,index:number):GameStateSnapshot {
 const options=["YES","NO"];
 return {...IN_GAME,active_ui:{phase:"field_multichoice",selected:options[index]??null,ready:true,controls:"UP/DOWN selects; A accepts",diagnostic:null,details:{menu_id:id,selected_index:index,options}}};
}
const result=(s:GameStateSnapshot):AgentToolResult<unknown>=>({content:[{type:"text",text:"current observation"}],details:{state:s}});
const closed=(s:GameStateSnapshot):GameStateSnapshot=>({...s,active_ui:null});
// An in-memory game: UP/DOWN move the highlight, A closes the menu.
function game(start:GameStateSnapshot,move:(s:GameStateSnapshot,index:number)=>GameStateSnapshot){
 let s=start;const buttons:Button[]=[];
 const observe=()=>Promise.resolve(result(s));
 const press=(_id:string,b:Button,check:(before:GameStateSnapshot|undefined)=>void)=>{
  check(s);buttons.push(b);
  const v=menuOptionView(s);
  s=b==="A"||v===null?closed(s):move(s,v.index+(b==="DOWN"?1:-1));
  return Promise.resolve(result(s));
 };
 return {observe,press,buttons};
}
const text=(r:AgentToolResult<unknown>)=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]).join("\n");
// What the agent loop hands execute: the model's arguments after pi-ai's validation.
function validated(tool:AgentTool,args:Record<string,unknown>):Record<string,unknown> {
 const call:ToolCall={type:"toolCall",id:"c1",name:tool.name,arguments:args};
 return validateToolArguments(tool,call) as Record<string,unknown>;
}

describe("pi-ai validation turns the START menu's null id into 0",()=>{
 it("documents the coercion the tool must tolerate",()=>{
  const g=game(startMenu(1),(_s,i)=>startMenu(i));
  const tool=menuOptionTool({observe:g.observe,press:g.press});
  expect(validated(tool,{phase:"start_menu",menu_id:null,option:"BAG"})).toEqual({phase:"start_menu",menu_id:0,option:"BAG"});
 });
 it.each([[true,["DOWN","A"]],[false,[]]] as const)("switch %s: a validated null id on the recorded START menu presses %j",async(on,pressed)=>{
  const g=game(startMenu(1),(_s,i)=>startMenu(i));
  const tool=menuOptionTool({observe:g.observe,press:g.press,nullId:on});
  const r=await tool.execute("c1",validated(tool,{phase:"start_menu",menu_id:null,option:"BAG"}) as never);
  expect(g.buttons).toEqual(pressed);
  expect(text(r)).toContain(on?"confirmation sent for BAG":"the requested menu is not currently ready and verified");
 });
});

describe("id matching with the switch on",()=>{
 it.each([null,0])("an id-less menu accepts menu_id %s",async id=>{
  const g=game(startMenu(3),(_s,i)=>startMenu(i));
  await menuOptionTool({observe:g.observe,press:g.press,nullId:true}).execute("c1",{phase:"start_menu",menu_id:id,option:"POKEDEX"});
  expect(g.buttons).toEqual(["UP","UP","UP","A"]);
 });
 it("an id-less menu still refuses any other number",async()=>{
  const g=game(startMenu(1),(_s,i)=>startMenu(i));
  const r=await menuOptionTool({observe:g.observe,press:g.press,nullId:true}).execute("c1",{phase:"start_menu",menu_id:5,option:"BAG"});
  expect(g.buttons).toEqual([]);
  expect(text(r)).toContain("not currently ready and verified");
 });
 it.each([[86,["DOWN","A"]],[0,[]],[null,[]]] as const)("a real id 86 needs an exact match: menu_id %s presses %j",async(id,pressed)=>{
  const g=game(multichoice(86,0),(_s,i)=>multichoice(86,i));
  await menuOptionTool({observe:g.observe,press:g.press,nullId:true}).execute("c1",{phase:"field_multichoice",menu_id:id,option:"NO"});
  expect(g.buttons).toEqual(pressed);
 });
 it("a real id 0 still matches 0 exactly, and null coerced to 0 reaches it as before",async()=>{
  const g=game(multichoice(0,0),(_s,i)=>multichoice(0,i));
  const tool=menuOptionTool({observe:g.observe,press:g.press,nullId:true});
  await tool.execute("c1",validated(tool,{phase:"field_multichoice",menu_id:0,option:"NO"}) as never);
  expect(g.buttons).toEqual(["DOWN","A"]);
 });
});

describe("registry and factory",()=>{
 it("is a default-on agent-side correctness switch appended after game-clear-completion-v1",()=>{
  expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("game-clear-completion-v1")+1);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null,switchable:true});
  expect(featureInfo(ID).description).toContain(" Off: ");
  const recorded=playHarnessFeatures(ALL_ON,null);
  expect(recorded.indexOf(ID)).toBe(recorded.indexOf("game-clear-completion-v1")+1);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(SERVER_FEATURES).not.toContain(ID);
  const without=Object.fromEntries(Object.entries(ALL_ON).filter(([id])=>id!==ID)) as Omit<FeatureSet,typeof ID>;
  expect(normalizeFeatures(without)[ID]).toBe(true);
  expect(normalizeFeatures({...without,[ID]:false})[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
 });
 it("leaves the prompt and tool list unchanged",()=>{
  const on={...ALL_ON,[ID]:true},off={...ALL_ON,[ID]:false};
  expect(playSystemPrompt(on,null)).toBe(playSystemPrompt(off,null));
  expect(playTools(on)).toEqual(playTools(off));
  expect(playSystemPrompt(on,null)).toContain(MENU_OPTION_SECTION);
 });
 // The production game tools, with pi-ai validation in front of select_menu_option as the agent loop runs it.
 async function play(on:boolean):Promise<Button[]> {
  const g=game(startMenu(1),(_s,i)=>startMenu(i));
  const observe:AgentTool={name:"observe",label:"observe",description:"observe",parameters:Type.Object({}),execute:()=>g.observe()};
  const press={...observe,name:"press",executeChecked:(id:string,params:{buttons:Button[]},check:(before:GameStateSnapshot|undefined)=>void)=>g.press(id,params.buttons[0]??"A",check)} as unknown as AgentTool;
  const recorder={subscribe:()=>undefined,recordState:()=>({seq:1,turn:1}),recordDialogueAutoAdvance:()=>({seq:1,turn:1})} as unknown as Parameters<typeof playGameTools>[3];
  const features:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"menu-option-tool-v1":true,[ID]:on};
  const tool=playGameTools([observe,press],features,{read:()=>g.observe().then(r=>(r.details as {state:GameStateSnapshot}).state)},recorder).find(t=>t.name==="select_menu_option");
  if(tool===undefined)throw new Error("select_menu_option missing");
  await tool.execute("c1",validated(tool,{phase:"start_menu",menu_id:null,option:"BAG"}) as never);
  return g.buttons;
 }
 it("the production game tools honor the switch",async()=>{
  expect(await play(true)).toEqual(["DOWN","A"]);
  expect(await play(false)).toEqual([]);
 });
});
