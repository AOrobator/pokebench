// untaken-exits-v1: right under the readout's Location/Position lines, every exit on the current map (warps from the
// game's own warp events, and map connections where the readout shows them) that this run has not used yet.
// Facts only, from recorded states; nothing clipped.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import {ExitHistory,mapKey,readoutNames,tileKey,warpsOf} from "./exit-history.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";

export const UNTAKEN_HEADER="Exits here you have not taken";
type Snapshot=Pick<GameStateSnapshot,"started"|"screen"|"location"|"map_id"|"position"|"interaction_targets"|"topology">;
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
  const map=mapKey(state.map_id);
  const groups=new Map<string,{tiles:string[];destination:readonly number[];taken:boolean}>();
  for(const warp of warpsOf(state)){
   if(warp.destination===null)continue;
   const key=JSON.stringify(warp.destination);
   const group=groups.get(key)??{tiles:[],destination:warp.destination,taken:false};
   group.tiles.push(`(${tileKey(warp.x,warp.y)})`);
   group.taken||=this.history.taken(map,warp.x,warp.y);
   groups.set(key,group);
  }
  const warps=[...groups.values()];
  const connections=this.features["world-destinations-v1"]?state.topology?.connections??[]:[];
  const open=[
   ...warps.filter(g=>!g.taken).map(g=>`${g.tiles.join(" or ")} -> ${mapKey(g.destination)==="127/127"?"dynamic destination":this.place(g.destination)}`),
   ...connections.filter(c=>!this.history.crossed(map,mapKey(c.destination))).map(c=>`${c.direction}${EDGES.has(c.direction)?" edge":""} -> ${this.place(c.destination)}`),
  ];
  const none=warps.length+connections.length===0?"none (no exits are listed on this map)":"none (you have taken every exit on this map this run)";
  return `${UNTAKEN_HEADER}: ${open.length===0?none:open.join("; ")}`;
 }
 // The readout with the line inserted after its Position line (or Location line when position is off).
 annotate(text:string,state:Snapshot):string {
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
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to")return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update)),executeChecked:async(id,params,check,signal,update)=>annotate(await tool.executeChecked(id,params,check,signal,update))};
  return checked;
 });
}
