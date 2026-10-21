import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {Button} from "./events.js";
import {semanticNavigation,type FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import {directionalWarpActivation,elevationsMatch,gatedState,isCheckedNavigation,planNavigation,plannedArrivalElevation,type CheckedNavigationTool,type NavigationMode,type NavigationOptions} from "./navigation.js";
import {COUNTER} from "./tile-rules.js";

const MapId=Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]);
const ObjectTarget=Type.Object({kind:Type.Literal("object"),local_id:Type.Integer({minimum:0,maximum:255})},{additionalProperties:false});
const FixedTarget=Type.Object({kind:Type.Literal("interaction"),interaction_kind:Type.String({minLength:1,pattern:"^(?!(?:object|warp)$).+$"}),x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0})},{additionalProperties:false});
const WarpTarget=Type.Object({kind:Type.Literal("warp"),x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0})},{additionalProperties:false});
const ConnectionTarget=Type.Object({kind:Type.Literal("connection"),direction:Type.Enum(["NORTH","SOUTH","EAST","WEST"] as const)},{additionalProperties:false});
const Target=Type.Union([ObjectTarget,FixedTarget,WarpTarget,ConnectionTarget]);
const SemanticArgs=Type.Object({map_id:MapId,target:Target},{additionalProperties:false});
const ExploreArgs=Type.Object({},{additionalProperties:false});

type SnapshotTarget=NonNullable<GameStateSnapshot["interaction_targets"]>[number];
type RequestTarget=
 | {readonly kind:"object";readonly local_id:number}
 | {readonly kind:"interaction";readonly interaction_kind:string;readonly x:number;readonly y:number}
 | {readonly kind:"warp";readonly x:number;readonly y:number}
 | {readonly kind:"connection";readonly direction:"NORTH"|"SOUTH"|"EAST"|"WEST"};
type Point={readonly x:number;readonly y:number};
type Approach={readonly point:Point;readonly facing:Button|null;readonly length:number};
type SemanticDetails={readonly state:GameStateSnapshot;readonly semantic_navigation:{readonly status:string;readonly selected:string;readonly activation_attempted:boolean;readonly target:RequestTarget};readonly [key:string]:unknown};
class SemanticPreconditionError extends Error {}
const STEPS:readonly [Button,number,number][]=[["UP",0,-1],["DOWN",0,1],["LEFT",-1,0],["RIGHT",1,0]];
const EDGE_BUTTON:Readonly<Record<"NORTH"|"SOUTH"|"EAST"|"WEST",Button>>={NORTH:"UP",SOUTH:"DOWN",EAST:"RIGHT",WEST:"LEFT"};

