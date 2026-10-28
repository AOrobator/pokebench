// people-id-cards-v1: an ID card for each person who comes into view, built only from what the game has
// shown the model in this run (delivered dialogue and battle text) and from the state the result carries.
// It names no relation, role or goal of its own; the game's words are quoted whole.
import type {AgentTool,AgentToolResult} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import {isCheckedPress,type CheckedPressTool} from "./game-tools.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {pageLine,type DialoguePage} from "./dialogue-auto-advance.js";
import {PEOPLE_HEADER,facedObject} from "./people-ledger.js";
import {STORY_CHARACTERS,onScreen,storyCharacter} from "./script-line-presence.js";
import type {RunRecorder} from "./recorder.js";
import {semanticWalk} from "./semantic-targets.js";

export const CARDS_HEADER="ID cards for people who just came into view (only what the game has shown or stored in this run):";

// Sprite kinds (env/pokebench_env/event-graphics.json) that are not people: items, terrain, vehicles,
// furniture, dolls and cushions, and Pokémon. Anything else with a known sprite kind is a person.
const NOT_PEOPLE=new Set(["RAYQUAZA_STILL","ITEM_BALL","BERRY_TREE","BERRY_TREE_EARLY_STAGES","BERRY_TREE_LATE_STAGES","UNUSED_NATU_DOLL","UNUSED_MAGNEMITE_DOLL","UNUSED_SQUIRTLE_DOLL","UNUSED_WOOPER_DOLL","UNUSED_PIKACHU_DOLL","UNUSED_PORYGON2_DOLL","CUTTABLE_TREE","BREAKABLE_ROCK","PUSHABLE_BOULDER","MR_BRINEYS_BOAT","TRUCK","VIGOROTH_CARRYING_BOX","VIGOROTH_FACING_AWAY","BIRCHS_BAG","ZIGZAGOON_1","MOVING_BOX","CABLE_CAR","SS_TIDAL","SUBMARINE_SHADOW","PICHU_DOLL","PIKACHU_DOLL","MARILL_DOLL","TOGEPI_DOLL","CYNDAQUIL_DOLL","CHIKORITA_DOLL","TOTODILE_DOLL","JIGGLYPUFF_DOLL","MEOWTH_DOLL","CLEFAIRY_DOLL","DITTO_DOLL","SMOOCHUM_DOLL","TREECKO_DOLL","TORCHIC_DOLL","MUDKIP_DOLL","DUSKULL_DOLL","WYNAUT_DOLL","BALTOY_DOLL","KECLEON_DOLL","AZURILL_DOLL","SKITTY_DOLL","SWABLU_DOLL","GULPIN_DOLL","LOTAD_DOLL","SEEDOT_DOLL","PIKA_CUSHION","ROUND_CUSHION","KISS_CUSHION","ZIGZAG_CUSHION","SPIN_CUSHION","DIAMOND_CUSHION","BALL_CUSHION","GRASS_CUSHION","FIRE_CUSHION","WATER_CUSHION","BIG_SNORLAX_DOLL","BIG_RHYDON_DOLL","BIG_LAPRAS_DOLL","BIG_VENUSAUR_DOLL","BIG_CHARIZARD_DOLL","BIG_BLASTOISE_DOLL","BIG_WAILMER_DOLL","BIG_REGIROCK_DOLL","BIG_REGICE_DOLL","BIG_REGISTEEL_DOLL","LATIAS","LATIOS","KYOGRE_FRONT","GROUDON_FRONT","FOSSIL","REGIROCK","REGICE","REGISTEEL","SKITTY","KECLEON","KYOGRE_ASLEEP","GROUDON_ASLEEP","RAYQUAZA","ZIGZAGOON_2","PIKACHU","AZUMARILL","WINGULL","KECLEON_BRIDGE_SHADOW","AZURILL","POOCHYENA","KYOGRE_SIDE","GROUDON_SIDE","TRICK_HOUSE_STATUE","KIRLIA","DUSCLOPS","SUDOWOODO","MEW","DEOXYS","DEOXYS_TRIANGLE","LUGIA","HOOH"]);
export const isPerson=(sprite:string|null):boolean=>sprite!==null&&!NOT_PEOPLE.has(sprite);

