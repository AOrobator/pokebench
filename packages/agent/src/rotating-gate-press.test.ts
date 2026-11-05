import {expect,it,vi} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {SWITCHABLE_FEATURES,featureInfo,playHarnessFeatures,ALL_ON} from "./features.js";
import {pressTool} from "./game-tools.js";
import type {GameStateSnapshot} from "./game-state.js";
import type {Button} from "./events.js";
import {toolSwitches} from "./play-config.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {ALL_PRESS_FACTS,pressResult} from "./press-result.js";
import {GateStepTrail,gatePressNote} from "./rotating-gate-press.js";
import type {StridePlan} from "./stride.js";

const ID="rotating-gate-press-feedback-v1";
type Compass="north"|"east"|"south"|"west";
const COMPASS:readonly Compass[]=["north","east","south","west"];
// The two-arm gate of map_rotating_elements.py: pivot corner (x,y), one short arm each way.
const edgeOf=(x:number,y:number,direction:number):readonly [number,number,number,number]=>direction===0?[x-1,y-1,x,y-1]:direction===1?[x,y-1,x,y]:direction===2?[x-1,y,x,y]:[x-1,y-1,x-1,y];
const gate=(id:number,x:number,y:number,orientation:number)=>{
 const group=`gate:${String(id)}`,arms=[orientation%4,(orientation+2)%4];
 return [{kind:"rotating_gate" as const,x,y,state:"pivot",group,orientation},...arms.map(direction=>{const edge=edgeOf(x,y,direction);return {kind:"rotating_gate" as const,x:edge[0],y:edge[1],state:"arm",direction:COMPASS[direction]??"north",group,orientation,edge:[...edge] as [number,number,number,number]};})];
};
const tiles=Array.from({length:100},(_,i)=>({x:i%10,y:Math.floor(i/10),collision:0,behavior:0,elevation:3}));
const running={permitted:true,controllable:true,reason:"permitted",shoes:true,allow_running:true,avatar_flags:1,metatile:0,elevation:3,map_type:3,callback1:1,callback2:2,diagnostic:null,raw_hex:null};
const observed=(orientations:readonly number[],unavailable:readonly string[]=[])=>({version:1 as const,map_id:[12,1] as [number,number],origin:[0,0] as [number,number],width:10,height:10,elements:orientations.flatMap((o,i)=>gate(i,3+i*3,5,o)),unavailable:[...unavailable]});
const field=(orientations:readonly number[],position={x:2,y:5},facing="up"):GameStateSnapshot=>({...IN_GAME,started:true,screen:"overworld",in_battle:false,active_ui:null,field_controls_locked:false,map_id:[12,1],position,facing,navigation_grid:{elevation:3,tiles,objects:[],warps:[]},world_context:null,running,map_observation:observed(orientations)});
const ON={...ALL_PRESS_FACTS,gatePressFeedback:true};
const unobserved=(state:GameStateSnapshot):GameStateSnapshot=>{const rest={...state};delete rest.map_observation;return rest;};

it("registers default off, in position, and needs the orientation read",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(345);
 expect(playHarnessFeatures(ALL_ON,null).at(-1)).toBe(ID);
 expect(featureInfo(ID).needs).toBe("rotating-gate-positions-v1");
 expect(featureInfo(ID).description).toContain(" Off: ");
 const {[ID]:enabled,...old}=ALL_ON;expect(enabled).toBe(true);expect(normalizeFeatures(old)[ID]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[ID]).toBe(false);
});

it("off leaves a turned gate unsaid",()=>{
 expect(pressResult(field([0,0]),field([1,0],{x:2,y:4}),["UP"],ALL_PRESS_FACTS)).toBe("moved (2,5) -> (2,4)");
});

it("names the gate that turned, which way, and its arms",()=>{
 expect(pressResult(field([0,0]),field([1,0],{x:2,y:4}),["UP"],ON)).toBe("moved (2,5) -> (2,4); Gate 0 turned 90 degrees clockwise (arms north, south -> east, west)");
 expect(gatePressNote(field([1,0]),field([0,0]),["UP"],true)).toBe("Gate 0 turned 90 degrees counterclockwise (arms east, west -> north, south)");
 expect(gatePressNote(field([0,3]),field([1,0]),["UP"],true)).toBe("Gate 0 turned 90 degrees clockwise (arms north, south -> east, west); Gate 1 turned 90 degrees clockwise (arms east, west -> north, south)");
});

