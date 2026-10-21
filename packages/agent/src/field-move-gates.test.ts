// field-move-gates-v1 on the agent side: the server's field_obstacles and gated exit_reach reach every exit list through
// exitBlock (surf-gate.ts), and navigate_to plans around closed obstacles, slides down slopes and names what cuts a goal off.
// Fixture field-moves-a8f9-states.json.gz: control run 2026-10-20T16-14-34_qwen36-gpu0_a8f9, RUSTURF TUNNEL (24/4), state seq
// 41177 at (4,7). states.off is the recorded state body; states.on is the server's state_json for the same RAM with
// field-move-gates-v1 on (env/tests/env/test_field_move_flood.py); map_grids.on is full-map-navigation-v1's grid. Tool result
// 41178 said "call navigate_to again to continue to (29,16)" although two BREAKABLE_ROCK objects at (24,4) and (24,5)
// close the only way east.
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {ALL_ON as REGISTRY_ALL_ON,FEATURES,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,featuresOf,playHarnessFeatures,serverFeatureEnv,type FeatureSet} from "./features.js";
const ALL_ON={...REGISTRY_ALL_ON,"pending-field-dialogue-v1":false};
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {gatedState,navigationTool,planNavigation,withNavigation,type NavigationOptions} from "./navigation.js";
import {exitBlock,passesText,reachSwitches} from "./surf-gate.js";
import {UntakenExits} from "./untaken-exits.js";
import type {CheckedPressTool} from "./game-tools.js";
import {IN_GAME} from "../test-support/events.js";

const ID="field-move-gates-v1";
interface Fixture {readonly harness_features:string[];readonly states:Record<"off"|"on",unknown>;readonly map_grids:Record<"on",unknown>;readonly results:Record<"navigation_line",string>}
const FIXTURE=JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/field-moves-a8f9-states.json.gz",import.meta.url))).toString("utf8")) as Fixture;
const OFF_STATE=():GameStateSnapshot=>parseGameState(FIXTURE.states.off);
const ON_STATE=(full=false):GameStateSnapshot=>parseGameState(full?{...(FIXTURE.states.on as object),map_grid:FIXTURE.map_grids.on}:FIXTURE.states.on);
const RUN:FeatureSet={...featuresOf(FIXTURE.harness_features),[ID]:false};
const ROCK_TEXT="It's a rugged rock, but a POKéMON may be able to smash it.";
const PASSES=`every way to it on this map passes BREAKABLE_ROCK at (24,4) or (24,5), which needs a field move you cannot use yet; the game says: "${ROCK_TEXT}"`;
const REFUSAL=`(29,16) cannot be reached on foot from where you stand: ${PASSES}`;

const result=(state:GameStateSnapshot):AgentToolResult<{state:GameStateSnapshot}>=>({content:[{type:"text",text:"observed"}],details:{state}});
const STEP:Readonly<Record<string,readonly [number,number]>>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
// The production factory over fake ordinary tools. "stay": a press leaves the player where they are; "walk": one tile per press,
// and a slope (behavior 0xD0) under the new tile slides the player south off it, as ForcedMovement_MuddySlope does.
async function navigate(features:FeatureSet,start:GameStateSnapshot,goal:{x:number;y:number},mode:"stay"|"walk"):Promise<{line:string;status:string;presses:number}> {
 let current=start,presses=0;
 const behavior=(x:number,y:number):number=>start.navigation_grid?.tiles.find(t=>t.x===x&&t.y===y)?.behavior??-1;
 const next=(_id:string,params:{buttons:string[]}):Promise<AgentToolResult<{state:GameStateSnapshot}>>=>{
  presses++;
  if(mode==="walk"){
   const [dx,dy]=STEP[params.buttons[0]??""]??[0,0];const p=current.position;if(p===null)throw new Error("no position");
   const x=p.x+dx;let y=p.y+dy;while(behavior(x,y)===0xd0)y++;
   current={...current,position:{x,y}};
  }
  return Promise.resolve(result(current));
 };
 const observe={name:"observe",label:"observe",description:"observe",parameters:{},execute:()=>Promise.resolve(result(current))} as unknown as AgentTool;
 const press={name:"press",label:"press",description:"press",parameters:{},execute:next,executeChecked:next} as unknown as CheckedPressTool;
 const tools=withNavigation([observe,press],features,{read:()=>Promise.resolve(current)});
 const nav=tools.find(t=>t.name==="navigate_to");if(nav===undefined)throw new Error("no navigate_to");
 const map=start.map_id;if(map===null)throw new Error("no map");
 const out=await nav.execute("nav",{...goal,map_id:[map[0],map[1]]});
 const part=out.content[0];
 return {line:part?.type==="text"?part.text:"",status:(out.details as {navigation:{status:string}}).navigation.status,presses};
}

