// harness-trust-v1: a numbered trust order at the end of the system prompt, and a header read from game memory at the
// top of every observe, press and navigate_to result: the latest story line naming a place, resolved by
// story-destinations-v1's resolver, and the story characters the readout's own object-list line places on this map.
// A SUPERVISOR paragraph follows the header when the player's own last two moves both took them farther from where
// that line points. Facts only, nothing clipped, nothing guessed.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunEvent} from "./events.js";
import {STORY_HEADER,StoryDestinations,PlacesBodySchema,staleGoalLine,type MapId,type Place,type PlaceSource,type StoryGoal} from "./story-destinations.js";
import {Value} from "typebox/value";
import {exitBlock} from "./surf-gate.js";
import {connectionArgument,targetSuffix,uniqueDirection} from "./semantic-targets.js";

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

const warpArgument=(w:{readonly x:number;readonly y:number}):string=>JSON.stringify({kind:"warp",x:w.x,y:w.y});
// A connection navigate_to_target can walk off: the readout lists its edge tiles.
// It resolves a connection by direction alone, so the side must have exactly one.
const walkOff=(state:Pick<GameStateSnapshot,"topology">,direction:string):boolean=>uniqueDirection(state.topology?.connections,direction)&&(state.topology?.connections.find(c=>c.direction===direction)?.edges?.length??0)>0;
const same=(a:MapId,b:MapId)=>a[0]===b[0]&&a[1]===b[1];
const mapLabel=(name:string,id:MapId)=>`${name} (map ${String(id[0])}/${String(id[1])})`;
const at=(p:{readonly x:number;readonly y:number})=>`(${String(p.x)},${String(p.y)})`;

export function goalLine(goal:StoryGoal|null,places:readonly Place[]|Error,anyLine:boolean,state?:GameStateSnapshot,semantic=false):string {
 if(places instanceof Error)return anyLine?`Story goal: not known; the game's map table could not be read (${places.message}).`:"Story goal: no story character has named a place yet in this run.";
 if(goal===null)return "Story goal: no story character has named a place yet in this run.";
 if(goal.done===true)return staleGoalLine(goal.line,goal.doneReason);
 const {line,resolved}=goal;
 if(state!==undefined)return `Story goal: "${line.text}" (${line.speaker}, turn ${String(line.turn)}) -> ${resolved.map(r=>r.target===null?`${r.quote}${r.text}`:`${r.quote} = ${mapLabel(r.target.display,r.target.map_id)}. ${localGoalAccess(state,r.target,places,semantic)}`).join(" ")}`;
 return `Story goal: "${line.text}" (${line.speaker}, turn ${String(line.turn)}) -> ${resolved.map(r=>`${r.quote}${r.text}`).join(" ")}`;
}

// Access facts only for this map. Do not turn disconnected parts of a map into a suggested direct route.
// semantic-navigation-v2: each entrance carries the target navigate_to_target takes.
function localGoalAccess(state:GameStateSnapshot,target:Place,places:readonly Place[],semantic=false):string {
 const map=places.find(p=>state.map_id!==null&&same(p.map_id,state.map_id));
 if(map===undefined)return "Local access is unknown.";
 if(same(map.map_id,target.map_id))return "The destination is the current map.";
 const reach=state.exit_reach;
 const qualified=reach!==undefined&&exitBlock({surf:false,reach:true},state).foot(0,0)!==null;
 const label=(value:string|undefined)=>!qualified||value===undefined?"reachability unknown":value==="foot"?"listed as reachable on foot":value==="water"?"across water; not reachable on foot":"not reachable on foot from here";
 const ways=[...map.warps.filter(w=>same(w.to,target.map_id)).map(w=>`door at ${at(w)} (${label(reach?.warps.find(r=>r.x===w.x&&r.y===w.y)?.reach)})${semantic?targetSuffix(warpArgument(w)):""}`),...map.connections.filter(c=>same(c.to,target.map_id)).map(c=>`${c.direction} edge (${label(reach?.connections.find(r=>r.direction===c.direction&&same(r.destination,c.to))?.reach)})`)];
 return ways.length===0?"No direct entrance to this destination is listed on the current map; consult the current exits.":`Direct entrances on this map: ${ways.join("; ")}.`;
}

