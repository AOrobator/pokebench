import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {describe,expect,it,vi} from "vitest";
import {IN_GAME,NAME_CONFIRMED} from "../test-support/events.js";
import {ALL_TOOL_SWITCHES,pressTool,type ToolSwitches} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {requestedStep,type PrefixRules} from "./navigation.js";
import {flagFeatures} from "./play-preset.js";
import {SWITCHABLE_FEATURES,featureInfo} from "./features.js";
import {toolSwitches} from "./play-config.js";
import {LEDGES,type Direction} from "./tile-rules.js";

type Tile={x:number;y:number;collision:number;behavior:number;elevation:number};
const tile=(x:number,y:number,collision=0,behavior=0,elevation=3):Tile=>({x,y,collision,behavior,elevation});
const RULES:PrefixRules={ledges:true,oneWay:true,floor:true,elevation:"game",fieldMoveGates:true};
const DELTA:Record<Direction,readonly [number,number]>={UP:[0,-1],DOWN:[0,1],LEFT:[-1,0],RIGHT:[1,0]};
// A 7x9 field of plain floor at elevation 3, with the given tiles replaced.
function grid(overrides:readonly Tile[]=[],objects:readonly {x:number;y:number}[]=[],warps:readonly {x:number;y:number}[]=[]){
 const tiles:Tile[]=[];
 for(let y=0;y<9;y++)for(let x=0;x<7;x++)tiles.push(overrides.find(t=>t.x===x&&t.y===y)??tile(x,y));
 return {elevation:3,tiles,objects:[...objects],warps:[...warps]};
}
const base:GameStateSnapshot={...IN_GAME,story:NAME_CONFIRMED.story,started:true,screen:"overworld",map_id:[0,16],location:"ROUTE101",position:{x:3,y:6},facing:"up",in_battle:false,active_ui:null,field_controls_locked:false,world_context:null,running:{permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:1,callback2:2,diagnostic:null,raw_hex:null},navigation_grid:grid()};
const field=(extra:Partial<GameStateSnapshot>={}):GameStateSnapshot=>parseGameState({...base,...extra});
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAPAAAACgCAIAAAC9uXYyAAACYklEQVR4nO3OAQnAMAADsNqYjwm4f1U3USiMQAQk537wjMwHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFGU+gKLMB1CU+QCKMh9AUeYDKMp8AEWZD6Ao8wEUZT6AoswHUJT5AIoyH0BR5gMoynwARZkPoCjzARRlPoCizAdQlPkAijIfQFHmAyjKfABFmQ+gKPMBFP07k6LPv/wpiQAAAABJRU5ErkJggg==","base64");
const urlOf=(input:Parameters<typeof fetch>[0])=>typeof input==="string"?input:input instanceof URL?input.href:input.url;
const clock={now:()=>0,sleep:()=>Promise.resolve()};
const text=(result:{content:readonly {type:string;text?:string}[]})=>result.content.flatMap(c=>c.type==="text"?[c.text??""]:[]).join("\n");
const hooks=()=>({beforePress:vi.fn(),afterPress:()=>Promise.resolve()});
// A game server whose player moves like the game: one tile, two over a ledge in its arrow direction, none into a solid tile.
// after(n,state) may replace the state after the n-th accepted press (1-based).
function game(start:GameStateSnapshot,after:(n:number,state:GameStateSnapshot)=>GameStateSnapshot=(_n,s)=>s){
 let state=start,presses=0;const posts:unknown[]=[];
 const fetchFn=vi.fn<typeof fetch>((input,init)=>{
  const url=urlOf(input);
  if(init?.method==="POST"){
   const body=JSON.parse(typeof init.body==="string"?init.body:"null") as {buttons:Direction[]};posts.push(body);
   for(const d of body.buttons){
    if(!(d in DELTA))continue;
    const p=state.position,g=state.navigation_grid;if(p===null||g==null)break;
    const [dx,dy]=DELTA[d],next=g.tiles.find(t=>t.x===p.x+dx&&t.y===p.y+dy);
    const landing=next===undefined?null:LEDGES.get(next.behavior)===d?{x:next.x+dx,y:next.y+dy}:next.collision===0&&!g.objects.some(o=>o.x===next.x&&o.y===next.y)?{x:next.x,y:next.y}:null;
    state={...state,facing:d.toLowerCase(),...(landing===null?{}:{position:landing})};
   }
   state=after(++presses,state);
  }
  const body=url.endsWith("/pokebench/state")?state:url.endsWith("/observation")?{state,state_text:"field",screenshot_base64:png.toString("base64")}:url.endsWith("/queue_status")?{queue_empty:true}:{status:"success"};
  return Promise.resolve(new Response(JSON.stringify(body)));
 });
 return {fetchFn,posts,state:()=>state};
}
const features=(extra:Record<string,boolean>={})=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"navigation-tool-use-guard-v1":true,"rejected-movement-prefix-v1":true,"ledge-hops-v1":true,"one-way-tiles-v1":true,"walkable-floor-v1":true,"elevation-transitions-v1":true,"field-move-gates-v1":true,...extra});
const press=(g:ReturnType<typeof game>,h=hooks(),f=features())=>pressTool("http://game",h,g.fetchFn,clock,toolSwitches(f));
const receipt=(requested:readonly Direction[],submitted:readonly Direction[])=>JSON.stringify({requested,submitted,dropped:requested.slice(submitted.length)});

