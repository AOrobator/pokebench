import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {Button} from "./events.js";
import {semanticNavigation,type FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import {directionalWarpActivation,elevationsMatch,gatedState,GOAL_ONLY_BEHAVIORS,isCheckedNavigation,isSurfing,matchingTriggers,planNavigation,plannedArrivalElevation,plannedWarpElevation,surfLaunch,waterReason,withClimb,type CheckedNavigationTool,type NavigationMode,type NavigationOptions} from "./navigation.js";
import {warpsOf} from "./exit-history.js";
import {exitReach} from "./surf-gate.js";
import {COUNTER} from "./tile-rules.js";
import {CONFIRM_ARG,SIGHT_STATUS,TARGET_CONFIRM_DESCRIPTION,TARGET_SIGHT_TOOL_SENTENCE} from "./trainer-sight.js";
import {INTERCEPT_MAX_FRAMES,sameTile,type PatrolStep} from "./intercept.js";

const MapId=Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]);
const ObjectTarget=Type.Object({kind:Type.Literal("object"),local_id:Type.Integer({minimum:0,maximum:255})},{additionalProperties:false});
const FixedTarget=Type.Object({kind:Type.Literal("interaction"),interaction_kind:Type.String({minLength:1,pattern:"^(?!(?:object|warp)$).+$"}),x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0})},{additionalProperties:false});
const WarpTarget=Type.Object({kind:Type.Literal("warp"),x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0})},{additionalProperties:false});
const ConnectionTarget=Type.Object({kind:Type.Literal("connection"),direction:Type.Enum(["NORTH","SOUTH","EAST","WEST"] as const)},{additionalProperties:false});
const Target=Type.Union([ObjectTarget,FixedTarget,WarpTarget,ConnectionTarget]);
const StaticObjectTarget=Type.Object({kind:Type.Literal("static_object"),local_id:Type.Integer({minimum:1,maximum:254})},{additionalProperties:false});
const StaticTarget=Type.Union([ObjectTarget,FixedTarget,WarpTarget,ConnectionTarget,StaticObjectTarget]);
const StaticSemanticArgs=Type.Object({map_id:MapId,target:StaticTarget},{additionalProperties:false});
const StaticSightSemanticArgs=Type.Object({map_id:MapId,target:StaticTarget,[CONFIRM_ARG]:Type.Optional(Type.Boolean({description:TARGET_CONFIRM_DESCRIPTION}))},{additionalProperties:false});
const SemanticArgs=Type.Object({map_id:MapId,target:Target},{additionalProperties:false});
// trainer-sight-check-v2: the confirm argument for a route trainer-sight-check-v1's check refused.
const SightSemanticArgs=Type.Object({map_id:MapId,target:Target,[CONFIRM_ARG]:Type.Optional(Type.Boolean({description:TARGET_CONFIRM_DESCRIPTION}))},{additionalProperties:false});
type SemanticRequest={readonly map_id:readonly [number,number];readonly target:RequestTarget;readonly confirm_trainer_sight?:boolean};
const ExploreArgs=Type.Object({},{additionalProperties:false});

type SnapshotTarget=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
type RequestTarget=
 | {readonly kind:"object";readonly local_id:number}
 | {readonly kind:"static_object";readonly local_id:number}
 | {readonly kind:"interaction";readonly interaction_kind:string;readonly x:number;readonly y:number}
 | {readonly kind:"warp";readonly x:number;readonly y:number}
 | {readonly kind:"connection";readonly direction:"NORTH"|"SOUTH"|"EAST"|"WEST"};
type Point={readonly x:number;readonly y:number};
const tileAt=(p:Point):string=>`(${String(p.x)},${String(p.y)})`;
type Approach={readonly point:Point;readonly facing:Button|null;readonly length:number};
type RefusalDetail={readonly cause:string;readonly alternatives:readonly string[]};
type SemanticDetails={readonly state:GameStateSnapshot;readonly semantic_navigation:{readonly status:string;readonly selected:string;readonly activation_attempted:boolean;readonly target:RequestTarget;readonly refused?:boolean;readonly refusal?:RefusalDetail};readonly [key:string]:unknown};
class SemanticPreconditionError extends Error {}
const STEPS:readonly [Button,number,number][]=[["UP",0,-1],["DOWN",0,1],["LEFT",-1,0],["RIGHT",1,0]];
const EDGE_BUTTON:Readonly<Record<"NORTH"|"SOUTH"|"EAST"|"WEST",Button>>={NORTH:"UP",SOUTH:"DOWN",EAST:"RIGHT",WEST:"LEFT"};