const cell=(collision:number,behavior=0,elevation=3):string=>((collision<<12)|(elevation<<8)|behavior).toString(16).padStart(4,"0");
const hexRows=(mask:readonly string[]):string[]=>mask.map(r=>{const bits=Array.from(r).map(c=>c==="1"?"1":"0").join("").padEnd(Math.ceil(r.length/4)*4,"0");return Array.from({length:bits.length/4},(_,i)=>Number.parseInt(bits.slice(i*4,i*4+4),2).toString(16)).join("");});
// A synthetic field: # wall, s slope (0xD0), r a closed BREAKABLE_ROCK the game has not loaded (floor tile, not in objects),
// anything else floor. foot is the server's gated foot mask (1 = reached), beyond what lies past the rocks.
function field(rows:readonly string[],player:{x:number;y:number},foot:readonly string[],beyond:readonly string[]|null=null):GameStateSnapshot {
 const width=rows[0]?.length??0,height=rows.length;
 const kind=(c:string):[number,number]=>c==="#"?[1,0]:c==="s"?[0,0xd0]:[0,0];
 const tiles=rows.flatMap((r,y)=>Array.from(r).map((c,x)=>({x,y,collision:kind(c)[0],behavior:kind(c)[1],elevation:3})));
 const rocks=rows.flatMap((r,y)=>Array.from(r).flatMap((c,x)=>c==="r"?[{x,y}]:[]));
 return {...IN_GAME,started:true,screen:"overworld",location:"ROUTE",map_id:[0,9],position:player,facing:"down",field_controls_locked:false,
  navigation_grid:{elevation:3,tiles,objects:[],warps:[]},
  map_grid:{width,height,elevation:3,rows:rows.map(r=>Array.from(r).map(c=>cell(...kind(c))).join("")),objects:[],warps:[]},
  interaction_targets:[],topology:{width,height,connections:[]},
  exit_reach:{warps:[],connections:[],foot:{width,height,rows:hexRows(foot)}},
  field_obstacles:{capabilities:{cut:false,rock_smash:false,strength:false,surf:false,waterfall:false,dive:false,mach_bike:false,acro_bike:false,go_goggles:false,devon_scope:false},
   obstacles:rocks.map((tile,id)=>({id,gate:"rock_smash",name:"BREAKABLE_ROCK",kind:"object",local_id:id+1,loaded:false,tiles:[tile],only:null,open:false,needs:"a field move you cannot use yet",text:ROCK_TEXT,beyond:beyond===null?null:{width,height,rows:hexRows(beyond)}}))}};
}
const grid=(s:GameStateSnapshot):NonNullable<GameStateSnapshot["navigation_grid"]>=>{const g=s.navigation_grid;if(g==null)throw new Error("no grid");return g;};
const NAV:FeatureSet={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"bounded-navigation-v1":true,"ledge-hops-v1":true,"one-way-tiles-v1":true,"walkable-floor-v1":true,"navigation-refusal-reasons-v1":true,"navigation-truth-v1":true,"exit-reachability-v1":true};
const PLAN:NavigationOptions={mode:"local",ledges:true,oneWay:true,floor:true,elevation:"game"};

