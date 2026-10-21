import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {describe,expect,it} from "vitest";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,type FeatureSet,type SwitchableFeature} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {ALL_TOOL_SWITCHES,observeTool,pressTool,PRESS_TIMING,type CheckedPressTool} from "./game-tools.js";
import {navigationTool,withNavigation,type NavigationPorts} from "./navigation.js";
import {deriveStatus,experimentArms,parseExperiment} from "./experiments.js";
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
const fullRoom=(extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>{
 const state=room(),grid=state.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing navigation grid");
 const cells=new Map(grid.tiles.map(t=>[`${String(t.x)},${String(t.y)}`,t]));
 const rows=[0,1,2].map(y=>[0,1,2,3,4].map(x=>{const t=cells.get(`${String(x)},${String(y)}`);if(t===undefined)throw new Error("missing tile");return ((t.collision<<12)|(t.elevation<<8)|t.behavior).toString(16).padStart(4,"0");}).join(""));
 return {...state,navigation_grid:null,map_grid:{width:5,height:3,elevation:3,rows,objects:grid.objects,warps:grid.warps},topology:{width:5,height:3,connections:[]},...extra};
};
const warpField=(position:{x:number;y:number},exits:readonly {x:number;y:number;behavior?:number}[],width:number,height:number,ground:(x:number,y:number)=>number=()=>0):GameStateSnapshot=>{
 const events=exits.map(({x,y,behavior})=>warp(x,y,DEST,behavior));
 return room({position,navigation_grid:{elevation:3,tiles:Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>tile(x,y,events.find(w=>w.x===x&&w.y===y)?.behavior??ground(x,y)))).flat(),objects:[],warps:events.map(({x,y})=>({x,y}))},interaction_targets:events.map(({kind,x,y,elevation,activation,availability,facing,local_id,destination,name})=>({kind,x,y,elevation,activation,availability,facing,local_id,destination,name}))});
};
const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
const run=async(initial:GameStateSnapshot,on=true,goal={x:3,y:2,map_id:MAP},maxCommands?:number,extraPorts:Partial<NavigationPorts>={})=>{
 let current=initial;const buttons:string[][]=[];
 const ports:NavigationPorts={read:()=>Promise.resolve(current),press:(_id,params,_signal,check)=>{
  check?.(current);buttons.push([...params.buttons]);const button=params.buttons[0];const p=current.position;
  if(p===null)throw new Error("missing position");
  if(button==="DOWN"&&p.x===1&&p.y===2)current={...current,map_id:[0,9],position:{x:7,y:16}};
  else {const delta=button==="DOWN"?[0,1]:button==="UP"?[0,-1]:button==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:p.x+(delta[0]??0),y:p.y+(delta[1]??0)}};}
  return Promise.resolve(result(current));
 },observe:()=>Promise.resolve(result(current))};
 const tool=navigationTool({...ports,...extraPorts,deterministicWarps:on,...(maxCommands===undefined?{}:{maxCommands})});
 const outcome=await tool.execute("nav",goal,new AbortController().signal);
 return {buttons,outcome,description:tool.description};
};