function navigationOptions(features:FeatureSet):NavigationOptions {
 const mode:NavigationMode=features["full-map-navigation-v1"]?"full":features["visited-terrain-navigation-v1"]?"visited":"local";
 return {zeroPads:features["navigator-elevation-zero-pads-v1"],mode,ledges:features["ledge-hops-v1"],oneWay:features["one-way-tiles-v1"],grassCost:features["grass-cost-navigation-v1"],floor:features["walkable-floor-v1"],elevation:features["elevation-transitions-v1"]?"game":"legacy",...(features["field-move-gates-v1"]?{slopes:true}:{}),...(features["warp-target-navigation-v1"]?{goalOnly:true}:{}),...(features["surf-navigation-v1"]?{surf:true}:{})};
}
function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))throw new Error("Semantic navigation result lacks verified state");
 return parseGameState(details.state);
}
function navigationStatus(result:AgentToolResult<unknown>):string|null {
 const details=result.details;
 if(typeof details!=="object"||details===null||!("navigation" in details))return null;
 const navigation=details.navigation;
 return typeof navigation==="object"&&navigation!==null&&"status" in navigation&&typeof navigation.status==="string"?navigation.status:null;
}
function navigationActivationAttempted(result:AgentToolResult<unknown>):boolean {
 const details=result.details;if(typeof details!=="object"||details===null||!("navigation" in details))return false;
 const navigation=details.navigation;return typeof navigation==="object"&&navigation!==null&&"activation_attempted" in navigation&&navigation.activation_attempted===true;
}
function navigationGoalEntryAttempted(result:AgentToolResult<unknown>):boolean {
 const details=result.details;if(typeof details!=="object"||details===null||!("navigation" in details))return false;
 const navigation=details.navigation;return typeof navigation==="object"&&navigation!==null&&"goal_entry_attempted" in navigation&&navigation.goal_entry_attempted===true;
}
function navigationGoalEntryActivation(result:AgentToolResult<unknown>):Button|"step"|null {
 const details=result.details;if(typeof details!=="object"||details===null||!("navigation" in details))return null;
 const navigation=details.navigation;if(typeof navigation!=="object"||navigation===null||!("goal_entry_activation" in navigation))return null;
 const activation=navigation.goal_entry_activation;
 return activation==="step"||activation==="UP"||activation==="DOWN"||activation==="LEFT"||activation==="RIGHT"?activation:null;
}
function navigationCommands(result:AgentToolResult<unknown>):number {
 const details=result.details;if(typeof details!=="object"||details===null||!("navigation" in details))return 0;
 const navigation=details.navigation;return typeof navigation==="object"&&navigation!==null&&"commands" in navigation&&typeof navigation.commands==="number"?navigation.commands:0;
}
function navigationStopRequested(result:AgentToolResult<unknown>):boolean {
 const details=result.details;if(typeof details!=="object"||details===null||!("navigation" in details))return false;
 const navigation=details.navigation;return typeof navigation==="object"&&navigation!==null&&"stop_requested" in navigation&&navigation.stop_requested===true;
}
function navigationCanContinue(status:string|null):boolean {
 return status?.startsWith("command limit")===true||status?.startsWith("planned route-step budget reached")===true;
}
function movementActivated(target:SnapshotTarget):boolean {
 return target.activation==="step"||target.activation.startsWith("movement");
}
function interrupted(state:GameStateSnapshot):string|null {
 if(state.in_battle)return "battle began";
 if(state.screen!=="overworld")return `screen changed to ${state.screen}`;
 if(state.world_context?.message!=null||Boolean(state.world_context?.dialogue))return "dialogue or a field message opened";
 if(state.active_ui!=null)return `interface ${state.active_ui.phase} opened`;
 if(state.field_controls_locked===true)return "a script or forced field action took control";
 if(state.field_controls_locked!==false)return "field-control ownership became unavailable";
 if(state.running?.controllable===false)return `native field input is not controllable (${state.running.reason})`;
 if(state.running!==null&&state.running!==undefined&&state.running.controllable!==true)return `native field input ownership is unavailable (${state.running.reason})`;
 return null;
}
function targetKey(map:readonly number[],target:RequestTarget):string {
 const head=`${String(map[0])}/${String(map[1])}:`;
 if(target.kind==="static_object")return `${head}static_object:${String(target.local_id)}`;
 if(target.kind==="object")return `${head}object:${String(target.local_id)}`;
 if(target.kind==="connection")return `${head}connection:${target.direction}`;
 return `${head}${target.kind}:${target.kind==="interaction"?target.interaction_kind:"warp"}:${String(target.x)},${String(target.y)}`;
}
function label(target:RequestTarget):string {
 if(target.kind==="static_object")return `static map object template ${String(target.local_id)}`;
 if(target.kind==="object")return `map object ${String(target.local_id)}`;
 if(target.kind==="connection")return `${target.direction} map connection`;
 if(target.kind==="warp")return `warp at (${String(target.x)},${String(target.y)})`;
 return `${target.interaction_kind.replaceAll("_"," ")} at (${String(target.x)},${String(target.y)})`;
}
// navigator-elevation-zero-pads-v1: whether the navigator's lookup finds this warp from this state.
export function navigatorTakesWarp(state:GameStateSnapshot,x:number,y:number,features:FeatureSet):boolean {
 return resolve(state,{kind:"warp",x,y},navigationOptions(features))!==null;
}
function resolve(state:GameStateSnapshot,target:RequestTarget,options:NavigationOptions):SnapshotTarget|null {
 if(target.kind==="static_object")return null;
 const listed=state.interaction_targets??[];
 if(target.kind==="object")return listed.find(item=>item.kind==="object"&&item.local_id===target.local_id)??null;
 if(target.kind==="connection")return null;
 if(target.kind==="interaction"&&(target.interaction_kind==="object"||target.interaction_kind==="warp"))return null;
 if(target.kind==="warp"){
  // Emerald GetWarpEventAtPosition keeps scanning and returns the first warp at
  // the coordinate whose elevation matches the player or is the transition wildcard.
  // A blocked remainder has no arrival path, so the player's current elevation
  // still identifies the event; it does not make the warp disappear.
  const here=state.position;
  const standing=here===null?undefined:state.navigation_grid?.tiles.find(tile=>tile.x===here.x&&tile.y===here.y)?.elevation??state.navigation_grid?.elevation??state.map_grid?.elevation;
  const elevation=(options.zeroPads===true?plannedWarpElevation:plannedArrivalElevation)(state,{x:target.x,y:target.y},options)??standing??null;
  if(elevation===null)return null;
  // navigator-elevation-zero-pads-v1: on an elevation-0 tile the previous elevation is not known here, so it cannot rule a warp out.
  const found=listed.find(item=>item.kind==="warp"&&item.x===target.x&&item.y===target.y&&(item.elevation===0||item.elevation===elevation||options.zeroPads===true&&elevation===0))??null;
  // An enrolled pad resolves canonically from the map's records, never from whichever source happens
  // to list it this read: navigate_to_target re-resolves before every step, and a target that flips
  // between the synthetic and the listed record reads as "changed during travel" mid-walk.
  const advertised=options.goalOnly===true?advertisedWarp(state,{x:target.x,y:target.y},options):null;
  return advertised??found;
 }
 return listed.find(item=>item.kind===target.interaction_kind&&item.x===target.x&&item.y===target.y)??null;
}
function sameTargetIdentity(before:SnapshotTarget,after:SnapshotTarget):boolean {
 if(before.kind!==after.kind||before.x!==after.x||before.y!==after.y)return false;
 if(before.kind==="object")return before.local_id===after.local_id&&before.elevation===after.elevation;
 if(before.kind!=="warp")return before.elevation===after.elevation&&before.activation===after.activation&&before.facing===after.facing;
 const a=before.destination,b=after.destination;
 return before.activation===after.activation&&before.elevation===after.elevation&&(a===null?b===null:b!==null&&a[0]===b[0]&&a[1]===b[1]&&a[2]===b[2]);
}
function tileBehavior(state:GameStateSnapshot,point:Point,mode:NavigationMode|undefined):number|null {
 if(mode==="full"){
  const grid=state.map_grid;if(grid===null||grid===undefined||point.x<0||point.y<0||point.x>=grid.width||point.y>=grid.height)return null;
  const cell=grid.rows[point.y]?.slice(point.x*4,point.x*4+4)??"";return /^[0-9a-f]{4}$/.test(cell)?Number.parseInt(cell,16)&0xff:null;
 }
 return state.navigation_grid?.tiles.find(tile=>tile.x===point.x&&tile.y===point.y)?.behavior??null;
}
// warp-target-navigation-v1: the untried-exits line is built from the map's warp records, while
// interaction_targets only carries what this observation happened to resolve. Run
// 2026-11-01T09-10-00_deepseek-v4.1-flash_control24h hit that gap seven times: the readout offered a
// handle for a pad one to three tiles away and the tool answered "not listed in the current verified
// state". An advertised warp therefore resolves from the grid's warp records when its tile is an
// enrolled step-on pad. The destination stays unknown: the record carries no landing coordinate.
// The full grid encodes elevation in the cell above the behaviour byte; the local grid carries it
// as a field. Both are the tile's own elevation, which is what keeps an enrolled pad's identity
// stable across the re-resolve that navigate_to performs before every step.
function tileElevation(state:GameStateSnapshot,point:Point,mode:NavigationOptions["mode"],fallback:number):number {
 if(point.x<0||point.y<0)return fallback;
 if(mode==="full"){
  const cell=state.map_grid?.rows[point.y]?.slice(point.x*4,point.x*4+4)??"";
  return /^[0-9a-f]{4}$/.test(cell)?(Number.parseInt(cell,16)>>8)&0xf:fallback;
 }
 return state.navigation_grid?.tiles.find(tile=>tile.x===point.x&&tile.y===point.y)?.elevation??fallback;
}
function advertisedWarp(state:GameStateSnapshot,point:Point,options:NavigationOptions):SnapshotTarget|null {
 const mode=options.mode??"local";
 const grid=mode==="full"?state.map_grid:state.navigation_grid;
 if(grid===null||grid===undefined)return null;
 if(!grid.warps.some(warp=>warp.x===point.x&&warp.y===point.y))return null;
 const behavior=tileBehavior(state,point,mode);
 if(behavior===null||!GOAL_ONLY_BEHAVIORS.has(behavior))return null;
 // The tile's own elevation, not the arrival elevation of the current plan: navigate_to_target
 // re-resolves the target before every step, so an elevation that tracked the walker would be
 // reported as "semantic target changed during travel" one step short of the pad.
 const elevation=tileElevation(state,point,mode,grid.elevation);
 return {name:null,kind:"warp",x:point.x,y:point.y,elevation,activation:"step",availability:"conditional",facing:null,local_id:null,destination:null};
}
function goalOnlyTile(state:GameStateSnapshot,point:Point,options:NavigationOptions):boolean {
 const behavior=tileBehavior(state,point,options.mode);
 return behavior!==null&&options.goalOnly===true&&GOAL_ONLY_BEHAVIORS.has(behavior);
}
function interactionRecipient(state:GameStateSnapshot,target:SnapshotTarget,approach:Approach,options:NavigationOptions):SnapshotTarget|null {
 const elevation=plannedArrivalElevation(state,approach.point,options);if(elevation===null)return null;
 if(target.kind==="warp"){
  const found=(state.interaction_targets??[]).find(item=>item.kind==="warp"&&item.x===target.x&&item.y===target.y&&(item.elevation===0||item.elevation===elevation))??null;
  return (options.goalOnly===true?advertisedWarp(state,{x:target.x,y:target.y},options):null)??found;
 }
 if(target.activation!=="A")return target;
 const slots=state.interaction_object_slots;if(slots===undefined)return null;
 const step=STEPS.find(([button])=>button===approach.facing);if(step===undefined)return null;
 const front={x:approach.point.x+step[1],y:approach.point.y+step[2]};
 const first=slots.find(item=>item.x===front.x&&item.y===front.y&&elevationsMatch(item.elevation,elevation));
 const beyond={x:front.x+step[1],y:front.y+step[2]};
 const beyondFirst=tileBehavior(state,front,options.mode)===COUNTER?slots.find(item=>item.x===beyond.x&&item.y===beyond.y&&elevationsMatch(item.elevation,elevation)):undefined;
 const native=first!==undefined&&first.local_id!==0xff?first:beyondFirst!==undefined&&beyondFirst.local_id!==0xff?beyondFirst:undefined;
 if(target.kind==="object"){
  return native!==undefined&&native.x===target.x&&native.y===target.y&&target.native_slot!==undefined&&native.slot===target.native_slot&&native.local_id===target.local_id&&native.map_id[0]===state.map_id?.[0]&&native.map_id[1]===state.map_id[1]?target:null;
 }
 // Native object lookup precedes background and metatile lookup. Conservatively
 // refuse a fixed target whenever any active slot would be selected there.
 if(native!==undefined)return null;
 const candidates=(state.interaction_targets??[]).filter(item=>item.x===target.x&&item.y===target.y&&item.activation==="A"&&item.kind!=="object"&&item.kind!=="warp"&&(item.elevation===0||item.elevation===elevation));
 const fixed=candidates;if(fixed.length!==1)return null;
 const facing=approach.facing?.toLowerCase()??null;
 const recipient=fixed[0];return recipient!==undefined&&(recipient.facing===null||recipient.facing===facing)?recipient:null;
}
function approaches(state:GameStateSnapshot,target:SnapshotTarget,options:NavigationOptions):Approach[] {
 if(target.kind==="warp"||target.activation==="step"){
  const path=planNavigation(state,{x:target.x,y:target.y},options);
  if(path===null)return [];
  const approach={point:{x:target.x,y:target.y},facing:null,length:path.length};
  const recipient=interactionRecipient(state,target,approach,options);
  return recipient!==null&&sameTargetIdentity(target,recipient)?[approach]:[];
 }
 const ordinary=STEPS.flatMap(([facing,dx,dy])=>{
  if(target.facing!==null&&target.facing!==facing.toLowerCase())return [];
  const point={x:target.x-dx,y:target.y-dy};
  // A step-on pad is a goal, never a place to stand while pressing something else.
  if(goalOnlyTile(state,point,options))return [];
  const path=planNavigation(state,point,options);
  if(path===null)return [];
  const elevation=plannedArrivalElevation(state,point,options);
  if(elevation===null||!elevationsMatch(target.elevation,elevation))return [];
  const approach={point,facing,length:path.length};
  const recipient=interactionRecipient(state,target,approach,options);
  return target.activation==="A"&&(recipient===null||!sameTargetIdentity(target,recipient))?[]:[approach];
 });
 const counters=target.kind!=="object"?[]:STEPS.flatMap(([facing,dx,dy])=>{
  const counter={x:target.x-dx,y:target.y-dy};if(tileBehavior(state,counter,options.mode)!==COUNTER)return [];
  const point={x:counter.x-dx,y:counter.y-dy};
  if(goalOnlyTile(state,point,options))return [];
  const path=planNavigation(state,point,options);if(path===null)return [];
  const elevation=plannedArrivalElevation(state,point,options);if(elevation===null||!elevationsMatch(target.elevation,elevation))return [];
  const approach={point,facing,length:path.length},recipient=interactionRecipient(state,target,approach,options);
  return recipient!==null&&sameTargetIdentity(target,recipient)?[approach]:[];
 });
 return [...ordinary,...counters].sort((a,b)=>a.length-b.length||a.point.y-b.point.y||a.point.x-b.point.x||a.facing.localeCompare(b.facing));
}
// surf-navigation-v1: a surfer can also cross a map edge from water; the server lists those tiles separately.
function edgeTiles(state:GameStateSnapshot,connection:NonNullable<GameStateSnapshot["topology"]>["connections"][number]|undefined,options:NavigationOptions):readonly {readonly x:number;readonly y:number}[] {
 const edges=connection?.edges??[];
 if(options.surf!==true||!isSurfing(state))return edges;
 return [...edges,...(connection?.water_edges??[]).filter(w=>!edges.some(e=>e.x===w.x&&e.y===w.y))];
}
function connectionApproaches(state:GameStateSnapshot,target:Extract<RequestTarget,{kind:"connection"}>,options:NavigationOptions):Approach[] {
 const connection=state.topology?.connections.find(item=>item.direction===target.direction);
 return edgeTiles(state,connection,options).flatMap(point=>{const path=planNavigation(state,point,options);return path===null?[]:[{point,facing:EDGE_BUTTON[target.direction],length:path.length}];})
  .sort((a,b)=>a.length-b.length||a.point.y-b.point.y||a.point.x-b.point.x);
}
// moving-npc-intercept-v1: a place to stand beside a watched walk, and the step into it. The game
// pins a walk-sequence object whose next tile is taken (event_object_movement.c
// MoveNextDirectionInSequence walks in place on collision), so stepping onto the tile the person is
// about to enter stops them next to the player. Only the observed steps and the map's walkability
// decide; no place or person is named.
export interface PathStepIn {readonly wait:Point;readonly enter:Point;readonly approach:Point;readonly elevation:number;readonly length:number}
export function pathStepIn(state:GameStateSnapshot,steps:readonly PatrolStep[],options:NavigationOptions):PathStepIn|null {
 const track=steps.flatMap(step=>[step.from,step.to]);
 const onTrack=(point:Point):boolean=>track.some(tile=>sameTile(tile,point));
 const choices=steps.flatMap(step=>STEPS.flatMap(([,dx,dy])=>{
  const wait={x:step.to.x+dx,y:step.to.y+dy};
  if(onTrack(wait)||goalOnlyTile(state,wait,options))return [];
  const path=planNavigation(state,wait,options);
  if(path===null)return [];
  const elevation=plannedArrivalElevation(state,wait,options);
  if(elevation===null||elevation<1||elevation>14)return [];
  return [{wait,enter:step.to,approach:step.from,elevation,length:path.length}];
 }));
 return choices.sort((a,b)=>a.length-b.length||a.wait.y-b.wait.y||a.wait.x-b.wait.x||a.enter.y-b.enter.y||a.enter.x-b.enter.x)[0]??null;
}
export const PATH_STEP_IN_SENTENCE="When the selected person keeps walking the same path, it first watches their steps without pressing anything, waits on a free tile beside that path, steps into the path just before they reach it so they stop, then faces them and presses A.";

