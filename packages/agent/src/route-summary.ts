// route-summary-v1: under the readout's Location/Position lines, one harness-computed line per listed
// navigate_to_target target and per tile the current guide row names: whether the route exists, its steps, which
// unbeaten trainers' sight it crosses (the trainer-sight-check-v1 check), and the steps of a route out of their sight.
// Qwen spent 10-41% of its output tokens tracing the ASCII grid by hand to answer exactly these questions.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {navigationReady} from "./navigation.js";
import {plannedRoute,type PlannedRoute,type RouteGoal} from "./semantic-navigation.js";
import {connectionArgument,listedArgument,semanticWalk,targetSuffix,uniqueDirection} from "./semantic-targets.js";
import {askSight} from "./story-battle-heal-gate.js";
import type {SightSeen,TrainerSightPorts} from "./trainer-sight.js";

type Point={readonly x:number;readonly y:number};
type Listed=NonNullable<GameStateSnapshot["interaction_targets"]>[number];

export const ROUTE_SUMMARY_SENTENCE="navigate_to and navigate_to_target find their own path around walls, ledges and water, so give the final tile or target, not stepping stones; you do not need to trace the grid.";
export const ROUTE_HEADER=`Routes from where you stand, worked out by the harness from the map. ${ROUTE_SUMMARY_SENTENCE}`;
export const ROUTE_LINE_CAP=12;
// Server sight checks for one readout. A check that would pass this leaves the line saying so, never guessing.
export const SIGHT_CHECK_CAP=16;

const at=(p:Point):string=>`(${String(p.x)},${String(p.y)})`;
const key=(p:Point):string=>`${String(p.x)},${String(p.y)}`;
const steps=(n:number):string=>`${String(n)} step${n===1?"":"s"}`;
const distance=(a:Point,b:Point):number=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const CONNECTIONS=["NORTH","SOUTH","EAST","WEST"] as const;
const walking=(direction:string):direction is (typeof CONNECTIONS)[number]=>(CONNECTIONS as readonly string[]).includes(direction);

interface Entry {readonly label:string;readonly goal:RouteGoal;readonly exclude:number|null}

// A guide row's tiles count only on the map the row is about: a note can name tiles on other floors.
const placeKey=(name:string):string=>name.toLowerCase().replace(/[^a-z0-9]/g,"");
export function guideTiles(note:string):Point[] {
 const seen=new Map<string,Point>();
 for(const match of note.matchAll(/\((\d{1,3}),(\d{1,3})\)/g)){const p={x:Number(match[1]),y:Number(match[2])};seen.set(key(p),p);}
 return [...seen.values()];
}

export interface GuideRow {readonly map:string;readonly note:string}

function guideEntries(state:GameStateSnapshot,guide:GuideRow|null):Entry[] {
 if(guide===null||state.location==null||placeKey(guide.map)!==placeKey(state.location))return [];
 return guideTiles(guide.note).map(tile=>({label:`guide tile ${at(tile)}`,goal:{route:"tile",tile},exclude:null}));
}

function exitEntries(state:GameStateSnapshot):Entry[] {
 return (state.topology?.connections??[]).flatMap(c=>{
  const direction=c.direction;
  if(!walking(direction)||(c.edges??[]).length===0||!uniqueDirection(state.topology?.connections,direction))return [];
  return [{label:`${direction} edge${targetSuffix(connectionArgument(direction))}`,goal:{route:"connection",direction},exclude:null}];
 });
}

function listedEntries(state:GameStateSnapshot,here:Point):Entry[] {
 const targets=state.interaction_targets??[];
 const label=(t:Listed):string=>`${t.kind==="object"?`object ${String(t.local_id)}`:t.kind} at ${at(t)}`;
 const rank=(t:Listed):number=>t.kind==="warp"?0:1;
 return [...targets].sort((a,b)=>rank(a)-rank(b)||distance(a,here)-distance(b,here)||a.y-b.y||a.x-b.x).flatMap(t=>{
  const argument=listedArgument(t,targets);
  return argument===null?[]:[{label:`${label(t)}${targetSuffix(argument)}`,goal:{route:"listed",target:t},exclude:t.kind==="object"?t.local_id:null}];
 });
}

// The planner keeps off a tile with an object on it, so a tile a trainer sees goes in as one, as a template tile does.
function avoiding(state:GameStateSnapshot,tiles:readonly Point[]):GameStateSnapshot {
 return {...state,...(state.navigation_grid==null?{}:{navigation_grid:{...state.navigation_grid,objects:[...state.navigation_grid.objects,...tiles]}}),...(state.map_grid==null?{}:{map_grid:{...state.map_grid,objects:[...state.map_grid.objects,...tiles]}})};
}

type Sight={readonly seen:readonly SightSeen[]}|{readonly reason:string};

