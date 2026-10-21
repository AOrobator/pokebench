// The Training block (the operator 2026-10-21, "both sets"): game numbers and game words from this run, so the model can
// reason from its EXP. Points about what to do before a gym leader, as a player reads the summary screen and
// remembers its battles. Four switches each add one part; nothing ranks a choice or names a place to go.
// - exp-next-level-v1: the summary screen's EXP. POINTS and NEXT LV. (the game server's party_next_level).
// - exp-earned-ledger-v1: the amounts in the "{B_BUFF1} gained{B_BUFF2} {B_BUFF3} EXP. Points!" pages the model was
//   shown (pret battle_message.c sText_PkmnGainedEXP), by the battle they came from.
// - leader-attempt-ledger-v1: each battle with a GYM LEADER (trainer class LEADER) this run, side by side.
// - seen-trainers-ledger-v1: the trainers heal-before-trainers-v2 listed on each map the player stood on, with
//   the game's trainer flag.
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {battleDecision,withAppendedBlock} from "./effectiveness-heard.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {LEADER_CLASS} from "./gym-readiness.js";

export const TRAINING_HEADER="Training (game numbers and game words from this run; not advice):";
const GAINED=/^(.+) gained(?: a boosted)? (\d+) EXP\. Points!$/;
const LAST_BATTLES=10;

type State=Extract<RunEvent,{type:"state";started:boolean}>;
export type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"location"|"map_id"|"party"|"battle"|"trainer_opponent"|"money"|"resources"|"heal_before_trainers"|"party_next_level">;
type Party=Snapshot["party"];

interface Source {readonly battle:number;readonly label:string;readonly place:string;readonly trainer:boolean}
interface Earned {readonly battle:number;readonly label:string;readonly place:string;readonly trainer:boolean;readonly turn:number;readonly amounts:string[];readonly values:number[]}
interface LeaderFoe {readonly species:string;readonly level:number;hp:number;maxHp:number}
interface LeaderBattle {
 readonly turn:number;readonly party:string;readonly bag:string;readonly money:number|null;
 readonly foes:Map<number,LeaderFoe>;outcome:string|null;moneyAfter:number|null;done:boolean;
}
interface SeenTrainer {readonly id:number;readonly sprite:string|null;readonly x:number;readonly y:number;defeated:boolean}

const oneLine=(text:string)=>text.replace(/\s*\n\s*/g," ").trim();
const inBattle=(s:Pick<Snapshot,"started"|"in_battle"|"screen">)=>s.started&&(s.in_battle||s.screen==="battle");
const field=(s:Pick<Snapshot,"started"|"in_battle"|"screen">)=>s.started&&!s.in_battle&&s.screen==="overworld";
const money=(m:number|null)=>m===null?"unknown":`₽${String(m)}`;
const bagText=(s:Pick<Snapshot,"resources">):string=>{
 const bag=(s.resources?.bag??[]).filter(i=>i.name!=null&&i.quantity>0);
 return bag.length===0?"BAG empty":`BAG ${bag.map(i=>`${i.name??""} ×${String(i.quantity)}`).join(", ")}`;
};
const partyExp=(party:Party):string=>party.filter(m=>m.species!==null&&m.is_egg!==true).map(m=>`${m.species??""} Lv${String(m.level)} EXP. POINTS ${m.experience==null?"unknown":String(m.experience)}`).join(", ");
const leaderActive=(s:Pick<Snapshot,"trainer_opponent">)=>s.trainer_opponent?.battle_active===true&&s.trainer_opponent.trainer_class===LEADER_CLASS;

export class TrainingBlock {
 // EXP pages are attributed through the state their page names; states are kept as the battle they belong to.
 private readonly sources=new Map<number,Source>();
 private battleCount=0;
 private wasInBattle=false;
 private readonly earned:Earned[]=[];
 private readonly leaders=new Map<string,LeaderBattle[]>();
 private leaderRunning:{readonly name:string;readonly battle:LeaderBattle}|null=null;
 private readonly names=new Map<number,string>();
 private readonly maps=new Map<string,Map<number,SeenTrainer>>();
 constructor(private readonly features:FeatureSet){}