function withStatus(result:AgentToolResult<unknown>,status:string,selected:string,target:RequestTarget,activationAttempted:boolean,refusal?:RefusalDetail|null):AgentToolResult<SemanticDetails> {
 const state=stateOf(result);
 const inherited=typeof result.details==="object"&&result.details!==null?result.details:{};
 const verdict=refusal===undefined||refusal===null?{}:{refused:true,refusal:{cause:refusal.cause,alternatives:[...refusal.alternatives]}};
 return {...result,content:[{type:"text",text:`Semantic navigation: ${status}. Selected ${selected}.`},...result.content],details:{...inherited,state,semantic_navigation:{status,selected,activation_attempted:activationAttempted,target,...verdict}}};
}

// semantic-refusal-reasons-v1: a refusal names the cause and the exits that do work, as navigate_to
// does. Before it printed one sentence - "no supported route to a valid approach" - so a model facing a
// sealed door could only re-ask the same target; the 2026-11-02 run asked six times in eight turns.
function refusalDetail(before:GameStateSnapshot,target:RequestTarget,plan:NavigationOptions,features:FeatureSet):RefusalDetail|null {
 if(!features["semantic-refusal-reasons-v1"])return null;
 const here=before.position;
 if(here===null)return null;
 const where=(x:number,y:number):string=>`(${String(x)},${String(y)})`;
 const block=exitReach(features,before);
 const cutOf=(x:number,y:number)=>block.warpCut(x,y);
 let cause:string;
 if(target.kind==="warp"){
  const cut=cutOf(target.x,target.y);
  cause=cut==="none"?`${where(target.x,target.y)} cannot be walked to from ${where(here.x,here.y)} on foot or across water, so no route on this map reaches it`
   :cut==="water"?`${where(target.x,target.y)} is across water you cannot cross from ${where(here.x,here.y)}`
   :`no walkable route on this map leads from ${where(here.x,here.y)} to ${where(target.x,target.y)}`;
 }else if(target.kind==="connection"){
  const connection=before.topology?.connections.find(item=>item.direction===target.direction);
  const cut=connection===undefined?null:block.connectionCut({direction:connection.direction,destination:connection.destination,offset:connection.offset});
  cause=cut==="none"?`no walkable way on this map leads from ${where(here.x,here.y)} to the ${target.direction} edge, on foot or across water`
   :cut==="water"?`the ${target.direction} edge is across water you cannot cross from ${where(here.x,here.y)}`
   :`no walkable route on this map leads from ${where(here.x,here.y)} to the ${target.direction} edge`;
 }else{
  cause=`no walkable route on this map leads from ${where(here.x,here.y)} to a tile next to it`;
 }
 const alternatives=warpsOf(before)
  .filter(warp=>cutOf(warp.x,warp.y)===null)
  .map(warp=>({warp,steps:(planNavigation(before,{x:warp.x,y:warp.y},plan)??[]).length}))
  .filter(({steps})=>steps>0)
  .sort((a,b)=>a.steps-b.steps||a.warp.y-b.warp.y||a.warp.x-b.warp.x)
  .slice(0,3)
  .map(({warp,steps})=>`${where(warp.x,warp.y)} (${String(steps)} steps) into map ${String(warp.destination[0])}/${String(warp.destination[1])}`);
 return {cause,alternatives};
}
function isMap(state:GameStateSnapshot,map:readonly [number,number]):boolean{return state.map_id?.[0]===map[0]&&state.map_id[1]===map[1];}
function isDestinationMap(state:GameStateSnapshot,destination:readonly number[]|null|undefined):boolean{const map=state.map_id;return destination!==null&&destination!==undefined&&map!==null&&map[0]===destination[0]&&map[1]===destination[1];}