class SightBudget {
 private calls=0;
 // Every tile a check found in sight, with who sees it; shared by all this readout's routes.
 readonly seenTiles=new Map<string,Point&{readonly by:number}>();
 constructor(private readonly check:TrainerSightPorts["check"],private readonly state:GameStateSnapshot,private readonly map:readonly [number,number],private readonly signal?:AbortSignal) {}
 async ask(route:PlannedRoute,exclude:number|null):Promise<Sight> {
  if(route.tiles.length===0)return {seen:[]};
  if(this.calls>=SIGHT_CHECK_CAP)return {reason:"check limit reached"};
  this.calls+=1;
  const answer=await askSight(this.check,this.state,[this.map[0],this.map[1]],route.tiles,this.signal);
  if("reason" in answer)return answer;
  for(const s of answer.seen)this.seenTiles.set(`${key(s.tile)}:${String(s.local_id)}`,{...s.tile,by:s.local_id});
  return {seen:answer.seen.filter(s=>s.local_id!==exclude)};
 }
 avoid(exclude:number|null):Point[] {return [...this.seenTiles.values()].filter(t=>t.by!==exclude).map(({x,y})=>({x,y}));}
}

async function sightFree(state:GameStateSnapshot,entry:Entry,features:FeatureSet,budget:SightBudget):Promise<string> {
 const goal=entry.goal;
 for(;;){
  const avoid=budget.avoid(entry.exclude);
  // A guide tile in sight can only be reached in sight; the planner would stop beside it instead.
  if(goal.route==="tile"&&avoid.some(t=>key(t)===key(goal.tile)))return "no route out of sight";
  const route=plannedRoute(avoiding(state,avoid),goal,features);
  if(route===null)return "no route out of sight";
  const sight=await budget.ask(route,entry.exclude);
  if("reason" in sight)return "a route out of sight was not checked";
  if(sight.seen.length===0)return `${steps(route.steps)} out of their sight`;
 }
}

const seenBy=(seen:readonly SightSeen[]):string=>seen.map(s=>`object ${String(s.local_id)}, sprite ${s.sprite_kind??"unknown"} at ${at(s)}`).join(" and ");

async function routeLine(state:GameStateSnapshot,entry:Entry,features:FeatureSet,budget:SightBudget|null):Promise<string> {
 const route=plannedRoute(state,entry.goal,features);
 if(route===null)return `- ${entry.label}: no route navigate_to_target can walk from here.`;
 const beside=route.launch===undefined&&entry.goal.route==="tile"&&key(route.point)!==key(entry.goal.tile)?` to ${at(route.point)} beside it`:"";
 const launch=route.launch===undefined?"":` to ${at(route.point)}, then press A facing ${at(route.launch.water)} to use ${route.launch.move}`;
 const walk=`${steps(route.steps)}${beside}${launch}`;
 if(budget===null)return `- ${entry.label}: ${walk}.`;
 const sight=await budget.ask(route,entry.exclude);
 if("reason" in sight)return `- ${entry.label}: ${walk}, trainer sight not checked.`;
 if(sight.seen.length===0)return `- ${entry.label}: ${walk}, out of every unbeaten trainer's sight.`;
 return `- ${entry.label}: ${walk}, crosses the sight of ${seenBy(sight.seen)}; ${await sightFree(state,entry,features,budget)}.`;
}

export async function routeSummary(state:GameStateSnapshot,features:FeatureSet,check:TrainerSightPorts["check"]|null,guide:GuideRow|null,signal?:AbortSignal):Promise<string|null> {
 const here=state.position,map=state.map_id;
 // While the field is locked the planner refuses every route, which is not "no route".
 if(!navigationReady(state,"full")||here===null||map===null)return null;
 const entries=[...guideEntries(state,guide),...exitEntries(state),...listedEntries(state,here)];
 if(entries.length===0)return null;
 const shown=entries.slice(0,ROUTE_LINE_CAP),left=entries.length-shown.length;
 const budget=check===null?null:new SightBudget(check,state,map,signal);
 const lines:string[]=[];
 for(const entry of shown)lines.push(await routeLine(state,entry,features,budget));
 return [ROUTE_HEADER,...lines,...(left===0?[]:[`${String(left)} more left out.`])].join("\n");
}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export interface RouteSummaryPorts {
 readonly check:TrainerSightPorts["check"]|null;
 readonly guide:()=>GuideRow|null;
}

export function withRouteSummary(tools:readonly AgentTool[],features:FeatureSet,ports:RouteSummaryPorts):AgentTool[] {
 if(!features["route-summary-v1"])return [...tools];
 const annotate=async<T>(result:AgentToolResult<T>,signal?:AbortSignal):Promise<AgentToolResult<T>>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  const index=result.content.findLastIndex(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const anchor=/^Location: .*$(?:\nPosition: .*$)?/m.exec(part.text);
  if(anchor===null)return result;
  const block=await routeSummary(state,features,ports.check,ports.guide(),signal);
  if(block===null)return result;
  const end=anchor.index+anchor[0].length,content=[...result.content];
  content[index]={...part,text:`${part.text.slice(0,end)}\n${block}${part.text.slice(end)}`};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to"&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update),signal);
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(await tool.execute(id,params,signal,update),signal),executeChecked:async(id,params,check,signal,update,options)=>annotate(await tool.executeChecked(id,params,check,signal,update,options),signal)};
  return checked;
 });
}
