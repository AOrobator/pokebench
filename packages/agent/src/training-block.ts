// The Training block (the operator 2026-10-21, "both sets"): game numbers and game words from this run, so the model can
// reason from its EXP. Points about what to do before a gym leader, as a player reads the summary screen and
// remembers its battles. Four switches each add one part; nothing ranks a choice or names a place to go.
// - exp-next-level-v1: the summary screen's EXP. POINTS and NEXT LV. (the game server's party_next_level).
// - exp-earned-ledger-v1: the amounts in the "{B_BUFF1} gained{B_BUFF2} {B_BUFF3} EXP. Points!" pages the model was
//   shown (pret battle_message.c sText_PkmnGainedEXP), by the battle they came from.
// - leader-attempt-ledger-v1: each battle with a GYM LEADER (trainer class LEADER) this run, side by side.
// - seen-trainers-ledger-v1: the trainers heal-before-trainers-v2 listed on each map the player stood on, with
//   the game's trainer flag.
import {BattleActionHistory,BATTLE_HISTORY_CONTEXT_CHARS} from "./battle-action-history.js";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {battleDecision,withAppendedBlock} from "./effectiveness-heard.js";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {GameStateSnapshot} from "./game-state.js";
import {LEADER_CLASS} from "./gym-readiness.js";

export const TRAINING_HEADER="Training (game numbers and game words from this run; not advice):";
const GAINED=/^(.+) gained(?: a boosted)? (\d+) EXP\. Points!$/;
const LAST_BATTLES=10;
// The battle states a page's state_seq may name; pages always name a recent one.
const STATE_MEMORY=512;

type State=Extract<RunEvent,{type:"state";started:boolean}>;
export type Snapshot=Pick<GameStateSnapshot,"started"|"in_battle"|"screen"|"location"|"map_id"|"party"|"battle"|"trainer_opponent"|"money"|"resources"|"heal_before_trainers"|"party_next_level">;
type Party=Snapshot["party"];
type Bag=NonNullable<Snapshot["resources"]>["bag"];

interface Source {readonly battle:number;readonly wild:string;readonly place:string}
interface Earned {readonly battle:number;label:string;readonly place:string;trainer:boolean;readonly turn:number;readonly amounts:string[];readonly values:number[]}
interface LeaderFoe {readonly species:string;readonly level:number;hp:number;maxHp:number;seq:number}
interface LeaderBattle {
 readonly messageSources:Map<string,number>;readonly effectivenessSources:Map<string,number>;readonly startSeq:number;endSeq:number|null;readonly startBag:Bag|null;readonly effectiveness:string[];readonly messages:string[];readonly startParty:Party;readonly turn:number;readonly party:string;readonly bag:string;readonly money:number|null;
 readonly foes:Map<number,LeaderFoe>;outcome:string|null;moneyAfter:number|null;done:boolean;
}
interface LossPages {readonly battle:LeaderBattle;readonly messages:string[];readonly effectiveness:string[]}
interface PendingLossPages {readonly tool:string;readonly pages:LossPages[]}
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
// pokeemerald include/constants/battle.h BATTLE_TYPE_TRAINER.
const BATTLE_TYPE_TRAINER=1<<3;
const leaderActive=(s:Pick<Snapshot,"trainer_opponent">)=>s.trainer_opponent?.battle_active===true&&s.trainer_opponent.trainer_class===LEADER_CLASS;

export class TrainingBlock {
 // EXP pages are attributed through the state their page names; states are kept as the battle they belong to.
 private readonly actions=new BattleActionHistory();
 private latest:State|null=null;
 private receipt:number|null=null;
 private offeredLoss:number|null=null;
 private consumedLoss:number|null=null;
 private readonly sources=new Map<number,Source>();
 // Per battle: the trainer's name once a state showed it, and battles the battle type marks as a trainer's.
 private readonly trainerLabels=new Map<number,string>();
 private readonly trainerBattles=new Set<number>();
 private battleCount=0;
 private wasInBattle=false;
 private readonly earned:Earned[]=[];
 private readonly leaders=new Map<string,LeaderBattle[]>();
 private leaderRunning:{readonly name:string;readonly battle:LeaderBattle}|null=null;
 // The new loss-memory path alone waits for the recorder's matching delivery receipt.
 private readonly leaderSources=new Map<number,LeaderBattle>();
 private readonly pendingLossPages=new Map<string,PendingLossPages>();
 private readonly names=new Map<number,string>();
 private readonly maps=new Map<string,Map<number,SeenTrainer>>();
 constructor(private readonly features:FeatureSet){}

