import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type} from "typebox";
import type {Button} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot,type StateSource} from "./game-state.js";
import {planNavigation,type NavigationMode,type NavigationOptions} from "./navigation.js";

const MapId=Type.Tuple([Type.Integer({minimum:0,maximum:255}),Type.Integer({minimum:0,maximum:255})]);
const ObjectTarget=Type.Object({kind:Type.Literal("object"),local_id:Type.Integer({minimum:0,maximum:255})},{additionalProperties:false});
const FixedTarget=Type.Object({kind:Type.Literal("interaction"),interaction_kind:Type.String({minLength:1}),x:Type.Integer({minimum:0}),y:Type.Integer({minimum:0})},{additionalProperties:false});
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
type SemanticDetails={readonly state:GameStateSnapshot;readonly semantic_navigation:{readonly status:string;readonly selected:string;readonly activation_attempted:boolean};readonly [key:string]:unknown};
class SemanticPreconditionError extends Error {}
const STEPS:readonly [Button,number,number][]=[["UP",0,-1],["DOWN",0,1],["LEFT",-1,0],["RIGHT",1,0]];
const EDGE_BUTTON:Readonly<Record<"NORTH"|"SOUTH"|"EAST"|"WEST",Button>>={NORTH:"UP",SOUTH:"DOWN",EAST:"RIGHT",WEST:"LEFT"};

