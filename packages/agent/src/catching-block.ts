// party-coverage-v1 and said-type-matches-v1 (the operator 2026-10-21, "both sets"): at battle decisions, game facts that
// show what the party lacks and what the game has said about types, so catching can follow from evidence. Only the
// game's own words and battle data; no type chart, no advice.
// - party-coverage-v1: per foe type met this run, each of the player's moves used on it (pret battle_message.c
//   sText_AttackerUsedX) and the effectiveness line printed right after (sText_SuperEffective,
//   sText_NotVeryEffective, sText_ItDoesntAffect), then the types no move has drawn "It's super effective!" against.
// - said-type-matches-v1: field pages that name a type ("WATER-type"), kept with their map; the foe's and the
//   player's battler type and moves that a kept line names.
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {battleDecision,withAppendedBlock} from "./effectiveness-heard.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";

// pokeemerald include/constants/pokemon.h TYPE_* order, named as the battle readout names them.
export const TYPE_NAMES=["NORMAL","FIGHTING","FLYING","POISON","GROUND","ROCK","BUG","GHOST","STEEL","???","FIRE","WATER","GRASS","ELECTRIC","PSYCHIC","ICE","DRAGON","DARK"] as const;
export const COVERAGE_HEADER="Your moves by foe type this run (counted from the game's \"… used …!\" pages and the line it printed right after):";
export const SAID_HEADER="Type words the game printed this run, and what in this battle they name:";
const SUPER="It's super effective!";
const NOT_VERY="It's not very effective…";
const NO_EFFECT=/^It doesn't affect .+…$/;
const TYPE_WORD=/\b([A-Z]+)-type\b/g;
// The states a page's state_seq may name; pages always name a recent one.
const STATE_MEMORY=512;

type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"battle"|"party"|"party_owner">;
type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Battler=NonNullable<NonNullable<Snapshot["battle"]>["battlers"]>[number];

const oneLine=(text:string)=>text.replace(/\s*\n\s*/g," ").trim();
const typeName=(id:number|null):string|null=>id===null?null:TYPE_NAMES[id]??null;
export function typesOf(b:Pick<Battler,"types">):string {
 const names:string[]=[];
 for(const t of b.types){const n=typeName(t);if(n!==null&&!names.includes(n))names.push(n);}
 return names.join("/");
}
const decision=(s:Snapshot)=>battleDecision(s);

interface Sides {readonly player:readonly string[];readonly foe:{readonly species:string;readonly types:string}|null}
interface Use {used:number;readonly said:Map<string,number>}