 observe(event:RunEvent):void {
  if(this.features["battle-action-history-v1"])this.actions.observe(event);
  if(event.type==="assistant"&&event.stop_reason!=="error"&&event.stop_reason!=="aborted"&&event.error===undefined&&this.offeredLoss!==null){this.consumedLoss=this.offeredLoss;this.offeredLoss=null;}
  if(event.type==="state"){this.latest="started" in event?event:null;this.receipt=null;}
  if(event.type==="tool_result"||event.type==="decision_input")this.receipt=(event.type==="decision_input"||!event.is_error)&&this.latest!==null&&event.state_seq===this.latest.seq?event.seq:null;
  if(event.type==="state"&&"started" in event){this.state(event);return;}
  if(this.features["leader-loss-comparison-v1"])this.lossDelivery(event);
  if(event.type!=="dialogue_auto_advance"||!this.features["exp-earned-ledger-v1"])return;
  for(const page of event.pages){
   if(page.battle_message_id===undefined||page.state_seq===null)continue;
   const gained=GAINED.exec(oneLine(page.text));
   if(gained===null)continue;
   const source=this.sources.get(page.state_seq);
   if(source===undefined)continue;
   const amount=Number(gained[2]);
   const named=this.trainerLabels.get(source.battle);
   const trainer=named!==undefined||this.trainerBattles.has(source.battle);
   // A trainer's battle whose opponent was not read stays unnamed, never a wild encounter.
   const label=named??(trainer?"a trainer (name not read)":source.wild);
   const last=this.earned.at(-1);
   const entry=last?.battle===source.battle?last:{battle:source.battle,place:source.place,label,trainer,turn:event.turn,amounts:[],values:[]};
   if(entry!==last)this.earned.push(entry);
   entry.label=label;entry.trainer=trainer;
   entry.amounts.push(`${gained[1]??""} ${String(amount)}`);
   entry.values.push(amount);
  }
 }

 // Recording precedes the final observation, which may reject. Pending pages stay bound to
 // their source battle even when that battle completes before its successful result arrives.
 private lossDelivery(event:RunEvent):void {
  if(event.type==="dialogue_auto_advance"){
   const previous=this.pendingLossPages.get(event.tool_call_id);
   const pages=new Map<LeaderBattle,LossPages>((previous?.tool===event.tool?previous.pages:[]).map(p=>[p.battle,p]));
   for(const page of event.pages){
    if(page.battle_message_id===undefined||page.state_seq===null)continue;
    const battle=this.leaderSources.get(page.state_seq);if(battle===undefined)continue;
    const text=oneLine(page.text),entry=pages.get(battle)??{battle,messages:[],effectiveness:[]};
    pages.set(battle,entry);
    if(text!==""&&entry.messages.at(-1)!==text)entry.messages.push(text);
    entry.messages.splice(0,Math.max(0,entry.messages.length-4));
    if(/not very effective|super effective|doesn.t affect/i.test(text)&&!entry.effectiveness.includes(text))entry.effectiveness.push(text);
    entry.effectiveness.splice(0,Math.max(0,entry.effectiveness.length-4));
   }
   if(pages.size>0){
    this.pendingLossPages.set(event.tool_call_id,{tool:event.tool,pages:[...pages.values()]});
    if(this.pendingLossPages.size>STATE_MEMORY){const first=this.pendingLossPages.keys().next().value;if(first!==undefined)this.pendingLossPages.delete(first);}
   }
   return;
  }
  if(event.type!=="tool_result")return;
  const pending=this.pendingLossPages.get(event.id);
  if(pending===undefined||pending.tool!==event.name)return;
  this.pendingLossPages.delete(event.id);
  if(event.is_error)return;
  for(const entry of pending.pages){
   for(const text of entry.messages)if(entry.battle.messages.at(-1)!==text)entry.battle.messages.push(text);
   for(const text of entry.effectiveness)if(!entry.battle.effectiveness.includes(text))entry.battle.effectiveness.push(text);
   entry.battle.messages.splice(0,Math.max(0,entry.battle.messages.length-4));
   entry.battle.effectiveness.splice(0,Math.max(0,entry.battle.effectiveness.length-4));
   for(const text of entry.messages)entry.battle.messageSources.set(text,event.seq);
   for(const text of entry.effectiveness)entry.battle.effectivenessSources.set(text,event.seq);
   for(const text of entry.battle.messageSources.keys())if(!entry.battle.messages.includes(text))entry.battle.messageSources.delete(text);
   for(const text of entry.battle.effectivenessSources.keys())if(!entry.battle.effectiveness.includes(text))entry.battle.effectivenessSources.delete(text);
  }
 }

