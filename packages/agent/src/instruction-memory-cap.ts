// instruction-memory-cap-v1: rule A′ over the episodes milestone-instruction-memory-v1 keeps. Whole episodes only, never cut.
// Order: story anchor, proven done (pret templates, story checkpoints, receipts, trainer flags), nearby maps, named target, recency. Steps 1 and 3
// always stay; 4 and 5 fill the room left under the cap. The reference implementation is
// runs/analysis/bounded-input-20261028/rule_a2.py, which a702's T700 and T1301 must match byte for byte.
import type {RunEvent} from "./events.js";
import {RETIREMENT_RULES} from "./milestone-memory-rules.js";
import {PRET_MAP_SECTIONS} from "./pret-map-sections.js";
import {STORY_CHARACTERS} from "./script-line-presence.js";
import {STORY_CHECKPOINTS} from "./story-checkpoints.js";

export const INSTRUCTION_MEMORY_CAP_CHARS=16000;
// The cap counts characters as code points, as Python len() does in the reference implementation.
export const codePoints=(s:string):number=>Array.from(s).length;
export const omittedLine=(n:number):string=>`${String(n)} earlier episodes are left out and remain in the run recording.`;
export type CapRow=readonly [speaker:string|null,source:string|null,text:string,map:string|null,mapId:readonly number[]|null,stateEvent:number|null];
export interface CapEpisode {readonly result:number;readonly dialogue:readonly number[];readonly turn:number;readonly pages:readonly CapRow[]}
export type CapStep="anchor"|"done"|"nearby"|"named"|"recency";
export interface CapDecision {readonly result:number;readonly step:CapStep;readonly fact:string;readonly kept:boolean}
export interface CapSelection {readonly kept:CapEpisode[];readonly omitted:number;readonly decisions:CapDecision[]}