const STORY_NAMES=new Set(STORY_CHARACTERS.map(c=>c.name));
const STEP:Readonly<Record<string,readonly[number,number]>>={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const INTRO=/^(.+)\nwould like to battle!$/s;
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
// A story name as the game prints it: upper case, not inside a longer upper-case word.
const names=(name:string)=>new RegExp(`(?<![A-Z])${escape(name)}(?![A-Z])`);
// A page shows a story name when it is the page's NAME: prefix or the page names it in upper case.
export const pageShowsName=(page:DialoguePage,name:string):boolean=>(page.speaker_source==="name_prefix"&&page.speaker===name)||names(name).test(page.text);

interface Person {readonly key:string;readonly name:string|null}
interface Shown {readonly page:DialoguePage;readonly turn:number;readonly call:string;readonly person:Person|null}
interface Delivery {readonly pages:readonly Shown[];readonly call:string}
interface History {readonly first:number;readonly maps:Map<string,number>;fingerprint:string|null}
export interface IdCard {readonly key:string;readonly reason:"first"|"changed";readonly text:string}

const place=(s:Pick<GameStateSnapshot,"location"|"location_display"|"map_id">)=>`${s.location_display??s.location??"unknown location"}${s.map_id===null?"":` (map ${s.map_id.join("/")})`}`;
const plural=(n:number,word:string)=>`${String(n)} ${word}${n===1?"":"s"}`;

// The person a page's state shows the player facing: the object the game would talk to (people ledger's
// rule), else an unscripted live person on the faced tile (a cutscene object such as May walking up).
function faced(s:GameStateSnapshot,named:boolean):Person|null {
 if(!s.started||s.map_id===null||s.position===null)return null;
 const live=(s.world_context?.objects??[]).filter(o=>o.map_id[0]===s.map_id?.[0]&&o.map_id[1]===s.map_id[1]);
 const target=facedObject(s);
 const step=s.facing===null?undefined:STEP[s.facing.toLowerCase()];
 const object=target!==null?live.find(o=>o.local_id===target.local_id)??null:step===undefined?null:live.find(o=>o.x===(s.position?.x??0)+step[0]&&o.y===(s.position?.y??0)+step[1])??null;
 if(object===null){
  if(target===null||!isPerson(target.sprite))return null;
  return {key:`obj:${s.map_id.join("/")}#${String(target.local_id)}`,name:null};
 }
 if(!isPerson(object.sprite_kind))return null;
 return identity(object.graphics_id,object.local_id,s,named);
}
// A story character is named only with character-presence-v1 on, by that switch's own rule.
function identity(graphics:number,local:number,s:Pick<GameStateSnapshot,"location"|"map_id">,named:boolean):Person {
 const name=named?storyCharacter(graphics,s.location):null;
 return name===null?{key:`obj:${(s.map_id??[]).join("/")}#${String(local)}`,name:null}:{key:`name:${name}`,name};
}

export class PeopleIdCards {
 constructor(private readonly named=true,private readonly cuts=false){}
 private turn=0;
 private readonly facing=new Map<number,Person|null>();
 private readonly pending=new Map<string,Shown[]>();
 private readonly delivered:Delivery[]=[];
 // Every delivered page in order, and each summary with the delivery count it was computed at.
 private readonly flat:Shown[]=[];
 private readonly summaryCache=new Map<string,{readonly at:number;readonly text:string}>();
 private readonly labels=new Map<string,Set<string>>();
 private readonly history=new Map<string,History>();
 private visible=new Set<string>();

 observe(event:RunEvent):void {
  this.turn=Math.max(this.turn,event.turn);
  if(event.type==="state"&&"started" in event){this.facing.set(event.seq,faced(event,this.named));return;}
  if(event.type==="dialogue_auto_advance"){this.pending.set(event.tool_call_id,this.attribute(event));return;}
  if(event.type!=="tool_result")return;
  const pages=this.pending.get(event.id);this.pending.delete(event.id);
  if(pages===undefined||event.is_error)return;
  this.delivered.push({pages,call:event.id});this.flat.push(...pages);
  // A battle intro right after a person's field lines is that person's battle; its "{CLASS} {NAME}" labels their battle text.
  let last:Person|null=null;
  for(const shown of pages){
   if(shown.page.battle_message_id===undefined){if(shown.person!==null)last=shown.person;continue;}
   const label=INTRO.exec(shown.page.text)?.[1];
   if(label!==undefined&&last!==null){const set=this.labels.get(last.key)??new Set<string>();set.add(label);this.labels.set(last.key,set);}
  }
 }
 // Who each field page belongs to: a story name's own NAME: label; the faced person for a page the record
 // attributes to the faced sprite; and, for a page with no speaker, the person the call's first field page
 // faced when the model pressed A (the people ledger's talk rule). Battle and level-up pages belong to no one.
 private attribute(event:Extract<RunEvent,{type:"dialogue_auto_advance"}>):Shown[] {
  const field=event.pages.filter(p=>p.battle_message_id===undefined&&p.position!==null);
  const first=field[0];
  const firstFaced=first?.state_seq==null?null:this.facing.get(first.state_seq)??null;
  const owner=firstFaced!==null&&(event.sent.at(-1)==="A"||first?.speaker_source==="faced_sprite")?firstFaced:null;
  return event.pages.map(page=>{
   let person:Person|null=null;
   if(page.battle_message_id===undefined&&page.position!==null){
    if(this.named&&page.speaker_source==="name_prefix"&&page.speaker!==null&&STORY_NAMES.has(page.speaker))person={key:`name:${page.speaker}`,name:page.speaker};
    else if(page.speaker_source==="faced_sprite")person=page.state_seq===null?null:this.facing.get(page.state_seq)??null;
    else if(page.speaker===null)person=owner;
   }
   return {page,turn:event.turn,call:event.tool_call_id,person};
  });
 }
 private all():readonly Shown[] {return this.flat;}
 private lastWords(key:string):Shown[] {
  for(let i=this.delivered.length-1;i>=0;i--){const mine=(this.delivered[i]?.pages??[]).filter(s=>s.person?.key===key);if(mine.length>0)return mine;}
  return [];
 }
 private nameShown(name:string):Shown|undefined {
  return this.all().find(s=>pageShowsName(s.page,name));
 }
 private mentions(name:string,exclude:readonly Shown[]):Shown[] {
  const rx=names(name);const seen=new Set<string>();
  return this.all().filter(s=>{
   if(s.page.battle_message_id!==undefined||exclude.includes(s))return false;
   const body=s.page.speaker_source==="name_prefix"&&s.page.speaker!==null&&s.page.text.startsWith(`${s.page.speaker}: `)?s.page.text.slice(s.page.speaker.length+2):s.page.text;
   if(!rx.test(body)||seen.has(s.page.text))return false;
   seen.add(s.page.text);return true;
  });
 }
 private battles(person:Person):Shown[] {
  const labels=[...(this.labels.get(person.key)??[])];
  const rx=person.name===null?null:names(person.name);
  return this.all().filter(s=>s.page.battle_message_id!==undefined&&(labels.some(l=>s.page.text.includes(l))||(rx?.test(s.page.text)??false)));
 }
 private card(person:Person,o:{local_id:number;sprite_kind:string|null;x:number;y:number},s:GameStateSnapshot,h:History,callId:string):{text:string;fingerprint:string} {
  const name=person.name;
  const shown=name===null?undefined:this.nameShown(name);
  const words=this.lastWords(person.key);
  const other=name===null?[]:this.mentions(name,words);
  const battles=this.battles(person);
  const quote=(list:readonly Shown[])=>list.map(x=>`  ${pageLine(x.page,x.turn)}`);
  const lines=[`ID card: ${name===null?`sprite ${o.sprite_kind??"unknown"}`:`${name} (sprite ${o.sprite_kind??"unknown"})`}, map object ${String(o.local_id)}, at ${String(o.x)},${String(o.y)} on ${place(s)}`];
  lines.push(name===null?"- Name: none shown by the game (a sprite kind is a graphic, not a name)."
   :shown===undefined?`- Name: ${name}, from the harness's story-character table (this graphic on a map where the game's story places ${name}); the game has not shown this name in this run yet.`
   :`- Name: ${name}. The game first showed this name on turn ${String(shown.turn)}.`);
  const maps=[...h.maps];
  lines.push(maps.length===1?`- First seen: turn ${String(h.first)}, here.`:`- Seen on: ${maps.map(([at,turn])=>`${at} from turn ${String(turn)}`).join("; ")}.`);
  const spokeNow=(this.pending.get(callId)??[]).some(x=>x.person?.key===person.key);
  if(words.length>0)lines.push(`- Last spoke to you: turn ${String(words[0]?.turn??0)}, ${plural(words.length,"page")}, whole:`,...quote(words));
  else if(!(this.cuts&&spokeNow))lines.push("- Has not spoken to you in this run.");
  if(name!==null){
   if(other.length===0)lines.push("- Other pages that name them: none.");
   else lines.push("- Other pages that name them (each once, in order, whole):",...quote(other));
  }
  if(battles.length===0)lines.push("- Battles with you: none recorded in this run.");
  else lines.push("- Battles with you (the game's own battle text, in order, whole):",...quote(battles));
  if((this.pending.get(callId)??[]).some(x=>x.person?.key===person.key))lines.push("- Also spoke to you during this call (see this result's dialogue list).");
  const fingerprint=JSON.stringify([name,shown?.turn??null,maps.map(([at])=>at),words.map(x=>x.page.text),other.map(x=>x.page.text),battles.map(x=>x.page.text)]);
  return {text:lines.join("\n"),fingerprint};
 }
 // The cards this result shows and the compact summary for each person who has had a card. Null outside a
 // started overworld readout with a position and live objects. Each call updates who is in view.
 cards(s:GameStateSnapshot,callId:string):{cards:IdCard[];summaries:ReadonlyMap<string,string>}|null {
  if(!s.started||s.screen!=="overworld"||s.in_battle)return null;
  const on=onScreen(s,this.named);
  if(on===null)return null;
  const now=new Set<string>();const cards:IdCard[]=[];const summaries=new Map<string,string>();
  for(const o of on){
   if(!isPerson(o.sprite_kind))continue;
   const person=o.character===null?identity(o.graphics_id,o.local_id,s,this.named):{key:`name:${o.character}`,name:o.character};
   if(now.has(person.key))continue;
   now.add(person.key);
   const h=this.history.get(person.key)??{first:this.turn,maps:new Map<string,number>(),fingerprint:null};
   this.history.set(person.key,h);
   if(!h.maps.has(place(s)))h.maps.set(place(s),this.turn);
   const c=this.card(person,o,s,h,callId);
   const reason=h.fingerprint===null?"first":!this.visible.has(person.key)&&h.fingerprint!==c.fingerprint?"changed":null;
   if(reason!==null){cards.push({key:person.key,reason,text:c.text});h.fingerprint=c.fingerprint;}
  }
  this.visible=now;
  for(const [key,h] of this.history)if(h.fingerprint!==null){
   // A summary changes only when a result is delivered, so it is recomputed only then.
   const spokeNow=this.cuts&&(this.pending.get(callId)??[]).some(x=>x.person?.key===key);
   if(spokeNow){summaries.set(key,this.summary(key,true));continue;}
   const cached=this.summaryCache.get(key);
   const text=cached?.at===this.delivered.length?cached.text:this.summary(key,false);
   this.summaryCache.set(key,{at:this.delivered.length,text});summaries.set(key,text);
  }
  return {cards,summaries};
 }
 private summary(key:string,spokeNow=false):string {
  const name=key.startsWith("name:")?key.slice(5):null;
  const person:Person={key,name};
  const shown=name===null?undefined:this.nameShown(name);
  const words=this.lastWords(key);
  const turns=[...new Set(this.battles(person).map(x=>x.turn))];
  return [name===null?"no name shown":shown===undefined?`name ${name} from the harness's story-character table, not yet shown by the game`:`name shown by the game on turn ${String(shown.turn)}`,
   words.length===0?(spokeNow?"spoke during this call (see this result's dialogue list)":"has not spoken to you"):`last spoke to you on turn ${String(words[0]?.turn??0)}`,
   turns.length===0?"battles: none":`battle text on ${turns.length===1?"turn":"turns"} ${turns.map(String).join(", ")}`].join("; ");
 }
 // The readout with the cards after the people-ledger block (after Position or Location when the block is
 // missing) and each carded person's ledger row ending in its compact summary.
 annotate(text:string,s:GameStateSnapshot,callId:string):{text:string;cards:IdCard[]} {
  const anchor=/^Location: .*$(?:\nPosition: .*$)?/m.exec(text);
  if(anchor===null)return {text,cards:[]};
  const out=this.cards(s,callId);
  if(out===null)return {text,cards:[]};
  const lines=text.split("\n");
  const head=lines.findIndex(l=>l.startsWith(PEOPLE_HEADER));
  let end:number;
  if(head>=0){
   end=head;
   for(let i=head+1;i<lines.length;i++){
    const line=lines[i]??"";
    if(line.startsWith("- object ")){
     const row=/^- object (\d+), (?:(.+?) \(sprite \S+\)|sprite \S+), at /.exec(line);
     const key=row===null?undefined:this.named&&row[2]!==undefined&&STORY_NAMES.has(row[2])?`name:${row[2]}`:s.map_id===null?undefined:`obj:${s.map_id.join("/")}#${row[1]??""}`;
     const summary=key===undefined?undefined:out.summaries.get(key);
     if(summary!==undefined)lines[i]=`${line}; ID card: ${summary}`;
     end=i;continue;
    }
    if(line.startsWith("Story characters here: ")){end=i;continue;}
    break;
   }
  }else end=text.slice(0,anchor.index+anchor[0].length).split("\n").length-1;
  if(out.cards.length>0)lines.splice(end+1,0,CARDS_HEADER,...out.cards.map(c=>c.text));
  return {text:lines.join("\n"),cards:out.cards};
 }
}

export interface IdCardRecorder {peopleIdCard(tool:string,toolCallId:string,card:IdCard):void}

function stateOf(details:unknown):GameStateSnapshot|null {
 if(typeof details!=="object"||details===null||!("state" in details)||details.state==null)return null;
 try{return parseGameState(details.state);}catch{return null;}
}

export function withPeopleIdCards(tools:readonly AgentTool[],features:FeatureSet,recorder:Pick<RunRecorder,"subscribe">&IdCardRecorder):AgentTool[] {
 if(!features["people-id-cards-v1"])return [...tools];
 const model=new PeopleIdCards(features["character-presence-v1"],features["input-cuts-v1"]);recorder.subscribe(event=>{model.observe(event);});
 const annotate=<T>(tool:string,id:string,result:AgentToolResult<T>):AgentToolResult<T>=>{
  const state=stateOf(result.details);
  if(state===null)return result;
  const index=result.content.findLastIndex(part=>part.type==="text"&&/^Location: /m.test(part.text));
  const part=result.content[index];
  if(part?.type!=="text")return result;
  const out=model.annotate(part.text,state,id);
  for(const card of out.cards)recorder.peopleIdCard(tool,id,card);
  const content=[...result.content];content[index]={...part,text:out.text};
  return {...result,content};
 };
 return tools.map(tool=>{
  if(tool.name!=="observe"&&tool.name!=="press"&&tool.name!=="navigate_to"&&!semanticWalk(tool.name,features))return tool;
  const execute:AgentTool["execute"]=async(id,params,signal,update)=>annotate(tool.name,id,await tool.execute(id,params,signal,update));
  if(!isCheckedPress(tool))return {...tool,execute};
  const checked:CheckedPressTool={...tool,execute,executeChecked:async(id,params,check,signal,update,options)=>annotate(tool.name,id,await tool.executeChecked(id,params,check,signal,update,options))};
  return checked;
 });
}