describe("field-move-gates-v1 registry, presets and server wiring",()=>{
 it("is the last switch: a default-off server observation that needs exit-reachability-v1, with OFF copy",()=>{
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"exit-reachability-v1",switchable:true,title:"FIELD MOVE GATES"});
  expect(featureInfo(ID).description).toContain(" Off: obstacles are ignored by the flood, the exit labels, the readout and navigate_to, as before");
  expect(featureInfo(ID).description).toContain(`the game says: "${ROCK_TEXT}"`);
  expect(SWITCHABLE_FEATURES.at(-3)).toBe(ID);
  expect(FEATURES.filter(f=>f.switchable).at(-3)?.id).toBe(ID);
  expect(SERVER_FEATURES.at(-1)).toBe(ID);
  expect(playHarnessFeatures(ALL_ON,null).at(-2)).toBe(ID);
  expect(playHarnessFeatures({...ALL_ON,[ID]:false},null)).not.toContain(ID);
  expect(serverFeatureEnv({...ALL_ON,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
  expect(dependencyProblems({...ALL_ON,"exit-reachability-v1":false})).toContain(`${ID} needs exit-reachability-v1`);
 });
 it("defaults off in presets and the legacy flag presets",()=>{
  expect(normalizeFeatures({} as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:true})[ID]).toBe(false);
  expect(reachSwitches({...ALL_ON,[ID]:false})).toEqual({surf:true,reach:true,gates:false});
  expect(reachSwitches(ALL_ON)).toEqual({surf:true,reach:true,gates:true});
 });
});

describe("field-move-gates-v1 on the a8f9 Rusturf Tunnel state (seq 41177)",()=>{
 it("the state schema accepts field_obstacles and blocked_by; OFF has neither",()=>{
  const on=ON_STATE();
  expect(on.exit_reach?.warps).toEqual([{x:4,y:10,reach:"foot"},{x:29,y:16,reach:"none",blocked_by:[0,1]},{x:18,y:20,reach:"none",blocked_by:[0,1]}]);
  expect(on.field_obstacles?.obstacles.map(o=>[o.name,o.tiles,o.open])).toEqual([["BREAKABLE_ROCK",[{x:24,y:5}],false],["BREAKABLE_ROCK",[{x:24,y:4}],false]]);
  expect(OFF_STATE().field_obstacles).toBeUndefined();
  expect(OFF_STATE().exit_reach?.warps.every(w=>w.reach==="foot")).toBe(true);
 });
 it("untaken exits: OFF lists the warps past the rocks; ON lists only (4,10)",()=>{
  const off=new UntakenExits(RUN).line(OFF_STATE(),"");
  expect(off).toContain("(29,16)");expect(off).toContain("(18,20)");
  const on=new UntakenExits({...RUN,[ID]:true}).line(ON_STATE(),"");
  expect(on).toContain("(4,10)");expect(on).not.toContain("(29,16)");expect(on).not.toContain("(18,20)");
 });
 it("exitBlock names the rocks for a goal past them, and only with the switch",()=>{
  expect(exitBlock({surf:true,reach:true,gates:true},ON_STATE()).obstacles(29,16)).toBe(PASSES);
  expect(exitBlock({surf:true,reach:true,gates:true},ON_STATE()).obstacles(18,20)).toBe(PASSES);
  expect(exitBlock({surf:true,reach:true,gates:true},ON_STATE()).obstacles(4,10)).toBeNull();
  expect(exitBlock({surf:true,reach:true,gates:false},ON_STATE()).obstacles(29,16)).toBeNull();
  expect(exitBlock({surf:true,reach:true},ON_STATE()).obstacles(29,16)).toBeNull();
  expect(exitBlock({surf:true,reach:true,gates:true},OFF_STATE()).obstacles(29,16)).toBeNull();
 });
 it("navigate_to (29,16): ON refuses before any press, naming the rocks and quoting the game; OFF walks as the run did",async()=>{
  const on=await navigate({...RUN,[ID]:true},ON_STATE(),{x:29,y:16},"stay");
  expect(on.presses).toBe(0);
  expect(on.status).toBe(REFUSAL);
  expect(on.line).toBe(`Navigation: ${REFUSAL}; 0 ordinary button attempts.`);
  const off=await navigate(RUN,OFF_STATE(),{x:29,y:16},"stay");
  expect(off.presses).toBeGreaterThan(0);
  expect(off.status).not.toContain("BREAKABLE_ROCK");
  expect(FIXTURE.results.navigation_line).toContain("call navigate_to again to continue to (29,16)");
 });
 it("whole map: the planner routes around rocks the game has not loaded only with the switch",()=>{
  const state=ON_STATE(true);
  const full:NavigationOptions={...PLAN,mode:"full"};
  expect(planNavigation(state,{x:26,y:4},full)).not.toBeNull();
  expect(planNavigation(gatedState(state),{x:26,y:4},full)).toBeNull();
  expect(planNavigation(gatedState(state),{x:23,y:4},full)).not.toBeNull();
  expect(gatedState(OFF_STATE())).toEqual(OFF_STATE());
 });
});

