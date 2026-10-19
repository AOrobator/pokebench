import {readFileSync} from "node:fs";
import type {AgentToolResult} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {ALL_ON,SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet,type SwitchableFeature} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {observeTool,pressTool} from "./game-tools.js";
import {navigationTool,withNavigation,type NavigationPorts} from "./navigation.js";
import {experimentArms,parseExperiment} from "./experiments.js";
import {flagFeatures,normalizeFeatures,presetFeatures,parsePlayPreset} from "./play-preset.js";

const ID="deterministic-warp-navigation-v1";
const MAP:[number,number]=[1,4];
const DEST:[number,number,number]=[0,9,2];
const tile=(x:number,y:number,behavior=0,elevation=3)=>({x,y,collision:0,behavior,elevation});
const warp=(x:number,y:number,destination:[number,number,number]=DEST,behavior=0x65,elevation=0)=>({
 kind:"warp" as const,x,y,elevation,activation:"movement",availability:"conditional" as const,facing:null,local_id:null,destination,name:"Warp",behavior,
});
const room=(extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>{
 const warps=[warp(1,2),warp(3,2)];
 return {screen:"overworld",started:true,name:"A",location:"LITTLEROOT TOWN PROFESSOR BIRCHS LAB",map_id:MAP,position:{x:1,y:1},facing:"down",in_battle:false,party:[],money:0,badges:[],play_time_s:0,field_controls_locked:false,
  navigation_grid:{elevation:3,tiles:[0,1,2].flatMap(y=>[0,1,2,3,4].map(x=>tile(x,y,warps.find(w=>w.x===x&&w.y===y)?.behavior??0))),objects:[],warps:warps.map(({x,y})=>({x,y}))},
  interaction_targets:warps.map(({kind,x,y,elevation,activation,availability,facing,local_id,destination,name})=>({kind,x,y,elevation,activation,availability,facing,local_id,destination,name})),...extra};
};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
const run=async(initial:GameStateSnapshot,on=true,goal={x:3,y:2,map_id:MAP},maxCommands?:number)=>{
 let current=initial;const buttons:string[][]=[];
 const ports:NavigationPorts={read:()=>Promise.resolve(current),press:(_id,params,_signal,check)=>{
  check?.(current);buttons.push([...params.buttons]);const button=params.buttons[0];const p=current.position;
  if(p===null)throw new Error("missing position");
  if(button==="DOWN"&&p.x===1&&p.y===2)current={...current,map_id:[0,9],position:{x:7,y:16}};
  else {const delta=button==="DOWN"?[0,1]:button==="UP"?[0,-1]:button==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:p.x+(delta[0]??0),y:p.y+(delta[1]??0)}};}
  return Promise.resolve(result(current));
 },observe:()=>Promise.resolve(result(current))};
 const tool=navigationTool({...ports,deterministicWarps:on,...(maxCommands===undefined?{}:{maxCommands})});
 const outcome=await tool.execute("nav",goal,new AbortController().signal);
 return {buttons,outcome,description:tool.description};
};