describe("requestedStep",()=>{
 it("walks plain floor, grass and a ledge in its arrow direction",()=>{
  expect(requestedStep(field(),"UP",RULES)).toEqual({ok:true,landing:{x:3,y:5},warp:false});
  expect(requestedStep(field({navigation_grid:grid([tile(3,5,0,0x02)])}),"UP",RULES)).toEqual({ok:true,landing:{x:3,y:5},warp:false});
  expect(requestedStep(field({navigation_grid:grid([tile(3,7,1,0x3b,0)])}),"DOWN",RULES)).toEqual({ok:true,landing:{x:3,y:8},warp:false});
 });
 it("names why a step is refused, in observable terms",()=>{
  const reason=(state:GameStateSnapshot,d:Direction)=>{const r=requestedStep(state,d,RULES);return r.ok?null:r.reason;};
  expect(reason(field({navigation_grid:grid([tile(3,5,1,0x3b,0)])}),"UP")).toBe("(3,5) is a ledge; it can be hopped only going DOWN");
  expect(reason(field({navigation_grid:grid([tile(3,5,1,0)])}),"UP")).toBe("(3,5) is a wall or other solid tile");
  expect(reason(field({navigation_grid:grid([tile(3,5,0,0x10)])}),"UP")).toBe("(3,5) is water");
  expect(reason(field({navigation_grid:grid([],[{x:3,y:5}])}),"UP")).toBe("(3,5) has a person or object on it");
  expect(reason(field({position:{x:3,y:0}}),"UP")).toBe("(3,-1) is outside the known map");
  expect(reason(field({navigation_grid:grid([tile(3,5,0,0,4)])}),"UP")).toBe("(3,5) is at another height than where you stand");
  expect(reason(field({navigation_grid:grid([tile(3,5,0,0x33)])}),"UP")).toBe("a one-way edge blocks moving UP from (3,6) to (3,5)");
  expect(reason(field({world_context:{objects:[],triggers:[{x:3,y:5,elevation:3,variable:0x4050,required_value:0,current_value:0,condition_met:true,script_pointer:136000000}],dialogue:null}}),"UP")).toBe("(3,5) is a script tile whose condition matches now; stepping on it runs a script, so press UP on its own to step on it on purpose");
 });
 it("follows the configured rules: without ledge hops a ledge is solid",()=>{
  const r=requestedStep(field({navigation_grid:grid([tile(3,7,1,0x3b,0)])}),"DOWN",{...RULES,ledges:false});
  expect(r.ok).toBe(false);
 });
});

