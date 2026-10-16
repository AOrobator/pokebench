// story-destinations-v1: right under the readout's Story line, the latest story line that names a place
// or a story character, with each place resolved against the game's own map table (GET /pokebench/places,
// read from the ROM by env/pokebench_env/places.py) into the map and the door or edge that leads into it,
// and each story character placed where the readout's character-presence line says they are. A name the
// table does not resolve to exactly one map is reported as not resolved. Facts only, nothing clipped.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {presence} from "./people-ledger.js";
import type {RunRecorder} from "./recorder.js";
import {STORY_CHARACTERS,storyCharacter} from "./script-line-presence.js";

const closed={additionalProperties:false};
const MapIdSchema=Type.Tuple([Type.Integer(),Type.Integer()]);
export const PlacesBodySchema=Type.Object({places:Type.Array(Type.Object({
 map_id:MapIdSchema,name:Type.String({minLength:1}),display:Type.String({minLength:1}),
 warps:Type.Array(Type.Object({x:Type.Integer(),y:Type.Integer(),to:MapIdSchema},closed)),
 connections:Type.Array(Type.Object({direction:Type.Enum(["NORTH","SOUTH","EAST","WEST","DIVE","EMERGE"]),to:MapIdSchema},closed)),
},closed))},closed);
export type PlacesBody=Static<typeof PlacesBodySchema>;
export type Place=PlacesBody["places"][number];
type MapId=readonly [number,number];

export const STORY_HEADER="Latest story line naming a place or person";
const NAMES=STORY_CHARACTERS.map(c=>c.name);
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const NAMED=new RegExp(`(?<![A-Za-z])(${NAMES.map(escape).join("|")})(?![A-Za-z])`,"g");
const LIVES=new RegExp(`(?<![A-Za-z])(He|She|${NAMES.map(escape).join("|")}) lives(?![A-Za-z])`);
// Abbreviations whose period is part of a name the game prints (PROF. BIRCH), not a sentence end.
const ABBREVIATIONS=new Set(NAMES.flatMap(n=>n.split(" ").filter(w=>w.endsWith("."))));
const FLOOR=/^(B?\d+F|RF)$/;