// field-ownership-feedback-v1: navigate_to's refusal reasons (navigation.ts unreadyReason), with a screen that is not a
// battle screen named before the battle flag: gMain.inBattle stays set through a post-battle evolution (TryEvolvePokemon
// runs before ReturnFromBattleToOverworld), so in_battle is true while the evolution screen owns input.
export function fieldOwner(state:GameStateSnapshot):string|null {
 const battleScreen=state.screen==="battle"||state.screen.startsWith("battle_");
 if(!state.started)return "the game has not started yet; navigate_to_target walks only on the field";
 if(state.screen!=="overworld"&&!battleScreen)return `the game is not on the field (screen: ${state.screen}); navigate_to_target walks only on the field`;
 if(state.in_battle)return "a battle is in progress; navigate_to_target walks only on the field";
 if(state.screen!=="overworld")return `the game is not on the field (screen: ${state.screen}); navigate_to_target walks only on the field`;
 const ui=state.active_ui;
 return ui==null?null:`a menu or other interface is open (${ui.phase}); close it before calling navigate_to_target`;
}

// semantic-navigation-v2: how to copy a target from the readout, and what happens after activation.
const SEMANTIC_V2_DESCRIPTION="The way to reach a person, object, door, stairs, other warp or walking map exit that the readout lists with a navigate_to_target target: it walks there, faces it and talks to it, uses it or goes through it, once. Pass the current map_id and the target exactly as the readout writes it after \"navigate_to_target target\". The harness chooses the reachable approach and continues progress-making route segments without an end-to-end command cap. It returns control immediately if a battle, a menu, a script, forced movement, a map transition or unavailable input interrupts travel, and says why when it refuses or stops early. For anything without a navigate_to_target target, use navigate_to.";

