import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
// trainer-sight-check-v1: navigate_to checks its first planned route against unbeaten trainers' sight before it walks.
// b300 (2026-10-20T13-54-28_qwen36-gpu0_b300) turn 501, seq 15231: navigate_to to (5,2) on map 11/3 from (5,15). The
// game server's reply is env/pokebench_env/trainer_sight.py on that run's raw RAM (archive 6600, seq 15233).
import {readFileSync} from "node:fs";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Value} from "typebox/value";
import {describe,expect,it} from "vitest";
import {featuresOf,featureInfo,SWITCHABLE_FEATURES,playHarnessFeatures,type FeatureSet} from "./features.js";
import {parseGameState,StateWatcher,type GameStateSnapshot} from "./game-state.js";
import {navigationTool,planNavigation,routeTiles,withNavigation,type NavigationPorts} from "./navigation.js";
import {playGameTools} from "./play-wiring.js";
import {playSystemPrompt} from "./play-config.js";
import {normalizeFeatures} from "./play-preset.js";
import {checkEvent} from "./events.js";
import {parseTrainerSight,SIGHT_TOOL_SENTENCE,type TrainerSightCheck,type TrainerSightReply} from "./trainer-sight.js";

const ID="trainer-sight-check-v1";
type Fixture={harness_features:string[];states:{seq:number;state:unknown}[];replies:Record<"turn501"|"tommy_beaten_from_1_9",{route:[number,number][];reply:unknown}>};
const B300=JSON.parse(readFileSync(new URL("../test-support/trainer-sight-b300.json",import.meta.url),"utf8")) as Fixture;
const ENV=JSON.parse(readFileSync(new URL("../../../env/tests/env/fixtures/trainer-sight-b300.json",import.meta.url),"utf8")) as {frames:{route:[number,number][];report:unknown}[]};
const START=parseGameState(B300.states.find(s=>s.seq===15233)?.state);
const TURN501=parseTrainerSight(B300.replies.turn501.reply);
const FROM_1_9=parseTrainerSight(B300.replies.tommy_beaten_from_1_9.reply);
const FEATURES:FeatureSet={...featuresOf(B300.harness_features),[ID]:true};
const GOAL={x:5,y:2,map_id:[11,3] as [number,number]};
// The walking cases press one tile at a time (no stride receipts from the stand-in press).
const WALK:FeatureSet={...FEATURES,"safe-navigation-strides-v1":false};

export const TURN501_TEXT=[
 "Trainer sight: the route navigate_to planned from (5,15) to (5,2) (23 steps) passes tiles trainers you have not beaten can see. A trainer who sees you walks up to you and starts a battle. In a trainer battle the game says \"No! There's no running from a TRAINER battle!\"",
 "- object 3, sprite YOUNGSTER at (3,9) (loaded, its tile now), facing LEFT, sight 3 tiles: it can see (1,9), step 12 of 23 on the route.",
 "- object 5, sprite HIKER at (1,6) (not loaded; where the map places it, it may have moved), facing DOWN, sight 3 tiles: it can see (1,9), step 12 of 23 on the route.",
 "Your party: TORCHIC 11/35 HP.",
 "To walk this route anyway, call navigate_to again with the same x, y and map_id and confirm_trainer_sight: true.",
].join("\n");
export const FROM_1_9_TEXT=[
 "Trainer sight: the route navigate_to planned from (1,9) to (5,2) (11 steps) passes tiles a trainer you have not beaten can see. A trainer who sees you walks up to you and starts a battle. In a trainer battle the game says \"No! There's no running from a TRAINER battle!\"",
 "- object 5, sprite HIKER at (1,6) (not loaded; where the map places it, it may have moved), facing DOWN, sight 3 tiles: it can see (1,8), step 1 of 11 on the route.",
 "Your party: TORCHIC 11/35 HP.",
 "To walk this route anyway, call navigate_to again with the same x, y and map_id and confirm_trainer_sight: true.",
].join("\n");

