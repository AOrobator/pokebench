// no-exit-here-v1: a press into a map edge, or navigate_to aimed at or past one, on a side with no map connection adds
// one line: "There is no way off <MAP> to the <side>; the ways off this map are: <list>". The game shows nothing there:
// off the map's grid where no map is connected, GetMapGridBlockAt (pokeemerald src/fieldmap.c) gives the impassable
// border block and PlayerNotOnBikeCollide (src/field_player_avatar.c) only bumps, so the line states the fact and lists
// the exits the readout already shows. A side with a connection, reachable or not, is exit-reachability-v1's job.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {mapKey,readoutNames,tileKey,warpsOf} from "./exit-history.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {exitReach,type Cut} from "./surf-gate.js";

export type Side="NORTH"|"SOUTH"|"EAST"|"WEST";
type Snapshot=Pick<GameStateSnapshot,"started"|"screen"|"in_battle"|"location"|"location_display"|"map_id"|"position"|"facing"|"interaction_targets"|"topology"|"surf_gate"|"exit_reach">;
interface Goal {readonly x:number;readonly y:number;readonly map_id:readonly number[]}
const ORDER:readonly Side[]=["NORTH","SOUTH","EAST","WEST"];
const PRESSED:Readonly<Record<string,Side>>={UP:"NORTH",DOWN:"SOUTH",RIGHT:"EAST",LEFT:"WEST"};
const FACING:Readonly<Record<Side,string>>={NORTH:"up",SOUTH:"down",EAST:"right",WEST:"left"};
const CUT:Readonly<Record<Cut,string>>={water:" (crosses water you cannot cross yet)",none:" (cannot be reached on foot from where you stand)"};

type Placed=Snapshot&{readonly map_id:readonly [number,number];readonly position:{readonly x:number;readonly y:number};readonly topology:NonNullable<Snapshot["topology"]>};
const placed=(s:Snapshot):s is Placed=>s.started&&s.screen==="overworld"&&!s.in_battle&&s.map_id!==null&&s.position!==null&&s.topology!=null;
// The sides with no connection among those given, in map order.
const open=(s:Placed,sides:ReadonlySet<Side>):Side[]=>ORDER.filter(side=>sides.has(side)&&!s.topology.connections.some(c=>c.direction===side));

// The side a press pushed off the map: its last button is a direction, pointing off the map from the tile it ends on,
// and the player faces it (when the state says).
export function pressSides(state:Snapshot,buttons:readonly string[]):Side[] {
 if(!placed(state))return [];
 const side=PRESSED[buttons.at(-1)??""];
 if(side===undefined||(state.facing!==null&&state.facing!==FACING[side]))return [];
 const {x,y}=state.position,{width,height}=state.topology;
 const edge=side==="NORTH"?y===0:side==="SOUTH"?y===height-1:side==="EAST"?x===width-1:x===0;
 return edge?open(state,new Set([side])):[];
}

// The sides a navigate_to goal on this map lies on or past.
export function goalSides(state:Snapshot,goal:Goal):Side[] {
 if(!placed(state)||goal.map_id[0]!==state.map_id[0]||goal.map_id[1]!==state.map_id[1])return [];
 const {width,height}=state.topology,sides=new Set<Side>();
 if(goal.y<=0)sides.add("NORTH");
 if(goal.y>=height-1)sides.add("SOUTH");
 if(goal.x>=width-1)sides.add("EAST");
 if(goal.x<=0)sides.add("WEST");
 return open(state,sides);
}