export const MOVING_NPC_SENTENCE="For a loaded NPC selected by object local_id, navigate_to_target walks toward its verified current position one bounded movement action at a time (the NPC moving to another tile during a step does not cancel that step), then faces it and presses A once. When the player is already on a tile that remains a valid approach for the NPC's new tile, it stays and re-faces or retries A instead of walking away. This path returns after at most 32 movement, facing or activation attempts, including changed-state retries, or earlier if identity, field control or a supported route becomes unavailable.";
export const STATIC_NPC_APPROACH_SENTENCE="For a static scripted object template listed in current-map native facts, pass target kind static_object with its local_id. This approaches only: current presence and position are unverified, scripts may relocate it, and the tool returns without facing or pressing A even if the object has loaded. No automatic field or battle text is advanced.";
export const NPC_TEMPLATE_APPROACH_SENTENCE="Exception for an explicitly requested unloaded trainer listed in current-map trainer facts: navigate_to_target may approach its template tile, then returns without facing or pressing A. The template may have moved; inspect the current returned state before choosing an interaction.";
const SEMANTIC_V2_DIALOGUE=" Dialogue the activation opens is advanced for you as with navigate_to.";
// The dialogue sentence is true only with dialogue auto-advance on.
function semanticV2Description(dialogue:boolean):string {
 const cut=SEMANTIC_V2_DESCRIPTION.indexOf(" It returns control immediately");
 return dialogue?`${SEMANTIC_V2_DESCRIPTION.slice(0,cut)}${SEMANTIC_V2_DIALOGUE}${SEMANTIC_V2_DESCRIPTION.slice(cut)}`:SEMANTIC_V2_DESCRIPTION;
}
function semanticTool(navigate:CheckedNavigationTool,press:CheckedPressTool,features:FeatureSet,stateSource:StateSource,observe?:AgentTool):AgentTool<typeof SemanticArgs|typeof StaticSemanticArgs|typeof SightSemanticArgs|typeof StaticSightSemanticArgs> {
 const baseOptions=navigationOptions(features);
 // Script-trigger boundary: prefer approach tiles no matching coordinate script sits on, and fall back to
 // ignoring them when every approach crosses one. The walk does the same, and there is no switch for either:
 // a refusal here would dead-end the agent on a route it is not allowed to take.
 const scriptBoundary=features["navigation-truth-v1"]&&features["coordinate-script-conditions-v1"];
 // trainer-sight-check-v2: navigate_to_target's first walk gets trainer-sight-check-v1's check.
 const sightCheck=features["trainer-sight-check-v1"]&&features["trainer-sight-check-v2"];
 const executePress=(id:string,button:Button,check:(state:GameStateSnapshot|undefined)=>void,signal?:AbortSignal):Promise<AgentToolResult<unknown>>=>press.executeChecked(id,{buttons:[button]},check,signal,undefined,{automaticRunning:false});
 const followObject=async(id:string,request:SemanticRequest,initial:SnapshotTarget,before:GameStateSnapshot,signal?:AbortSignal):Promise<AgentToolResult<unknown>>=>{
  const selected=label(request.target),moved="moving target position changed before input";
  let last:AgentToolResult<unknown>={content:[],details:{state:before}};
  type BurstImage={readonly type:"image";readonly data:string;readonly mimeType:string};
  const burst:BurstImage[]=[];
  const capture=async():Promise<void>=>{
   if(!features["moving-npc-frame-burst-v1"]||observe===undefined||burst.length>=6)return;
   const shot=await observe.execute(`${id}-npc-burst-${String(burst.length)}`,{},signal);
   for(const part of shot.content){
    if(part.type==="image"&&"data" in part&&typeof part.data==="string"){
     burst.push({type:"image",data:part.data,mimeType:typeof part.mimeType==="string"?part.mimeType:"image/png"});
     break;
    }
   }
  };
  const notes:string[]=[];
  const finish=(status:string,attempted=false)=>{
   const base=withStatus(last,status,selected,request.target,attempted);
   if(notes.length===0)return burst.length===0?base:{...base,content:[...burst,...base.content]};
   // Dialogue auto-advance keeps only the first content part of a semantic walk, so the step-in notes
   // ride in the status text and go before any burst frames.
   const [head,...rest]=base.content;
   const line=head?.type==="text"?head.text:"";
   return {...base,content:[{type:"text" as const,text:`${line}\n${notes.join("\n")}`},...burst,...rest]};
  };
  const identity=(state:GameStateSnapshot):SnapshotTarget|null=>{
   const fresh=resolve(state,request.target,baseOptions);
   return fresh?.kind==="object"&&initial.kind==="object"&&fresh.local_id===initial.local_id&&initial.native_slot!==undefined&&fresh.native_slot===initial.native_slot&&fresh.elevation===initial.elevation&&fresh.activation===initial.activation?fresh:null;
  };
  // Travel: identity and field ownership only. Coordinate drift during a step is normal for
  // patrol NPCs (Briney); aborting before input caused 0-move attempt-limit thrash.
  const stable=(actual:GameStateSnapshot):string|null=>{
   if(!isMap(actual,request.map_id))return "interrupted by a map transition";
   const reason=interrupted(actual);if(reason!==null)return `semantic navigation interrupted: ${reason}`;
   if(identity(actual)===null)return "selected moving object disappeared or changed identity";
   return null;
  };
  // moving-npc-intercept-v1: once the person is seen to have moved, watch their steps on the game
  // server and step into their path. Every failure falls back to the follow below.
  const stepIns=features["moving-npc-intercept-v1"]?press.executeWatch!==undefined&&press.executeIntercept!==undefined?2:0:0;
  let tries=0,seen:Point={x:initial.x,y:initial.y};
  const stepIn=async(current:GameStateSnapshot,fresh:SnapshotTarget):Promise<string|null>=>{
   if(press.executeWatch===undefined||press.executeIntercept===undefined||fresh.kind!=="object"||fresh.native_slot===undefined||fresh.local_id===null)return null;
   const target={target_local_id:fresh.local_id,target_slot:fresh.native_slot};
   const check=(actual:GameStateSnapshot|undefined)=>{
    if(actual===undefined)throw new SemanticPreconditionError("verified state became unavailable before input");
    const issue=stable(actual);if(issue!==null)throw new SemanticPreconditionError(issue);
   };
   const watched=await press.executeWatch({map_id:[request.map_id[0],request.map_id[1]],...target,max_frames:INTERCEPT_MAX_FRAMES},check,signal);
   if(watched.reason!=="loop closed"){notes.push(`Watched the person for ${String(watched.frames)} frames without pressing anything: ${watched.reason}; ${String(watched.edges.length)} steps seen, not a repeating path.`);return null;}
   notes.push(`Watched the person walk a repeating path of ${String(watched.edges.length)} steps without pressing anything.`);
   const options:NavigationOptions=scriptBoundary?{...baseOptions,triggers:matchingTriggers(current)}:baseOptions;
   const plan=pathStepIn(features["field-move-gates-v1"]?gatedState(current,features["surf-navigation-v1"]):current,watched.edges,options);
   if(plan===null){notes.push("No free tile beside that path can be reached on foot.");return null;}
   const here=current.position;
   if(here===null||!sameTile(here,plan.wait)){
    last=await navigate.executeChecked(id,{x:plan.wait.x,y:plan.wait.y,map_id:request.map_id},stable,signal,{exactTarget:true});
    const status=navigationStatus(last);
    if(navigationStopRequested(last)||status===SIGHT_STATUS)return status??"semantic travel stop requested";
    if(status!=="arrived at requested coordinate"){notes.push(`Could not reach ${tileAt(plan.wait)} beside the path: ${status??"route ended early"}.`);return null;}
   }
   const stepped=await press.executeIntercept(id,{map_id:[request.map_id[0],request.map_id[1]],wait:plan.wait,enter:plan.enter,approach:plan.approach,...target,elevation:plan.elevation,max_frames:INTERCEPT_MAX_FRAMES},check,signal);
   last=stepped;
   const receipt=stepped.details.intercept;
   notes.push(receipt.reason==="entered"?`Stepped into the path at ${tileAt(plan.enter)} as the person reached ${tileAt(plan.approach)}.`:`Waited at ${tileAt(plan.wait)} to step into the path at ${tileAt(plan.enter)}: ${receipt.reason}.`);
   return null;
  };
  await capture();
  for(let attempt=0;attempt<32;attempt++){
   signal?.throwIfAborted();
   const current=await stateSource.read(signal);last={...last,details:{...last.details as Record<string,unknown>,state:current}};
   if(!isMap(current,request.map_id))return finish("interrupted by a map transition");
   const interruption=interrupted(current);if(interruption!==null)return finish(`interrupted before activation: ${interruption}`);
   const fresh=identity(current);if(fresh===null)return finish("selected moving object disappeared or changed identity");
   if(tries<stepIns&&(fresh.x!==seen.x||fresh.y!==seen.y)){
    tries+=1;seen={x:fresh.x,y:fresh.y};
    try{
     const stop=await stepIn(current,fresh);
     if(stop!==null)return finish(stop);
    }catch(error){
     if(!(error instanceof SemanticPreconditionError))throw error;
     notes.push(`Stopped stepping into the path: ${error.message}.`);
    }
    // Only a new move after this try may start the next one.
    const after=identity(stateOf(last));if(after!==null)seen={x:after.x,y:after.y};
    await capture();
    continue;
   }
   seen={x:fresh.x,y:fresh.y};
   const planned=features["field-move-gates-v1"]?gatedState(current,features["surf-navigation-v1"]):current;
   let options:NavigationOptions=scriptBoundary?{...baseOptions,triggers:matchingTriggers(current)}:baseOptions;
   let choices=approaches(planned,fresh,options).filter(choice=>!scriptBoundary||choice.length===0||!options.triggers?.some(trigger=>trigger.x===choice.point.x&&trigger.y===choice.point.y&&(trigger.elevation===0||trigger.elevation===plannedArrivalElevation(planned,choice.point,options))));
   if(scriptBoundary&&choices.length===0){options={...options,triggers:[]};choices=approaches(planned,fresh,options);}
   const here=current.position;
   // Prefer staying when the current tile is still a valid approach for the NPC's new tile.
   const choice=(here===null?undefined:choices.find(c=>c.point.x===here.x&&c.point.y===here.y))??choices[0];
   if(choice===undefined)return finish("no supported route to a valid approach");
   if(here===null||here.x!==choice.point.x||here.y!==choice.point.y){
    last=await navigate.executeChecked(id,{x:choice.point.x,y:choice.point.y,map_id:request.map_id},stable,signal,{exactTarget:true,commandLimit:1,...(sightCheck?{sightCheck:{confirm:request.confirm_trainer_sight===true,exclude:fresh.local_id}}:{})});
    const status=navigationStatus(last);
    if(navigationStopRequested(last)||status===SIGHT_STATUS)return finish(status??"semantic travel stop requested");
    if(status!=="arrived at requested coordinate"&&!navigationCanContinue(status)){
     // NPC walked onto the chosen approach: plan/step refuses the occupied tile. Identity is
     // intact, so replan like a pre-input drift instead of ending the follow early.
     const occupied=status!==null&&(/person or object|cannot stand on/.test(status));
     if(occupied&&identity(await stateSource.read(signal))!==null){await capture();continue;}
     return finish(status??"route ended before the selected approach");
    }
    await capture();
    continue;
   }
   const facing=choice.facing;if(facing===null)return finish("no verified facing for the selected object");
   const button=current.facing===facing.toLowerCase()?"A":facing;
   try{
    last=await executePress(id,button,actual=>{
     if(actual===undefined)throw new SemanticPreconditionError("verified state became unavailable before input");
     const issue=stable(actual);if(issue!==null)throw new SemanticPreconditionError(issue);
     if(actual.position?.x!==choice.point.x||actual.position.y!==choice.point.y)throw new SemanticPreconditionError("semantic target approach changed before input");
     const target=identity(actual);
     if(target===null)throw new SemanticPreconditionError("selected moving object disappeared or changed identity");
     if(target.x!==fresh.x||target.y!==fresh.y)throw new SemanticPreconditionError(moved);
     // GetInteractedObjectEventScript selects the native object at the facing tile, including counters.
     const recipient=interactionRecipient(actual,target,choice,options);
     if(recipient===null||!sameTargetIdentity(target,recipient))throw new SemanticPreconditionError("semantic interaction recipient changed before input");
     if(button==="A"&&actual.facing!==facing.toLowerCase())throw new SemanticPreconditionError("player facing changed before activation");
    },signal);
   }catch(error){
    if(!(error instanceof SemanticPreconditionError))throw error;
    if(error.message===moved){await capture();continue;}
    const state=await stateSource.read(signal);last={content:[],details:{state}};return finish(error.message);
   }
   if(button==="A"){
    await capture();
    const state=stateOf(last),reason=interrupted(state);
    return finish(reason!==null?`activation handed control back: ${reason}`:!isMap(state,request.map_id)?"activation changed maps; inspect the destination":"activation completed; inspect the resulting state",true);
   }
   await capture();
  }
  const state=await stateSource.read(signal);last={...last,details:{...last.details as Record<string,unknown>,state}};
  if(!isMap(state,request.map_id))return finish("interrupted by a map transition");
  const reason=interrupted(state);if(reason!==null)return finish(`interrupted before activation: ${reason}`);
  if(identity(state)===null)return finish("selected moving object disappeared or changed identity");
  return finish("moving target attempt limit reached; inspect the current state");
 };
 return {name:"navigate_to_target",label:"Navigate to a game target",description:`${features["semantic-navigation-v2"]?semanticV2Description(features["dialogue-auto-advance-v1"]):"Select a listed person, object, warp or walking map connection by its game-owned identity. The harness chooses the reachable approach, continues progress-making route segments without an end-to-end command cap, faces the target and activates it once. It immediately returns control if battle, dialogue, a menu, a script, forced movement, a map transition or unavailable input interrupts travel."}${features["moving-npc-target-v1"]?` ${MOVING_NPC_SENTENCE}`:""}${features["moving-npc-target-v1"]&&features["moving-npc-intercept-v1"]?` ${PATH_STEP_IN_SENTENCE}`:""}${sightCheck?` ${TARGET_SIGHT_TOOL_SENTENCE}`:""}${features["npc-approach-feedback-v1"]?` ${NPC_TEMPLATE_APPROACH_SENTENCE}`:""}${features["static-npc-template-approach-v1"]?` ${STATIC_NPC_APPROACH_SENTENCE}`:""}`,parameters:features["static-npc-template-approach-v1"]?(sightCheck?StaticSightSemanticArgs:StaticSemanticArgs):(sightCheck?SightSemanticArgs:SemanticArgs),
  execute:async(id,args,signal)=>{
   const request=args as SemanticRequest;
   signal?.throwIfAborted();const before=await stateSource.read(signal),selected=label(request.target);
   const owner=features["field-ownership-feedback-v1"]&&observe!==undefined?fieldOwner(before):null;
   if(owner!==null&&observe!==undefined)return withStatus(await observe.execute(id,{},signal),`refused because ${owner}; nothing was pressed`,selected,request.target,false);
   if(!isMap(before,request.map_id)){
    const result=withStatus({content:[],details:{state:before}},"refused because the requested map is not current",selected,request.target,false);
    if(!features["semantic-current-map-feedback-v1"])return result;
    const map=before.map_id===null?"map unavailable":`map ${String(before.map_id[0])}/${String(before.map_id[1])}`;
    const position=before.position===null?"unavailable":`(${String(before.position.x)},${String(before.position.y)})`;
    return {...result,content:[{type:"text",text:`Current map: ${(features["current-map-display-name-v1"]?before.location_display:undefined)??before.location??"name unavailable"} (${map}). Position: ${position}. No input was sent.`},...result.content]};
   }
   let options:NavigationOptions=scriptBoundary?{...baseOptions,triggers:matchingTriggers(before)}:baseOptions;
   const listed=request.target.kind==="connection"?null:resolve(before,request.target,options);
   // heal_trainers._template_tile excludes hidden templates using the native hide flag.
   // Without native loaded slots there is no verified recipient for A. Approach only,
   // then yield fresh state even if this walk causes the object to load.
   if(listed===null&&((features["npc-approach-feedback-v1"]&&request.target.kind==="object")||(features["static-npc-template-approach-v1"]&&request.target.kind==="static_object"))){
    const requested=request.target.local_id;
    const staticRequest=request.target.kind==="static_object";
    const staticFacts=before.static_npc_templates;
    const staticTemplate=staticFacts?.map_id[0]===request.map_id[0]&&staticFacts.map_id[1]===request.map_id[1]?staticFacts.templates.find(t=>t.local_id===requested):undefined;
    const template=staticRequest?staticTemplate:before.heal_before_trainers?.trainers.find(t=>t.local_id===requested&&t.loaded===false);
    if(template!==undefined){
     const reason=fieldOwner(before)??interrupted(before);
     if(reason!==null)return withStatus({content:[],details:{state:before}},`template approach refused: ${reason}; nothing was pressed`,selected,request.target,false);
     const gated=features["field-move-gates-v1"]?gatedState(before,features["surf-navigation-v1"]):before;
     const reserved={x:template.x,y:template.y};
     const planned={...gated,...(gated.navigation_grid==null?{}:{navigation_grid:{...gated.navigation_grid,objects:[...gated.navigation_grid.objects,reserved]}}),...(gated.map_grid==null?{}:{map_grid:{...gated.map_grid,objects:[...gated.map_grid.objects,reserved]}})};
     const templateOptions={...options,triggers:matchingTriggers(before)};
     const candidates=STEPS.flatMap(([,dx,dy])=>{
      const point={x:template.x+dx,y:template.y+dy};
      if(point.x<0||point.y<0)return [];
      if((before.interaction_targets??[]).some(t=>t.kind==="warp"&&t.x===point.x&&t.y===point.y))return [];
      if(goalOnlyTile(planned,point,templateOptions))return [];
      if(staticRequest&&[...(planned.navigation_grid?.warps??[]),...(planned.map_grid?.warps??[])].some(w=>w.x===point.x&&w.y===point.y))return [];
      if(staticRequest&&(before.world_context?.triggers??[]).some(t=>t.x===point.x&&t.y===point.y))return [];
      const path=planNavigation(planned,point,templateOptions);
      if(path!==null&&staticRequest&&staticTemplate!==undefined){const elevation=plannedArrivalElevation(planned,point,templateOptions);if(elevation===null||!elevationsMatch(staticTemplate.elevation,elevation))return [];}
      return path===null?[]:[{point,length:path.length}];
     }).sort((a,b)=>a.length-b.length||a.point.y-b.point.y||a.point.x-b.point.x);
     const choice=candidates[0];
     const qualification=`object ${String(requested)} template tile; current presence and position are unverified (it may have moved). No interaction is attempted; inspect the returned current state`;
     if(choice===undefined)return withStatus({content:[],details:{state:before}},`${qualification}; no supported route to an adjacent tile`,selected,request.target,false);
     const stop=(actual:GameStateSnapshot):string|null=>{
      if(!isMap(actual,request.map_id))return "map changed during template approach";
      const interruptedReason=interrupted(actual);if(interruptedReason!==null)return interruptedReason;
      if(staticRequest){
       if((actual.world_context?.triggers??[]).some(t=>t.x===choice.point.x&&t.y===choice.point.y)||[...(actual.navigation_grid?.warps??[]),...(actual.map_grid?.warps??[])].some(t=>t.x===choice.point.x&&t.y===choice.point.y))return "approach tile became a script or warp boundary; no interaction attempted";
       const loaded=(actual.interaction_targets??[]).some(t=>t.kind==="object"&&t.local_id===requested)||actual.interaction_object_slots?.some(t=>t.local_id===requested&&t.map_id[0]===request.map_id[0]&&t.map_id[1]===request.map_id[1])===true||(actual.world_context?.objects??[]).some(t=>t.local_id===requested&&t.map_id[0]===request.map_id[0]&&t.map_id[1]===request.map_id[1]);
       if(loaded)return "object loaded; inspect its verified current position; no interaction attempted";
       const facts=actual.static_npc_templates;
       const fresh=facts?.map_id[0]===request.map_id[0]&&facts.map_id[1]===request.map_id[1]?facts.templates.find(t=>t.local_id===requested):undefined;
       if(fresh===undefined||staticTemplate===undefined)return "static template no longer verified; no interaction attempted";
       if(fresh.x!==staticTemplate.x||fresh.y!==staticTemplate.y||fresh.elevation!==staticTemplate.elevation||fresh.movement_type!==staticTemplate.movement_type||fresh.hide_flag!==staticTemplate.hide_flag)return "static template evidence changed; no interaction attempted";
       return null;
      }
      const still=actual.heal_before_trainers?.trainers.find(t=>t.local_id===requested);
      if(still===undefined)return "template no longer verified";
      if(still.loaded===true)return "object loaded; inspect its verified current position";
      if(still.x!==template.x||still.y!==template.y)return "template changed during approach";
      return null;
     };
     // Approaching a template is not a request to talk: no trainer is exempt from the existing sight check.
     const result=await navigate.executeChecked(id,{x:choice.point.x,y:choice.point.y,map_id:request.map_id,...(request.confirm_trainer_sight===undefined?{}:{confirm_trainer_sight:request.confirm_trainer_sight})},stop,signal,sightCheck?{sightCheck:{confirm:request.confirm_trainer_sight===true,exclude:null}}:{});
     return withStatus(result,`${qualification}; ${navigationStatus(result)??"returned from checked navigation"}`,selected,request.target,false);
    }
   }
   if(request.target.kind!=="connection"&&listed===null)return withStatus({content:[],details:{state:before}},"target is not listed in the current verified state",selected,request.target,false);
   if(features["moving-npc-target-v1"]&&request.target.kind==="object"&&listed?.kind==="object"&&listed.activation==="A")return followObject(id,request,listed,before,signal);
   // field-move-gates-v1: approaches are planned around closed obstacle objects, loaded or not, as navigate_to walks.
   const planned=features["field-move-gates-v1"]?gatedState(before,features["surf-navigation-v1"]):before;
   const choicesFor=(plan:NavigationOptions)=>request.target.kind==="connection"?connectionApproaches(planned,request.target,plan):approaches(planned,listed as SnapshotTarget,plan);
   let choices=choicesFor(options).filter(choice=>!scriptBoundary||choice.length===0||!options.triggers?.some(trigger=>trigger.x===choice.point.x&&trigger.y===choice.point.y&&(trigger.elevation===0||trigger.elevation===plannedArrivalElevation(planned,choice.point,options))));
   if(scriptBoundary&&choices.length===0){options={...options,triggers:[]};choices=choicesFor(options);}
   const choice=choices[0];
   if(choice===undefined&&features["surf-navigation-v1"]){
    const here=planned.position;
    const target=request.target.kind==="connection"?null:listed;
    const near=target===null?[]:target.kind==="warp"?[{x:target.x,y:target.y}]:[[0,-1],[0,1],[-1,0],[1,0]].map(([dx=0,dy=0])=>({x:target.x+dx,y:target.y+dy}));
    if(before.surf_gate?.can_surf===true){
     const direction=request.target.kind==="connection"?request.target.direction:null;
     const connection=before.topology?.connections.find(item=>item.direction===direction);
     const goals=direction===null?near:[...(connection?.edges??[]),...(connection?.water_edges??[])];
     const launch=surfLaunch(planned,goals,withClimb(planned,options));
     if(launch!==null){
      const walked=await navigate.execute(id,{x:launch.goal.x,y:launch.goal.y,map_id:[request.map_id[0],request.map_id[1]]},signal);
      return withStatus(walked,navigationStatus(walked)??"stopped at the water",selected,request.target,false);
     }
    }
    if(isSurfing(planned)&&here!==null)return withStatus({content:[],details:{state:before}},`no supported route to a valid approach: ${waterReason(planned,target??here)}`,selected,request.target,false);
   }
   if(choice===undefined){
    const base=request.target.kind==="warp"&&goalOnlyTile(planned,{x:request.target.x,y:request.target.y},options)?`no supported route to the step-on warp at (${String(request.target.x)},${String(request.target.y)})`:"no supported route to a valid approach";
    const detail=refusalDetail(before,request.target,options,features);
    if(detail===null)return withStatus({content:[],details:{state:before}},base,selected,request.target,false);
    const exits=detail.alternatives.length===0?"; no exit listed on this map can be walked to from here":`; exits you can walk to from here, nearest first: ${detail.alternatives.join(", ")}`;
    return withStatus({content:[],details:{state:before}},`${base}: ${detail.cause}${exits}`,selected,request.target,false,detail);
   }
   const connectionDirection=request.target.kind==="connection"?request.target.direction:null;
   const selectedConnection=connectionDirection===null?null:before.topology?.connections.find(item=>item.direction===connectionDirection)??null;
   const identityIssue=(actual:GameStateSnapshot,phase:string):string|null=>{
    if(connectionDirection!==null){
     const connection=actual.topology?.connections.find(item=>item.direction===connectionDirection);
     const a=selectedConnection?.destination,b=connection?.destination;
     const sameDestination=a!==undefined&&b!==undefined&&a[0]===b[0]&&a[1]===b[1];
     return sameDestination&&edgeTiles(actual,connection,options).some(point=>point.x===choice.point.x&&point.y===choice.point.y)?null:`semantic connection changed during ${phase}`;
    }
    const fresh=resolve(actual,request.target,options);
    if(fresh===null)return `semantic target disappeared during ${phase}`;
    if(listed===null)return `semantic target changed during ${phase}`;
    if(fresh.x!==listed.x||fresh.y!==listed.y)return `semantic target moved during ${phase}`;
    if(!sameTargetIdentity(listed,fresh))return `semantic target changed during ${phase}`;
    if((fresh.kind==="warp"||fresh.activation==="A")&&actual.position?.x===choice.point.x&&actual.position.y===choice.point.y){
     const recipient=interactionRecipient(actual,fresh,choice,options);
     if(recipient===null||!sameTargetIdentity(fresh,recipient))return `semantic interaction recipient changed during ${phase}`;
    }
    return null;
   };
   const routeStop=(actual:GameStateSnapshot):string|null=>{
    if(!isMap(actual,request.map_id))return null;
    const interruption=interrupted(actual);if(interruption!==null)return `semantic navigation interrupted during travel: ${interruption}`;
    return identityIssue(actual,"travel");
   };
   const destination={x:choice.point.x,y:choice.point.y,map_id:[request.map_id[0],request.map_id[1]] as [number,number]};
   // A listed warp can be farther away than the native local grid currently
   // describes. Unknown geometry is not evidence that it is an ordinary
   // step-on warp: use navigation's source-side final-entry receipt before
   // deciding whether a direction input is required.
   const listedWarpBehavior=listed?.kind==="warp"?tileBehavior(before,listed,options.mode):null;
   const initialEntryActivation=listed?.kind!=="warp"?"step":listedWarpBehavior===null?null:directionalWarpActivation(before,listed,options.mode??"local")??"step";
   let previous=before.position;
   const segmentEnds=new Set<string>(previous===null?[]:[`${String(previous.x)},${String(previous.y)}`]);
   const targetSight=sightCheck?{sightCheck:{confirm:request.confirm_trainer_sight===true,exclude:request.target.kind==="object"?request.target.local_id:null}}:{};
   let walked=await navigate.executeChecked(id,destination,routeStop,signal,{exactTarget:true,multiTileRunning:true,...targetSight}),current:GameStateSnapshot,reason:string|null;
   if(navigationStatus(walked)===SIGHT_STATUS)return withStatus(walked,SIGHT_STATUS,selected,request.target,false);
   for(;;){
    current=stateOf(walked);
    const entryActivation=navigationGoalEntryActivation(walked)??initialEntryActivation;
    const entryAttempted=listed!==null&&movementActivated(listed)&&entryActivation==="step"&&navigationGoalEntryAttempted(walked);
    if(navigationStopRequested(walked)){const status=navigationStatus(walked)??"semantic travel stop requested";return withStatus(walked,status,selected,request.target,entryAttempted&&status.startsWith("semantic navigation interrupted"));}
    if(!isMap(current,request.map_id))return withStatus(walked,"interrupted by a map transition",selected,request.target,navigationActivationAttempted(walked)||(listed!==null&&movementActivated(listed)&&navigationGoalEntryAttempted(walked)));
    if(entryAttempted)return withStatus(walked,"movement-activated target entry was attempted; inspect the resulting state",selected,request.target,true);
    reason=interrupted(current);if(reason!==null)return withStatus(walked,`interrupted before activation: ${reason}`,selected,request.target,false);
    const changed=identityIssue(current,"travel");if(changed!==null)return withStatus(walked,changed,selected,request.target,false);
    const status=navigationStatus(walked);
    if(current.position?.x===choice.point.x&&current.position.y===choice.point.y){
     if(status==="arrived at requested coordinate"||navigationCanContinue(status)||navigationActivationAttempted(walked))break;
     return withStatus(walked,`route failed at the selected approach${status===null?"":`: ${status}`}`,selected,request.target,false);
    }
    if(!navigationCanContinue(status))return withStatus(walked,"route ended before the selected approach",selected,request.target,false);
    if(previous!==null&&current.position?.x===previous.x&&current.position.y===previous.y)return withStatus(walked,"route made no progress before the selected approach",selected,request.target,false);
    if(current.position!==null){
     const end=`${String(current.position.x)},${String(current.position.y)}`;
     if(segmentEnds.has(end))return withStatus(walked,"route returned to an earlier segment end before the selected approach",selected,request.target,false);
     segmentEnds.add(end);
    }
    previous=current.position;
    walked=await navigate.executeChecked(id,destination,routeStop,signal,{exactTarget:true,multiTileRunning:true});
   }
   const checkInput=(actual:GameStateSnapshot|undefined,phase:"facing input"|"activation",requiredFacing:Button|null):void=>{
    if(actual===undefined)throw new SemanticPreconditionError(`verified state became unavailable before ${phase}`);
    if(!isMap(actual,request.map_id)||actual.position?.x!==choice.point.x||actual.position.y!==choice.point.y)throw new SemanticPreconditionError(`semantic target approach changed before ${phase}`);
    const interruption=interrupted(actual);if(interruption!==null)throw new SemanticPreconditionError(`semantic navigation was interrupted before ${phase}: ${interruption}`);
    const changed=identityIssue(actual,phase);if(changed!==null)throw new SemanticPreconditionError(changed);
    if(listed!==null&&listed.kind!=="warp"){
     const elevation=plannedArrivalElevation(actual,choice.point,options);
     if(elevation===null||!elevationsMatch(listed.elevation,elevation))throw new SemanticPreconditionError(`selected target elevation became unreachable before ${phase}`);
     const recipient=interactionRecipient(actual,listed,choice,options);
     if(listed.activation==="A"&&(recipient===null||!sameTargetIdentity(listed,recipient)))throw new SemanticPreconditionError(`semantic interaction recipient changed before ${phase}`);
    }
    if(requiredFacing!==null&&actual.facing!==requiredFacing.toLowerCase())throw new SemanticPreconditionError(`player facing changed before ${phase}`);
   };
   if(request.target.kind!=="connection"){
    const fresh=resolve(current,request.target,options);
    if(fresh===null)return withStatus(walked,"target disappeared before activation",selected,request.target,false);
    if(listed===null)return withStatus(walked,"target changed before activation; inspect its new identity or position",selected,request.target,false);
    if(fresh.x!==listed.x||fresh.y!==listed.y)return withStatus(walked,"target moved before activation; inspect its new position",selected,request.target,false);
    if(!sameTargetIdentity(listed,fresh))return withStatus(walked,"target changed before activation; inspect its new identity",selected,request.target,false);
    if(fresh.kind==="warp"){
     if(navigationActivationAttempted(walked))return withStatus(walked,"directional warp activation was already attempted by navigation; inspect the unchanged map",selected,request.target,true);
     const warpActivation=directionalWarpActivation(current,fresh,options.mode??"local");
     if(warpActivation===null){const attempted=navigationCommands(walked)>0;return withStatus(walked,attempted?"arrived at the movement-activated target":"already standing on the movement-activated target; step away and re-enter it",selected,request.target,attempted);}
     let activated:AgentToolResult<unknown>;
     try{activated=await executePress(id,warpActivation,actual=>{checkInput(actual,"activation",null);if(actual===undefined)throw new SemanticPreconditionError("verified state became unavailable before activation");const fresh=resolve(actual,request.target,options);if(fresh===null||directionalWarpActivation(actual,fresh,options.mode??"local")!==warpActivation)throw new SemanticPreconditionError("directional warp activation changed before input");},signal);}
     catch(error){if(!(error instanceof SemanticPreconditionError))throw error;const state=await stateSource.read(signal);return withStatus({content:[],details:{state}},error.message,selected,request.target,false);}
     current=stateOf(activated);reason=interrupted(current);
     const status=reason!==null?`activation handed control back: ${reason}`:!isMap(current,request.map_id)?"activation changed maps; inspect the destination":"directional warp activation did not change maps; inspect the target";
     return withStatus(activated,status,selected,request.target,true);
    }
    if(fresh.activation==="step"){const attempted=navigationCommands(walked)>0;return withStatus(walked,attempted?"arrived at the movement-activated target":"already standing on the movement-activated target; step away and re-enter it",selected,request.target,attempted);}
   }
   const facing=choice.facing;if(facing===null)return withStatus(walked,"arrived at the selected target",selected,request.target,false);
   if(current.facing!==facing.toLowerCase()){
    let turned:AgentToolResult<unknown>;
    try{turned=await executePress(id,facing,actual=>{checkInput(actual,"facing input",null);},signal);}
    catch(error){if(!(error instanceof SemanticPreconditionError))throw error;const fresh=await stateSource.read(signal);return withStatus({content:[],details:{state:fresh}},error.message,selected,request.target,false);}
    current=stateOf(turned);
    if(!isMap(current,request.map_id))return withStatus(turned,"interrupted by a map transition while facing the target",selected,request.target,request.target.kind==="connection"&&isDestinationMap(current,selectedConnection?.destination));
    reason=interrupted(current);if(reason!==null)return withStatus(turned,`interrupted while facing the target: ${reason}`,selected,request.target,false);
    const changed=identityIssue(current,"facing input");
    if(changed!==null)return withStatus(turned,changed,selected,request.target,false);
    if(current.position?.x!==choice.point.x||current.position.y!==choice.point.y)return withStatus(turned,"facing input moved away from the selected approach",selected,request.target,false);
   }
   const activation=request.target.kind==="connection"?facing:"A";
   let activated:AgentToolResult<unknown>;
   try{activated=await executePress(id,activation,actual=>{checkInput(actual,"activation",facing);},signal);}
   catch(error){if(!(error instanceof SemanticPreconditionError))throw error;const fresh=await stateSource.read(signal);return withStatus({content:[],details:{state:fresh}},error.message,selected,request.target,false);}
   current=stateOf(activated);reason=interrupted(current);
   const status=reason!==null?`activation handed control back: ${reason}`:!isMap(current,request.map_id)?"activation changed maps; inspect the destination":"activation completed; inspect the resulting state";
   return withStatus(activated,status,selected,request.target,true);
  }};
}

