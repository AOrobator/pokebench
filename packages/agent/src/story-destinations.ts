// story-destinations-v1: right under the readout's Story line, the latest story line that names a place,
// with each place resolved against the game's own map table (GET /pokebench/places, read from the ROM by
// env/pokebench_env/places.py) into the map and the door or edge that leads into it. A name the table does
// not resolve to exactly one map is reported as not resolved. No people are listed (operator decision
// 2026-10-17). Facts only, nothing clipped.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import type {RunRecorder} from "./recorder.js";
import {STORY_CHARACTERS,canonicalStoryCharacterName,storyCharacter} from "./script-line-presence.js";

const closed={additionalProperties:false};
const MapIdSchema=Type.Tuple([Type.Integer(),Type.Integer()]);
export const PlacesBodySchema=Type.Object({places:Type.Array(Type.Object({
 map_id:MapIdSchema,name:Type.String({minLength:1}),display:Type.String({minLength:1}),
 warps:Type.Array(Type.Object({x:Type.Integer(),y:Type.Integer(),to:MapIdSchema},closed)),
 connections:Type.Array(Type.Object({direction:Type.Enum(["NORTH","SOUTH","EAST","WEST","DIVE","EMERGE"]),to:MapIdSchema},closed)),
},closed))},closed);
export type PlacesBody=Static<typeof PlacesBodySchema>;
export type Place=PlacesBody["places"][number];
export type MapId=readonly [number,number];

export const STORY_HEADER="Latest story line naming a place";
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
 readonly lives:Lives|null;
 readonly scriptedPlaces?:readonly {readonly quote:string;readonly resolution:string}[];
 readonly birchLabStage?:number;
}

