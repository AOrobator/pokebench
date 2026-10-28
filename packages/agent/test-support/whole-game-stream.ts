import {readFileSync} from "node:fs";
import {join} from "node:path";
import {Type,type Static} from "typebox";
import {Value} from "typebox/value";
import {checkEvent,type EventBody,type RunEvent} from "../src/events.js";
import {MILESTONES} from "../src/milestones.js";
import {PROGRESS_CATALOG} from "../src/story-progress.js";
import {IN_GAME,NAME_CONFIRMED} from "./events.js";

const symbol=Type.String({pattern:"^[A-Za-z][A-Za-z0-9_]*$"});
const EntrySchema=Type.Object({
 id:Type.String({minLength:1}),region:Type.Enum(["a","b","c","d","e","f"] as const),role:Type.Enum(["story","filler"] as const),
 category:Type.Optional(Type.String()),map:symbol,map_id:Type.Tuple([Type.Integer({minimum:0}),Type.Integer({minimum:0})]),
 speaker_gfx:Type.Optional(Type.Union([Type.String({pattern:"^OBJ_EVENT_GFX_[A-Z0-9_]+$"}),Type.Null()])),name_prefix:Type.Optional(Type.String({minLength:1})),
 sign_script:Type.Optional(symbol),page_names:Type.Optional(Type.Array(Type.Union([Type.String(),Type.Null()]))),text_label:symbol,called_from:Type.Optional(Type.Array(symbol)),milestone_after:Type.Array(Type.String({minLength:1})),
},{additionalProperties:false});
const ScriptSchema=Type.Array(EntrySchema);
export type WholeGameSource=Static<typeof EntrySchema>;
export interface WholeGameEntry extends WholeGameSource {readonly pages:readonly string[];readonly speaker:string|null;readonly speakerSource:"name_prefix"|"faced_sprite"|null}
export interface WholeGameStep {readonly entry:WholeGameEntry;readonly before:readonly RunEvent[];readonly after:readonly RunEvent[];readonly resultSeq:number}