describe("deterministic-warp-navigation-v1",()=>{
 it("selects the cheapest exact equivalent lab exit and activates its SOUTH_ARROW_WARP",async()=>{
  const {buttons,outcome}=await run(room());
  expect(buttons).toEqual([["DOWN"],["DOWN"]]);
  expect(outcome.details).toMatchObject({state:{map_id:[0,9]},navigation:{status:"directional warp activated; inspect destination",commands:2,target:{x:3,y:2},selected_target:{x:1,y:2}}});
 });

 it("short-circuits from a directional warp already under the player and never retries a failed transition",async()=>{
  for(const [behavior,direction] of [[0x62,"RIGHT"],[0x63,"LEFT"],[0x64,"UP"],[0x65,"DOWN"],[0x1b,"UP"],[0x1c,"DOWN"],[0x6d,"DOWN"]] as const){
   const initial=room(),navigation=initial.navigation_grid;if(navigation===null||navigation===undefined)throw new Error("missing navigation grid");
   const state=room({position:{x:3,y:2},navigation_grid:{...navigation,tiles:navigation.tiles.map(t=>t.x===3&&t.y===2?{...t,behavior}:t)}});
   let current=state;const buttons:string[][]=[];
   const tool=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,params)=>{buttons.push([...params.buttons]);current={...current,map_id:[0,9]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
   const outcome=await tool.execute("nav",{x:3,y:2,map_id:MAP});
   expect(buttons,behavior.toString(16)).toEqual([[direction]]);expect(outcome.details).toMatchObject({navigation:{commands:1}});
  }
  const stuck=room({position:{x:3,y:2}});let presses=0;
  const outcome=await navigationTool({deterministicWarps:true,read:()=>Promise.resolve(stuck),press:()=>{presses++;return Promise.resolve(result(stuck));},observe:()=>Promise.resolve(result(stuck))}).execute("nav",{x:3,y:2,map_id:MAP});
  expect(presses).toBe(1);expect(outcome.details).toMatchObject({navigation:{status:"directional warp did not change map; inspect new state",commands:1}});
 });

 it("respects the command bound and rechecks warp identity before the only activation press",async()=>{
  const capped=await run(room(),true,{x:3,y:2,map_id:MAP},1);
  expect(capped.buttons).toEqual([["DOWN"]]);expect(capped.outcome.details).toMatchObject({state:{map_id:MAP,position:{x:1,y:2}},navigation:{status:"command limit",commands:1,selected_target:{x:1,y:2}}});
  const current=room({position:{x:3,y:2}});let submitted=0;
  const tool=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.({...current,position:{x:2,y:2}});submitted++;return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
  const outcome=await tool.execute("nav",{x:3,y:2,map_id:MAP});
  expect(submitted).toBe(0);expect(outcome.details).toMatchObject({navigation:{status:"map, position or field input unavailable or changed before action; no command submitted",commands:0}});
 });

 it("fails closed for distinct destinations, dynamic destinations, behavior or elevation mismatches, unknown classes and unreachable candidates",async()=>{
  const base=room();const targets=base.interaction_targets??[],grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing navigation grid");
  const activated:GameStateSnapshot[]=[
   {...base,interaction_targets:targets.map(t=>t.x===1?{...t,destination:[0,9,1] as [number,number,number]}:t)},
   {...base,navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.x===1&&t.y===2?{...t,behavior:0x64}:t)}},
   {...base,interaction_targets:targets.map(t=>t.x===1?{...t,elevation:3}:t)},
  ];
  for(const state of activated){const {buttons,outcome}=await run(state);expect(buttons).toEqual([["RIGHT"],["DOWN"],["RIGHT"],["DOWN"]]);expect(outcome.details).toMatchObject({navigation:{target:{x:3,y:2},selected_target:{x:3,y:2}}});}
  for(const state of [
   {...base,interaction_targets:targets.map(t=>({...t,destination:[127,127,127] as [number,number,number]}))},
   {...base,navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.y===2?{...t,behavior:0}:t)}},
   {...base,navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.y===2?{...t,behavior:0x60}:t)}},
  ]){const {buttons,outcome}=await run(state);expect(buttons).toEqual([["RIGHT"],["DOWN"],["RIGHT"]]);expect(outcome.details).toMatchObject({navigation:{target:{x:3,y:2},selected_target:{x:3,y:2}}});}
  const blockedNear=room({position:{x:3,y:0},navigation_grid:{...grid,tiles:grid.tiles.map(t=>(t.x===1&&t.y===1)||(t.x===0&&t.y===2)||(t.x===2&&t.y===2)?{...t,collision:1}:t)}});
  const routed=await run(blockedNear);expect(routed.buttons).toEqual([["DOWN"],["DOWN"],["DOWN"]]);expect(routed.outcome.details).toMatchObject({navigation:{selected_target:{x:3,y:2}}});
 });

 it("OFF reproduces the prior route, status, target receipt and description exactly",async()=>{
  const before=await run(room(),false);expect(before.buttons).toEqual([["RIGHT"],["DOWN"],["RIGHT"]]);expect(before.outcome.details).toMatchObject({navigation:{status:"arrived at requested coordinate",commands:3,target:{x:3,y:2}}});expect(before.outcome.details).not.toHaveProperty("navigation.selected_target");expect(before.description).not.toContain("equivalent warp");
 });

 it("is wired through the production factory",()=>{
  const fetchFn:typeof fetch=()=>Promise.reject(new Error("unused"));
  const base=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn)];
  const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,[ID]:true};
  const on=withNavigation(base,features as FeatureSet,{read:()=>Promise.reject(new Error("unused"))}).find(t=>t.name==="navigate_to");
  const off=withNavigation(base,{...features,[ID]:false},{read:()=>Promise.reject(new Error("unused"))}).find(t=>t.name==="navigate_to");
  expect(on?.description).toContain("equivalent warp");expect(off?.description).not.toContain("equivalent warp");
 });

 it("is appended, default OFF, bundle-only, and registered as a pending one-switch experiment",()=>{
  const id=ID as SwitchableFeature;
  expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
  expect(featureInfo(id)).toMatchObject({group:"guidance",needs:"bounded-navigation-v1",switchable:true,title:"DETERMINISTIC WARP NAVIGATION"});expect(featureInfo(id).description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[id]).toBe(false);
  const legacy=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  const without=Object.fromEntries(Object.entries(legacy).filter(([key])=>key!==ID)) as FeatureSet;
  expect(presetFeatures(parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[id]).toBe(false);
  const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[]};
  expect(bundle.base.features[ID]).toBe(false);expect(bundle.switches).toContain(ID);expect(bundle.onInBoth).not.toContain(ID);
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/deterministic-warp-navigation.json",import.meta.url),"utf8")) as {queuePosition?:number;changedFeature:string;incumbent:{features:Record<string,boolean>}};
  expect(raw.queuePosition).toBeUndefined();expect(raw.changedFeature).toBe(ID);const arms=experimentArms(parseExperiment(raw));expect(arms.incumbent.features[id]).toBe(false);expect(arms.candidate.features[id]).toBe(true);expect(SWITCHABLE_FEATURES.filter(feature=>arms.incumbent.features[feature]!==arms.candidate.features[feature])).toEqual([ID]);
 });
});