describe("deterministic-warp-navigation-v1",()=>{
 it("does not add the checked semantic activation receipt to ordinary navigate_to",async()=>{
  const {outcome}=await run(room());
  expect(outcome.details).toMatchObject({navigation:{selected_target:{x:1,y:2}}});
  expect((outcome.details as {navigation:Record<string,unknown>}).navigation).not.toHaveProperty("activation_attempted");
 });
 it("selects the cheapest exact equivalent lab exit and activates its SOUTH_ARROW_WARP",async()=>{
  const {buttons,outcome}=await run(room());
  expect(buttons).toEqual([["DOWN"],["DOWN"]]);
  expect(outcome.details).toMatchObject({state:{map_id:[0,9]},navigation:{status:"directional warp activated; inspect destination",commands:2,target:{x:3,y:2},selected_target:{x:1,y:2}}});
 });

 it("short-circuits from a directional warp already under the player and never retries a failed transition",async()=>{
  for(const [behavior,direction] of [[0x62,"RIGHT"],[0x63,"LEFT"],[0x64,"UP"],[0x65,"DOWN"],[0x1b,"UP"],[0x1c,"DOWN"],[0x6d,"DOWN"]] as const){
   const initial=room(),navigation=initial.navigation_grid;if(navigation===null||navigation===undefined)throw new Error("missing navigation grid");
   const state=room({position:{x:3,y:2},navigation_grid:{...navigation,tiles:navigation.tiles.map(t=>t.x===3&&t.y===2?{...t,behavior}:t)}});
   let current=state;const buttons:string[][]=[];const running:(boolean|undefined)[]=[];
   const tool=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,params,_signal,_check,options)=>{buttons.push([...params.buttons]);running.push(options?.automaticRunning);current={...current,map_id:[0,9]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
   const outcome=await tool.execute("nav",{x:3,y:2,map_id:MAP});
   expect(buttons,behavior.toString(16)).toEqual([[direction]]);expect(running,behavior.toString(16)).toEqual([false]);expect(outcome.details).toMatchObject({navigation:{commands:1}});
  }
  const stuck=room({position:{x:3,y:2}});let presses=0;
  const outcome=await navigationTool({deterministicWarps:true,read:()=>Promise.resolve(stuck),press:()=>{presses++;return Promise.resolve(result(stuck));},observe:()=>Promise.resolve(result(stuck))}).execute("nav",{x:3,y:2,map_id:MAP});
 expect(presses).toBe(1);expect(outcome.details).toMatchObject({navigation:{status:"directional warp did not change map; inspect new state",commands:1}});
 });

 it("classifies the final observation instead of treating an unknown or stale press result as success",async()=>{
  const start=room({position:{x:3,y:2}});
  let current:GameStateSnapshot={...start,map_id:null};
  const unknown=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(start),press:()=>Promise.resolve(result(current)),observe:()=>Promise.resolve(result(current))});
  expect((await unknown.execute("nav",{x:3,y:2,map_id:MAP})).details).toMatchObject({navigation:{status:"directional warp transition unverified; inspect new state",commands:1}});

  current={...start,map_id:[0,9]};let observes=0;
  const settled=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(start),press:()=>Promise.resolve(result(start)),observe:()=>{observes++;return Promise.resolve(result(current));}});
  expect((await settled.execute("nav",{x:3,y:2,map_id:MAP})).details).toMatchObject({state:{map_id:[0,9]},navigation:{status:"directional warp activated; inspect destination",commands:1}});
  expect(observes).toBe(1);
 });

 it("respects the command bound and rechecks warp identity before the only activation press",async()=>{
  const capped=await run(room(),true,{x:3,y:2,map_id:MAP},1);
  expect(capped.buttons).toEqual([["DOWN"]]);expect(capped.outcome.details).toMatchObject({state:{map_id:MAP,position:{x:1,y:2}},navigation:{status:"command limit",commands:1,selected_target:{x:1,y:2}}});
  const current=room({position:{x:3,y:2}});let submitted=0;
  const tool=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.({...current,position:{x:2,y:2}});submitted++;return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current))});
  const outcome=await tool.execute("nav",{x:3,y:2,map_id:MAP});
 expect(submitted).toBe(0);expect(outcome.details).toMatchObject({navigation:{status:"map, position or field input unavailable or changed before action; no command submitted",commands:0}});

  const navigation=current.navigation_grid;if(navigation===null||navigation===undefined)throw new Error("missing navigation grid");
  const drifts:[string,GameStateSnapshot][]=[
   ["destination",{...current,interaction_targets:(current.interaction_targets??[]).map(t=>t.x===3&&t.y===2?{...t,destination:[0,8,2] as [number,number,number]}:t)}],
   ["behavior",{...current,navigation_grid:{...navigation,tiles:navigation.tiles.map(t=>t.x===3&&t.y===2?{...t,behavior:0x1c}:t)}}],
   ["elevation",{...current,interaction_targets:(current.interaction_targets??[]).map(t=>t.x===3&&t.y===2?{...t,elevation:3}:t)}],
  ];
  for(const [name,changed] of drifts){
   let identitySubmissions=0;
   const identity=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(current),press:(_id,_params,_signal,check)=>{check?.(changed);identitySubmissions++;return Promise.resolve(result(changed));},observe:()=>Promise.resolve(result(current))});
   const changedOutcome=await identity.execute("nav",{x:3,y:2,map_id:MAP});
   expect(identitySubmissions,name).toBe(0);expect(changedOutcome.details).toMatchObject({navigation:{status:"warp identity or activation changed before action; no command submitted",commands:0}});
  }

  const elevated=room({position:{x:3,y:2},interaction_targets:(current.interaction_targets??[]).map(target=>({...target,elevation:3}))});
  const elevatedNavigation=elevated.navigation_grid;if(elevatedNavigation===null||elevatedNavigation===undefined)throw new Error("missing elevated navigation grid");
  const wrongLiveElevation={...elevated,navigation_grid:{...elevatedNavigation,elevation:2}};let elevationSubmissions=0;
  const liveElevation=navigationTool({deterministicWarps:true,read:()=>Promise.resolve(elevated),press:(_id,_params,_signal,check)=>{check?.(wrongLiveElevation);elevationSubmissions++;return Promise.resolve(result(wrongLiveElevation));},observe:()=>Promise.resolve(result(elevated))});
  const elevationOutcome=await liveElevation.execute("nav",{x:3,y:2,map_id:MAP});
  expect(elevationSubmissions).toBe(0);expect(elevationOutcome.details).toMatchObject({navigation:{status:"warp identity or activation changed before action; no command submitted",commands:0}});
 });

 it("rejects ambiguous coordinates, incompatible elevations, step-on warps and missing geometry",async()=>{
  const base=room(),targets=base.interaction_targets??[],grid=base.navigation_grid;if(grid===null||grid===undefined)throw new Error("missing navigation grid");
  const near=targets[0],requestedTarget=targets[1];if(near===undefined||requestedTarget===undefined)throw new Error("missing warp targets");
  const duplicateNear={...near,x:1,y:2,destination:[0,8,1] as [number,number,number]};
  for(const reordered of [[...targets,duplicateNear],[duplicateNear,...targets]]){
   const {buttons,outcome}=await run({...base,interaction_targets:reordered});
   expect(buttons).toEqual([["RIGHT"],["DOWN"],["RIGHT"],["DOWN"]]);expect(outcome.details).toMatchObject({navigation:{selected_target:{x:3,y:2}}});
  }
  const duplicateRequested={...requestedTarget,x:3,y:2,destination:null};
  for(const reordered of [[...targets,duplicateRequested],[duplicateRequested,...targets]]){
   const {buttons,outcome}=await run({...base,interaction_targets:reordered});
   expect(buttons).toEqual([["RIGHT"],["DOWN"],["RIGHT"]]);expect(outcome.details).toMatchObject({navigation:{status:"arrived at requested coordinate",selected_target:{x:3,y:2}}});
  }
  const elevated={...base,interaction_targets:targets.map(t=>({...t,elevation:2}))};
  expect((await run(elevated)).buttons).toEqual([["RIGHT"],["DOWN"],["RIGHT"]]);
  const stepOn={...base,navigation_grid:{...grid,tiles:grid.tiles.map(t=>t.y===2?{...t,behavior:0x6e}:t)}};
  expect((await run(stepOn)).buttons).toEqual([["RIGHT"],["DOWN"],["RIGHT"]]);
  const missing=await run({...base,navigation_grid:null});expect(missing.buttons).toEqual([]);expect(missing.outcome.details).toMatchObject({navigation:{commands:0}});
 });

 it("uses weighted route cost and resolves equal costs by y then x independent of event order",async()=>{
  const whole=await run(fullRoom(),true,{x:3,y:2,map_id:MAP},undefined,{fullMap:true});
  expect(whole.buttons).toEqual([["DOWN"],["DOWN"]]);expect(whole.outcome.details).toMatchObject({navigation:{selected_target:{x:1,y:2}}});

  const weighted=warpField({x:1,y:1},[{x:5,y:1},{x:1,y:6}],8,8,(x,y)=>y===1&&x>=2&&x<=4?2:0);
  const cheaper=await run(weighted,true,{x:5,y:1,map_id:MAP},1,{grassCost:true});
  expect(cheaper.buttons).toEqual([["DOWN"]]);expect(cheaper.outcome.details).toMatchObject({navigation:{selected_target:{x:1,y:6}}});

  const ledge=warpField({x:2,y:2},[{x:5,y:2},{x:2,y:4}],8,7,(x,y)=>x===3&&y===2?0x38:0);
  const cheaperWalk=await run(ledge,true,{x:5,y:2,map_id:MAP},1,{ledges:true});
  expect(cheaperWalk.buttons).toEqual([["DOWN"]]);expect(cheaperWalk.outcome.details).toMatchObject({navigation:{selected_target:{x:2,y:4}}});

  const xTied=warpField({x:2,y:1},[{x:3,y:2},{x:1,y:2}],5,3);
  const byX=await run(xTied,true,{x:3,y:2,map_id:MAP},1);
  expect(byX.outcome.details).toMatchObject({navigation:{selected_target:{x:1,y:2}}});

  const yTied=warpField({x:2,y:2},[{x:1,y:3},{x:3,y:1}],5,5);
  const byY=await run(yTied,true,{x:1,y:3,map_id:MAP},1);
  expect(byY.outcome.details).toMatchObject({navigation:{selected_target:{x:3,y:1}}});
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

 it("is wired through the production factory and executes the shortcut",async()=>{
  const fetchFn:typeof fetch=()=>Promise.reject(new Error("unused"));
  const base=[observeTool("http://127.0.0.1",fetchFn),pressTool("http://127.0.0.1",{beforePress:()=>undefined,afterPress:()=>Promise.resolve()},fetchFn)];
  const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,[ID]:true};
  const on=withNavigation(base,features as FeatureSet,{read:()=>Promise.reject(new Error("unused"))}).find(t=>t.name==="navigate_to");
  const off=withNavigation(base,{...features,[ID]:false},{read:()=>Promise.reject(new Error("unused"))}).find(t=>t.name==="navigate_to");
  expect(on?.description).toContain("equivalent warp");expect(off?.description).not.toContain("equivalent warp");

  const start=room({position:{x:3,y:2}});let current=start;const buttons:string[][]=[];const running:(boolean|undefined)[]=[];
  const ordinaryPress={name:"press",execute:()=>Promise.reject(new Error("unchecked press")),executeChecked:(_id:string,params:{buttons:string[]},check:(state:GameStateSnapshot)=>void,_signal?:AbortSignal,_update?:unknown,options?:{automaticRunning?:boolean})=>{
   check(current);buttons.push([...params.buttons]);running.push(options?.automaticRunning);current={...current,map_id:[0,9]};return Promise.resolve(result(current));
  }} as unknown as CheckedPressTool;
  const ordinaryObserve={name:"observe",execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
  const produced=withNavigation([ordinaryPress,ordinaryObserve],features as FeatureSet,{read:()=>Promise.resolve(current)}).find(t=>t.name==="navigate_to");
  if(produced===undefined)throw new Error("missing navigate_to");
  const outcome=await produced.execute("nav",{x:3,y:2,map_id:MAP},new AbortController().signal);
  expect(buttons).toEqual([["DOWN"]]);expect(running).toEqual([false]);expect(outcome.details).toMatchObject({state:{map_id:[0,9]},navigation:{status:"directional warp activated; inspect destination",commands:1}});

  const rememberedWarps=[warp(1,2),warp(17,2)];
  const targets=rememberedWarps.map(({kind,x,y,elevation,activation,availability,facing,local_id,destination,name})=>({kind,x,y,elevation,activation,availability,facing,local_id,destination,name}));
  const remembered=room({position:{x:1,y:2},navigation_grid:{elevation:3,tiles:[tile(1,2,0x65),tile(17,2,0x65)],objects:[],warps:rememberedWarps.map(({x,y})=>({x,y}))},interaction_targets:targets});
  let live=room({position:{x:1,y:2},navigation_grid:{elevation:3,tiles:[tile(1,2,0x65)],objects:[],warps:[{x:1,y:2}]},interaction_targets:targets});
  const visitedButtons:string[][]=[];
  const checkedPress={name:"press",execute:()=>Promise.reject(new Error("unchecked press")),executeChecked:(_id:string,params:{buttons:string[]},check:(state:GameStateSnapshot)=>void)=>{
   check(live);visitedButtons.push([...params.buttons]);live={...live,map_id:[0,9]};return Promise.resolve(result(live));
  }} as unknown as CheckedPressTool;
  const observe={name:"observe",execute:()=>Promise.resolve(result(live))} as unknown as AgentTool;
  const visitedFeatures={...features,"visited-terrain-navigation-v1":true};
  const visited=withNavigation([checkedPress,observe],visitedFeatures as FeatureSet,{read:()=>Promise.resolve(remembered)}).find(t=>t.name==="navigate_to");
  if(visited===undefined)throw new Error("missing visited navigate_to");
  const visitedOutcome=await visited.execute("nav",{x:17,y:2,map_id:MAP},new AbortController().signal);
  expect(visitedButtons).toEqual([["DOWN"]]);expect(visitedOutcome.details).toMatchObject({state:{map_id:[0,9]},navigation:{status:"directional warp activated; inspect destination",commands:1,selected_target:{x:1,y:2}}});

  const nativeRunning={permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:0x08085E05,callback2:0x08085E5D,diagnostic:null,raw_hex:null};
  let automaticCurrent=room({position:{x:3,y:2},running:nativeRunning});const posted:{url:string;body:unknown}[]=[];const modifiers:unknown[]=[];
  const png=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
  const automaticFetch:typeof fetch=(input,init)=>{const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;let body:unknown=automaticCurrent;
   if(url.endsWith("/action")||url.endsWith("/pokebench/travel")){if(typeof init?.body!=="string")throw new Error("action body must be JSON");posted.push({url,body:JSON.parse(init.body) as unknown});automaticCurrent={...automaticCurrent,map_id:[0,9]};body={status:"success"};}
   else if(url.endsWith("/queue_status"))body={queue_empty:true};
   else if(url.endsWith("/pokebench/observation"))body={state:automaticCurrent,state_text:"warped",screenshot_base64:png.toString("base64")};
   return Promise.resolve(new Response(JSON.stringify(body)));};
  const realPress=pressTool("http://127.0.0.1",{beforePress:(_id,_buttons,_timing,_before,actual)=>{modifiers.push(actual);},afterPress:()=>Promise.resolve()},automaticFetch,{now:()=>0,sleep:()=>Promise.resolve()},{...ALL_TOOL_SWITCHES,automaticRunning:true});
  const combined=withNavigation([realPress,observeTool("http://127.0.0.1",automaticFetch)],{...features,"automatic-running-v1":true},{read:()=>Promise.resolve(automaticCurrent)}).find(t=>t.name==="navigate_to");
  if(combined===undefined)throw new Error("missing combined navigate_to");
  await combined.execute("nav",{x:3,y:2,map_id:MAP},new AbortController().signal);
  expect(posted).toEqual([{url:"http://127.0.0.1/action",body:{buttons:["DOWN"],...PRESS_TIMING}}]);expect(modifiers).toEqual([{automatic_running:false}]);
 });

 it("is appended, default OFF, bundle-only, and registered as a pending one-switch experiment",()=>{
  const id=ID as SwitchableFeature;
  expect(SWITCHABLE_FEATURES.at(-73)).toBe(ID);expect(playHarnessFeatures(ALL_ON,null).at(-8)).toBe(ID);
  expect(featureInfo(id)).toMatchObject({group:"guidance",needs:"bounded-navigation-v1",switchable:true,title:"DETERMINISTIC WARP NAVIGATION"});expect(featureInfo(id).description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[id]).toBe(false);
  const legacy=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
  const without=Object.fromEntries(Object.entries(legacy).filter(([key])=>key!==ID)) as FeatureSet;
  expect(presetFeatures(parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1,maxWallMs:1,failureLimit:1},sampling:{thinkingLevel:"medium",maxTokens:1},features:without}))[id]).toBe(false);
  const bundle=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[]};
  expect(bundle.base.features[ID]).toBe(false);expect(bundle.switches).toContain(ID);expect(bundle.onInBoth).not.toContain(ID);
  const raw=JSON.parse(readFileSync(new URL("../../../experiments/deterministic-warp-navigation.json",import.meta.url),"utf8")) as {queuePosition?:number;changedFeature:string;incumbent:{features:Record<string,boolean>}};
  expect(raw.queuePosition).toBeUndefined();expect(raw.changedFeature).toBe(ID);const experiment=parseExperiment(raw),arms=experimentArms(experiment);expect(arms.incumbent.features[id]).toBe(false);expect(arms.candidate.features[id]).toBe(true);expect(SWITCHABLE_FEATURES.filter(feature=>arms.incumbent.features[feature]!==arms.candidate.features[feature])).toEqual([ID]);
  const ready={ready:true,basis:"comparable",milestone:"CLOCK_SET",window:4,minReached:3,reached:4,considered:["r1","r2","r3","r4"]} as const;
  const status=deriveStatus({experiment,approval:null,ledger:[],runner:null,readiness:ready});expect(status.state).toBe("blocked");expect(status.reason).toContain("bundle arm");
  const explainer=readFileSync(new URL("../../../docs/explainers/deterministic-warp-navigation-v1.html",import.meta.url),"utf8");expect(explainer).toContain("weighted terrain/ledge cost");expect(explainer).not.toContain("Route length wins");
 });
});