function navigationOptions(features:FeatureSet):NavigationOptions {
 const mode:NavigationMode=features["full-map-navigation-v1"]?"full":features["visited-terrain-navigation-v1"]?"visited":"local";
 return {mode,ledges:features["ledge-hops-v1"],oneWay:features["one-way-tiles-v1"],grassCost:features["grass-cost-navigation-v1"],floor:features["walkable-floor-v1"],elevation:features["elevation-transitions-v1"]?"game":"legacy",...(features["field-move-gates-v1"]?{slopes:true}:{})};
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
 if(target.kind==="object")return `${head}object:${String(target.local_id)}`;
 if(target.kind==="connection")return `${head}connection:${target.direction}`;
 return `${head}${target.kind}:${target.kind==="interaction"?target.interaction_kind:"warp"}:${String(target.x)},${String(target.y)}`;
}
function label(target:RequestTarget):string {
 if(target.kind==="object")return `map object ${String(target.local_id)}`;
 if(target.kind==="connection")return `${target.direction} map connection`;
 if(target.kind==="warp")return `warp at (${String(target.x)},${String(target.y)})`;
 return `${target.interaction_kind.replaceAll("_"," ")} at (${String(target.x)},${String(target.y)})`;
}
function resolve(state:GameStateSnapshot,target:RequestTarget,options:NavigationOptions):SnapshotTarget|null {
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
  const elevation=plannedArrivalElevation(state,{x:target.x,y:target.y},options)??standing??null;
  if(elevation===null)return null;
  return listed.find(item=>item.kind==="warp"&&item.x===target.x&&item.y===target.y&&(item.elevation===0||item.elevation===elevation))??null;
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
function interactionRecipient(state:GameStateSnapshot,target:SnapshotTarget,approach:Approach,options:NavigationOptions):SnapshotTarget|null {
 const elevation=plannedArrivalElevation(state,approach.point,options);if(elevation===null)return null;
 if(target.kind==="warp"){
  return (state.interaction_targets??[]).find(item=>item.kind==="warp"&&item.x===target.x&&item.y===target.y&&(item.elevation===0||item.elevation===elevation))??null;
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
  const point={x:target.x-dx,y:target.y-dy},path=planNavigation(state,point,options);
  if(path===null)return [];
  const elevation=plannedArrivalElevation(state,point,options);
  if(elevation===null||!elevationsMatch(target.elevation,elevation))return [];
  const approach={point,facing,length:path.length};
  const recipient=interactionRecipient(state,target,approach,options);
  return target.activation==="A"&&(recipient===null||!sameTargetIdentity(target,recipient))?[]:[approach];
 });
 const counters=target.kind!=="object"?[]:STEPS.flatMap(([facing,dx,dy])=>{
  const counter={x:target.x-dx,y:target.y-dy};if(tileBehavior(state,counter,options.mode)!==COUNTER)return [];
  const point={x:counter.x-dx,y:counter.y-dy},path=planNavigation(state,point,options);if(path===null)return [];
  const elevation=plannedArrivalElevation(state,point,options);if(elevation===null||!elevationsMatch(target.elevation,elevation))return [];
  const approach={point,facing,length:path.length},recipient=interactionRecipient(state,target,approach,options);
  return recipient!==null&&sameTargetIdentity(target,recipient)?[approach]:[];
 });
 return [...ordinary,...counters].sort((a,b)=>a.length-b.length||a.point.y-b.point.y||a.point.x-b.point.x||a.facing.localeCompare(b.facing));
}
function connectionApproaches(state:GameStateSnapshot,target:Extract<RequestTarget,{kind:"connection"}>,options:NavigationOptions):Approach[] {
 const connection=state.topology?.connections.find(item=>item.direction===target.direction);
 return (connection?.edges??[]).flatMap(point=>{const path=planNavigation(state,point,options);return path===null?[]:[{point,facing:EDGE_BUTTON[target.direction],length:path.length}];})
  .sort((a,b)=>a.length-b.length||a.point.y-b.point.y||a.point.x-b.point.x);
}
function withStatus(result:AgentToolResult<unknown>,status:string,selected:string,target:RequestTarget,activationAttempted:boolean):AgentToolResult<SemanticDetails> {
 const state=stateOf(result);
 const inherited=typeof result.details==="object"&&result.details!==null?result.details:{};
 return {...result,content:[{type:"text",text:`Semantic navigation: ${status}. Selected ${selected}.`},...result.content],details:{...inherited,state,semantic_navigation:{status,selected,activation_attempted:activationAttempted,target}}};
}
function isMap(state:GameStateSnapshot,map:readonly [number,number]):boolean{return state.map_id?.[0]===map[0]&&state.map_id[1]===map[1];}
function isDestinationMap(state:GameStateSnapshot,destination:readonly number[]|null|undefined):boolean{const map=state.map_id;return destination!==null&&destination!==undefined&&map!==null&&map[0]===destination[0]&&map[1]===destination[1];}

// semantic-navigation-v2: how to copy a target from the readout, and what happens after activation.
const SEMANTIC_V2_DESCRIPTION="The way to reach a person, object, door, stairs, other warp or walking map exit that the readout lists with a navigate_to_target target: it walks there, faces it and talks to it, uses it or goes through it, once. Pass the current map_id and the target exactly as the readout writes it after \"navigate_to_target target\". The harness chooses the reachable approach and continues progress-making route segments without an end-to-end command cap. It returns control immediately if a battle, a menu, a script, forced movement, a map transition or unavailable input interrupts travel, and says why when it refuses or stops early. For anything without a navigate_to_target target, use navigate_to.";