// A word as names are compared: capitals, é as E, no periods or apostrophes.
const norm=(word:string)=>word.toUpperCase().replace(/É/g,"E").replace(/[.'’]/g,"");
function words(parts:readonly string[]):string[] {
 const out:string[]=[];
 for(const part of parts.map(norm).filter(w=>w!=="")){
  const last=out.at(-1);
  // "ROUTE 103" as the map table spells it, ROUTE103.
  if(last==="ROUTE"&&/^\d+$/.test(part))out[out.length-1]=`ROUTE${part}`;else out.push(part);
 }
 return out;
}
const nameWords=(name:string)=>words(name.split(" "));
const headOf=(ws:readonly string[])=>ws.filter(w=>!FLOOR.test(w)).at(-1);
export function headsOf(places:readonly Place[]):Set<string> {
 const heads=new Set<string>();
 for(const p of places)for(const n of [p.name,p.display]){const h=headOf(nameWords(n));if(h!==undefined)heads.add(h);}
 return heads;
}

const isCaps=(token:string)=>{const body=token.replace(/['’]s$/,"");return /^[A-Z][A-Z0-9é.'’-]*$/.test(body)&&(body.match(/[A-Zé]/g)?.length??0)>=2;};
// Runs of capitalised words (the game prints names in capitals), split at punctuation and sentence ends.
function capsRuns(text:string):string[][] {
 const runs:string[][]=[];let current:string[]=[];
 const flush=()=>{if(current.length>0)runs.push(current);current=[];};
 for(const token of text.replace(/\s+/g," ").trim().split(" ")){
  const lead=/^[("“‘'…]+/.exec(token)?.[0]??"";
  if(lead!=="")flush();
  let body=token.slice(lead.length);
  const trail=/[,!?;:…"”’)]+$/.exec(body)?.[0]??"";
  body=body.slice(0,body.length-trail.length);
  let end=false;
  if(body.endsWith(".")&&!ABBREVIATIONS.has(body)){body=body.replace(/\.+$/,"");end=true;}
  if(isCaps(body)||(current.length>0&&/^\d+$/.test(body)))current.push(body);else flush();
  if(trail!==""||end)flush();
 }
 flush();
 return runs;
}
// The place phrases of a text: capitalised runs whose last word ends some map's name (null: any run).
export function placePhrases(text:string,heads:ReadonlySet<string>|null,skip:readonly string[]=[]):string[] {
 const skipped=new Set(skip.map(s=>words(s.split(" ")).join(" ")));
 const out:string[]=[];
 for(const run of capsRuns(text)){
  const ws=words(run);const head=ws.at(-1);
  if(head===undefined||skipped.has(ws.join(" ")))continue;
  if(heads!==null&&!heads.has(head))continue;
  const phrase=run.join(" ");
  if(!out.includes(phrase))out.push(phrase);
 }
 return out;
}

type Page=Extract<RunEvent,{type:"dialogue_auto_advance"}>["pages"][number];
interface Lives {readonly subject:string;readonly owner:string|null;readonly others:readonly string[]}
export interface StoryLine {
 readonly turn:number;readonly speaker:string;readonly text:string;
 readonly named:readonly string[];readonly lives:Lives|null;
}

function namedIn(text:string):string[] {
 const out:string[]=[];
 for(const m of text.matchAll(NAMED)){const name=m[1] ?? "";if(!out.includes(name))out.push(name);}
 return out;
}

export class StoryDestinations {
 private readonly lines:StoryLine[]=[];
 private readonly pending=new Map<string,StoryLine[]>();
 // The story characters each recorded state's sprite kinds are (character-presence-v1's table by graphics id),
 // for states that show one, in recording order.
 private readonly sprites:{readonly seq:number;readonly map:MapId|null;readonly kinds:ReadonlyMap<string,string>}[]=[];
 observe(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){
   const kinds=new Map<string,string>();
   for(const o of event.world_context?.objects??[]){const name=o.sprite_kind===null?null:storyCharacter(o.graphics_id,event.location);if(name!==null&&o.sprite_kind!==null)kinds.set(o.sprite_kind,name);}
   if(kinds.size>0)this.sprites.push({seq:event.seq,map:event.map_id,kinds});
   return;
  }
  if(event.type==="dialogue_auto_advance"){this.pending.set(event.tool_call_id,this.storyLines(event.turn,event.pages));return;}
  if(event.type!=="tool_result")return;
  const lines=this.pending.get(event.id);this.pending.delete(event.id);
  if(lines!==undefined&&!event.is_error)this.lines.push(...lines);
 }
 private speaker(page:Page):string|null {
  if(page.speaker===null||page.speaker_source===null||page.speaker_source==="faced_target")return null;
  if(NAMES.includes(page.speaker))return page.speaker;
  if(page.speaker_source!=="faced_sprite"||page.state_seq===null||page.map_id===null)return null;
  // The page's own state, or the latest earlier one on the same map that showed a story character.
  const seq=page.state_seq,map=page.map_id;
  const known=this.sprites.findLast(s=>s.seq<=seq&&s.map!==null&&same(s.map,map));
  return known?.kinds.get(page.speaker)??null;
 }
 // Every field page a story character speaks in one call, with what it names; battle text is no one's line.
 private storyLines(turn:number,pages:readonly Page[]):StoryLine[] {
  const out:StoryLine[]=[];const before:string[]=[];
  for(const page of pages){
   if(page.battle_message_id!==undefined||page.battle_turn!==undefined)continue;
   const speaker=this.speaker(page);
   const prefix=page.speaker===null?"":`${page.speaker}: `;
   const text=(page.speaker_source==="name_prefix"&&page.text.startsWith(prefix)?page.text.slice(prefix.length):page.text).replace(/\s+/g," ").trim();
   const named=namedIn(text);
   if(speaker!==null){
    const m=LIVES.exec(text);
    let lives:Lives|null=null;
    if(m!==null){
     const subject=m[1] ?? "";
     const others=before.filter(n=>n!==speaker);
     lives=subject==="He"||subject==="She"?{subject,owner:others.length===1?others[0] ?? null:null,others}:{subject,owner:subject,others:[]};
    }
    out.push({turn,speaker,text,named:named.filter(n=>n!==speaker),lives});
   }
   for(const n of namedIn(page.text))if(!before.includes(n))before.push(n);
  }
  return out;
 }
 // The latest story line that names a place (by the map table's name endings), a "lives" or a story character.
 latest(callId:string,heads:ReadonlySet<string>|null=null,player:string|null=null):StoryLine|null {
  const lines=[...this.lines,...(this.pending.get(callId)??[])];
  for(let i=lines.length-1;i>=0;i--){
   const line=lines[i];
   if(line===undefined)continue;
   if(line.lives!==null||line.named.length>0||placePhrases(line.text,heads,[...NAMES,...(player===null?[]:[player])]).length>0)return line;
  }
  return null;
 }
 block(state:GameStateSnapshot,readout:string,callId:string,places:readonly Place[]|Error):string|null {
  if(!state.started||state.screen!=="overworld"||state.in_battle||state.map_id===null)return null;
  const table=places instanceof Error?null:places;
  const heads=table===null?null:headsOf(table);
  const line=this.latest(callId,heads,state.name);
  if(line===null)return null;
  const here=state.map_id;
  const out=[`${STORY_HEADER} (turn ${String(line.turn)}, ${line.speaker}): "${line.text}"`];
  const unread=places instanceof Error?`not resolved: the game's map table could not be read (${places.message}).`:null;
  if(line.lives!==null){
   const {subject,owner,others}=line.lives;
   const quote=`"${subject} lives"`;
   if(owner===null)out.push(`- ${quote}: not resolved: ${others.length===0?"no story character is named before it in this conversation.":`"${subject}" could be ${others.slice(0,-1).join(", ")} or ${others.at(-1) ?? ""}.`}`);
   else{
    const why=subject===owner?"":` (${subject} = ${owner}, the one story character named before it in this conversation)`;
    const house=`${owner}'S HOUSE`;
    out.push(`- ${quote}${why}${unread===null?resolution(nameWords(house),table??[],here,`no map in the game's map table is named ${house}.`):`: ${unread}`}`);
   }
  }
  for(const phrase of placePhrases(line.text,heads,[...NAMES,...(state.name===null?[]:[state.name])]))
   out.push(`- "${phrase}"${unread===null?resolution(words(phrase.split(" ")),table??[],here,"no map in the game's map table has this name."):`: ${unread}`}`);
  const characters=presence(readout);
  const where=(name:string)=>whereIs(name,characters);
  out.push(`- ${line.speaker} (spoke the line): ${where(line.speaker)}.`);
  for(const name of line.named)out.push(`- ${name} (named in the line): ${where(name)}.`);
  const owner=line.lives?.owner;
  if(owner!=null&&line.lives?.subject!==owner&&owner!==line.speaker&&!line.named.includes(owner))out.push(`- ${owner} ("${line.lives?.subject ?? ""}" in the line): ${where(owner)}.`);
  return out.join("\n");
 }
 // The readout with the block inserted after its Story line (after Location/Position without one).
 annotate(text:string,state:GameStateSnapshot,callId:string,places:readonly Place[]|Error):string {
  const anchor=/^Story: .*$/m.exec(text)??/^Location: .*$(?:\nPosition: .*$)?/m.exec(text);
  if(anchor===null)return text;
  const block=this.block(state,text,callId,places);
  if(block===null)return text;
  const end=anchor.index+anchor[0].length;
  return `${text.slice(0,end)}\n${block}${text.slice(end)}`;
 }
}

const same=(a:MapId,b:MapId)=>a[0]===b[0]&&a[1]===b[1];
const mapLabel=(p:Place)=>`${p.display} (map ${String(p.map_id[0])}/${String(p.map_id[1])})`;
const EDGES=new Set(["NORTH","SOUTH","EAST","WEST"]);

// Resolve a name to exactly one map, keeping only maps entered from outside the matching set
// (a house's 2F, reached by its own 1F stairs, is not a second answer), and say how to get in.
function resolution(phrase:readonly string[],places:readonly Place[],here:MapId,none:string):string {
 const head=phrase.at(-1);
 const matches=places.filter(p=>[p.name,p.display].some(n=>{const ws=nameWords(n);return headOf(ws)===head&&phrase.every(w=>ws.includes(w));}));
 if(matches.length===0)return `: not resolved: ${none}`;
 const inside=(id:MapId)=>matches.some(p=>same(p.map_id,id));
 const ways=(target:Place)=>({
  edges:places.filter(p=>!inside(p.map_id)).flatMap(p=>p.connections.filter(c=>same(c.to,target.map_id)).map(c=>({from:p,direction:c.direction}))),
  doors:places.filter(p=>!inside(p.map_id)).flatMap(p=>{const at=p.warps.filter(w=>same(w.to,target.map_id));return at.length===0?[]:[{from:p,at}];}),
 });
 const entered=matches.filter(p=>{const w=ways(p);return w.edges.length+w.doors.length>0;});
 const pick=entered.length===1?entered[0]:entered.length===0&&matches.length===1?matches[0]:undefined;
 if(pick===undefined)return `: not resolved: ${String(entered.length>0?entered.length:matches.length)} maps in the game's map table match this name, and the line does not say which.`;
 const head0=` = ${mapLabel(pick)}.`;
 if(same(pick.map_id,here))return `${head0} You are in it now.`;
 const {edges,doors}=ways(pick);
 const parts=[
  ...edges.map(e=>{const side=EDGES.has(e.direction)?`${e.direction} edge`:`by ${e.direction}`;return same(e.from.map_id,here)?`this map's ${side}`:`${mapLabel(e.from)} ${side}`;}),
  ...doors.map(d=>{const at=d.at.map(w=>`(${String(w.x)},${String(w.y)})`).join(" or ");return same(d.from.map_id,here)?`door on this map at ${at}`:`door in ${mapLabel(d.from)} at ${at}`;}),
 ];
 return parts.length===0?`${head0} No way in is recorded in the game's map table.`:`${head0} Way in: ${parts.join("; ")}.`;
}

function whereIs(name:string,characters:ReturnType<typeof presence>):string {
 if(characters===null)return "the readout does not say where";
 const entry=characters.here.find(e=>e===name||e.startsWith(`${name} `));
 if(entry!==undefined){
  const rest=entry.slice(name.length);
  let m=/^ at (-?\d+),(-?\d+)$/.exec(rest);
  if(m!==null)return `on this map at (${m[1] ?? ""},${m[2] ?? ""})`;
  m=/^ at (-?\d+),(-?\d+) \(out of view\)$/.exec(rest);
  if(m!==null)return `on this map at (${m[1] ?? ""},${m[2] ?? ""}), out of view`;
  m=/^ at (-?\d+),(-?\d+) \(out of view; where the map places this character, it may have moved\)$/.exec(rest);
  if(m!==null)return `on this map, out of view; the map places this character at (${m[1] ?? ""},${m[2] ?? ""}), it may have moved`;
  if(rest===" (on this map, out of view)")return "on this map, out of view (its tile was not read)";
  return `on this map (the readout says "${entry}")`;
 }
 return characters.absent.split(", ").includes(name)?"not on this map":"the readout does not say where";
}

export interface PlaceSource {places?(signal?:AbortSignal):Promise<unknown>}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export function withStoryDestinations(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">,source:PlaceSource):AgentTool[] {
 if(!features["story-destinations-v1"])return [...tools];
 const story=new StoryDestinations();recorder.subscribe(event=>{story.observe(event);});
 // The map table never changes; the names of the player's own house do, so it is read once per player name.
 const tables=new Map<string,Promise<readonly Place[]>>();
 const table=async(player:string):Promise<readonly Place[]|Error>=>{
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
 const annotate=async<T>(id:string,result:AgentToolResult<T>):Promise<AgentToolResult<T>>=>{
  const state=stateOf(result.details);
  if(state===null||story.latest(id,null,state.name)===null)return result;
  const index=result.content.findLastIndex(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const content=[...result.content];content[index]={...part,text:story.annotate(part.text,state,id,await table(state.name??""))};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to")return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute:async(id,params,signal,update)=>annotate(id,await tool.execute(id,params,signal,update)),executeChecked:async(id,params,check,signal,update)=>annotate(id,await tool.executeChecked(id,params,check,signal,update))};
  return checked;
 });
}