const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"readout"}],details:{state}});
const texts=(r:AgentToolResult<unknown>):string[]=>r.content.flatMap(p=>p.type==="text"?[p.text]:[]);

// The production tools for b300's switches: ordinary press and observe stand-ins whose press moves along the route.
function b300Tools(reply:TrainerSightReply|Error,state:GameStateSnapshot=START,features:FeatureSet=FEATURES){
 let current=state;const pressed:string[][]=[],asked:{x:number;y:number}[][]=[],records:TrainerSightCheck[]=[];
 const step=(button:string):void=>{const p=current.position;if(p===null)return;const [dx,dy]:[number,number]=button==="UP"?[0,-1]:button==="DOWN"?[0,1]:button==="LEFT"?[-1,0]:[1,0];current={...current,position:{x:p.x+dx,y:p.y+dy}};};
 const press={name:"press",label:"press",description:"press",parameters:{} as never,execute:()=>Promise.reject(new Error("unchecked press")),
  executeChecked:(_id:string,params:{buttons:string[]},check:(s:GameStateSnapshot)=>void,_signal?:AbortSignal,_update?:unknown,options?:{stride?:{path:readonly unknown[]}})=>{
   check(current);pressed.push([...params.buttons]);
   for(let i=0;i<(options?.stride?.path.length??1);i++)step(params.buttons[0]??"");
   const stride=options?.stride===undefined?{}:{stride:{id:"s",reason:"completed",tiles:options.stride.path.length}};
   return Promise.resolve({content:[{type:"text" as const,text:"pressed"}],details:{state:current,...stride}});
  }} as unknown as AgentTool;
 const observe={name:"observe",label:"observe",description:"observe",parameters:{} as never,execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
 const sight:NavigationPorts["trainerSight"]={check:(_map,tiles)=>{asked.push(tiles.map(t=>({x:t.x,y:t.y})));return reply instanceof Error?Promise.reject(reply):Promise.resolve(reply);},record:check=>{records.push(check);}};
 const tools=withNavigation([press,observe],features,{read:()=>Promise.resolve(current)},undefined,sight);
 const navigate=tools.find(t=>t.name==="navigate_to");if(navigate===undefined)throw new Error("no navigate_to");
 return {navigate,pressed,asked,records,now:()=>current};
}

describe("b300 turn 501",()=>{
 it("plans the route the run walked, the one the game server checked",()=>{
  const options={mode:"full" as const,ledges:true,oneWay:true,grassCost:true,floor:true,elevation:"game" as const};
  const path=planNavigation(START,GOAL,options);
  expect(path).not.toBeNull();
  const tiles=routeTiles(START,path??[],options)?.map(t=>[t.x,t.y]);
  expect(tiles).toEqual(B300.replies.turn501.route);
  expect(tiles).toEqual(ENV.frames[0]?.route);
  expect(TURN501).toEqual(ENV.frames[0]?.report);
  expect(planNavigation({...START,position:{x:1,y:9}},GOAL,options)?.length).toBe(11);
  expect(routeTiles({...START,position:{x:1,y:9}},planNavigation({...START,position:{x:1,y:9}},GOAL,options)??[],options)?.map(t=>[t.x,t.y])).toEqual(B300.replies.tommy_beaten_from_1_9.route);
 });

 it("does not walk and names TOMMY's and MARC's sight of (1,9), the game's no-running line and the party",async()=>{
  const tools=b300Tools(TURN501);
  const out=await tools.navigate.execute("nav-501",GOAL);
  expect(tools.pressed).toEqual([]);
  expect(tools.asked).toEqual([B300.replies.turn501.route.map(([x,y])=>({x,y}))]);
  expect(texts(out).slice(0,3)).toEqual(["Navigation: not walked: a trainer you have not beaten can see the planned route; 0 bounded movement actions.",TURN501_TEXT,"readout"]);
  expect(out.details).toMatchObject({navigation:{status:"not walked: a trainer you have not beaten can see the planned route",commands:0}});
  expect(tools.records).toHaveLength(1);
  expect(tools.records[0]).toMatchObject({tool_call_id:"nav-501",map_id:[11,3],origin:{x:5,y:15},goal:{x:5,y:2},route_tiles:23,confirmed:false,outcome:"refused",reason:null,text:TURN501_TEXT});
  expect(tools.records[0]?.sightings.map(s=>[s.local_id,s.sprite_kind,s.trainer_id,s.step,s.tile.x,s.tile.y,s.from.x,s.from.y,s.seen_facing])).toEqual([[3,"YOUNGSTER",321,12,1,9,3,9,"LEFT"],[5,"HIKER",571,12,1,9,1,6,"DOWN"]]);
 });

 it("with TOMMY beaten, from (1,9) names MARC's sight of (1,8)",async()=>{
  const tools=b300Tools(FROM_1_9,{...START,position:{x:1,y:9}});
  const out=await tools.navigate.execute("nav-1-9",GOAL);
  expect(tools.pressed).toEqual([]);
  expect(texts(out)[1]).toBe(FROM_1_9_TEXT);
 });

 it("walks the route with confirm_trainer_sight: true and records the confirmed check",async()=>{
  const tools=b300Tools(TURN501,START,WALK);
  const out=await tools.navigate.execute("nav-501",{...GOAL,confirm_trainer_sight:true});
  expect(tools.pressed.length).toBeGreaterThan(0);
  expect(tools.pressed[0]).toEqual(["DOWN"]);
  expect(texts(out).some(t=>t.startsWith("Trainer sight:"))).toBe(false);
  expect(tools.records).toHaveLength(1);
  expect(tools.records[0]).toMatchObject({confirmed:true,outcome:"confirmed",text:null});
  expect(tools.records[0]?.sightings).toHaveLength(2);
 });
});

describe("checks that let the walk run",()=>{
 const clear:TrainerSightReply={...TURN501,sightings:[]} as TrainerSightReply;
 it("walks a clear route and records it clear",async()=>{
  const tools=b300Tools(clear,START,WALK);
  await tools.navigate.execute("n",GOAL);
  expect(tools.pressed.length).toBeGreaterThan(0);
  expect(tools.records.map(r=>[r.outcome,r.sightings.length,r.text])).toEqual([["clear",0,null]]);
 });
 it("walks when the server cannot check, the reply is for another map or the request fails",async()=>{
  for(const [reply,reason] of [[{available:false,reason:"map grid unreadable"},"map grid unreadable"],[{...TURN501,map_id:[0,3]},"the check read map 0/3"],[new Error("Trainer sight returned HTTP 500"),"Trainer sight returned HTTP 500"],[new Error(""),"the trainer sight request failed with no message"]] as const){
   const tools=b300Tools(reply as TrainerSightReply|Error,START,WALK);
   await tools.navigate.execute("n",GOAL);
   expect(tools.pressed.length).toBeGreaterThan(0);
   expect(tools.records.map(r=>[r.outcome,r.reason])).toEqual([["unavailable",reason]]);
  }
 });
 it("leaves out a double-battle trainer while only one party Pokémon can battle (CheckTrainer)",async()=>{
  const doubles=parseTrainerSight({...TURN501,trainers:(TURN501 as {trainers:object[]}).trainers.map(t=>({...t,double:true}))});
  const tools=b300Tools(doubles,START,WALK);
  await tools.navigate.execute("n",GOAL);
  expect(tools.records[0]?.outcome).toBe("clear");
  const two=b300Tools(doubles,{...START,party:[...START.party,...START.party]},WALK);
  await two.navigate.execute("n",GOAL);
  expect(two.records[0]?.outcome).toBe("refused");
 });
 it("checks the model's own call only, once: a checked (semantic) walk is not checked",async()=>{
  let current=START;const asked:unknown[]=[];
  const tool=navigationTool({read:()=>Promise.resolve(current),press:(_id,params,_s,check)=>{check?.(current);current={...current,map_id:[0,0]};return Promise.resolve(result(current));},observe:()=>Promise.resolve(result(current)),fullMap:true,trainerSight:{check:()=>{asked.push(1);return Promise.resolve(TURN501);},record:()=>{}}});
  await tool.executeChecked("n",GOAL,()=>null);
  expect(asked).toEqual([]);
 });
 it("an aborted walk stops instead of recording an unavailable check",async()=>{
  const abort=new AbortController();
  const tool=navigationTool({read:()=>Promise.resolve(START),press:()=>Promise.reject(new Error("no press")),observe:()=>Promise.resolve(result(START)),fullMap:true,trainerSight:{check:()=>{abort.abort();return Promise.reject(new Error("aborted"));},record:()=>{throw new Error("recorded");}}});
  await expect(tool.execute("n",GOAL,abort.signal)).rejects.toThrow();
 });
 it("no check without a position, map or route",async()=>{
  const asked:unknown[]=[];
  const sight={check:()=>{asked.push(1);return Promise.resolve(TURN501);},record:()=>{}};
  const odd=navigationTool({read:()=>Promise.resolve({...START,map_grid:null,navigation_grid:null}),press:()=>Promise.reject(new Error("no")),observe:()=>Promise.resolve(result(START)),trainerSight:sight});
  await odd.execute("n",GOAL);
  expect(asked).toEqual([]);
 });
});

describe("switch OFF and wiring",()=>{
 const ports=(sight?:NavigationPorts["trainerSight"]):NavigationPorts=>({read:()=>Promise.resolve(START),press:()=>Promise.reject(new Error("no")),observe:()=>Promise.resolve(result(START)),fullMap:true,automaticRunning:true,trainerSight:sight});
 it("adds the description sentence and the confirm argument only with the check",()=>{
  const off=navigationTool(ports()),on=navigationTool(ports({check:()=>Promise.resolve(TURN501),record:()=>{}}));
  expect(on.description).toBe(`${off.description} ${SIGHT_TOOL_SENTENCE}`);
  expect(Object.keys(off.parameters.properties)).toEqual(["x","y","map_id"]);
  expect(Object.keys(on.parameters.properties)).toEqual(["x","y","map_id","confirm_trainer_sight"]);
  expect(Value.Check(off.parameters,{...GOAL,confirm_trainer_sight:true})).toBe(false);
  expect(Value.Check(on.parameters,{...GOAL,confirm_trainer_sight:true})).toBe(true);
  const walking=navigationTool({...ports({check:()=>Promise.resolve(TURN501),record:()=>{}}),automaticRunning:false});
  expect(Object.keys(walking.parameters.properties)).toEqual(["x","y","map_id","walking","confirm_trainer_sight"]);
 });
 it("withNavigation passes the check only with the switch, and refuses the switch without one",()=>{
  const press={name:"press",executeChecked:()=>Promise.reject(new Error("no")),execute:()=>Promise.reject(new Error("no"))} as unknown as AgentTool;
  const observe={name:"observe",execute:()=>Promise.reject(new Error("no"))} as unknown as AgentTool;
  const sight={check:()=>Promise.resolve(TURN501),record:()=>{}};
  const on=withNavigation([press,observe],FEATURES,{read:()=>Promise.resolve(START)},undefined,sight).find(t=>t.name==="navigate_to");
  const off=withNavigation([press,observe],{...FEATURES,[ID]:false},{read:()=>Promise.resolve(START)},undefined,sight).find(t=>t.name==="navigate_to");
  expect(on?.description).toContain(SIGHT_TOOL_SENTENCE);
  expect(off?.description).not.toContain(SIGHT_TOOL_SENTENCE);
  expect(()=>withNavigation([press,observe],FEATURES,{read:()=>Promise.resolve(START)})).toThrow("trainer-sight-check-v1 needs");
 });
 it("playGameTools asks the game server through the state source and records through the recorder",async()=>{
  const features:FeatureSet={...FEATURES,"dialogue-auto-advance-v1":false,"battle-text-auto-advance-v1":false,"cited-destination-v1":false,"harness-trust-v1":false,"semantic-navigation-v2":false,"safe-navigation-strides-v1":false};
  const asked:unknown[]=[],records:TrainerSightCheck[]=[];
  const press={name:"press",label:"press",description:"press",parameters:{} as never,executeChecked:()=>Promise.reject(new Error("no press expected")),execute:()=>Promise.reject(new Error("no press expected"))} as unknown as AgentTool;
  const observe={name:"observe",label:"observe",description:"observe",parameters:{} as never,execute:()=>Promise.resolve(result(START))} as unknown as AgentTool;
  // Every other recorder hook is a no-op; only trainerSightCheck is observed.
  const hooks=(sight:((c:TrainerSightCheck)=>void)|undefined)=>new Proxy({},{get:(_t,key)=>key==="trainerSightCheck"?sight:key==="then"?undefined:()=>{}}) as unknown as Parameters<typeof playGameTools>[3];
  const recorder=hooks(c=>{records.push(c);});
  const tools=playGameTools([press,observe],features,{read:()=>Promise.resolve(START),trainerSight:(map,tiles)=>{asked.push([map,tiles.length]);return Promise.resolve(TURN501);}},recorder);
  const out=await tools.find(t=>t.name==="navigate_to")?.execute("n",GOAL);
  expect(asked).toEqual([[[11,3],23]]);
  expect(records.map(r=>r.outcome)).toEqual(["refused"]);
  expect(texts(out as AgentToolResult<unknown>).join("\n")).toContain(TURN501_TEXT);
  // A state source that cannot serve the check: the walk runs (here into the stand-in press) and the check is unavailable.
  const missing=playGameTools([press,observe],features,{read:()=>Promise.resolve(START)},recorder);
  await expect(missing.find(t=>t.name==="navigate_to")?.execute("n",GOAL)).rejects.toThrow("no press expected");
  expect(records.at(-1)).toMatchObject({outcome:"unavailable",reason:"trainer-sight-check-v1 needs a game server that serves /pokebench/trainer-sight"});
  const noRecorder=playGameTools([press,observe],features,{read:()=>Promise.resolve(START),trainerSight:()=>Promise.resolve(TURN501)},hooks(undefined));
  await expect(noRecorder.find(t=>t.name==="navigate_to")?.execute("n",GOAL)).rejects.toThrow("trainer_sight_check");
 });
});

describe("game server client",()=>{
 it("posts the map and tiles and validates the reply",async()=>{
  const calls:{url:string;body:string}[]=[];
  const fetchFn=((url:string,init:{body:string})=>{calls.push({url,body:init.body});return Promise.resolve(new Response(JSON.stringify(TURN501)));}) as unknown as typeof fetch;
  const watcher=new StateWatcher("http://127.0.0.1:8000",fetchFn);
  await expect(watcher.trainerSight([11,3],[{x:5,y:16}])).resolves.toEqual(TURN501);
  expect(calls).toEqual([{url:"http://127.0.0.1:8000/pokebench/trainer-sight",body:JSON.stringify({map_id:[11,3],tiles:[[5,16]]})}]);
  const bad=new StateWatcher("http://x",()=>Promise.resolve(new Response("{}")));
  await expect(bad.trainerSight([11,3],[])).rejects.toThrow("Malformed trainer sight reply");
  const down=new StateWatcher("http://x",()=>Promise.resolve(new Response("",{status:500})));
  await expect(down.trainerSight([11,3],[],new AbortController().signal)).rejects.toThrow("Trainer sight returned HTTP 500");
 });
});

describe("registry, prompt and event",()=>{
 it("is a default-off guidance switch that needs bounded-navigation-v1, last in the registry",()=>{
  expect(SWITCHABLE_FEATURES.at(-97)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"guidance",needs:"bounded-navigation-v1"});
  expect(featureInfo(ID).description).toContain(" Off: ");
  const omitted=Object.fromEntries(Object.entries(FEATURES).filter(([id])=>id!==ID));
  expect(normalizeFeatures(omitted as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(playHarnessFeatures(withoutFrontierTreatments(FEATURES),null).at(-1)).toBe(ID);
  expect(playHarnessFeatures({...FEATURES,[ID]:false},null)).not.toContain(ID);
 });
 it("adds its system-prompt sentence only with the switch and navigate_to",()=>{
  const on=playSystemPrompt(FEATURES,null),off=playSystemPrompt({...FEATURES,[ID]:false},null);
  expect(on).toContain("Trainer sight: a trainer you have not beaten battles you as soon as you step into its line of sight");
  expect(off).not.toContain("Trainer sight:");
  expect(on.replace(/\n\nTrainer sight: [^\n]*/,"")).toBe(off);
  expect(playSystemPrompt({...FEATURES,"bounded-navigation-v1":false},null)).not.toContain("Trainer sight:");
 });
 it("records a valid trainer_sight_check event",()=>{
  const event={v:1,run:"r",seq:1,t:"2026-10-20T15:00:00.000-04:00",type:"trainer_sight_check",turn:501,tool_call_id:"n",map_id:[11,3],origin:{x:5,y:15},goal:{x:5,y:2},route_tiles:23,confirmed:false,outcome:"refused",reason:null,
   sightings:[{local_id:3,sprite_kind:"YOUNGSTER",trainer_id:321,x:3,y:9,facing:"LEFT",sight:3,loaded:true,step:12,tile:{x:1,y:9},from:{x:3,y:9},seen_facing:"LEFT"}],text:TURN501_TEXT};
  expect(checkEvent(event)).toMatchObject({type:"trainer_sight_check",outcome:"refused"});
 });
});

describe("text and route details",()=>{
 it("skips a sighting whose trainer the reply does not list, and spells unknown party values and one-tile sight",async()=>{
  const {seenTrainers,sightText}=await import("./trainer-sight.js");
  const reply={available:true as const,map_id:[11,3] as [number,number],trainers:[{local_id:3,graphics_id:35,sprite_kind:null,trainer_id:321,double:false,x:3,y:9,facing:"LEFT" as const,sight:1,loaded:true}],sightings:[{local_id:9,step:1,tile:[1,9] as [number,number],from:[3,9] as [number,number],facing:"LEFT" as const},{local_id:3,step:2,tile:[2,9] as [number,number],from:[3,8] as [number,number],facing:"DOWN" as const}]};
  const seen=seenTrainers(reply,START);
  expect(seen.map(s=>s.local_id)).toEqual([3]);
  const text=sightText(seen,{x:2,y:7},{x:2,y:9},1,{...START,party:[{...must(START.party[0]),hp:null,max_hp:null,species:null}]});
  expect(text).toContain("(1 step) passes tiles a trainer you have not beaten can see.");
  expect(text).toContain("- object 3, sprite unknown at (3,9) (loaded, its tile now), facing LEFT, sight 1 tile: it can see (2,9) when it faces DOWN from (3,8), step 2 of 1 on the route.");
  expect(text).toContain("Your party: unknown ?/? HP.");
  expect(sightText(seen,{x:2,y:7},{x:2,y:9},2,{...START,party:[]})).toContain("Your party: none.");
 });
 it("route tiles land past a ledge hop and stop on an unknown direction or position",()=>{
  const ledge:GameStateSnapshot={...START,position:{x:1,y:1},navigation_grid:{elevation:3,tiles:[{x:1,y:1,collision:0,behavior:0,elevation:3},{x:1,y:2,collision:1,behavior:0x3b,elevation:3},{x:1,y:3,collision:0,behavior:0,elevation:3}],objects:[],warps:[]}};
  expect(routeTiles(ledge,["DOWN"],{ledges:true})).toEqual([{x:1,y:3}]);
  expect(routeTiles(ledge,["DOWN"],{})).toEqual([{x:1,y:2}]);
  expect(routeTiles(ledge,["NORTHWEST" as "UP"],{})).toBeNull();
  expect(routeTiles({...ledge,position:null},["DOWN"],{})).toBeNull();
 });
});
function must<T>(value:T|undefined):T{if(value===undefined)throw new Error("missing");return value;}
