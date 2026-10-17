// harness-trust-v1: a numbered trust order at the end of the system prompt, and a header read from game memory at the
// top of every observe, press and navigate_to result: the latest story line naming a place, resolved by
// story-destinations-v1's resolver, and the story characters the readout's own object-list line places on this map.
// A SUPERVISOR paragraph follows the header when the player's own last two moves both took them farther from where
// that line points. Facts only, nothing clipped, nothing guessed.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunEvent} from "./events.js";
import {StoryDestinations,PlacesBodySchema,type MapId,type Place,type PlaceSource,type StoryGoal} from "./story-destinations.js";
import {Value} from "typebox/value";

export const TRUST_HEADER="Read from game memory, always true:";

// The trust order, appended last to the system prompt. With game-evidence-priority-v1 it ranks that section's evidence.
export function trustSection(gameEvidence:boolean,supervisor:boolean):string {
 const lead=gameEvidence?"Trust order (this puts \"Game evidence first\" in order): when sources disagree, believe them in this order.":"Trust order: when sources disagree, believe them in this order.";
 return [
  lead,
  "1. The latest thing a story character told you. Each result starts with it as the Story goal line, read from game memory, with the place it names.",
  "2. The other facts read from game memory in the result: where you are, who is on this map, the exits and the map.",
  "3. Never your memory of Pokémon games, guides or walkthroughs. When it disagrees with 1 or 2, it is wrong about this game.",
  ...(supervisor?["A SUPERVISOR note under the header says when your last two moves took you farther from the place the Story goal line names."]:[]),
 ].join("\n");
}

const same=(a:MapId,b:MapId)=>a[0]===b[0]&&a[1]===b[1];
const mapLabel=(name:string,id:MapId)=>`${name} (map ${String(id[0])}/${String(id[1])})`;
const at=(p:{readonly x:number;readonly y:number})=>`(${String(p.x)},${String(p.y)})`;

export function goalLine(goal:StoryGoal|null,places:readonly Place[]|Error,anyLine:boolean):string {
 if(places instanceof Error)return anyLine?`Story goal: not known; the game's map table could not be read (${places.message}).`:"Story goal: no story character has named a place yet in this run.";
 if(goal===null)return "Story goal: no story character has named a place yet in this run.";
 const {line,resolved}=goal;
 return `Story goal: "${line.text}" (${line.speaker}, turn ${String(line.turn)}) -> ${resolved.map(r=>`${r.quote}${r.text}`).join(" ")}`;
}