export class PartyCoverage {
 private readonly sides=new Map<number,Sides>();
 // Foe type -> species met, in the order met; and per type, per move, uses and the lines printed.
 private readonly met=new Map<string,string[]>();
 private readonly uses=new Map<string,Map<string,Use>>();
 // A move whose effectiveness line has not been printed yet; it can arrive in a later auto-advance call.
 private pending:{readonly turn:number;readonly use:Use}|null=null;

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){this.state(event);return;}
  if(event.type!=="dialogue_auto_advance")return;
  for(const page of event.pages){
   if(page.battle_turn===undefined||page.battle_message_id===undefined){this.pending=null;continue;}
   const text=oneLine(page.text);
   const move=/^(.+?) used (.+)!$/.exec(text);
   if(move!==null){
    const sides=page.state_seq===null?undefined:this.sides.get(page.state_seq);
    this.pending=null;
    if(sides?.foe==null||!sides.player.includes(move[1]??""))continue;
    const byMove=this.uses.get(sides.foe.types)??new Map<string,Use>();
    this.uses.set(sides.foe.types,byMove);
    const use=byMove.get(move[2]??"")??{used:0,said:new Map<string,number>()};
    byMove.set(move[2]??"",use);
    use.used+=1;
    this.pending={turn:page.battle_turn,use};
    continue;
   }
   const used=this.pending;
   if(used===null||used.turn!==page.battle_turn)continue;
   if(text!==SUPER&&text!==NOT_VERY&&!NO_EFFECT.test(text))continue;
   used.use.said.set(text,(used.use.said.get(text)??0)+1);
   this.pending=null;
  }
 }

 private remember(seq:number,sides:Sides):void {
  this.sides.set(seq,sides);
  if(this.sides.size>STATE_MEMORY){const first=this.sides.keys().next().value;if(first!==undefined)this.sides.delete(first);}
 }

 private state(s:State):void {
  // A battle that ended leaves no move waiting for its line.
  if(!(s.in_battle||s.screen==="battle"))this.pending=null;
  // The player's own party only: the tutorial battle uses WALLY's ZIGZAGOON.
  if(s.party_owner!=="player"){this.remember(s.seq,{player:[],foe:null});return;}
  const battlers=s.battle?.battlers??[];
  const player=battlers.filter(b=>b.position%2===0).flatMap(b=>[b.species,s.party[b.party_slot]?.nickname??b.species]);
  const foes=battlers.filter(b=>b.position%2===1);
  const only=foes.length===1?foes[0]:undefined;
  const foe=only===undefined?null:{species:only.species,types:typesOf(only)};
  this.remember(s.seq,{player,foe});
  if(foe!==null&&foe.types!==""&&s.started&&(s.in_battle||s.screen==="battle")){
   const species=this.met.get(foe.types)??[];
   if(!species.includes(foe.species))species.push(foe.species);
   this.met.set(foe.types,species);
  }
 }

 block(s:Snapshot):string|null {
  if(!decision(s)||this.met.size===0)return null;
  const current=new Set((s.battle?.battlers??[]).filter(b=>b.position%2===1).map(typesOf));
  const rows=[...this.met.entries()].flatMap(([types,species])=>{
   const byMove=this.uses.get(types);
   const printed=byMove!==undefined&&[...byMove.values()].some(u=>u.said.size>0);
   if(byMove===undefined||(!printed&&!current.has(types)))return [];
   const moves=[...byMove.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,u])=>{
    const said=[...u.said.entries()].map(([line,n])=>`"${line}" ${String(n)}`).join(", ");
    return `${name} used ${String(u.used)}${said===""?" (no effectiveness line printed)":`, ${said}`}`;
   });
   return [`- ${types} (${species.join(", ")}): ${moves.join("; ")}`];
  });
  const gaps=[...this.met.keys()].filter(types=>![...(this.uses.get(types)?.values()??[])].some(u=>u.said.has(SUPER)));
  const lines=[...rows];
  if(gaps.length>0)lines.push(`- Foe types met this run that none of your moves has drawn "${SUPER}" against: ${gaps.join(", ")}`);
  return lines.length===0?null:[COVERAGE_HEADER,...lines].join("\n");
 }
}

interface Said {readonly text:string;readonly map:string;readonly types:ReadonlySet<string>}

export class SaidTypeMatches {
 private readonly said:Said[]=[];

 observe(event:RunEvent):void {
  if(event.type!=="dialogue_auto_advance")return;
  for(const page of event.pages){
   if(page.battle_message_id!==undefined)continue;
   const text=oneLine(page.text);
   const types=new Set([...text.matchAll(TYPE_WORD)].map(m=>m[1]??"").filter(t=>(TYPE_NAMES as readonly string[]).includes(t)));
   if(types.size===0||this.said.some(x=>x.text===text))continue;
   this.said.push({text,map:page.map??"an unnamed map",types});
  }
 }

 block(s:Snapshot):string|null {
  if(!decision(s)||this.said.length===0)return null;
  const battlers=(s.battle?.battlers??[]).filter(b=>!b.absent);
  const ordered=[...battlers.filter(b=>b.position%2===1),...battlers.filter(b=>b.position%2===0)];
  const lines=ordered.flatMap(b=>this.said.flatMap(said=>{
   const matches:string[]=[];
   for(const t of new Set(b.types.map(typeName)))if(t!==null&&said.types.has(t))matches.push(`${b.species} is ${t}-type`);
   for(const m of b.moves){
    const t=typeName(m.move_type);
    if(m.name!==null&&t!==null&&said.types.has(t))matches.push(`${m.name} is ${t}-type`);
   }
   return matches.length===0?[]:[`- ${b.position%2===1?"Foe":"Your"} ${b.species} (${typesOf(b)}): ${matches.join(", ")} — said on ${said.map}: "${said.text}"`];
  }));
  return lines.length===0?null:[SAID_HEADER,...lines].join("\n");
 }
}

export function withCatchingBlocks(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):AgentTool[] {
 let wrapped=[...tools];
 if(features["party-coverage-v1"]){
  const coverage=new PartyCoverage();
  recorder.subscribe(event=>{coverage.observe(event);});
  wrapped=withAppendedBlock(wrapped,features,state=>coverage.block(state as unknown as Snapshot));
 }
 if(features["said-type-matches-v1"]){
  const said=new SaidTypeMatches();
  recorder.subscribe(event=>{said.observe(event);});
  wrapped=withAppendedBlock(wrapped,features,state=>said.block(state as unknown as Snapshot));
 }
 return wrapped;
}