 private state(s:State):void {
  const battling=inBattle(s);
  if(battling&&!this.wasInBattle)this.battleCount+=1;
  this.wasInBattle=battling;
  const opponent=s.trainer_opponent;
  if(opponent?.battle_active===true&&opponent.name!==null)this.names.set(opponent.trainer_id,opponent.name);
  if(battling){
   if(opponent?.battle_active===true)this.trainerLabels.set(this.battleCount,`${opponent.name??`trainer ${String(opponent.trainer_id)}`} (trainer)`);
   if(((s.battle?.battle_type??0)&BATTLE_TYPE_TRAINER)!==0)this.trainerBattles.add(this.battleCount);
   this.sources.set(s.seq,this.source(s));
   if(this.sources.size>STATE_MEMORY){const first=this.sources.keys().next().value;if(first!==undefined)this.sources.delete(first);}
  }
  const previousLeader=this.leaderRunning;
  if(this.features["leader-attempt-ledger-v1"]||this.features["leader-loss-comparison-v1"])this.leader(s,battling);
  if(this.features["leader-loss-comparison-v1"]){
   // The completion state can own the last journal pages collected on the way back to the field.
   const source=this.leaderRunning?.battle??(field(s)?previousLeader?.battle:undefined);
   if(source!==undefined){
    this.leaderSources.set(s.seq,source);
    if(this.leaderSources.size>STATE_MEMORY){const first=this.leaderSources.keys().next().value;if(first!==undefined)this.leaderSources.delete(first);}
   }
  }
  if(this.features["seen-trainers-ledger-v1"]&&field(s)&&s.location!==null)this.seen(s,s.location);
 }

 private source(s:State):Source {
  const place=s.location??"an unnamed map";
  const foes=(s.battle?.battlers??[]).filter(b=>b.position%2===1);
  return {battle:this.battleCount,wild:`wild ${foes.map(b=>`${b.species} Lv${String(b.level)}`).join(" and ")||"POKéMON"}`,place};
 }