it("a refused push says the arm across that edge did not turn, and nothing about why",()=>{
 const here=field([0,0],{x:2,y:4}),line=pressResult(here,here,["RIGHT"],ON);
 expect(line).toBe("blocked or unavailable (no movement/turn observed; snapshots cannot distinguish collision from ignored input); Gate 0's arm between (2,4) and (3,4) did not turn");
 expect(gatePressNote(here,here,["RIGHT"],false)).toBe("Gate 0's arm ahead did not turn");
});

it("turning to face an arm is the same fact",()=>{
 expect(pressResult(field([0,0],{x:2,y:4},"down"),field([0,0],{x:2,y:4},"right"),["RIGHT"],ON)).toBe("turned down -> right; no net movement; Gate 0's arm between (2,4) and (3,4) did not turn");
});

it("a step that meets no arm says no gate turned",()=>{
 expect(gatePressNote(field([0,0]),field([0,0],{x:1,y:5}),["LEFT"],true)).toBe("no gate turned");
 expect(gatePressNote(field([0,0]),field([0,0],{x:1,y:5}),["A","LEFT"],true)).toBe("no gate turned");
});

it("repeated pushes that never left the tile are the same fact as one",()=>{
 const here=field([0,0],{x:2,y:4});
 expect(gatePressNote(here,here,["RIGHT","RIGHT"],true)).toBe("Gate 0's arm between (2,4) and (3,4) did not turn");
});

it("says nothing when no step could have pushed a gate here",()=>{
 const plain=field([0,0]);const elsewhere={...unobserved(plain),map_id:[0,4]} as GameStateSnapshot;const empty={...plain,map_observation:{...observed([]),elements:[]}} as GameStateSnapshot;
 expect(gatePressNote(plain,plain,["A"],true)).toBeNull();
 expect(gatePressNote(undefined,plain,["UP"],true)).toBeNull();
 expect(gatePressNote(plain,elsewhere,["UP"],true)).toBeNull();
 expect(gatePressNote(elsewhere,plain,["UP"],true)).toBeNull();
 expect(gatePressNote(empty,empty,["UP"],true)).toBeNull();
 expect(gatePressNote({...plain,map_id:null},plain,["UP"],true)).toBeNull();
 for(const busy of [{screen:"bag"},{in_battle:true},{active_ui:{phase:"bag"}},{field_controls_locked:true},{started:false}])expect(gatePressNote({...plain,...busy} as GameStateSnapshot,plain,["UP"],true)).toBeNull();
});

it("never claims a gate stayed put when a side of the comparison is unread",()=>{
 const plain=field([0,0]),unread="gate state unavailable, so whether a gate turned is not known";
 const failed={...plain,map_observation:{...observed([]),unavailable:["rotating gate memory unavailable"]}} as GameStateSnapshot;
 const missing=unobserved(plain);
 const other={...plain,map_observation:{...observed([0,0]),map_id:[0,4]}} as GameStateSnapshot;
 const noOrientation={...plain,map_observation:{...observed([]),elements:[{kind:"rotating_gate",x:3,y:5,state:"transitioning",group:"gate:0"}]}} as GameStateSnapshot;
 const ungrouped={...plain,map_observation:{...observed([]),elements:[{kind:"rotating_gate",x:3,y:5,state:"pivot",orientation:0}]}} as GameStateSnapshot;
 expect(gatePressNote(failed,plain,["UP"],true)).toBe(unread);
 expect(gatePressNote(plain,failed,["UP"],true)).toBe(unread);
 expect(gatePressNote(plain,missing,["UP"],true)).toBe(unread);
 expect(gatePressNote(plain,other,["UP"],true)).toBe(unread);
 expect(gatePressNote(plain,noOrientation,["UP"],true)).toBe(unread);
 expect(gatePressNote(plain,ungrouped,["UP"],true)).toBe(unread);
 expect(gatePressNote(plain,field([0]),["UP"],true)).toBe(unread);
});