describe("field-move-gates-v1 planners on synthetic maps",()=>{
 const CORRIDOR=["....r....",".#######.","........."];
 const ALL=["111111111","100000001","111111111"];
 it("local and whole-map plans go around a closed rock that is not loaded",()=>{
  const s=field(CORRIDOR,{x:0,y:0},ALL);
  for(const mode of ["local","full"] as const){
   const plain=planNavigation(s,{x:8,y:0},{...PLAN,mode});
   expect(plain?.slice(0,4)).toEqual(["RIGHT","RIGHT","RIGHT","RIGHT"]);
   const around=planNavigation(gatedState(s),{x:8,y:0},{...PLAN,mode});
   expect(around).toEqual(["DOWN","DOWN","RIGHT","RIGHT","RIGHT","RIGHT","RIGHT","RIGHT","RIGHT","RIGHT","UP","UP"]);
  }
 });
 it("navigate_to walks around it with the switch, and straight into it without",async()=>{
  const s=field(CORRIDOR,{x:0,y:0},ALL);
  const on=await navigate({...NAV,[ID]:true},s,{x:8,y:0},"walk");
  // Eight presses (the local bound) take it down and along the bottom row, past the rock.
  expect(on.status).toBe("command limit: stopped at (6,2) after 8 ordinary button attempts, the most one navigate_to call makes; call navigate_to again to continue to (8,0)");
  const off=await navigate(NAV,s,{x:8,y:0},"walk");
  expect([off.status,off.presses]).toEqual(["arrived at requested coordinate",8]);
 });
 it("a goal only the rock cuts off is refused before walking, and a person past it is named too",async()=>{
  const rows=["...r...","...#...","...#..."];
  const foot=["1110000","1110000","1110000"],beyond=["0001111","0000111","0000111"];
  const s=field(rows,{x:0,y:0},foot,beyond);
  const why="every way to it on this map passes BREAKABLE_ROCK at (3,0), which needs a field move you cannot use yet; the game says: \"It's a rugged rock, but a POKéMON may be able to smash it.\"";
  const on=await navigate({...NAV,[ID]:true},s,{x:6,y:2},"walk");
  expect([on.presses,on.status]).toEqual([0,`(6,2) cannot be reached on foot from where you stand: ${why}`]);
  const person={...s,interaction_targets:[{kind:"object",x:6,y:1,elevation:3,activation:"A",availability:"conditional",facing:null,local_id:9,destination:null,name:"HIKER"}],navigation_grid:{...grid(s),objects:[{x:6,y:1}]}} as GameStateSnapshot;
  const talk=await navigate({...NAV,[ID]:true},person,{x:6,y:1},"walk");
  expect(talk.presses).toBe(0);
  expect(talk.status).toBe(`(6,1) cannot be reached on foot from where you stand: ${why}`);
  // Off: the generic texts, no obstacle named.
  const off=await navigate(NAV,s,{x:6,y:2},"walk");
  expect(off.status).not.toContain("BREAKABLE_ROCK");
 });
 it("a slope is walked only downhill, sliding to its foot, and only with the switch",async()=>{
  const rows=[".",".","s","s",".","."];
  const foot=["1","1","1","1","1","1"];
  const s=field(rows,{x:0,y:0},foot);
  expect(planNavigation(s,{x:0,y:5},PLAN)).toBeNull();
  const slides={...PLAN,slopes:true};
  expect(planNavigation(s,{x:0,y:5},slides)).toEqual(["DOWN","DOWN","DOWN"]);
  const below=field(rows,{x:0,y:5},foot);
  expect(planNavigation(below,{x:0,y:0},slides)).toBeNull();
  expect(planNavigation(s,{x:0,y:2},slides)).toBeNull();
  const on=await navigate({...NAV,[ID]:true},s,{x:0,y:5},"walk");
  expect([on.status,on.presses]).toEqual(["arrived at requested coordinate",3]);
  const off=await navigate(NAV,s,{x:0,y:5},"walk");
  expect(off.presses).toBe(0);
 });
 it("cracked floor stays avoided with the switch on",()=>{
  const s=field(["..."],{x:0,y:0},["111"]);
  const local=grid(s);
  const cracked={...s,navigation_grid:{...local,tiles:local.tiles.map(t=>t.x===1?{...t,behavior:0xd2}:t)}} as GameStateSnapshot;
  expect(planNavigation(gatedState(cracked),{x:2,y:0},{...PLAN,slopes:true})).toBeNull();
 });
 it("the factory hands navigate_to the switch: delete the wiring and the refusal is gone",()=>{
  const tool=navigationTool({read:()=>Promise.resolve(ON_STATE()),press:()=>Promise.reject(new Error("no press")),observe:()=>Promise.resolve(result(ON_STATE())),truth:true,refusalReasons:true,exitReach:true,fieldMoveGates:true});
  expect(tool.name).toBe("navigate_to");
 });
});