 private leader(s:State,battling:boolean):void {
  if(battling&&leaderActive(s)){
   const name=s.trainer_opponent?.name??"GYM LEADER";
   if(this.leaderRunning===null){
    const battle:LeaderBattle={messageSources:new Map(),effectivenessSources:new Map(),startSeq:s.seq,endSeq:null,startBag:s.resources?.bag==null?null:structuredClone(s.resources.bag),effectiveness:[],messages:[],startParty:structuredClone(s.party),turn:s.turn,party:partyExp(s.party),bag:bagText(s),money:s.money,foes:new Map(),outcome:null,moneyAfter:null,done:false};
    this.leaderRunning={name,battle};
    this.leaders.set(name,[...(this.leaders.get(name)??[]),battle]);
   }
   const battle=this.leaderRunning.battle;
   for(const b of s.battle?.battlers??[]){
    if(b.position%2!==1)continue;
    battle.foes.set(b.party_slot,{species:b.species,level:b.level,hp:b.hp,maxHp:b.max_hp,seq:s.seq});
   }
   const outcome=s.battle?.outcome;
   if(outcome!=null&&outcome!=="ongoing")battle.outcome=outcome;
   return;
  }
  if(this.leaderRunning!==null&&field(s)){
   this.leaderRunning.battle.moneyAfter=s.money;
   this.leaderRunning.battle.done=true;
   this.leaderRunning.battle.endSeq=s.seq;
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
     return `  ${String(i+1)}. turn ${String(b.turn)}: ${b.party} · ${b.bag} · ${n}'s POKéMON: ${foes||"none seen"} · ${b.outcome===null?"no outcome recorded":`you ${b.outcome}`} · money ${money(b.money)} → ${money(b.moneyAfter)}`;
    }),
    `  Now: ${partyExp(s.party)} · ${bagText(s)} · money ${money(s.money)}`,
   ];
  });
 }

 private lossPart(s:Snapshot,immediate=false):string[] {
  if(!this.features["leader-loss-comparison-v1"])return [];
  const current=leaderActive(s)?s.trainer_opponent?.name??null:null;
  if(!immediate&&current===null&&!(field(s)&&s.location?.endsWith(" GYM")===true))return [];
  return [...this.leaders].filter(([name])=>current===null||name===current).flatMap(([name,battles])=>{
   const loss=this.features["leader-preparation-comparison-v1"]?battles.findLast(b=>b.done):battles.findLast(b=>b.done&&b.outcome==="lost");if(loss===undefined)return [];
   if(immediate&&[...this.leaders.values()].flat().some(b=>b.done&&(b.endSeq??0)>(loss.endSeq??0)))return [];
   if(this.features["leader-preparation-comparison-v1"])return this.preparation(name,loss,s);
   const before=loss.startParty.filter(m=>m.species!==null&&m.is_egg!==true),now=s.party.filter(m=>m.species!==null&&m.is_egg!==true);
   const unique=(p:Party)=>p.length>0&&p.every(m=>m.identity!=null)&&new Set(p.map(m=>m.identity)).size===p.length;
   const complete=unique(before)&&unique(now);
   const byIdentity=new Map(now.map(m=>[m.identity,m]));
   const membership=complete?(before.length===now.length&&before.every(m=>byIdentity.has(m.identity))?"unchanged":"changed"):"unknown";
   const aligned=before.flatMap(m=>{const member=byIdentity.get(m.identity);return member===undefined?[]:[member];});
   const comparable=membership==="unchanged"&&before.every((m,i)=>m.species===aligned[i]?.species);
   const compare=(values:(party:Party)=>readonly unknown[]|null):string=>{
    if(!comparable)return "unknown";const a=values(before),b=values(aligned);
    return a===null||b===null?"unknown":JSON.stringify(a)===JSON.stringify(b)?"unchanged":"changed";
   };
   const levels=compare(p=>p.some(m=>m.level==null)?null:p.map(m=>m.level));
   const exp=compare(p=>p.some(m=>m.experience==null)?null:p.map(m=>m.experience));
   const moves=compare(p=>p.some(m=>m.moves==null)?null:p.map(m=>m.moves?.map(move=>move.move_id)));
   const moveText=(p:Party)=>p.map(m=>`${m.species??"unknown"}: ${m.moves==null?"unknown":m.moves.map(move=>move.name??`move ${String(move.move_id)}`).join(", ")}`).join("; ")||"unknown";
   return [`- Last observed loss to GYM LEADER ${name} (turn ${String(loss.turn)}): party membership: ${membership}; levels: ${levels}; EXP: ${exp}; moves: ${moves}.`,
    `  At battle start: ${partyExp(before)}. Now: ${partyExp(now)||"unknown"}.`,
    `  Moves at battle start: ${moveText(before)}. Now: ${moveText(now)}.`,
    `  Opponents last observed: ${[...loss.foes.values()].map(f=>`${f.species} Lv${String(f.level)} HP ${String(f.hp)}/${String(f.maxHp)}`).join(", ")||"unknown"}. Damage attribution: unknown.`,
    `  Effectiveness pages delivered: ${loss.effectiveness.length===0?"unknown":loss.effectiveness.join(" | ")}`,
    `  Last battle pages delivered (up to 4; game words): ${loss.messages.length===0?"unknown":loss.messages.join(" | ")}`];
  });
 }


 private preparation(name:string,last:LeaderBattle,s:Snapshot):string[] {
  const before=last.startParty.filter(m=>m.is_egg!==true),now=s.party.filter(m=>m.is_egg!==true);
  const unique=(p:Party)=>p.length>0&&p.every(m=>m.identity!=null)&&new Set(p.map(m=>m.identity)).size===p.length;
  const complete=unique(before)&&unique(now),byId=new Map(now.map(m=>[m.identity,m]));
  const same=complete&&before.length===now.length&&before.every(m=>byId.has(m.identity));
  const rows=[`- Preparation since last completed ${name} attempt (${last.outcome??"outcome unknown"}; battle-start state ${String(last.startSeq)}, completion state ${String(last.endSeq??"unknown")}; compared with current observation): party membership ${complete?(same?"unchanged":"changed"):"unknown"}.`];
  if(!complete)rows.push("  Party species, levels, EXP, moves and HP comparison unknown (missing or duplicated identities).");
  if(complete)for(const b of before){
   const n=byId.get(b.identity);if(n===undefined){rows.push(`  ${b.species??"unknown member"}: no longer in observed party.`);continue;}
   const compare=(label:string,a:string|number|null|undefined,z:string|number|null|undefined)=>`${label} ${a==null||z==null?"unknown":JSON.stringify(a)===JSON.stringify(z)?"unchanged":`${String(a)} → ${String(z)}`}`;
   const moves=b.moves==null||n.moves==null?"moves unknown":JSON.stringify(b.moves.map(m=>m.move_id))===JSON.stringify(n.moves.map(m=>m.move_id))?"moves unchanged":`moves ${b.moves.map(m=>m.name??m.move_id).join(", ")} → ${n.moves.map(m=>m.name??m.move_id).join(", ")}`;
   rows.push(`  ${b.species??"unknown member"}: ${compare("species",b.species,n.species)}; ${compare("level",b.level,n.level)}; ${compare("EXP",b.experience,n.experience)}; ${moves}; HP ${b.hp==null?"unknown":String(b.hp)}/${b.max_hp==null?"unknown":String(b.max_hp)} → ${n.hp==null?"unknown":String(n.hp)}/${n.max_hp==null?"unknown":String(n.max_hp)} (battle start → now).`);
  }
  if(complete)for(const n of now)if(!before.some(b=>b.identity===n.identity))rows.push(`  Added observed party member: ${n.species??"unknown species"} Lv${n.level==null?"unknown":String(n.level)}.`);
  const bag=(items:Bag|null|undefined)=>{
   if(items==null)return null;
   const quantities=new Map<number,{name:string|null;quantity:number}>();
   for(const item of items){const previous=quantities.get(item.item_id);quantities.set(item.item_id,{name:item.name??previous?.name??null,quantity:(previous?.quantity??0)+item.quantity});}
   return quantities;
  };
  const a=bag(last.startBag),b=bag(s.resources?.bag);
  if(a===null||b===null)rows.push("  BAG quantities: unknown (incomplete read).");
  else {
   const changes=[...new Set([...a.keys(),...b.keys()])].flatMap(id=>{const x=a.get(id),y=b.get(id);return (x?.quantity??0)===(y?.quantity??0)?[]:[`${y?.name??x?.name??`item ${String(id)}`} ×${String(x?.quantity??0)} → ×${String(y?.quantity??0)}`];});
   rows.push(`  BAG quantities ${changes.length===0?"unchanged":changes.slice(0,12).join("; ")}${changes.length>12?`; ${String(changes.length-12)} more changed item quantities`:""}.`);
  }
  rows.push(`  Opponents last observed during that attempt: ${[...last.foes.values()].map(f=>`${f.species} Lv${String(f.level)} HP ${String(f.hp)}/${String(f.maxHp)}`).join(", ")||"unknown"}. Damage attribution: unknown.`);
  return rows;
 }

 context():{text:string;evidence:number[]}|null {
  const state=this.latest;
  if(state===null||this.receipt===null)return null;
  const parts:string[]=[],evidence:number[]=[state.seq,this.receipt];
  const latest=[...this.leaders.values()].flat().filter(b=>b.done).sort((a,b)=>(b.endSeq??0)-(a.endSeq??0))[0];
  if(this.features["leader-loss-immediate-v1"]&&latest?.outcome==="lost"&&latest.endSeq!==this.consumedLoss&&field(state)){
   parts.push(...this.lossPart(state,true));this.offeredLoss=latest.endSeq;
   evidence.push(latest.startSeq,...(latest.endSeq===null?[]:[latest.endSeq]),...[...latest.foes.values()].map(f=>f.seq),...latest.messageSources.values(),...latest.effectivenessSources.values());
  }
  const actions=this.features["battle-action-history-v1"]?this.actions.context(64-new Set(evidence).size,BATTLE_HISTORY_CONTEXT_CHARS-parts.join("\n").length-(parts.length===0?0:1)):null;
  if(actions!==null){parts.push(actions.text);evidence.push(...actions.evidence);}
  return parts.length===0?null:{text:parts.join("\n"),evidence:[...new Set(evidence)]};
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

 private toolLoss(s:Snapshot):string[] {
  const last=[...this.leaders.values()].flat().filter(b=>b.done).sort((a,b)=>(b.endSeq??0)-(a.endSeq??0))[0];
  // The context path supplies this same comparison once before the first post-loss decision.
  if(this.features["leader-loss-immediate-v1"]&&last?.outcome==="lost"&&last.endSeq!==this.consumedLoss&&field(s))return [];
  return this.lossPart(s);
 }

 block(s:Snapshot):string|null {
  if(!s.started)return null;
  let parts:string[];
  if(field(s)){
   const party=this.partyPart(s);
   parts=[...(party===null?[]:[party]),...this.earnedPart(),...this.leaderPart(s),...this.toolLoss(s),...this.seenPart()];
  }else if(battleDecision(s)&&leaderActive(s)){
   parts=[...this.leaderPart(s),...this.toolLoss(s)];
  }else return null;
  return parts.length===0?null:[TRAINING_HEADER,...parts].join("\n");
 }
}