const CHARACTERS=/^Story characters here \(from this map's own object list\): (.*?)\. Not on this map: /m;
// The readout's own character-presence line (character-presence-v1), the characters placed on this map only.
export function charactersLine(text:string):string|null {
 const m=CHARACTERS.exec(text);
 return m===null?null:`Story characters on this map (from its own object list): ${m[1] ?? ""}.`;
}

// exit-reachability-v1's labels: the warps and connections of this map the server's flood reaches on foot from the
// player's tile, named from the map table. Null without exit_reach, with a malformed foot mask, or for a map the table
// lacks. A warp the table does not list, or one to a dynamic destination, is left out rather than guessed.
export function exitsLine(state:Pick<GameStateSnapshot,"map_id"|"exit_reach"|"topology"|"surf_gate">,places:readonly Place[],semantic=false):string|null {
 const reach=state.exit_reach,here=state.map_id;
 if(reach===undefined||here===null||exitBlock({surf:false,reach:true},state).foot(0,0)===null)return null;
 const map=places.find(p=>same(p.map_id,here));if(map===undefined)return null;
 const name=(to:MapId)=>{const q=places.find(r=>same(r.map_id,to));return q===undefined?null:mapLabel(q.display,to);};
 const doors=new Map<string,{tiles:string[];label:string}>();
 for(const w of reach.warps){
  if(w.reach!=="foot")continue;
  const to=map.warps.find(m=>m.x===w.x&&m.y===w.y)?.to;
  const label=to===undefined?null:name(to);if(to===undefined||label===null)continue;
  const key=`${String(to[0])}/${String(to[1])}`;const door=doors.get(key)??{tiles:[],label};
  door.tiles.push(`${at(w)}${semantic?targetSuffix(warpArgument(w)):""}`);doors.set(key,door);
 }
 const edges=reach.connections.flatMap(c=>{const label=c.reach==="foot"?name(c.destination):null;return label===null?[]:[`${c.direction} edge -> ${label}${semantic&&walkOff(state,c.direction)?targetSuffix(connectionArgument(c.direction)):""}`];});
 const all=[...[...doors.values()].map(d=>`${d.tiles.join(" or ")} -> ${d.label}`),...edges];
 return `Exits you can walk to from where you stand: ${all.length===0?"none (no exit of this map can be reached on foot from your tile)":all.join("; ")}.`;
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
export function waysHere(state:GameStateSnapshot,targets:readonly Place[],places:readonly Place[],reachable=false):WayIn[] {
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
 const reach=state.exit_reach;
 const qualified=reach!==undefined&&exitBlock({surf:false,reach:true},state).foot(0,0)!==null;
 if(reachable&&!qualified)return [];
 for(const w of map.warps)if(toward(w.to)&&(!reachable||reach?.warps.some(r=>r.x===w.x&&r.y===w.y&&r.reach==="foot")))out.push({label:`the door at ${at(w)} (to ${name(w.to)})`,distance:Math.abs(w.x-p.x)+Math.abs(w.y-p.y)});
 if(size!=null)for(const c of map.connections){
  if(!EDGE_SIDES.has(c.direction)||!toward(c.to)||(reachable&&!reach?.connections.some(r=>r.direction===c.direction&&same(r.destination,c.to)&&r.reach==="foot")))continue;
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
interface Sample {readonly key:string;readonly map:MapId;readonly name:string;readonly pos:{readonly x:number;readonly y:number};readonly ways:readonly WayIn[];readonly maps:number|null}

// Counts the player's own moves farther from the goal's place; two in a row (no closer move between) fire once.
export class WalkAway {
 constructor(private readonly reachable=false){}
 private last:Sample|null=null;
 private away:AwayStep[]=[];
 // own: the result is the player's own move: a press or navigate_to that ended with field controls free. Movement seen
 // otherwise (an observe, a script moving the player while controls are locked) is not counted and starts over.
 observe(state:GameStateSnapshot,goal:StoryGoal|null,places:readonly Place[],own:boolean):StoryGoalAwayFacts|null {
  if(!state.started||state.screen!=="overworld"||state.in_battle||state.map_id===null||state.position===null)return null;
  const targets=goal===null?[]:goal.resolved.flatMap(r=>r.target===null?[]:[r.target]);
  if(goal===null||targets.length===0){this.reset(null);return null;}
  const key=`${String(goal.line.turn)}\u0000${goal.line.speaker}\u0000${goal.line.text}`;
  const here=state.map_id;
  if(targets.some(t=>same(t.map_id,here))){this.reset(null);return null;}
  const sample:Sample={key,map:here,name:state.location_display??state.location??"this map",pos:state.position,ways:waysHere(state,targets,places,this.reachable),maps:mapSteps(here,targets.map(t=>t.map_id),places)};
  const prev=this.last;this.last=sample;
  if(prev?.key!==key){this.away=[];return null;}
  if(same(prev.map,here)&&prev.pos.x===sample.pos.x&&prev.pos.y===sample.pos.y)return null;
  if(!own||state.field_controls_locked!==false){this.away=[];return null;}
  let step:AwayStep|null=null,closer=false;
  if(same(prev.map,here)){
   // Away only when no way into the goal got closer and the nearest one is farther; the note names the way nearest
   // after the move among those that got farther, with its own two distances.
   const pairs=sample.ways.flatMap(w=>{const before=prev.ways.find(p=>p.label===w.label);return before===undefined?[]:[{label:w.label,before:before.distance,after:w.distance}];});
   if(pairs.length===0)return null;
   const min=(ds:readonly number[])=>Math.min(...ds);
   if(pairs.some(p=>p.after<p.before)){closer=true;}
   else if(min(pairs.map(p=>p.after))>min(pairs.map(p=>p.before))){
    const way=pairs.filter(p=>p.after>p.before).reduce((best,p)=>p.after<best.after?p:best);
    step={measure:"tiles",from_map:prev.map,to_map:here,from_name:prev.name,to_name:sample.name,from:prev.pos,to:sample.pos,before:way.before,after:way.after,way:way.label};
   }
  }else{
   // Only a walk through one warp or connection counts; a whiteout, a fly or a scripted warp is not a move.
   if(this.reachable){this.away=[];return null;}
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
 if(s.measure==="tiles")return `on ${mapLabel(s.to_name,s.to_map)} you went from ${at(s.from)} to ${at(s.to)}, and ${s.way ?? "the way in"} went from ${String(s.before)} to ${String(s.after)} tiles away, counting tiles across and down`;
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

// battleAction: harness-trust-v2 also heads battle_action results.
export interface TrustOptions {readonly supervisor:boolean;readonly battleAction?:boolean;readonly goalOnce?:boolean;readonly retireLab?:boolean;readonly stageBound?:boolean;readonly omitEmptyGoal?:boolean;readonly scriptedGuidance?:boolean;readonly reachableGoal?:boolean;readonly semanticTargets?:boolean}

// The header (and any walk-away note) put at the top of the result's first text part.
export class HarnessTrust {
 private readonly story:StoryDestinations;
 private readonly walk:WalkAway;
 constructor(private readonly options:TrustOptions) {this.walk=new WalkAway(options.reachableGoal===true);this.story=new StoryDestinations(options.scriptedGuidance===true);}
 observe(event:RunEvent):void {this.story.observe(event);}
 lines(text:string,state:GameStateSnapshot,callId:string,places:readonly Place[]|Error,own=false,seen=text):{readonly header:string;readonly away:StoryGoalAwayFacts|null} {
  const anyLine=this.story.latest(callId,null,state.name)!==null;
  const goal=places instanceof Error||state.map_id===null?null:this.story.goal(state.map_id,state.name,callId,places,this.options.retireLab===true,state.story??null,this.options.stageBound===true);
  const characters=charactersLine(text);
  const exits=places instanceof Error?null:exitsLine(state,places,this.options.semanticTargets===true);
  const repeated=this.options.goalOnce===true&&goal!==null&&goal.done!==true&&seen.includes(STORY_HEADER)&&seen.includes(`"${goal.line.text}"`);
  const omitGoal=this.options.omitEmptyGoal===true&&!(places instanceof Error)&&(goal===null||goal.done===true);
  const header=[TRUST_HEADER,...(repeated||omitGoal?[]:[goalLine(goal,places,anyLine,this.options.reachableGoal===true?state:undefined,this.options.semanticTargets===true)]),...(characters===null?[]:[characters]),...(exits===null?[]:[exits])].join("\n");
  const away=this.options.supervisor&&!(places instanceof Error)?this.walk.observe(state,goal?.done===true?null:goal,places,own):null;
  return {header,away};
 }
}

export function withHarnessTrust(tools:readonly AgentTool[],on:boolean,recorder:{subscribe(listener:(event:RunEvent)=>void):void}&TrustRecorder,source:PlaceSource,options:TrustOptions={supervisor:true}):AgentTool[] {
 if(!on)return [...tools];
 const record=recorder.storyGoalAway?.bind(recorder);
 if(options.supervisor&&record===undefined)throw new Error("harness-trust-v1 needs a recorder for story_goal_away events");
 const trust=new HarnessTrust(options);recorder.subscribe(event=>{trust.observe(event);});
 // The map table never changes; the names of the player's own house do, so it is read once per player name.
 const tables=new Map<string,Promise<readonly Place[]>>();
 const places=async(player:string):Promise<readonly Place[]|Error>=>{
  let pending=tables.get(player);
  if(pending===undefined){
   pending=source.places===undefined?Promise.reject(new Error("this game server does not serve /pokebench/places")):source.places().then(body=>{
    if(!Value.Check(PlacesBodySchema,body))throw new Error("malformed /pokebench/places");
    return body.places;
   });
   tables.set(player,pending);
  }
  try{return await pending;}catch(error){tables.delete(player);return error instanceof Error?error:new Error(String(error));}
 };
 const annotate=async<T>(tool:string,id:string,result:AgentToolResult<T>):Promise<AgentToolResult<T>>=>{
  const state=stateOf(result.details);
  if(state===null||!state.started)return result;
  const index=result.content.findIndex(part=>part.type==="text");
  const part=result.content[index];
  if(part?.type!=="text")return result;
  // battle_action (harness-trust-v2) puts its status first and the readout after the screenshot, so its readout lines are
  // read from every text part; the other tools keep harness-trust-v1's first-part read.
  // navigate_to puts "Navigation:" first and the story-destinations block in a later part. input-cuts-v1's goal
  // check has to see that later part. Characters still come from the first part.
  const readout=tool==="battle_action"?result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n"):part.text;
  const walk=tool==="navigate_to"||(options.semanticTargets===true&&(tool==="navigate_to_target"||tool==="explore_map"));
  const seen=walk&&options.goalOnce===true?result.content.flatMap(c=>c.type==="text"?[c.text]:[]).join("\n"):readout;
  const {header,away}=trust.lines(readout,state,id,await places(state.name ?? ""),tool==="press"||walk,seen);
  const note=away===null?null:awayText(away);
  if(away!==null&&note!==null)record?.(tool,away,note);
  const content=[...result.content];content[index]={...part,text:`${header}\n${note===null?"":`${note}\n`}\n${part.text}`};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to"&&!(options.battleAction===true&&tool.name==="battle_action")&&!(options.semanticTargets===true&&(tool.name==="navigate_to_target"||tool.name==="explore_map")))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(tool.name,id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(tool.name,id,await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