// The line, or null with no side or without the readout's map connections (world-destinations-v1).
export function noExitLine(features:FeatureSet,state:Snapshot,text:string,sides:readonly Side[]):string|null {
 if(sides.length===0||!features["world-destinations-v1"])return null;
 const names=new Map<string,string>();readoutNames(text,state.map_id,names);
 const here=state.map_id===null?undefined:names.get(mapKey(state.map_id));
 const map=here??state.location_display??state.location??"this map";
 const place=(id:readonly number[]):string=>{const name=names.get(mapKey(id));return name===undefined?`map ${mapKey(id)}`:`${name} (map ${mapKey(id)})`;};
 const block=exitReach(features,state);
 const connections=(state.topology?.connections??[]).map(c=>{const cut=block.connectionCut(c);return `${c.direction}${ORDER.includes(c.direction as Side)?" edge":""} -> ${place(c.destination)}${cut===null?"":CUT[cut]}`;});
 const doors=new Map<string,{tiles:string[];cuts:(Cut|null)[];destination:readonly number[]}>();
 for(const w of warpsOf(state)){
  const key=JSON.stringify(w.destination),door=doors.get(key)??{tiles:[],cuts:[],destination:w.destination};
  door.tiles.push(`(${tileKey(w.x,w.y)})`);door.cuts.push(block.warpCut(w.x,w.y));doors.set(key,door);
 }
 // A doorway is cut only when every one of its tiles is, as untaken-exits-v1 lists them.
 const warps=[...doors.values()].map(d=>{const cut=d.cuts.every(c=>c!==null)?d.cuts[0]??null:null;return `${d.tiles.join(" or ")} -> ${mapKey(d.destination)==="127/127"?"dynamic destination":place(d.destination)}${cut===null?"":CUT[cut]}`;});
 const ways=[...connections,...warps];
 const side=sides.map(s=>`the ${s.toLowerCase()}`).join(" or ");
 return `There is no way off ${map} to ${side}; the ways off this map are: ${ways.length===0?"none are listed":ways.join("; ")}`;
}

function stateOf(result:AgentToolResult<unknown>):GameStateSnapshot|undefined {
 const details:unknown=result.details;
 if(typeof details!=="object"||details===null||!("state" in details))return undefined;
 const state:unknown=details.state;
 return typeof state==="object"&&state!==null&&"started" in state?state as GameStateSnapshot:undefined;
}
const textOf=(result:AgentToolResult<unknown>):string=>result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n");

// The press line goes right under its Press result line (or the pressed line); navigate_to's is its own text part right
// after the Navigation part.
function annotate(name:string,params:unknown,result:AgentToolResult<unknown>,features:FeatureSet):AgentToolResult<unknown> {
 const state=stateOf(result);
 if(state===undefined||typeof params!=="object"||params===null)return result;
 const args=params as Record<string,unknown>;
 const sides=name==="press"?pressSides(state,Array.isArray(args["buttons"])?args["buttons"].map(String):[]):goalSides(state,{x:Number(args["x"]),y:Number(args["y"]),map_id:Array.isArray(args["map_id"])?args["map_id"].map(Number):[]});
 const line=noExitLine(features,state,textOf(result),sides);
 if(line===null)return result;
 const content=[...result.content];
 const first=content.findIndex(c=>c.type==="text");
 const part=content[first];
 if(part?.type!=="text")return {...result,content:[...content,{type:"text",text:line}]};
 if(name==="navigate_to"){content.splice(first+1,0,{type:"text",text:line});return {...result,content};}
 const anchor=/^Press result: .*$/m.exec(part.text)??/^.*$/m.exec(part.text);
 const end=(anchor?.index??0)+(anchor?.[0].length??0);
 content[first]={...part,text:`${part.text.slice(0,end)}\n${line}${part.text.slice(end)}`};
 return {...result,content};
}

export function withNoExitHere(tools:readonly AgentTool[],features:FeatureSet):AgentTool[] {
 if(!features["no-exit-here-v1"])return [...tools];
 return tools.map(tool=>{
  if(tool.name!=="press"&&tool.name!=="navigate_to")return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(tool.name,params,await tool.execute(id,params,signal,update),features);
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(tool.name,params,await tool.execute(id,params,signal,update),features) as Awaited<ReturnType<CheckedPressTool["execute"]>>,executeChecked:async(id,params,check,signal,update)=>annotate(tool.name,params,await tool.executeChecked(id,params,check,signal,update),features) as Awaited<ReturnType<CheckedPressTool["executeChecked"]>>};
  return checked;
 });
}