// One place a story line names: the quoted words, how they resolve (text as the block prints it after the quote),
// and the map they resolve to (null when not resolved).
export interface Resolved {readonly quote:string;readonly text:string;readonly target:Place|null}
export interface StoryGoal {readonly line:StoryLine;readonly resolved:readonly Resolved[];readonly done?:boolean;readonly doneReason?:string}
// The middle of the retired-goal sentences. "Pokédex received" is the story checklist's own label.
export function staleNote(reason="Pokédex received"):string {
 return `Done: ${reason}. This is not where to go.`;
}
export const STALE_LAB_NOTE=staleNote();
export function staleGoalLine(line:StoryLine,reason="Pokédex received"):string {
 return `Story goal: none. ${line.speaker}'s line from turn ${String(line.turn)} ("${line.text}") is done: ${reason}. It is not where to go.`;
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
 // Native Birch-lab story stages paired to the dialogue pages recorded from those states. A missing stage stays
 // unknown; it never becomes evidence that an instruction is complete.
 private readonly birchLabStages:{readonly seq:number;readonly stage:number|null}[]=[];
 constructor(private readonly scriptedGuidance=false){}
 observe(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){
   // An unreadable state is a boundary, not permission to reuse an older known stage for later dialogue.
   const stage=event.story?.birch_lab_stage ?? null;
   if(this.birchLabStages.at(-1)?.stage!==stage)this.birchLabStages.push({seq:event.seq,stage});
   const kinds=new Map<string,string>();
   for(const o of event.world_context?.objects??[]){const name=o.sprite_kind===null?null:storyCharacter(o.graphics_id,event.location);if(name!==null&&o.sprite_kind!==null)kinds.set(o.sprite_kind,name);}
   if(kinds.size>0)this.sprites.push({seq:event.seq,map:event.map_id,kinds});
   return;
  }
  if(event.type==="dialogue_auto_advance"){
   const lines=this.storyLines(event.turn,event.pages);
   this.pending.set(event.tool_call_id,lines);
   return;
  }
  if(event.type!=="tool_result")return;
  const lines=this.pending.get(event.id);this.pending.delete(event.id);
  if(lines!==undefined&&!event.is_error)this.lines.push(...lines);
 }
 private speaker(page:Page):string|null {
  if(page.speaker===null||page.speaker_source===null||page.speaker_source==="faced_target")return null;
  if(NAMES.includes(page.speaker))return page.speaker;
  // Keep the game's printed label in the quote, but use its canonical identity for eligibility.
  if(page.speaker_source==="name_prefix"&&canonicalStoryCharacterName(page.speaker)!==null)return page.speaker;
  if(page.speaker_source!=="faced_sprite"||page.state_seq===null||page.map_id===null)return null;
  // The page's own state, or the latest earlier one on the same map that showed a story character.
  const seq=page.state_seq,map=page.map_id;
  const known=this.sprites.findLast(s=>s.seq<=seq&&s.map!==null&&same(s.map,map));
  return known?.kinds.get(page.speaker)??null;
 }
 private withBirchLabStage(page:Page,line:StoryLine):StoryLine {
  const stateSeq=page.state_seq;
  if(stateSeq===null)return line;
  const stage=this.birchLabStages.findLast(s=>s.seq<=stateSeq)?.stage;
  return stage===undefined||stage===null?line:{...line,birchLabStage:stage};
 }
 // Every field page a story character speaks in one call, with its "lives" clause; battle text is no one's line.
 // Story characters named on earlier pages of the call (any speaker) are who "He/She lives" can mean.
 private storyLines(turn:number,pages:readonly Page[]):StoryLine[] {
  const out:StoryLine[]=[];const before:string[]=[];
  // pret/pokeemerald PetalburgCity_EventScript_ShowGymToPlayer: the four VAR_PETALBURG_CITY_STATE
  // coordinate triggers show this exact guidance and physically lead the player to the Gym.
  const plain=(page:Page)=>page.text.replace(/\s+/g," ").trim();
  const gymBoy=(page:Page)=>(page.speaker===null&&page.speaker_source===null)||(page.speaker==="BOY_2"&&page.speaker_source==="faced_sprite");
  const forcedGym=this.scriptedGuidance&&pages.some(page=>gymBoy(page)&&page.map_id?.[0]===0&&page.map_id[1]===0&&plain(page).startsWith("Hiya! Are you maybe… A rookie TRAINER?"))&&pages.some(page=>gymBoy(page)&&plain(page)==="This is the GYM's sign. Look for it whenever you're looking for a GYM.");
  for(const page of pages){
   if(page.battle_message_id!==undefined||page.battle_turn!==undefined)continue;
   const speaker=this.speaker(page);
   const prefix=page.speaker===null?"":`${page.speaker}: `;
   const text=(page.speaker_source==="name_prefix"&&page.text.startsWith(prefix)?page.text.slice(prefix.length):page.text).replace(/\s+/g," ").trim();
   if(forcedGym&&gymBoy(page)&&page.map_id?.[0]===0&&page.map_id[1]===0&&text==="See? This is PETALBURG CITY's GYM."){
    out.push(this.withBirchLabStage(page,{turn,speaker:"PETALBURG GYM BOY",text,lives:null,scriptedPlaces:[{quote:"PETALBURG CITY's GYM",resolution:"PETALBURG CITY GYM"}]}));
   }else if(speaker!==null){
    const m=LIVES.exec(text);
    let lives:Lives|null=null;
    if(m!==null){
     const subject=m[1] ?? "";
     const others=before.filter(n=>n!==speaker);
     lives=subject==="He"||subject==="She"?{subject,owner:others.length===1?others[0] ?? null:null,others}:{subject,owner:subject,others:[]};
    }
    out.push(this.withBirchLabStage(page,{turn,speaker,text,lives}));
   }
   for(const n of namedIn(page.text))if(!before.includes(n))before.push(n);
  }
  return out;
 }
 // The latest story line that names a place (by the map table's name endings) or says who "lives" where.
 latest(callId:string,heads:ReadonlySet<string>|null=null,player:string|null=null):StoryLine|null {
  const lines=[...this.lines,...(this.pending.get(callId)??[])];
  for(let i=lines.length-1;i>=0;i--){
   const line=lines[i];
   if(line===undefined)continue;
   if(line.lives!==null||(line.scriptedPlaces?.length??0)>0||placePhrases(line.text,heads,[...NAMES,...(player===null?[]:[player])]).length>0)return line;
  }
  return null;
 }
 // The latest story line naming a place, with each place it names resolved against the map table from map `here`.
 // retire: the story checklist retires the quote only when its resolved place's native milestone is finished.
 // A newer place-naming line supersedes it through latest(); incidental later dialogue does not.
 goal(here:MapId,player:string|null,callId:string,places:readonly Place[],retire=false,story:GameStateSnapshot["story"]=null,stageBound=false):StoryGoal|null {
  const heads=headsOf(places);
  const line=this.latest(callId,heads,player);
  if(line===null)return null;
  const resolved:Resolved[]=[];
  if(line.lives!==null){
   const {subject,owner,others}=line.lives;
   const quote=`"${subject} lives"`;
   if(owner===null)resolved.push({quote,text:`: not resolved: ${others.length===0?"no story character is named before it in this conversation.":`"${subject}" could be ${others.slice(0,-1).join(", ")} or ${others.at(-1) ?? ""}.`}`,target:null});
   else{
    const why=subject===owner?"":` (${subject} = ${owner}, the one story character named before it in this conversation)`;
    const house=`${owner}'S HOUSE`;
    const r=resolve(nameWords(house),places,here,`no map in the game's map table is named ${house}.`);
    resolved.push({quote,text:`${why}${r.text}`,target:r.target});
   }
  }
  for(const place of line.scriptedPlaces??[])
   resolved.push({quote:`"${place.quote}"`,...resolve(words(place.resolution.split(" ")),places,here,"no map in the game's map table has this name.")});
  for(const phrase of placePhrases(line.text,heads,[...NAMES,...(player===null?[]:[player]),...(line.scriptedPlaces??[]).map(place=>place.quote)]))
   resolved.push({quote:`"${phrase}"`,...resolve(words(phrase.split(" ")),places,here,"no map in the game's map table has this name.")});
  const targets=resolved.flatMap(r=>r.target===null?[]:[r.target]);
  const doneReason=stageBound?stageRetirement(line,targets,story??null)??(retire?retirement(targets,story??null):null):retire?retirement(targets,story??null):null;
  return doneReason===null?{line,resolved}:{line,resolved,done:true,doneReason};
 }
 block(state:GameStateSnapshot,callId:string,places:readonly Place[]|Error,retireLab=false,stageBound=false):string|null {
  if(!state.started||state.screen!=="overworld"||state.in_battle||state.map_id===null)return null;
  // Which line names a place depends on the map table's name endings, so without the table no line is
  // picked: one plain line instead of a guess or a looser rule.
  if(places instanceof Error)return this.latest(callId,null,state.name)===null?null:`${STORY_HEADER}: not known; the game's map table could not be read (${places.message}).`;
  const goal=this.goal(state.map_id,state.name,callId,places,retireLab,state.story??null,stageBound);
  if(goal===null)return null;
  if(stageBound&&goal.done===true)return null;
  const quote=`${STORY_HEADER} (turn ${String(goal.line.turn)}, ${goal.line.speaker}): "${goal.line.text}"`;
  if(goal.done===true)return [quote,staleNote(goal.doneReason)].join("\n");
  return [quote,...goal.resolved.map(r=>`- ${r.quote}${r.text}`)].join("\n");
 }
 // The readout with the block inserted after its Story line (after Location/Position without one).
 annotate(text:string,state:GameStateSnapshot,callId:string,places:readonly Place[]|Error,retireLab=false,stageBound=false):string {
  const anchor=/^Story: .*$/m.exec(text)??/^Location: .*$(?:\nPosition: .*$)?/m.exec(text);
  if(anchor===null)return text;
  const block=this.block(state,callId,places,retireLab,stageBound);
  if(block===null)return text;
  const end=anchor.index+anchor[0].length;
  return `${text.slice(0,end)}\n${block}${text.slice(end)}`;
 }
}