describe("rejected-movement-prefix-v1 at the press boundary",()=>{
 it("walks every requested direction through bends and grass, one checked press at a time",async()=>{
  const g=game(field({navigation_grid:grid([tile(3,4,0,0x02)])})),h=hooks();
  const result=await press(g,h).execute("model",{buttons:["UP","UP","RIGHT","RIGHT"]});
  expect(g.posts).toEqual(["UP","UP","RIGHT","RIGHT"].map(d=>({buttons:[d],hold_frames:10,release_frames:8})));
  expect(g.state().position).toEqual({x:5,y:4});
  expect(text(result)).toContain(receipt(["UP","UP","RIGHT","RIGHT"],["UP","UP","RIGHT","RIGHT"]));
  expect(text(result)).not.toContain("Stopped");
  expect(h.beforePress.mock.calls.map((c:unknown[])=>c[1])).toEqual([["UP"],["UP"],["RIGHT"],["RIGHT"]]);
 });
 it("stops before a ledge the model walks into against its arrow, and says why",async()=>{
  const g=game(field({navigation_grid:grid([tile(3,3,1,0x3b,0)])}));
  const result=await press(g).execute("model",{buttons:["UP","UP","UP","UP","UP"]});
  expect(g.posts).toHaveLength(2);expect(g.state().position).toEqual({x:3,y:4});
  expect(text(result)).toContain(receipt(["UP","UP","UP","UP","UP"],["UP","UP"]));
  expect(text(result)).toContain("Stopped before step 3: (3,3) is a ledge; it can be hopped only going DOWN");
 });
 it("hops a ledge in its arrow direction and keeps walking",async()=>{
  const g=game(field({position:{x:3,y:1},navigation_grid:grid([tile(3,2,1,0x3b,0)])}));
  await press(g).execute("model",{buttons:["DOWN","DOWN","DOWN"]});
  expect(g.posts).toHaveLength(3);expect(g.state().position).toEqual({x:3,y:5});
 });
 it("sends nothing when the first step is refused, and says why",async()=>{
  const g=game(field({navigation_grid:grid([tile(3,5,1,0)])})),h=hooks();
  const result=await press(g,h).execute("model",{buttons:["UP","UP"]});
  expect(g.posts).toEqual([]);expect(h.beforePress).not.toHaveBeenCalled();
  expect(text(result)).toContain(receipt(["UP","UP"],[]));
  expect(text(result)).toContain("Stopped before step 1: (3,5) is a wall or other solid tile");
 });
 it("re-checks each step on fresh state: a person stepping in stops the walk with no further input",async()=>{
  const g=game(field(),(n,s)=>n===1?{...s,navigation_grid:grid([],[{x:3,y:4}])}:s);
  const result=await press(g).execute("model",{buttons:["UP","UP","UP"]});
  expect(g.posts).toHaveLength(1);
  expect(text(result)).toContain("Stopped before step 2: (3,4) has a person or object on it");
 });
 it("stops when a step does not land where it should",async()=>{
  const g=game(field(),(n,s)=>n===1?{...s,position:{x:3,y:6}}:s);
  const result=await press(g).execute("model",{buttons:["UP","UP"]});
  expect(g.posts).toHaveLength(1);
  expect(text(result)).toContain("Stopped after step 1: the UP press from (3,6) ended at (3,6), not (3,5)");
 });
 it("stops when the field is no longer free after a step",async()=>{
  for(const change of [{in_battle:true},{field_controls_locked:true},{map_id:[0,9] as [number,number]}]){
   const g=game(field(),(n,s)=>n===1?{...s,...change}:s);
   const result=await press(g).execute("model",{buttons:["UP","UP"]});
   expect(g.posts).toHaveLength(1);expect(text(result)).toMatch(/Stopped after step 1: (the map changed|walking was interrupted)/);
  }
 });
 it("ends the walk after stepping onto a warp",async()=>{
  const g=game(field({navigation_grid:grid([],[],[{x:3,y:5}])}));
  const result=await press(g).execute("model",{buttons:["UP","UP","UP"]});
  expect(g.posts).toHaveLength(1);
  expect(text(result)).toContain("Stopped after step 1: stepped onto a warp at (3,5)");
 });
 it("never uses automatic running",async()=>{
  const g=game(field()),h=hooks();
  await press(g,h,features({"automatic-running-v1":true})).execute("model",{buttons:["UP","UP"],walking:false});
  expect(h.beforePress.mock.calls.map(c=>(c[4] as {automatic_running:boolean}|undefined)?.automatic_running)).toEqual([false,false]);
  expect(g.fetchFn.mock.calls.filter(([,i])=>i?.method==="POST").map(([u])=>urlOf(u))).toEqual(["http://game/action","http://game/action"]);
 });
 it("takes precedence over rejected-movement-step-v1",async()=>{
  const g=game(field());
  await press(g,hooks(),features({"rejected-movement-step-v1":true})).execute("model",{buttons:["UP","UP","UP"]});
  expect(g.posts).toHaveLength(3);
 });
 it("OFF keeps the original rejection and the one-step cut exactly: whole result, every request and every hook call",async()=>{
  const run=async(switches:ToolSwitches)=>{
   const g=game(field()),before=vi.fn(),after=vi.fn(()=>Promise.resolve());
   const result=await pressTool("http://game",{beforePress:before,afterPress:after},g.fetchFn,clock,switches).execute("model",{buttons:["UP","UP"]});
   return {result,requests:g.fetchFn.mock.calls.map(([u,i])=>[urlOf(u),i?.method??"GET",typeof i?.body==="string"?i.body:null]),before:before.mock.calls,after:after.mock.calls.length};
  };
  for(const step of [false,true]){
   const f=features({"rejected-movement-prefix-v1":false,"rejected-movement-step-v1":step});
   const off=await run(toolSwitches(f));
   // The press tool as it was before this switch existed: the same switches with no prefix rules at all.
   const previous:ToolSwitches=Object.fromEntries(Object.entries(toolSwitches(f)).filter(([k])=>k!=="rejectedMovementPrefix")) as unknown as ToolSwitches;
   expect("rejectedMovementPrefix" in previous).toBe(false);
   expect(off).toEqual(await run(previous));
   expect(off).toEqual(await run({...ALL_TOOL_SWITCHES,...previous}));
   if(step){expect(off.requests.filter(r=>r[1]==="POST")).toEqual([["http://game/action","POST",JSON.stringify({buttons:["UP"],hold_frames:10,release_frames:8})]]);expect(text(off.result)).toContain(`Movement batch limited to one direction press; remaining inputs were not sent. Inspect the new state before another input. ${JSON.stringify({requested:["UP","UP"],submitted:["UP"],dropped:["UP"]})}`);}
   else{expect(off.requests.filter(r=>r[1]==="POST")).toEqual([]);expect(off.before).toEqual([]);expect(text(off.result).startsWith(`Navigation tool-use guard: no input was sent. Use an available navigation tool with a target you choose for walking. Single direction presses remain available for facing or crossing an exit. ${JSON.stringify({requested:["UP","UP"],submitted:[],map_id:[0,16],position:{x:3,y:6}})}`)).toBe(true);}
  }
 });
 it("leaves checked navigation, single presses, mixed batches and a disabled guard alone",async()=>{
  for(const [buttons,f] of [[["UP","A"],{}],[["UP"],{}],[["UP","UP"],{"navigation-tool-use-guard-v1":false}]] as const){
   const g=game(field());await press(g,hooks(),features(f)).execute("model",{buttons:[...buttons]});
   expect(g.posts).toEqual([{buttons:[...buttons],hold_frames:10,release_frames:8}]);
  }
  const g=game(field());await press(g).executeChecked("internal",{buttons:["UP","UP"]},()=>undefined);
  expect(g.posts).toEqual([{buttons:["UP","UP"],hold_frames:10,release_frames:8}]);
 });
});