it("a raw batch says its comparison is net, because a turn and its reverse would not show",()=>{
 const start=field([0,0]);
 expect(gatePressNote(start,field([1,0],{x:3,y:5}),["UP","RIGHT"],true)).toBe("across this batch, Gate 0 turned 90 degrees clockwise (arms north, south -> east, west)");
 expect(gatePressNote(start,field([2,0],{x:3,y:5}),["UP","RIGHT"],true)).toBe("across this batch, Gate 0 turned 180 degrees (arms north, south -> north, south)");
 expect(gatePressNote(start,field([0,0],{x:3,y:5}),["UP","RIGHT"],true)).toBe("no gate differs between the states before and after this batch; gate state was not read between its inputs");
});

it("a step trail names each step that mattered and keeps opposite turns apart",()=>{
 const trail=new GateStepTrail(true);
 expect(trail.add(field([0,0]),field([1,0],{x:3,y:5}),"RIGHT")).toBe("gates by step: step 1 RIGHT: Gate 0 turned 90 degrees clockwise (arms north, south -> east, west)");
 expect(trail.add(field([1,0],{x:3,y:5}),field([0,0],{x:2,y:5}),"LEFT")).toBe("gates by step: step 1 RIGHT: Gate 0 turned 90 degrees clockwise (arms north, south -> east, west); step 2 LEFT: Gate 0 turned 90 degrees counterclockwise (arms east, west -> north, south)");
 expect(trail.add(field([0,0]),field([0,0],{x:1,y:5}),"LEFT")).toBe("gates by step: step 1 RIGHT: Gate 0 turned 90 degrees clockwise (arms north, south -> east, west); step 2 LEFT: Gate 0 turned 90 degrees counterclockwise (arms east, west -> north, south); no gate turned on the other steps");
 const quiet=new GateStepTrail(true);
 expect(quiet.add(field([0,0]),field([0,0],{x:1,y:5}),"LEFT")).toBe("no gate turned on any step");
 const away=new GateStepTrail(true);
 expect(away.add(field([0,0]),{...unobserved(field([0,0])),map_id:[0,4]},"LEFT")).toBeNull();
});

const urlOf=(input:Parameters<typeof fetch>[0])=>typeof input==="string"?input:input instanceof URL?input.href:input.url;
const png=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.write("IHDR",12);png.writeUInt32BE(240,16);png.writeUInt32BE(160,20);
// A press moves the player unless refuse says otherwise; turn gives the orientations after that press.
function server(start:GameStateSnapshot,step:(state:GameStateSnapshot,direction:Button)=>GameStateSnapshot){
 let state=start,plan:StridePlan|undefined;
 const fetchFn=vi.fn<typeof fetch>((input,init)=>{
  const url=urlOf(input);let body:unknown={status:"success"};
  if(init?.method==="POST"&&(url.endsWith("/action")||url.endsWith("/pokebench/travel"))){const action=JSON.parse(typeof init.body==="string"?init.body:"null") as {buttons:Button[]};for(const direction of action.buttons)state=step(state,direction);}
  if(init?.method==="POST"&&url.endsWith("/pokebench/stride")){plan=JSON.parse(typeof init.body==="string"?init.body:"null") as StridePlan;state=step({...state,position:plan.path.at(-1)??state.position},"RIGHT");}
  if(url.endsWith("/pokebench/state"))body=state;
  else if(url.endsWith("/pokebench/observation"))body={state,state_text:"field",screenshot_base64:png.toString("base64")};
  else if(url.endsWith("/queue_status"))body={queue_empty:true};
  else if(url.includes("/pokebench/stride/")&&plan!==undefined)body={...plan,automatic_running:false,completed:plan.path.length,frames:20,reason:"completed",stopped:true};
  return Promise.resolve(new Response(JSON.stringify(body)));
 });
 return {fetchFn,hooks:{beforePress:vi.fn(),afterPress:()=>Promise.resolve()},clock:{now:()=>0,sleep:()=>Promise.resolve()}};
}
const features=(on:boolean,extra:Record<string,boolean>={})=>({...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"navigation-tool-use-guard-v1":true,"rejected-movement-prefix-v1":true,"walkable-floor-v1":true,"map-observability-v1":true,"rotating-gate-positions-v1":true,[ID]:on,...extra});
const walked=(state:GameStateSnapshot,direction:Button,orientations:readonly number[]):GameStateSnapshot=>{
 const at=state.position;if(at===null)throw new Error("Missing position");
 return {...field(orientations,{x:at.x+(direction==="RIGHT"?1:direction==="LEFT"?-1:0),y:at.y+(direction==="DOWN"?1:direction==="UP"?-1:0)},direction.toLowerCase())};
};
const text=(result:{content:readonly {type:string;text?:string}[]})=>result.content.map(part=>part.text??"").join("\n");
const pressLine=(result:{content:readonly {type:string;text?:string}[]})=>/^Press result: (.*)$/m.exec(text(result))?.[1];