const SEMANTIC_V2_DIALOGUE=" Dialogue the activation opens is advanced for you as with navigate_to.";
// The dialogue sentence is true only with dialogue auto-advance on.
function semanticV2Description(dialogue:boolean):string {
 const cut=SEMANTIC_V2_DESCRIPTION.indexOf(" It returns control immediately");
 return dialogue?`${SEMANTIC_V2_DESCRIPTION.slice(0,cut)}${SEMANTIC_V2_DIALOGUE}${SEMANTIC_V2_DESCRIPTION.slice(cut)}`:SEMANTIC_V2_DESCRIPTION;
}
function semanticTool(navigate:CheckedNavigationTool,press:CheckedPressTool,features:FeatureSet,stateSource:StateSource):AgentTool<typeof SemanticArgs> {
 const options=navigationOptions(features);
 const executePress=(id:string,button:Button,check:(state:GameStateSnapshot|undefined)=>void,signal?:AbortSignal):Promise<AgentToolResult<unknown>>=>press.executeChecked(id,{buttons:[button]},check,signal,undefined,{automaticRunning:false});
 return {name:"navigate_to_target",label:"Navigate to a game target",description:features["semantic-navigation-v2"]?semanticV2Description(features["dialogue-auto-advance-v1"]):"Select a listed person, object, warp or walking map connection by its game-owned identity. The harness chooses the reachable approach, continues progress-making route segments without an end-to-end command cap, faces the target and activates it once. It immediately returns control if battle, dialogue, a menu, a script, forced movement, a map transition or unavailable input interrupts travel.",parameters:SemanticArgs,
  execute:async(id,request,signal)=>{
   signal?.throwIfAborted();const before=await stateSource.read(signal),selected=label(request.target);
   if(!isMap(before,request.map_id)){
    const result=withStatus({content:[],details:{state:before}},"refused because the requested map is not current",selected,request.target,false);
    if(!features["semantic-current-map-feedback-v1"])return result;
    const map=before.map_id===null?"map unavailable":`map ${String(before.map_id[0])}/${String(before.map_id[1])}`;
    const position=before.position===null?"unavailable":`(${String(before.position.x)},${String(before.position.y)})`;
    return {...result,content:[{type:"text",text:`Current map: ${before.location??"name unavailable"} (${map}). Position: ${position}. No input was sent.`},...result.content]};
   }
   const listed=request.target.kind==="connection"?null:resolve(before,request.target,options);
   if(request.target.kind!=="connection"&&listed===null)return withStatus({content:[],details:{state:before}},"target is not listed in the current verified state",selected,request.target,false);
   // field-move-gates-v1: approaches are planned around closed obstacle objects, loaded or not, as navigate_to walks.
   const planned=features["field-move-gates-v1"]?gatedState(before):before;
   const choices=request.target.kind==="connection"?connectionApproaches(planned,request.target,options):approaches(planned,listed as SnapshotTarget,options);
   const choice=choices[0];if(choice===undefined)return withStatus({content:[],details:{state:before}},"no supported route to a valid approach",selected,request.target,false);
   const connectionDirection=request.target.kind==="connection"?request.target.direction:null;
   const selectedConnection=connectionDirection===null?null:before.topology?.connections.find(item=>item.direction===connectionDirection)??null;
   const identityIssue=(actual:GameStateSnapshot,phase:string):string|null=>{
    if(connectionDirection!==null){
     const connection=actual.topology?.connections.find(item=>item.direction===connectionDirection);
     const a=selectedConnection?.destination,b=connection?.destination;
     const sameDestination=a!==undefined&&b!==undefined&&a[0]===b[0]&&a[1]===b[1];
     return sameDestination&&connection?.edges?.some(point=>point.x===choice.point.x&&point.y===choice.point.y)===true?null:`semantic connection changed during ${phase}`;
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
   let walked=await navigate.executeChecked(id,destination,routeStop,signal,{exactTarget:true,multiTileRunning:true}),current:GameStateSnapshot,reason:string|null;
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
function explorationTool(semantic:AgentTool<typeof SemanticArgs>,features:FeatureSet,stateSource:StateSource):AgentTool<typeof ExploreArgs> {
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
 const navigate=tools.find(tool=>tool.name==="navigate_to"),press=tools.find(tool=>tool.name==="press");
 // State-only probes and historical replay builders intentionally construct partial tool sets.
 // Production feature validation requires bounded navigation, and live play always supplies both.
 if(navigate===undefined||press===undefined||!isCheckedNavigation(navigate)||!isCheckedPress(press))return [...tools];
 const semantic=semanticTool(navigate,press,features,state),result=[...tools,semantic];
 if(features["deterministic-exploration-v1"])result.push(explorationTool(semantic,features,state));
 return result;
}