 observe(event:RunEvent):void {
  if(event.type==="state"&&"started" in event){this.state(event);return;}
  if(event.type!=="dialogue_auto_advance"||!this.features["exp-earned-ledger-v1"])return;
  for(const page of event.pages){
   if(page.battle_message_id===undefined||page.state_seq===null)continue;
   const gained=GAINED.exec(oneLine(page.text));
   if(gained===null)continue;
   const source=this.sources.get(page.state_seq);
   if(source===undefined)continue;
   const amount=Number(gained[2]);
   const last=this.earned.at(-1);
   const entry=last?.battle===source.battle?last:{...source,turn:event.turn,amounts:[],values:[]};
   if(entry!==last)this.earned.push(entry);
   entry.amounts.push(`${gained[1]??""} ${String(amount)}`);
   entry.values.push(amount);
  }
 }

 private state(s:State):void {
  const battling=inBattle(s);
  if(battling&&!this.wasInBattle)this.battleCount+=1;
  this.wasInBattle=battling;
  const opponent=s.trainer_opponent;
  if(opponent?.battle_active===true&&opponent.name!==null)this.names.set(opponent.trainer_id,opponent.name);
  if(battling)this.sources.set(s.seq,this.source(s));
  if(this.features["leader-attempt-ledger-v1"])this.leader(s,battling);
  if(this.features["seen-trainers-ledger-v1"]&&field(s)&&s.location!==null)this.seen(s,s.location);
 }

 private source(s:State):Source {
  const place=s.location??"an unnamed map";
  const opponent=s.trainer_opponent;
  if(opponent?.battle_active===true)return {battle:this.battleCount,label:`${opponent.name??`trainer ${String(opponent.trainer_id)}`} (trainer)`,place,trainer:true};
  const foes=(s.battle?.battlers??[]).filter(b=>b.position%2===1);
  return {battle:this.battleCount,label:`wild ${foes.map(b=>`${b.species} Lv${String(b.level)}`).join(" and ")||"POKéMON"}`,place,trainer:false};
 }

 private leader(s:State,battling:boolean):void {
  if(battling&&leaderActive(s)){
   const name=s.trainer_opponent?.name??"GYM LEADER";
   if(this.leaderRunning===null){
    const battle:LeaderBattle={turn:s.turn,party:partyExp(s.party),bag:bagText(s),money:s.money,foes:new Map(),outcome:null,moneyAfter:null,done:false};
    this.leaderRunning={name,battle};
    this.leaders.set(name,[...(this.leaders.get(name)??[]),battle]);
   }
   const battle=this.leaderRunning.battle;
   for(const b of s.battle?.battlers??[]){
    if(b.position%2!==1)continue;
    battle.foes.set(b.party_slot,{species:b.species,level:b.level,hp:b.hp,maxHp:b.max_hp});
   }
   const outcome=s.battle?.outcome;
   if(outcome!=null&&outcome!=="ongoing")battle.outcome=outcome;
   return;
  }
  if(this.leaderRunning!==null&&field(s)){
   this.leaderRunning.battle.moneyAfter=s.money;
   this.leaderRunning.battle.done=true;
   this.leaderRunning=null;
  }
 }

 private seen(s:State,location:string):void {
  const trainers=s.heal_before_trainers?.trainers;
  if(trainers==null)return;
  const map=this.maps.get(location)??new Map<number,SeenTrainer>();
  for(const t of trainers)map.set(t.trainer_id,{id:t.trainer_id,sprite:t.sprite_kind,x:t.x,y:t.y,defeated:t.defeated});
  this.maps.set(location,map);
 }

 private partyPart(s:Snapshot):string|null {
  const next=s.party_next_level;
  if(!this.features["exp-next-level-v1"]||next==null)return null;
  const entries=s.party.flatMap((m,i)=>m.species===null||m.is_egg===true?[]:[`${m.species} Lv${String(m.level)} · EXP. POINTS ${m.experience==null?"unknown":String(m.experience)} · NEXT LV. ${next[i]==null?"unknown":String(next[i])}`]);
  return entries.length===0?null:`- Party: ${entries.join("; ")}`;
 }