function navigationOptions(features:FeatureSet):NavigationOptions {
 const mode:NavigationMode=features["full-map-navigation-v1"]?"full":features["visited-terrain-navigation-v1"]?"visited":"local";
 return {mode,ledges:features["ledge-hops-v1"],oneWay:features["one-way-tiles-v1"],grassCost:features["grass-cost-navigation-v1"],floor:features["walkable-floor-v1"],elevation:features["elevation-transitions-v1"]?"game":"legacy"};
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
function interrupted(state:GameStateSnapshot):string|null {
 if(state.in_battle)return "battle began";
 if(state.screen!=="overworld")return `screen changed to ${state.screen}`;
 if(state.world_context?.message!=null||Boolean(state.world_context?.dialogue))return "dialogue or a field message opened";
 if(state.active_ui!=null)return `interface ${state.active_ui.phase} opened`;
 if(state.field_controls_locked===true)return "a script or forced field action took control";
 if(state.field_controls_locked!==false)return "field-control ownership became unavailable";
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
function resolve(state:GameStateSnapshot,target:RequestTarget):SnapshotTarget|null {
 const listed=state.interaction_targets??[];
 if(target.kind==="object")return listed.find(item=>item.kind==="object"&&item.local_id===target.local_id)??null;
 if(target.kind==="connection")return null;
 const kind=target.kind==="warp"?"warp":target.interaction_kind;
 return listed.find(item=>item.kind===kind&&item.x===target.x&&item.y===target.y)??null;
}
function approaches(state:GameStateSnapshot,target:SnapshotTarget,options:NavigationOptions):Approach[] {
 if(target.kind==="warp"||target.activation==="step"){
  const path=planNavigation(state,{x:target.x,y:target.y},options);
  return path===null?[]:[{point:{x:target.x,y:target.y},facing:null,length:path.length}];
 }
 return STEPS.flatMap(([facing,dx,dy])=>{
  if(target.facing!==null&&target.facing!==facing.toLowerCase())return [];
  const point={x:target.x-dx,y:target.y-dy},path=planNavigation(state,point,options);
  return path===null?[]:[{point,facing,length:path.length}];
 }).sort((a,b)=>a.length-b.length||a.point.y-b.point.y||a.point.x-b.point.x||a.facing.localeCompare(b.facing));
}
function connectionApproaches(state:GameStateSnapshot,target:Extract<RequestTarget,{kind:"connection"}>,options:NavigationOptions):Approach[] {
 const connection=state.topology?.connections.find(item=>item.direction===target.direction);
 return (connection?.edges??[]).flatMap(point=>{const path=planNavigation(state,point,options);return path===null?[]:[{point,facing:EDGE_BUTTON[target.direction],length:path.length}];})
  .sort((a,b)=>a.length-b.length||a.point.y-b.point.y||a.point.x-b.point.x);
}
function withStatus(result:AgentToolResult<unknown>,status:string,selected:string,activationAttempted:boolean):AgentToolResult<SemanticDetails> {
 const state=stateOf(result);
 const inherited=typeof result.details==="object"&&result.details!==null?result.details:{};
 return {...result,content:[{type:"text",text:`Semantic navigation: ${status}. Selected ${selected}.`},...result.content],details:{...inherited,state,semantic_navigation:{status,selected,activation_attempted:activationAttempted}}};
}
function isMap(state:GameStateSnapshot,map:readonly [number,number]):boolean{return state.map_id?.[0]===map[0]&&state.map_id[1]===map[1];}

function semanticTool(navigate:AgentTool,press:AgentTool,features:FeatureSet,stateSource:StateSource):AgentTool<typeof SemanticArgs> {
 const options=navigationOptions(features);
 const executePress=(id:string,button:Button,check:(state:GameStateSnapshot|undefined)=>void,signal?:AbortSignal):Promise<AgentToolResult<unknown>>=>isCheckedPress(press)?press.executeChecked(id,{buttons:[button]},check,signal,undefined,{automaticRunning:false}):press.execute(id,{buttons:[button]},signal);
 return {name:"navigate_to_target",label:"Navigate to a game target",description:"Select a listed person, object, warp or walking map connection by its game-owned identity. The harness chooses the reachable approach, continues progress-making route segments without an end-to-end command cap, faces the target and activates it once. It immediately returns control if battle, dialogue, a menu, a script, forced movement, a map transition or unavailable input interrupts travel.",parameters:SemanticArgs,
  execute:async(id,request,signal)=>{
   signal?.throwIfAborted();const before=await stateSource.read(signal),selected=label(request.target);
   if(!isMap(before,request.map_id))return withStatus({content:[],details:{state:before}},"refused because the requested map is not current",selected,false);
   const listed=request.target.kind==="connection"?null:resolve(before,request.target);
   if(request.target.kind!=="connection"&&listed===null)return withStatus({content:[],details:{state:before}},"target is not listed in the current verified state",selected,false);
   const choices=request.target.kind==="connection"?connectionApproaches(before,request.target,options):approaches(before,listed as SnapshotTarget,options);
   const choice=choices[0];if(choice===undefined)return withStatus({content:[],details:{state:before}},"no supported route to a valid approach",selected,false);
   const destination={x:choice.point.x,y:choice.point.y,map_id:[request.map_id[0],request.map_id[1]]};
   let previous=before.position;
   let walked=await navigate.execute(id,destination,signal),current:GameStateSnapshot,reason:string|null;
   for(;;){
    current=stateOf(walked);reason=interrupted(current);
    if(reason!==null)return withStatus(walked,`interrupted before activation: ${reason}`,selected,false);
    if(!isMap(current,request.map_id))return withStatus(walked,"interrupted by a map transition",selected,request.target.kind==="warp");
    if(current.position?.x===choice.point.x&&current.position.y===choice.point.y)break;
    const status=navigationStatus(walked);
    if(status===null||!status.startsWith("command limit"))return withStatus(walked,"route ended before the selected approach",selected,false);
    if(previous!==null&&current.position?.x===previous.x&&current.position.y===previous.y)return withStatus(walked,"route made no progress before the selected approach",selected,false);
    previous=current.position;
    walked=await navigate.execute(id,destination,signal);
   }
   if(request.target.kind!=="connection"){
    const fresh=resolve(current,request.target);
    if(fresh===null)return withStatus(walked,"target disappeared before activation",selected,false);
    if(fresh.x!==listed?.x||fresh.y!==listed.y)return withStatus(walked,"target moved before activation; inspect its new position",selected,false);
    if(fresh.kind==="warp"||fresh.activation==="step")return withStatus(walked,"arrived at the movement-activated target",selected,true);
   }
   const facing=choice.facing;if(facing===null)return withStatus(walked,"arrived at the selected target",selected,false);
   const connectionDirection=request.target.kind==="connection"?request.target.direction:null;
   const checkInput=(actual:GameStateSnapshot|undefined,phase:"facing input"|"activation",requireFacing:boolean):void=>{
    if(actual===undefined)throw new SemanticPreconditionError(`verified state became unavailable before ${phase}`);
    if(!isMap(actual,request.map_id)||actual.position?.x!==choice.point.x||actual.position.y!==choice.point.y)throw new SemanticPreconditionError(`semantic target approach changed before ${phase}`);
    const interruption=interrupted(actual);if(interruption!==null)throw new SemanticPreconditionError(`semantic navigation was interrupted before ${phase}: ${interruption}`);
    if(connectionDirection!==null){
     const connection=actual.topology?.connections.find(item=>item.direction===connectionDirection);
     if(connection?.edges?.some(point=>point.x===choice.point.x&&point.y===choice.point.y)!==true)throw new SemanticPreconditionError(`semantic connection changed before ${phase}`);
    }else{
     const fresh=resolve(actual,request.target);
     if(fresh===null||fresh.x!==listed?.x||fresh.y!==listed.y)throw new SemanticPreconditionError(`semantic target changed before ${phase}`);
    }
    if(requireFacing&&actual.facing!==facing.toLowerCase())throw new SemanticPreconditionError(`player facing changed before ${phase}`);
   };
   if(current.facing!==facing.toLowerCase()){
    let turned:AgentToolResult<unknown>;
    try{turned=await executePress(id,facing,actual=>{checkInput(actual,"facing input",false);},signal);}
    catch(error){if(!(error instanceof SemanticPreconditionError))throw error;const fresh=await stateSource.read(signal);return withStatus({content:[],details:{state:fresh}},error.message,selected,false);}
    current=stateOf(turned);reason=interrupted(current);
    if(reason!==null)return withStatus(turned,`interrupted while facing the target: ${reason}`,selected,false);
    if(current.position?.x!==choice.point.x||current.position.y!==choice.point.y)return withStatus(turned,"facing input moved away from the selected approach",selected,false);
   }
   const activation=request.target.kind==="connection"?facing:"A";
   let activated:AgentToolResult<unknown>;
   try{activated=await executePress(id,activation,actual=>{checkInput(actual,"activation",true);},signal);}
   catch(error){if(!(error instanceof SemanticPreconditionError))throw error;const fresh=await stateSource.read(signal);return withStatus({content:[],details:{state:fresh}},error.message,selected,false);}
   current=stateOf(activated);reason=interrupted(current);
   const status=reason!==null?`activation handed control back: ${reason}`:!isMap(current,request.map_id)?"activation changed maps; inspect the destination":"activation completed; inspect the resulting state";
   return withStatus(activated,status,selected,true);
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
 if(!features["semantic-navigation-v1"])return [...tools];
 const navigate=tools.find(tool=>tool.name==="navigate_to"),press=tools.find(tool=>tool.name==="press");
 // State-only probes and historical replay builders intentionally construct partial tool sets.
 // Production feature validation requires bounded navigation, and live play always supplies both.
 if(navigate===undefined||press===undefined)return [...tools];
 const semantic=semanticTool(navigate,press,features,state),result=[...tools,semantic];
 if(features["deterministic-exploration-v1"])result.push(explorationTool(semantic,features,state));
 return result;
}
