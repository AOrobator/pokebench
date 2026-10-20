// untaken-exits-v1: right under the readout's Location/Position lines, every exit on the current map (warps from the
// game's own warp events, and map connections where the readout shows them) that this run has not used yet.
// Facts only, from recorded states; nothing clipped.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import {ExitHistory,mapKey,readoutNames,tileKey,warpsOf} from "./exit-history.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {exitReach,type Cut} from "./surf-gate.js";
import type {RunRecorder} from "./recorder.js";
import {connectionArgument,semanticWalk,targetSuffix,uniqueDirection,uniqueTile} from "./semantic-targets.js";

export const UNTAKEN_HEADER="Exits here you have not taken";
type Snapshot=Pick<GameStateSnapshot,"started"|"screen"|"location"|"map_id"|"position"|"interaction_targets"|"topology"|"surf_gate"|"exit_reach">;
const EDGES=new Set(["NORTH","SOUTH","EAST","WEST"]);

export class UntakenExits {
 private readonly history=new ExitHistory();
 // The names the readouts of this run gave to maps (Location lines and named destinations).
 private readonly names=new Map<string,string>();
 constructor(private readonly features:FeatureSet){}
 observe(event:RunEvent):void {
  if(event.type==="state"&&"started"in event)this.history.observe(event);
 }
 private place(id:readonly number[]):string {
  const name=this.names.get(mapKey(id));
  return name===undefined?`map ${mapKey(id)}`:`${name} (map ${mapKey(id)})`;
 }
 // The line for this observation, or null outside a started overworld readout with interaction targets.
 line(state:Snapshot,readout:string):string|null {
  if(!state.started||state.screen!=="overworld"||state.map_id===null||state.interaction_targets==null)return null;
  readoutNames(readout,state.map_id,this.names);
  const map=mapKey(state.map_id),semantic=this.features["semantic-navigation-v2"];
  const groups=new Map<string,{tiles:string[];warps:{x:number;y:number}[];destination:readonly number[];taken:boolean}>();
  for(const warp of warpsOf(state)){
   const key=JSON.stringify(warp.destination);
   const group=groups.get(key)??{tiles:[],warps:[],destination:warp.destination,taken:false};
   // semantic-navigation-v2: each warp tile with the target navigate_to_target takes.
   group.tiles.push(`(${tileKey(warp.x,warp.y)})${semantic&&uniqueTile(state.interaction_targets,"warp",warp.x,warp.y)?targetSuffix(JSON.stringify({kind:"warp",x:warp.x,y:warp.y})):""}`);group.warps.push(warp);
   group.taken||=this.history.taken(map,warp.x,warp.y);
   groups.set(key,group);
  }
  // surf-gated-exits-v1: an exit reachable only across water is not listed while Surf cannot be used; a doorway is
  // across water only when every one of its tiles is. exit-reachability-v1: nor is one reachable neither way.
  const block=exitReach(this.features,state);
  const all=[...groups.values()],listed=this.features["world-destinations-v1"]?state.topology?.connections??[]:[];
  const warps=all.filter(g=>!g.warps.every(w=>block.warp(w.x,w.y))),connections=listed.filter(c=>!block.connection(c));
  const across=all.length-warps.length+listed.length-connections.length;
  const cuts=new Set<Cut|null>([...all.filter(g=>!warps.includes(g)).flatMap(g=>g.warps.map(w=>block.warpCut(w.x,w.y))),...listed.filter(c=>!connections.includes(c)).map(c=>block.connectionCut(c))]);
  // surf-gated-exits-v2: the water part names no badge or move (GetInteractedWaterScript returns no script, so no message, without badge 5 and a party Surf user).
  const plain=this.features["surf-gated-exits-v2"];
  const why=!cuts.has("none")?(plain?"every exit listed on this map is across water you cannot cross yet":"every exit listed on this map is across water, and you cannot use Surf yet"):cuts.has("water")?(plain?"every exit listed on this map is across water you cannot cross yet or cannot be reached on foot from where you stand":"every exit listed on this map is across water you cannot Surf yet or cannot be reached on foot from where you stand"):"no exit listed on this map can be reached on foot from where you stand";
  // exit-reachability-v1: a doorway prints only its tiles not labelled none; off, every tile as before.
  const shown=(g:{tiles:string[];warps:{x:number;y:number}[]}):string[]=>this.features["exit-reachability-v1"]?g.tiles.filter((_,i)=>{const w=g.warps[i];return w===undefined||block.warpCut(w.x,w.y)!=="none";}):g.tiles;
  const open=[
   ...warps.filter(g=>!g.taken).map(g=>`${shown(g).join(" or ")} -> ${mapKey(g.destination)==="127/127"?"dynamic destination":this.place(g.destination)}`),
   ...connections.filter(c=>!this.history.crossed(map,mapKey(c.destination))).map(c=>`${c.direction}${EDGES.has(c.direction)?" edge":""} -> ${this.place(c.destination)}${semantic&&(c.edges?.length??0)>0&&uniqueDirection(state.topology?.connections,c.direction)?targetSuffix(connectionArgument(c.direction)):""}`),
  ];
  const none=warps.length+connections.length>0?`none (you have taken every exit ${across>0?"you can walk to ":""}on this map this run)`:across>0?`none you can walk to (${why})`:"none (no exits are listed on this map)";
  return `${UNTAKEN_HEADER}: ${open.length===0?none:open.join("; ")}`;
 }
 // The readout with the line inserted after its Position line (or Location line when position is off).
 annotate(text:string,state:Snapshot):string {
  // A live result's own state is recorded only after the tool returns; it may hold the map change this line needs.
  this.history.observe(state);
  const anchor=/^Location: .*$(?:\nPosition: .*$)?/m.exec(text);
  if(anchor===null)return text;
  const line=this.line(state,text);
  if(line===null)return text;
  const end=anchor.index+anchor[0].length;
  return `${text.slice(0,end)}\n${line}${text.slice(end)}`;
 }
}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export function withUntakenExits(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">):AgentTool[] {
 if(!features["untaken-exits-v1"])return [...tools];
 const exits=new UntakenExits(features);recorder.subscribe(event=>{exits.observe(event);});
 const annotate=<T>(result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  // The readout is the last text part that carries a Location line.
  const index=result.content.findLastIndex(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const content=[...result.content];content[index]={...part,text:exits.annotate(part.text,state)};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to"&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update)),executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