 private earnedPart():string[] {
  if(!this.features["exp-earned-ledger-v1"]||this.earned.length===0)return [];
  const range=(trainer:boolean)=>{
   const values=this.earned.filter(e=>e.trainer===trainer).flatMap(e=>e.values);
   return values.length===0?"none yet":`${String(Math.min(...values))}–${String(Math.max(...values))}`;
  };
  return [
   "- EXP. Points the game printed (its \"… gained … EXP. Points!\" pages), the last 10 battles that printed any, oldest first:",
   ...this.earned.slice(-LAST_BATTLES).map(e=>`  turn ${String(e.turn)} · ${e.label} on ${e.place}: ${e.amounts.join(", ")}`),
   `  Per page this run: trainer battles ${range(true)} · wild POKéMON ${range(false)}`,
  ];
 }

 private leaderPart(s:Snapshot):string[] {
  if(!this.features["leader-attempt-ledger-v1"])return [];
  const name=leaderActive(s)?s.trainer_opponent?.name??null:null;
  const names=name!==null?[name]:field(s)&&s.location?.endsWith(" GYM")===true?[...this.leaders.keys()]:[];
  return names.flatMap(n=>{
   const battles=(this.leaders.get(n)??[]).filter(b=>b.done);
   if(battles.length===0)return [];
   return [
    `- Battles with GYM LEADER ${n} this run:`,
    ...battles.map((b,i)=>{
     const foes=[...b.foes.entries()].sort(([a],[c])=>a-c).map(([,f])=>`${f.species} Lv${String(f.level)} ${f.hp===0?"fainted":`HP ${String(f.hp)}/${String(f.maxHp)}`}`).join(", ");
     return `  ${String(i+1)}. turn ${String(b.turn)}: ${b.party} · ${b.bag} · her POKéMON: ${foes||"none seen"} · ${b.outcome===null?"no outcome recorded":`you ${b.outcome}`} · money ${money(b.money)} → ${money(b.moneyAfter)}`;
    }),
    `  Now: ${partyExp(s.party)} · ${bagText(s)} · money ${money(s.money)}`,
   ];
  });
 }

 private seenPart():string[] {
  if(!this.features["seen-trainers-ledger-v1"])return [];
  const lines=[...this.maps.entries()].flatMap(([location,trainers])=>{
   if(trainers.size===0)return [];
   const list=[...trainers.values()];
   const label=(t:SeenTrainer)=>this.names.get(t.id)??`${t.sprite??"a trainer"} at (${String(t.x)},${String(t.y)})`;
   const open=list.filter(t=>!t.defeated).map(t=>`${label(t)} ${this.names.has(t.id)?"battled, not beaten":"not beaten"}`);
   const beaten=list.filter(t=>t.defeated);
   const beatenText=beaten.length===0?"":`${String(beaten.length)} beaten (${beaten.map(label).join(", ")})`;
   return [`  ${location}: ${[open.join(", "),beatenText].filter(x=>x!=="").join("; ")}`];
  });
  return lines.length===0?[]:["- Trainers the readout listed on maps you stood on this run (the game's trainer flags):",...lines];
 }

 block(s:Snapshot):string|null {
  if(!s.started)return null;
  let parts:string[];
  if(field(s)){
   const party=this.partyPart(s);
   parts=[...(party===null?[]:[party]),...this.earnedPart(),...this.leaderPart(s),...this.seenPart()];
  }else if(battleDecision(s)&&leaderActive(s)){
   parts=this.leaderPart(s);
  }else return null;
  return parts.length===0?null:[TRAINING_HEADER,...parts].join("\n");
 }
}

const TRAINING_SWITCHES=["exp-next-level-v1","exp-earned-ledger-v1","leader-attempt-ledger-v1","seen-trainers-ledger-v1"] as const;

export function withTrainingBlock(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void}):AgentTool[] {
 if(!TRAINING_SWITCHES.some(id=>features[id]))return [...tools];
 const training=new TrainingBlock(features);
 recorder.subscribe(event=>{training.observe(event);});
 return withAppendedBlock(tools,features,state=>training.block(state as unknown as Snapshot));
}