type State=Extract<RunEvent,{type:"state";started:boolean}>;
interface StoryLine {readonly speaker:string;readonly turn:number;readonly quote:string}
// pret data/maps/*_Gym*/scripts.inc: each leader's FLAG_BADGE0N_GET and "received the … BADGE from …" text.
const LEADER_BADGE:Readonly<Record<string,string>>={ROXANNE:"STONE",BRAWLY:"KNUCKLE",WATTSON:"DYNAMO",FLANNERY:"HEAT",NORMAN:"BALANCE",WINONA:"FEATHER",TATE:"MIND",LIZA:"MIND",JUAN:"RAIN"};
const PEOPLE=[...new Set([...STORY_CHARACTERS.map(c=>c.name),...Object.keys(LEADER_BADGE)])];
// pret receipt strings with {PLAYER} substituted; true marks a completion, false a page of the same exchange.
const RECEIPTS:readonly (readonly [string,boolean])[]=[
 ["{P} put away the .+\\nin the .+ POCKET\\.",true], // data/text/obtain_item.inc gText_PutItemInPocket
 ["{P} put away the .+\\nin the BAG\\.",true], // gText_PlayerPutItemInBag
 ["Obtained the .+!",true], // gText_ObtainedTheItem
 ["{P} found one .+!",true], // gText_PlayerFoundOneItem
 ["{P} received the (?:STONE|KNUCKLE|DYNAMO|HEAT|BALANCE|FEATHER|MIND|RAIN) BADGE\\nfrom .+\\.",true], // *_Gym_Text_Received*Badge
 ["Registered .+\\nin the POKéNAV\\.",true], // match_call.inc, *_Gym_Text_Registered*
 ["{P} picked the \\d+ .+\\.",true], // data/text/berry_tree.inc
 ["You found \\d+ .+!",false],
 ["Do you want to pick the\\n.+\\?",false],
];
// Readout forms that name the current story line. A finished goal prints "Story goal: none. …" and names none.
const STORY_FORMS:readonly ((line:string)=>StoryLine|null)[]=[
 line=>{const m=/^Story line heard \((.+?), turn (\d+)\): "(.*)"/.exec(line);return m===null?null:{speaker:m[1]??"",turn:Number(m[2]),quote:m[3]??""};},
 line=>{const m=/^Story goal: "(.*)" \((.+?), turn (\d+)\) ->/.exec(line);return m===null?null:{speaker:m[2]??"",turn:Number(m[3]),quote:m[1]??""};},
 line=>{const m=/^Latest story line naming a place \(turn (\d+), (.+?)\): "(.*)"/.exec(line);return m===null?null:{speaker:m[2]??"",turn:Number(m[1]),quote:m[3]??""};},
];
const OBSERVATION_TOOLS=new Set(["observe","press","navigate_to","navigate_to_target","explore_map","battle_action"]);
const FACING:Readonly<Record<string,readonly [number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const key=(id:readonly number[]|null|undefined):string|null=>id===null||id===undefined?null:`${String(id[0])}/${String(id[1])}`;
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const norm=(s:string)=>s.toUpperCase().replaceAll("É","E").replace(/[^A-Z0-9]/g,"");
const word=(w:string,text:string,edge="A-Z0-9")=>new RegExp(`(?<![${edge}])${escape(w)}(?![${edge}])`).test(text);
const oneLine=(pages:readonly CapRow[])=>pages.map(p=>p[2].replaceAll("\n"," ")).join(" ");

export class InstructionMemoryCap {
 private run:string|null=null;
 private state:State|null=null;
 private readout:string|null=null;
 private readonly milestones=new Map<string,number>();
 private readonly visited=new Set<string>();
 private readonly defeated=new Map<string,boolean>();
 private readonly faced=new Map<number,string>();
 observe(event:RunEvent):void {
  this.run??=event.run;
  if(event.run!==this.run)return;
  if(event.type==="milestone"){if(!this.milestones.has(event.name))this.milestones.set(event.name,event.turn);return;}
  if(event.type==="tool_result"){if(!event.is_error&&OBSERVATION_TOOLS.has(event.name))this.readout=event.text;return;}
  if(event.type!=="state"||!("started" in event))return;
  this.state=event;
  if(event.location!==null)this.visited.add(event.location);
  const map=key(event.map_id),trainers=event.heal_before_trainers?.trainers??[];
  for(const t of trainers)this.defeated.set(`${String(map)}#${String(t.trainer_id)}`,t.defeated);
  const step=FACING[(event.facing??"").toLowerCase()];
  if(event.position===null||step===undefined)return;
  const x=event.position.x+step[0],y=event.position.y+step[1];
  const hit=trainers.find(t=>t.x===x&&t.y===y);
  if(hit!==undefined)this.faced.set(event.seq,`${String(map)}#${String(hit.trainer_id)}`);
 }
 private story():StoryLine|null {
  for(const line of (this.readout??"").split("\n"))for(const form of STORY_FORMS){const found=form(line);if(found!==null)return found;}
  return null;
 }
 private near():Map<string,string> {
  const near=new Map<string,string>(),state=this.state;
  if(state===null)return near;
  const here=key(state.map_id);if(here!==null)near.set(here,"current map");
  for(const c of state.topology?.connections??[]){const k=key(c.destination);if(k!==null&&!near.has(k))near.set(k,`${c.direction} connection`);}
  for(const line of (this.readout??"").split("\n")){
   if(!line.startsWith("Exits you can walk to")&&!line.startsWith("Warps:")&&!line.startsWith("Unavailable from here:"))continue;
   for(const m of line.matchAll(/\(map (\d+)\/(\d+)\)/g)){const k=`${m[1]??""}/${m[2]??""}`;if(!near.has(k))near.set(k,"warp listed in the readout");}
  }
  return near;
 }
 private player():string {return this.state?.name??"";}
 private templateDone(e:CapEpisode):string|null {
  const player=this.player();
  for(const rule of RETIREMENT_RULES){
   if(rule.pages.length!==e.pages.length)continue;
   const same=rule.pages.every((t,i)=>{const p=e.pages[i];return p!==undefined&&p[2]===t.text.replaceAll("{PLAYER}",player)&&JSON.stringify(p[4])===JSON.stringify(t.map_id)&&p[0]===t.speaker&&p[1]===t.speaker_source;});
   if(same&&rule.requires.every(n=>this.milestones.has(n)))return `pret-audited template ${rule.id}; milestones ${rule.requires.length===0?"none needed":rule.requires.join(", ")}`;
  }
  return null;
 }
 // A story checkpoint closes an episode heard by the time its milestones were all recorded, every page in its scope.
 private checkpointDone(e:CapEpisode):string|null {
  for(const c of STORY_CHECKPOINTS){
   const turns=c.closes_after.map(n=>this.milestones.get(n));
   if(turns.some(t=>t===undefined))continue;
   const by=turns.reduce<number>((a,t)=>Math.max(a,t??0),0);
   if(e.turn>by||e.pages.length===0)continue;
   if(e.pages.every(p=>c.scope.some(s=>key(s.map_id)===key(p[4])&&s.speakers.includes(p[0]))))return `checkpoint ${c.id}: ${c.closes_after.join(", ")} (turn ${String(by)})`;
  }
  return null;
 }
 private pageDone(p:CapRow):readonly [string,boolean]|null {
  const player=escape(this.player());
  for(const [pattern,completion] of RECEIPTS)if(new RegExp(`^${pattern.replaceAll("{P}",player)}$`).test(p[2]))return ["receipt",completion];
  const faced=p[5]===null?undefined:this.faced.get(p[5]);
  if(p[1]==="faced_sprite"&&faced!==undefined&&faced.startsWith(`${String(key(p[4]))}#`)&&this.defeated.get(faced)===true)return [`trainer ${faced.split("#")[1]??""} defeated`,true];
  return null;
 }
 private done(e:CapEpisode):string|null {
  const template=this.templateDone(e)??this.checkpointDone(e);if(template!==null)return template;
  const marks=e.pages.map(p=>this.pageDone(p));
  if(marks.length===0||marks.some(m=>m===null)||!marks.some(m=>m?.[1]===true))return null;
  return `every page finished: ${[...new Set(marks.map(m=>m?.[0]??""))].sort().join("; ")}`;
 }
 private anchor(e:CapEpisode,story:StoryLine|null):readonly [boolean,string]|null {
  if(story===null||story.turn!==e.turn||!oneLine(e.pages).includes(story.quote.replaceAll("\n"," ")))return null;
  const badges=new Set(this.state?.badges??[]);
  const leaders=Object.keys(LEADER_BADGE).filter(n=>word(n,story.quote,"A-Za-z0-9"));
  if(leaders.length>0&&leaders.every(n=>badges.has(LEADER_BADGE[n]??"")))return [false,`its quote names ${leaders.join(", ")}; badge flag ${leaders.map(n=>LEADER_BADGE[n]??"").join(", ")} is set`];
  return [true,`source of the readout's story line (${story.speaker}, turn ${String(story.turn)})`];
 }
 private visitedPlace(place:string):boolean {
  const stems=[norm(place),...(/ (?:TOWN|CITY)$/.test(place)?[norm(place.replace(/ (?:TOWN|CITY)$/,""))]:[])];
  return [...this.visited].some(v=>{const n=norm(v);return stems.some(s=>n.startsWith(s)&&!/[0-9]/.test(n.charAt(s.length)));});
 }
 private named(e:CapEpisode,met:ReadonlySet<string>):string[] {
  const text=oneLine(e.pages),found:string[]=[];
  for(const place of PRET_MAP_SECTIONS){
   const words=[place,...(/ (?:TOWN|CITY)$/.test(place)?[place.replace(/ (?:TOWN|CITY)$/,"")]:[])];
   if(words.some(w=>word(w,text))&&!this.visitedPlace(place))found.push(`unvisited place ${place}`);
  }
  for(const person of PEOPLE)if(word(person,text,"A-Z")&&!met.has(person))found.push(`not-yet-met person ${person}`);
  for(const item of this.state?.resources?.bag??[])if(item.pocket==="key_items"&&item.name!==null&&item.name!==undefined&&word(item.name,text,"A-Z"))found.push(`key item ${item.name} still in the bag`);
  return found;
 }
 select(episodes:readonly CapEpisode[],render:(kept:readonly CapEpisode[],omitted:number)=>string,budget=INSTRUCTION_MEMORY_CAP_CHARS):CapSelection {
  const story=this.story(),near=this.near();
  const met=new Set(episodes.flatMap(e=>e.pages.flatMap(p=>p[0]===null?[]:[p[0]])));
  if(met.has("DAD"))met.add("NORMAN");
  const rows=episodes.map((e):{e:CapEpisode;step:CapStep;fact:string}=>{
   const anchor=this.anchor(e,story);
   if(anchor?.[0]===true)return {e,step:"anchor",fact:anchor[1]};
   const done=this.done(e);
   if(done!==null)return {e,step:"done",fact:anchor===null?done:`${done}; stale anchor: ${anchor[1]}`};
   const at=e.pages.find(p=>near.has(key(p[4])??""));
   if(at!==undefined)return {e,step:"nearby",fact:`heard on ${String(at[3])} (${String(key(at[4]))}): ${near.get(key(at[4])??"")??""}`};
   const names=this.named(e,met);
   const stale=anchor===null?"":`; stale anchor: ${anchor[1]}`;
   return names.length>0?{e,step:"named",fact:names.join("; ")+stale}:{e,step:"recency",fact:`names no unvisited place, unmet story person or held key item${stale}`};
  });
  const keep=new Set(rows.flatMap((r,i)=>r.step==="anchor"||r.step==="nearby"?[i]:[]));
  for(const group of ["named","recency"] as const){
   const order=rows.flatMap((r,i)=>r.step===group?[i]:[]).sort((a,b)=>(rows[b]?.e.turn??0)-(rows[a]?.e.turn??0));
   for(const i of order){
    const trial=new Set([...keep,i]);
    if(codePoints(render(rows.filter((_,j)=>trial.has(j)).map(r=>r.e),rows.length-trial.size))<=budget)keep.add(i);
   }
  }
  return {kept:rows.filter((_,i)=>keep.has(i)).map(r=>r.e),omitted:rows.length-keep.size,decisions:rows.map((r,i)=>({result:r.e.result,step:r.step,fact:r.fact,kept:keep.has(i)}))};
 }
}