function isBirchLab(place:Place):boolean {
 const ws=new Set([...nameWords(place.name),...nameWords(place.display)]);
 return [...ws].some(w=>w.includes("BIRCH"))&&ws.has("LAB");
}

const GENERIC=new Set(["THE","POKEMON","PROF","CITY","TOWN","MAP","HOUSE"]);
type StoryFacts=NonNullable<GameStateSnapshot["story"]>;
// Checklist labels the readout already prints for a finished milestone (story.py text()). Trainer
// "defeated" lines are not the place being finished, so they are not here.
function checklistLabels(story:StoryFacts):string[] {
 const out:string[]=[];
 const lab=story.birch_lab_stage;
 if(lab!==null&&lab>=2)out.push("Birch rescue complete");
 if(lab!==null&&lab>=3)out.push("Birch starter handoff complete");
 if(story.rival_battle_won===true)out.push("Route 103 rival battle won");
 if(story.pokedex_received===true)out.push("Pokédex received");
 if(story.running_shoes_received===true)out.push("running shoes received");
 if(story.woods_stage===1)out.push("Petalburg Woods Aqua event complete");
 if(story.rustboro_gym_complete===true)out.push("Rustboro Gym complete");
 if(story.stone_badge===true)out.push("Stone Badge received");
 return out;
}
function distinctive(place:Place):string[] {
 return [...new Set([...nameWords(place.name),...nameWords(place.display)])].filter(w=>!GENERIC.has(w)&&!FLOOR.test(w));
}
// A checklist label covers a place when that place's words are exactly the place the label names.
// "Pokédex received" is the checklist's own words for Birch's lab (the label does not say LAB).
// Sharing one word is not enough: PETALBURG CITY is not Petalburg Woods, and RUSTBORO CITY is not the gym.
const LABEL_PLACE:Readonly<Record<string,readonly string[]>>={
 "Route 103 rival battle won":words(["ROUTE","103"]),
 "Petalburg Woods Aqua event complete":words(["PETALBURG","WOODS"]),
 "Rustboro Gym complete":words(["RUSTBORO","GYM"]),
};
function covers(label:string,place:Place):boolean {
 if(label==="Pokédex received")return isBirchLab(place);
 const named=LABEL_PLACE[label];
 if(named===undefined)return false;
 const dw=distinctive(place);
 return dw.length===named.length&&named.every(w=>dw.includes(w));
}
function retirement(targets:readonly Place[],story:GameStateSnapshot["story"]):string|null {
 const labels=story===null||story===undefined?[]:checklistLabels(story);
 const cited:string[]=[];
 const covered=targets.length>0&&targets.every(target=>{
  const hit=labels.findLast(label=>covers(label,target));
  if(hit===undefined)return false;
  if(!cited.includes(hit))cited.push(hit);
  return true;
 });
 return covered?cited.join("; "):null;
}