describe("field-move-gates-v1 obstacle wording",()=>{
 const obstacle=(name:string,x:number,y:number,needs:string,text:string|null)=>({id:0,gate:"g",name,kind:"object" as const,local_id:1,loaded:false,tiles:[{x,y}],only:null,open:false,needs,text,beyond:null});
 it("groups tiles by kind in reading order, says when the needs differ, and quotes each text once",()=>{
  const rock=obstacle("BREAKABLE_ROCK",24,5,"a field move you cannot use yet",ROCK_TEXT);
  const rock2=obstacle("BREAKABLE_ROCK",24,4,"a field move you cannot use yet",ROCK_TEXT);
  const slope={...obstacle("slope tiles (metatile behavior 0xD0)",9,9,"an item you do not have yet",null),kind:"terrain" as const,local_id:null};
  const tree=obstacle("CUTTABLE_TREE",3,3,"a field move you cannot use yet","This tree looks like it can be CUT down!");
  expect(passesText([rock,rock2])).toBe(PASSES);
  expect(passesText([slope])).toBe("every way to it on this map passes slope tiles (metatile behavior 0xD0) at (9,9), which needs an item you do not have yet; the game shows no message there");
  expect(passesText([rock,slope,tree])).toBe(`every way to it on this map passes BREAKABLE_ROCK at (24,5) or slope tiles (metatile behavior 0xD0) at (9,9) or CUTTABLE_TREE at (3,3), which needs a field move or an item you cannot use yet; the game says: "${ROCK_TEXT}" and "This tree looks like it can be CUT down!"`);
 });
 it("an open or unknown obstacle, or a beyond mask of the wrong size, names nothing",()=>{
  const s=ON_STATE(),given=s.field_obstacles;if(given==null)throw new Error("no field_obstacles");
  const field=given;
  type Entry=typeof field.obstacles[number];
  const with_=(change:(o:Entry)=>Entry):GameStateSnapshot=>({...s,field_obstacles:{...field,obstacles:field.obstacles.map(change)}});
  const gates={surf:true,reach:true,gates:true};
  expect(exitBlock(gates,with_(o=>({...o,open:null}))).obstacles(29,16)).toBeNull();
  expect(exitBlock(gates,with_(o=>({...o,open:true}))).obstacles(29,16)).toBeNull();
  expect(exitBlock(gates,with_(o=>({...o,beyond:o.beyond===null?null:{...o.beyond,width:5}}))).obstacles(29,16)).toBeNull();
  expect(exitBlock(gates,with_(o=>({...o,beyond:null}))).obstacles(29,16)).toBeNull();
 });
});