function requestFor(target:SnapshotTarget):RequestTarget {
 if(target.kind==="object"&&target.local_id!==null)return {kind:"object",local_id:target.local_id};
 if(target.kind==="warp")return {kind:"warp",x:target.x,y:target.y};
 return {kind:"interaction",interaction_kind:target.kind,x:target.x,y:target.y};
}
function explorationTool(semantic:AgentTool<typeof SemanticArgs|typeof StaticSemanticArgs|typeof SightSemanticArgs|typeof StaticSightSemanticArgs>,features:FeatureSet,stateSource:StateSource):AgentTool<typeof ExploreArgs> {
 const tried=new Set<string>(),options=navigationOptions(features);
 return {name:"explore_map",label:"Explore one map target",description:"Deterministically chooses one reachable listed interaction not previously attempted by this explorer. When none remain, chooses a reachable walking connection. It navigates to and activates only that one target, returning immediately on battle, dialogue, menus, scripts, forced movement or map changes.",parameters:ExploreArgs,
  execute:async(id,_request,signal)=>{
   const state=await stateSource.read(signal);if(state.map_id===null)return {content:[{type:"text",text:"Exploration: current map identity is unavailable."}],details:{state}};
   const map:[number,number]=[state.map_id[0],state.map_id[1]];
   const interactions=(state.interaction_targets??[]).flatMap(target=>{const request=requestFor(target),key=targetKey(map,request);if(tried.has(key))return [];const approach=approaches(state,target,options)[0];return approach===undefined?[]:[{request,key,length:approach.length,rank:target.kind==="warp"?1:0}];});
   const connections=(state.topology?.connections??[]).flatMap(connection=>{if(!(["NORTH","SOUTH","EAST","WEST"] as const).includes(connection.direction as "NORTH"|"SOUTH"|"EAST"|"WEST"))return [];const request:RequestTarget={kind:"connection",direction:connection.direction as "NORTH"|"SOUTH"|"EAST"|"WEST"},key=targetKey(map,request);if(tried.has(key))return [];const approach=connectionApproaches(state,request,options)[0];return approach===undefined?[]:[{request,key,length:approach.length,rank:2}];});
   const selected=[...interactions,...connections].sort((a,b)=>a.rank-b.rank||a.length-b.length||a.key.localeCompare(b.key))[0];
   if(selected===undefined)return {content:[{type:"text",text:"Exploration: no untried listed interaction or walking connection has a supported route in the current navigation map."}],details:{state}};
   const result=await semantic.execute(id,{map_id:map,target:selected.request},signal);
   const details:unknown=result.details;
   if(typeof details==="object"&&details!==null&&"semantic_navigation" in details){
    const semanticDetails:unknown=details.semantic_navigation;
    if(typeof semanticDetails==="object"&&semanticDetails!==null&&"activation_attempted" in semanticDetails&&semanticDetails.activation_attempted===true)tried.add(selected.key);
   }
   return result;
  }};
}

export function withSemanticNavigation(tools:readonly AgentTool[],features:FeatureSet,state:StateSource):AgentTool[] {
 if(!semanticNavigation(features))return [...tools];
 const navigate=tools.find(tool=>tool.name==="navigate_to"),press=tools.find(tool=>tool.name==="press"),observe=tools.find(tool=>tool.name==="observe");
 // State-only probes and historical replay builders intentionally construct partial tool sets.
 // Production feature validation requires bounded navigation, and live play always supplies both.
 if(navigate===undefined||press===undefined||!isCheckedNavigation(navigate)||!isCheckedPress(press))return [...tools];
 const semantic=semanticTool(navigate,press,features,state,observe),result=[...tools,semantic];
 if(features["deterministic-exploration-v1"])result.push(explorationTool(semantic,features,state));
 return result;
}