const CHARACTERS=/^Story characters here \(from this map's own object list\): (.*?)\. Not on this map: /m;
// The readout's own character-presence line (character-presence-v1), the characters placed on this map only.
export function charactersLine(text:string):string|null {
 const m=CHARACTERS.exec(text);
 return m===null?null:`Story characters on this map (from its own object list): ${m[1] ?? ""}.`;
}

// Map-table steps (warps and NORTH/SOUTH/EAST/WEST connections) from a map to the nearest target; null when none leads there.
export function mapSteps(from:MapId,targets:readonly MapId[],places:readonly Place[]):number|null {
 const key=(id:MapId)=>`${String(id[0])}/${String(id[1])}`;
 const byId=new Map(places.map(p=>[key(p.map_id),p]));
 const goals=new Set(targets.map(key));
 const seen=new Set([key(from)]);let frontier=[from],steps=0;
 while(frontier.length>0){
  if(frontier.some(id=>goals.has(key(id))))return steps;
  const next:MapId[]=[];
  for(const id of frontier){
   const p=byId.get(key(id));if(p===undefined)continue;
   for(const to of [...p.warps.map(w=>w.to),...p.connections.filter(c=>EDGE_SIDES.has(c.direction)).map(c=>c.to)]){
    if(seen.has(key(to)))continue;seen.add(key(to));next.push(to);
   }
  }
  frontier=next;steps++;
 }
 return null;
}
const EDGE_SIDES=new Set(["NORTH","SOUTH","EAST","WEST"]);
// One map-table step from a map to another: a warp or a walkable connection between them.
function adjacent(from:MapId,to:MapId,places:readonly Place[]):boolean {
 const p=places.find(q=>same(q.map_id,from));
 return p!==undefined&&(p.warps.some(w=>same(w.to,to))||p.connections.some(c=>EDGE_SIDES.has(c.direction)&&same(c.to,to)));
}

interface WayIn {readonly label:string;readonly distance:number}
// The ways off this map that lead into a target, or (when none does) one map-table step closer to one, each with
// its straight-line tile distance from the player.
export function waysHere(state:GameStateSnapshot,targets:readonly Place[],places:readonly Place[]):WayIn[] {
 const here=state.map_id,p=state.position;
 if(here===null||p===null)return [];
 const map=places.find(q=>same(q.map_id,here));if(map===undefined)return [];
 const ids=targets.map(t=>t.map_id);
 const steps=mapSteps(here,ids,places);
 if(steps===null||steps===0)return [];
 const toward=(to:MapId)=>steps===1?ids.some(id=>same(id,to)):mapSteps(to,ids,places)===steps-1;
 const name=(to:MapId)=>{const q=places.find(r=>same(r.map_id,to));return q===undefined?mapLabel("a map",to):mapLabel(q.display,to);};
 const size=state.topology??state.map_grid;
 const out:WayIn[]=[];
 for(const w of map.warps)if(toward(w.to))out.push({label:`the door at ${at(w)} (to ${name(w.to)})`,distance:Math.abs(w.x-p.x)+Math.abs(w.y-p.y)});
 if(size!=null)for(const c of map.connections){
  if(!EDGE_SIDES.has(c.direction)||!toward(c.to))continue;
  const d=c.direction==="NORTH"?p.y:c.direction==="SOUTH"?size.height-1-p.y:c.direction==="WEST"?p.x:size.width-1-p.x;
  out.push({label:`this map's ${c.direction} edge (to ${name(c.to)})`,distance:d});
 }
 return out;
}

export interface AwayStep {
 readonly measure:"tiles"|"maps";
 readonly from_map:MapId;readonly to_map:MapId;readonly from_name:string;readonly to_name:string;
 readonly from:{readonly x:number;readonly y:number};readonly to:{readonly x:number;readonly y:number};
 readonly before:number;readonly after:number;readonly way:string|null;
}
export interface StoryGoalAwayFacts {
 readonly speaker:string;readonly line_turn:number;readonly quote:string;
 readonly targets:readonly {readonly name:string;readonly map_id:MapId}[];
 readonly steps:readonly AwayStep[];
}
interface Sample {readonly key:string;readonly map:MapId;readonly name:string;readonly pos:{readonly x:number;readonly y:number};readonly tiles:WayIn|null;readonly maps:number|null}

// Counts the player's own moves farther from the goal's place; two in a row (no closer move between) fire once.
export class WalkAway {
 private last:Sample|null=null;
 private away:AwayStep[]=[];
 observe(state:GameStateSnapshot,goal:StoryGoal|null,places:readonly Place[]):StoryGoalAwayFacts|null {
  if(!state.started||state.screen!=="overworld"||state.in_battle||state.map_id===null||state.position===null)return null;
  const targets=goal===null?[]:goal.resolved.flatMap(r=>r.target===null?[]:[r.target]);
  if(goal===null||targets.length===0){this.reset(null);return null;}
  const key=`${String(goal.line.turn)}\u0000${goal.line.speaker}\u0000${goal.line.text}`;
  const here=state.map_id;
  if(targets.some(t=>same(t.map_id,here))){this.reset(null);return null;}
  const ways=waysHere(state,targets,places);
  const nearest=ways.reduce<WayIn|null>((best,w)=>best===null||w.distance<best.distance?w:best,null);
  const sample:Sample={key,map:here,name:state.location_display??state.location??"this map",pos:state.position,tiles:nearest,maps:mapSteps(here,targets.map(t=>t.map_id),places)};
  const prev=this.last;this.last=sample;
  if(prev?.key!==key){this.away=[];return null;}
  let step:AwayStep|null=null,closer=false;
  if(same(prev.map,here)){
   if(prev.pos.x===sample.pos.x&&prev.pos.y===sample.pos.y)return null;
   if(prev.tiles===null||sample.tiles===null)return null;
   if(sample.tiles.distance>prev.tiles.distance)step={measure:"tiles",from_map:prev.map,to_map:here,from_name:prev.name,to_name:sample.name,from:prev.pos,to:sample.pos,before:prev.tiles.distance,after:sample.tiles.distance,way:sample.tiles.label};
   else closer=sample.tiles.distance<prev.tiles.distance;
  }else{
   // Only a walk through one warp or connection counts; a whiteout, a fly or a scripted warp is not a move.
   if(!adjacent(prev.map,here,places)){this.away=[];return null;}
   if(prev.maps===null||sample.maps===null)return null;
   if(sample.maps>prev.maps)step={measure:"maps",from_map:prev.map,to_map:here,from_name:prev.name,to_name:sample.name,from:prev.pos,to:sample.pos,before:prev.maps,after:sample.maps,way:null};
   else closer=sample.maps<prev.maps;
  }
  if(closer){this.away=[];return null;}
  if(step===null)return null;
  this.away.push(step);
  if(this.away.length<2)return null;
  const steps=this.away;this.away=[];
  return {speaker:goal.line.speaker,line_turn:goal.line.turn,quote:goal.line.text,targets:targets.map(t=>({name:t.display,map_id:t.map_id})),steps};
 }
 private reset(sample:Sample|null):void {this.last=sample;this.away=[];}
}

function stepText(s:AwayStep):string {
 if(s.measure==="tiles")return `on ${mapLabel(s.to_name,s.to_map)} you went from ${at(s.from)} to ${at(s.to)}, and ${s.way ?? "the way in"} went from ${String(s.before)} to ${String(s.after)} tiles away in a straight line`;
 return `you went from ${mapLabel(s.from_name,s.from_map)} to ${mapLabel(s.to_name,s.to_map)}, from ${String(s.before)} to ${String(s.after)} map${s.after===1?"":"s"} away from it by the game's map table (doors, stairs and map edges)`;
}
export function awayText(f:StoryGoalAwayFacts):string {
 const place=f.targets.map(t=>mapLabel(t.name,t.map_id)).join(" or ");
 return `SUPERVISOR: Your last two moves took you farther from ${place}, the place in ${f.speaker}'s line above (turn ${String(f.line_turn)}): ${f.steps.map(stepText).join("; then ")}. Unless a story character has told you something newer, the Story goal line is where to go.`;
}

export interface TrustRecorder {storyGoalAway?(tool:string,facts:StoryGoalAwayFacts,text:string):void}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export interface TrustOptions {readonly supervisor:boolean}

// The header (and any walk-away note) put at the top of the result's first text part.
export class HarnessTrust {
 private readonly story=new StoryDestinations();
 private readonly walk=new WalkAway();
 constructor(private readonly options:TrustOptions) {}
 observe(event:RunEvent):void {this.story.observe(event);}
 lines(text:string,state:GameStateSnapshot,callId:string,places:readonly Place[]|Error):{readonly header:string;readonly away:StoryGoalAwayFacts|null} {
  const anyLine=this.story.latest(callId,null,state.name)!==null;
  const goal=places instanceof Error||state.map_id===null?null:this.story.goal(state.map_id,state.name,callId,places);
  const characters=charactersLine(text);
  const header=[TRUST_HEADER,goalLine(goal,places,anyLine),...(characters===null?[]:[characters])].join("\n");
  const away=this.options.supervisor&&!(places instanceof Error)?this.walk.observe(state,goal,places):null;
  return {header,away};
 }
}

export function withHarnessTrust(tools:readonly AgentTool[],on:boolean,recorder:{subscribe(listener:(event:RunEvent)=>void):void}&TrustRecorder,source:PlaceSource,options:TrustOptions={supervisor:true}):AgentTool[] {
 if(!on)return [...tools];
 const record=recorder.storyGoalAway?.bind(recorder);
 if(options.supervisor&&record===undefined)throw new Error("harness-trust-v1 needs a recorder for story_goal_away events");
 const trust=new HarnessTrust(options);recorder.subscribe(event=>{trust.observe(event);});
 let table:Promise<readonly Place[]>|null=null;
 const places=async():Promise<readonly Place[]|Error>=>{
  table??=source.places===undefined?Promise.reject(new Error("this game server does not serve /pokebench/places")):source.places().then(body=>{
   if(!Value.Check(PlacesBodySchema,body))throw new Error("malformed /pokebench/places");
   return body.places;
  });
  try{return await table;}catch(error){table=null;return error instanceof Error?error:new Error(String(error));}
 };
 const annotate=async<T>(tool:string,id:string,result:AgentToolResult<T>):Promise<AgentToolResult<T>>=>{
  const state=stateOf(result.details);
  if(state===null||!state.started)return result;
  const index=result.content.findIndex(part=>part.type==="text");
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const {header,away}=trust.lines(part.text,state,id,await places());
  const note=away===null?null:awayText(away);
  if(away!==null&&note!==null)record?.(tool,away,note);
  const content=[...result.content];content[index]={...part,text:`${header}\n${note===null?"":`${note}\n`}\n${part.text}`};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to")return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(tool.name,id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update)=>annotate(tool.name,id,await tool.executeChecked(id,params,check,signal,update))};
  return checked;
 });
}