describe("registry and pending experiment",()=>{
 it("is the last switch: a default-off guard that needs the navigation tool-use guard, with OFF copy",()=>{
  expect(SWITCHABLE_FEATURES.at(-22)).toBe("rejected-movement-prefix-v1");
  expect(featureInfo("rejected-movement-prefix-v1")).toMatchObject({group:"guard",needs:"navigation-tool-use-guard-v1"});
  expect(featureInfo("rejected-movement-prefix-v1").description).toContain(" Off: ");
  expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})["rejected-movement-prefix-v1"]).toBe(false);
 });

});

describe("production wiring",()=>{
 it("maps the switch and the navigation rules it walks by",()=>{
  expect(toolSwitches(features()).rejectedMovementPrefix).toEqual(RULES);
  expect(toolSwitches(features({"ledge-hops-v1":false,"one-way-tiles-v1":false,"walkable-floor-v1":false,"elevation-transitions-v1":false,"field-move-gates-v1":false})).rejectedMovementPrefix).toEqual({ledges:false,oneWay:false,floor:false,elevation:"legacy",fieldMoveGates:false});
  expect(toolSwitches(features({"rejected-movement-prefix-v1":false})).rejectedMovementPrefix).toBeUndefined();
 });
});

describe("recorded run 1fe0 (Route 101 ledges)",()=>{
 const cases=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/rejected-movement-1fe0.json.gz",import.meta.url))).toString("utf8")) as {source:string;buttons:Direction[];state:unknown}[];
 const walk=(state:GameStateSnapshot,buttons:readonly Direction[])=>{
  let s=state;const landed=[];
  for(const d of buttons){const r=requestedStep(s,d,RULES);if(!r.ok)return {landed,reason:r.reason};landed.push(r.landing);s={...s,position:r.landing};}
  return {landed,reason:null};
 };
 it("walks seq 8033's eight UP presses five tiles to the foot of the ledge, where the one-step cut walked one",()=>{
  const c=cases[0];if(c===undefined)throw new Error("fixture");
  const r=walk(parseGameState(c.state),c.buttons);
  expect(r.landed).toHaveLength(5);expect(r.landed.at(-1)).toEqual({x:10,y:14});
  expect(r.reason).toBe("(10,13) is a ledge; it can be hopped only going DOWN");
 });
 it("hops the ledge going DOWN at seq 9355, up to the edge of that one recorded window (live, each step re-reads it)",()=>{
  const c=cases[1];if(c===undefined)throw new Error("fixture");
  const r=walk(parseGameState(c.state),c.buttons);
  expect(r.landed.slice(-2)).toEqual([{x:8,y:12},{x:8,y:14}]);expect(r.reason).toBe("(8,15) is outside the known map");
 });
 it("sends nothing at the ledge foot (seq 8189) and says why",()=>{
  const c=cases[2];if(c===undefined)throw new Error("fixture");
  expect(walk(parseGameState(c.state),c.buttons)).toEqual({landed:[],reason:"(10,13) is a ledge; it can be hopped only going DOWN"});
 });
});