export function loadWholeGameScript(pret:string,script=join(import.meta.dirname,"whole-game-script.json"),readText:(path:string)=>string=path=>readFileSync(path,"utf8")):WholeGameEntry[]{
 const cache=new Map<string,string>();
 const read=(path:string)=>{let text=cache.get(path);if(text===undefined){text=readText(path);cache.set(path,text);}return text;};
 const value:unknown=JSON.parse(read(script));
 if(!Value.Check(ScriptSchema,value))throw Error("malformed whole-game script");
 const rawGroups:unknown=JSON.parse(read(join(pret,"data/maps/map_groups.json")));
 const Groups=Type.Record(Type.String(),Type.Array(Type.String()));
 if(!Value.Check(Groups,rawGroups)||rawGroups.group_order===undefined)throw Error("malformed pret map groups");
 const mapIds=new Map<string,string>();
 rawGroups.group_order.forEach((group,gi)=>{(rawGroups[group]??[]).forEach((map,mi)=>mapIds.set(map,`${String(gi)}/${String(mi)}`));});
 const known=new Set(MILESTONES.map(m=>m.name)),seen=new Set<string>();
 const strings=new Map<string,Map<string,string>>();
 return value.map(entry=>{
  if(seen.has(entry.id))throw Error(`duplicate entry ${entry.id}`);seen.add(entry.id);
  if(mapIds.get(entry.map)!==entry.map_id.join("/"))throw Error(`map id mismatch ${entry.id}`);
  if((entry.speaker_gfx===undefined)===(entry.name_prefix===undefined))throw Error(`one speaker attribution required ${entry.id}`);
  if(entry.milestone_after.some(n=>!known.has(n)))throw Error(`unknown milestone ${entry.id}`);
  const source=read(join(pret,"data/maps",entry.map,"scripts.inc"));
  let labels=strings.get(entry.map);
  if(labels===undefined){
   labels=new Map<string,string>();strings.set(entry.map,labels);
   for(const match of source.matchAll(/^(\w+):+\s*\n((?:\s*\.string "(?:\\.|[^"\n])*"[^\n]*\n?)+)/gm)){
    const raw=[...(match[2]??"").matchAll(/\.string "((?:\\.|[^"\n])*)"/g)].map(m=>m[1]??"").join("");
    labels.set(match[1]??"",raw);
   }
  }
  const raw=labels.get(entry.text_label);
  if(raw===undefined)throw Error(`missing pret text ${entry.id}: ${entry.text_label}`);
  const callers=[source,...(entry.called_from??[]).map(map=>read(join(pret,"data/maps",map,"scripts.inc")))].join("\n");
  if([...callers.matchAll(new RegExp(`\\b${entry.text_label}\\b`,"g"))].length<2)throw Error(`uncalled pret text ${entry.id}`);
  if(entry.speaker_gfx===null){
   if(entry.sign_script===undefined)throw Error(`sign script required ${entry.id}`);
   const SignMap=Type.Object({bg_events:Type.Array(Type.Object({script:Type.Optional(Type.String())}))});
   const map:unknown=JSON.parse(read(join(pret,"data/maps",entry.map,"map.json")));
   if(!Value.Check(SignMap,map)||!map.bg_events.some(bg=>bg.script===entry.sign_script))throw Error(`missing sign script ${entry.id}`);
   const block=new RegExp(`^${entry.sign_script}:+\\n([\\s\\S]*?)(?=^\\w+:|$)`,"m").exec(source)?.[1]??"";
   if(!block.includes(`msgbox ${entry.text_label}, MSGBOX_SIGN`))throw Error(`sign text mismatch ${entry.id}`);
  }else if(entry.speaker_gfx!==undefined){
   const map=read(join(pret,"data/maps",entry.map,"map.json"));
   if(!map.includes(`"${entry.speaker_gfx}"`))throw Error(`missing sprite ${entry.id}`);
  }else if(!raw.includes(`${entry.name_prefix??""}: `))throw Error(`missing printed name ${entry.id}`);
  const text=raw.replace(/\\([npl"\\])/g,(_m:string,c:string)=>c==="p"?"\0":c==="n"||c==="l"?"\n":c).replace(/\$$/,"").replaceAll("{PLAYER}","ANNA").replaceAll("{KUN}","");
  if(/\\[A-Za-z]/.test(text))throw Error(`unsupported text escape ${entry.id}`);
  const pages=text.split("\0");
  if(pages.some(p=>p.length===0))throw Error(`empty pret page ${entry.id}`);
  if(entry.page_names!==undefined){
   if(entry.page_names.length!==pages.length)throw Error(`page attribution count ${entry.id}`);
   let last:string|null=null;
   for(const [i,name] of entry.page_names.entries()){
    if(name===null&&last!==null)throw Error(`lost printed name ${entry.id}`);
    // The production dialogue producer's NAME_PREFIX, used only to audit this offline fixture.
    const printed=/^([A-Z][A-Z0-9.'&-]*(?: [A-Z0-9.'&-]+){0,2}):\s/.exec(pages[i]??"")?.[1];
    if(name!==(printed??last))throw Error(`page printed name ${entry.id}`);
    last=name;
   }
  }
  return {...entry,pages,speaker:entry.speaker_gfx===null?null:entry.name_prefix??(entry.speaker_gfx??"").replace(/^OBJ_EVENT_GFX_/,""),speakerSource:entry.speaker_gfx===null?null:entry.name_prefix===undefined?"faced_sprite":"name_prefix"};
 });
}

export function buildWholeGameStream(entries:readonly WholeGameEntry[],seed=20261028):WholeGameStep[]{
 let random=seed>>>0,seq=0,turn=0;
 const next=()=>{random=(Math.imul(1664525,random)+1013904223)>>>0;return random/4294967296;};
 const shuffle=(items:WholeGameEntry[])=>{for(let i=items.length-1;i>0;i--){const j=Math.floor(next()*(i+1));const a=items[i],b=items[j];if(a!==undefined&&b!==undefined){items[i]=b;items[j]=a;}}return items;};
 const emitted=new Set<string>(),completed=new Set<string>(),steps:WholeGameStep[]=[],badges:string[]=[];
 const flags=Buffer.alloc(300),variables=Buffer.alloc(512);
 let story={...NAME_CONFIRMED.story,intro_stage:0,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:false,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
 let rustboroStage=0;
 const bit=(n:number)=>{flags.writeUInt8(flags.readUInt8(n>>3)|(1<<(n&7)),n>>3);};
 const complete=(name:string,entry:WholeGameEntry)=>{
  const definition=PROGRESS_CATALOG.find(m=>m.name===name);
  if(definition?.flag!==undefined)bit(definition.flag);
  if(definition?.allFlags!==undefined)for(const n of definition.allFlags)bit(n);
  if(definition?.anyFlags!==undefined)definition.anyFlags.forEach((n,i)=>{if(i===(entry.name_prefix==="MAY"?3:0))bit(n);});
  if(definition?.variable!==undefined)variables.writeUInt16LE(definition.values?.[0]??0,2*(definition.variable-0x4000));
  if(definition?.field==="rustboro_stage")rustboroStage=definition.values?.[0]??0;
  if(name.endsWith("_BADGE")){const badge=name.slice(0,-6);if(!badges.includes(badge))badges.push(badge);}
  switch(name){
   case "RIVAL_MET":story={...story,rival_stage:3};break;
   case "BIRCH_RESCUE_COMPLETE":story={...story,birch_lab_stage:2};break;
   case "BIRCH_STARTER_HANDOFF_COMPLETE":story={...story,birch_lab_stage:3};break;
   case "RIVAL_BATTLE_WON":story={...story,rival_battle_won:true};break;
   case "RECEIVED_POKEDEX":story={...story,pokedex_received:true};bit(0x8e4);break;
   case "RUNNING_SHOES_RECEIVED":story={...story,running_shoes_received:true};bit(0x112);break;
   case "DAD_FIRST_MEETING":story={...story,petalburg_gym_stage:1};break;
   case "WALLY_TUTORIAL_COMPLETE":story={...story,petalburg_gym_stage:2};break;
   case "TEAM_AQUA_WOODS_EVENT_COMPLETE":story={...story,woods_stage:1};break;
   case "STONE_BADGE":story={...story,stone_badge:true};bit(0x867);break;
  }
 };
 const emit=(body:EventBody):RunEvent=>checkEvent({...body,v:1,run:"synthetic-whole-game",seq:++seq,t:"2026-10-28T12:00:00.000-04:00"});
 const state=(entry:WholeGameEntry):RunEvent=>emit({type:"state",turn,...IN_GAME,name:"ANNA",party:[],badges:[...badges],location:entry.map,map_id:[...entry.map_id],story:{...story},story_progress:{flags:flags.toString("hex"),variables:variables.toString("hex"),rustboro_stage:rustboroStage,devon_stage:0,letter:false,avatar_flags:1}});
 const append=(entry:WholeGameEntry)=>{
  if(emitted.has(entry.id))return;emitted.add(entry.id);turn++;
  const before:RunEvent[]=[state(entry)],stateSeq=seq,id=`step-${String(turn)}`;
  before.push(emit({type:"dialogue_auto_advance",turn,tool_call_id:id,tool:"press",requested:[],sent:[],dropped:[],auto_presses:entry.pages.length,pages:entry.pages.map((text,i)=>({state_seq:stateSeq,map:entry.map,map_display:entry.map,map_id:[...entry.map_id],position:null,speaker:entry.page_names?.[i]??entry.speaker,speaker_source:entry.page_names?.[i]===undefined||entry.page_names[i]===null?entry.speakerSource:"name_prefix",text})),stop:"field_free",detail:"deterministic pret-only synthetic fixture; no game execution",duration_ms:0}));
  const quote=entry.pages.join(" ").replaceAll("\n"," ");
  before.push(emit({type:"tool_result",turn,id,name:"press",is_error:false,text:`Location: ${entry.map}\nStory line heard (${entry.page_names?.find(n=>n!==null)??entry.speaker}, turn ${String(turn)}): "${quote}"`,state_seq:stateSeq,duration_ms:0,frames:[]}));
  const resultSeq=seq,after:RunEvent[]=[];
  const newly=entry.milestone_after.filter(n=>!completed.has(n));
  for(const name of newly){complete(name,entry);completed.add(name);}
  if(newly.length>0){
   after.push(state(entry));const evidence=seq;
   after.push(emit({type:"tool_result",turn,id:`${id}-completed`,name:"observe",is_error:false,text:`Location: ${entry.map}`,state_seq:evidence,duration_ms:0,frames:[]}));
   for(const name of newly)after.push(emit({type:"milestone",turn,name,kind:"story",origin:"observed",server_timestamp:1793203200,evidence:[evidence]}));
  }
  steps.push({entry,before,after,resultSeq});
 };
 let region="";
 for(const entry of entries.filter(e=>e.role==="story")){
  if(entry.region!==region){region=entry.region;const nextRegion=String.fromCharCode(region.charCodeAt(0)+1);for(const filler of shuffle(entries.filter(e=>e.role==="filler"&&(e.region===region||e.region===nextRegion&&e.category==="PROGRESSION_HINT"))))append(filler);}
  append(entry);
 }
 return steps;
}