it("production wiring: a walking batch reports the turn on an earlier step on its last press line",async()=>{
 // 5f0f turn 1960: the gate turned on an early step of RIGHT, RIGHT, UP and the last step was a refused UP.
 const script=(on:boolean)=>{const s=server(field([0,0],{x:0,y:5}),(state,direction)=>direction==="UP"?{...state,facing:"up"}:walked(state,direction,[1,0]));return pressTool("http://game",s.hooks,s.fetchFn,s.clock,toolSwitches(features(on))).execute("model",{buttons:["RIGHT","RIGHT","UP"]});};
 const on=await script(true);
 expect(pressLine(on)).toBe("turned right -> up; no net movement; gates by step: step 1 RIGHT: Gate 0 turned 90 degrees clockwise (arms north, south -> east, west); step 3 UP: Gate 0's arm between (2,4) and (2,5) did not turn; no gate turned on the other steps");
 expect(pressLine(await script(false))).toBe("turned right -> up; no net movement");
});

it("production wiring: two pushes that cancel inside one batch are both reported",async()=>{
 const orientations=[[1,0],[0,0]];let press=0;
 const s=server(field([0,0],{x:1,y:5}),(state,direction)=>walked(state,direction,orientations[press++]??[0,0]));
 const out=await pressTool("http://game",s.hooks,s.fetchFn,s.clock,toolSwitches(features(true))).execute("model",{buttons:["RIGHT","LEFT"]});
 expect(pressLine(out)).toBe("moved (2,5) -> (1,5); gates by step: step 1 RIGHT: Gate 0 turned 90 degrees clockwise (arms north, south -> east, west); step 2 LEFT: Gate 0 turned 90 degrees counterclockwise (arms east, west -> north, south)");
});

it("production wiring: a single press and a raw batch carry the note, off carries none",async()=>{
 const single=(on:boolean)=>{const s=server(field([0,0]),(state,direction)=>walked(state,direction,[1,0]));return pressTool("http://game",s.hooks,s.fetchFn,s.clock,toolSwitches(features(on))).execute("model",{buttons:["UP"]});};
 expect(pressLine(await single(true))).toBe("moved (2,5) -> (2,4); Gate 0 turned 90 degrees clockwise (arms north, south -> east, west)");
 expect(pressLine(await single(false))).toBe("moved (2,5) -> (2,4)");
 const s=server(field([0,0]),(state,direction)=>walked(state,direction,[1,0]));
 const raw=await pressTool("http://game",s.hooks,s.fetchFn,s.clock,toolSwitches(features(true,{"navigation-tool-use-guard-v1":false,"rejected-movement-prefix-v1":false}))).execute("model",{buttons:["UP","UP"]});
 expect(pressLine(raw)).toContain("across this batch, Gate 0 turned 90 degrees clockwise");
});

it("production wiring: a checked stride is a net comparison, and navigate_to's checked press carries no note",async()=>{
 const s=server(field([0,0],{x:0,y:5}),state=>({...state,map_observation:observed([1,0])}));
 const stride=await pressTool("http://game",s.hooks,s.fetchFn,s.clock,toolSwitches(features(true,{"rejected-movement-prefix-v1":false,"safe-navigation-strides-v1":true,"rejected-movement-stride-v1":true}))).execute("model",{buttons:["RIGHT","RIGHT"]});
 expect(text(stride)).toContain("across this batch, Gate 0 turned 90 degrees clockwise");
 const n=server(field([0,0]),(state,direction)=>walked(state,direction,[0,0]));
 const checked=await pressTool("http://game",n.hooks,n.fetchFn,n.clock,toolSwitches(features(true))).executeChecked("nav",{buttons:["UP"]},()=>undefined);
 expect(pressLine(checked)).toBe("moved (2,5) -> (2,4)");
});