function stageRetirement(line:StoryLine,targets:readonly Place[],story:GameStateSnapshot["story"]):string|null {
 const current=story?.birch_lab_stage;
 if(line.birchLabStage===undefined||current===null||current===undefined)return null;
 if(line.birchLabStage>=3||current<3||targets.length===0||!targets.every(isBirchLab))return null;
 return "Birch starter handoff complete";
}

const same=(a:MapId,b:MapId)=>a[0]===b[0]&&a[1]===b[1];
const mapLabel=(p:Place)=>`${p.display} (map ${String(p.map_id[0])}/${String(p.map_id[1])})`;
const EDGES=new Set(["NORTH","SOUTH","EAST","WEST"]);

// Resolve a name to exactly one map, keeping only maps entered from outside the matching set
// (a house's 2F, reached by its own 1F stairs, is not a second answer), and say how to get in.
function resolve(phrase:readonly string[],places:readonly Place[],here:MapId,none:string):{readonly text:string;readonly target:Place|null} {
 const head=phrase.at(-1);
 const matches=places.filter(p=>[p.name,p.display].some(n=>{const ws=nameWords(n);return headOf(ws)===head&&phrase.every(w=>ws.includes(w));}));
 if(matches.length===0)return {text:`: not resolved: ${none}`,target:null};
 const inside=(id:MapId)=>matches.some(p=>same(p.map_id,id));
 const ways=(target:Place)=>({
  edges:places.filter(p=>!inside(p.map_id)).flatMap(p=>p.connections.filter(c=>same(c.to,target.map_id)).map(c=>({from:p,direction:c.direction}))),
  doors:places.filter(p=>!inside(p.map_id)).flatMap(p=>{const at=p.warps.filter(w=>same(w.to,target.map_id));return at.length===0?[]:[{from:p,at}];}),
 });
 const entered=matches.filter(p=>{const w=ways(p);return w.edges.length+w.doors.length>0;});
 const pick=entered.length===1?entered[0]:entered.length===0&&matches.length===1?matches[0]:undefined;
 if(pick===undefined)return {text:`: not resolved: ${String(entered.length>0?entered.length:matches.length)} maps in the game's map table match this name, and the line does not say which.`,target:null};
 const head0=` = ${mapLabel(pick)}.`;
 if(same(pick.map_id,here))return {text:`${head0} You are in it now.`,target:pick};
 const {edges,doors}=ways(pick);
 const parts=[
  ...edges.map(e=>{const side=EDGES.has(e.direction)?`${e.direction} edge`:`by ${e.direction}`;return same(e.from.map_id,here)?`this map's ${side}`:`${mapLabel(e.from)} ${side}`;}),
  ...doors.map(d=>{const at=d.at.map(w=>`(${String(w.x)},${String(w.y)})`).join(" or ");return same(d.from.map_id,here)?`door on this map at ${at}`:`door in ${mapLabel(d.from)} at ${at}`;}),
 ];
 return {text:parts.length===0?`${head0} No way in is recorded in the game's map table.`:`${head0} Way in: ${parts.join("; ")}.`,target:pick};
}

export interface PlaceSource {places?(signal?:AbortSignal):Promise<unknown>}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state===undefined)return null;
 return parseGameState(details.state);
}

export function withStoryDestinations(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">,source:PlaceSource):AgentTool[] {
 if(!features["story-destinations-v1"])return [...tools];
 const story=new StoryDestinations(features["scripted-place-guidance-v1"]);recorder.subscribe(event=>{story.observe(event);});
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
  const content=[...result.content];content[index]={...part,text:story.annotate(part.text,state,id,await table(state.name??""),features["stale-story-goal-v1"],features["stale-story-goal-v2"])};
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