const TRAINING_SWITCHES=["leader-loss-comparison-v1","exp-next-level-v1","exp-earned-ledger-v1","leader-attempt-ledger-v1","seen-trainers-ledger-v1"] as const;

export function withTrainingBlock(tools:readonly AgentTool[],features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void):void},shared?:TrainingBlock):AgentTool[] {
 if(!TRAINING_SWITCHES.some(id=>features[id]))return [...tools];
 const training=shared??new TrainingBlock(features);
 if(shared===undefined)recorder.subscribe(event=>{training.observe(event);});
 return withAppendedBlock(tools,features,state=>training.block(state as unknown as Snapshot));
}

export function trainingContext(features:FeatureSet,recorder:{subscribe(observer:(event:RunEvent)=>void,replay?:boolean):void;recordLedgerContext(note:{text:string;evidence:number[]}):void},base:(messages:AgentMessage[])=>Promise<AgentMessage[]>):{transform:(messages:AgentMessage[])=>Promise<AgentMessage[]>;training?:TrainingBlock}{
 if(!["leader-loss-immediate-v1","battle-action-history-v1","leader-preparation-comparison-v1"].some(id=>features[id as keyof FeatureSet]))return {transform:base};
 const training=new TrainingBlock(features);recorder.subscribe(e=>{training.observe(e);},true);
 return {training,transform:async messages=>{const out=await base(messages),note=training.context();if(note===null||out.some(m=>m.role==="user"&&m.content===note.text))return out;recorder.recordLedgerContext(note);return [...out,{role:"user",content:note.text,timestamp:Date.now()}];}};
}
