// Emerald 731ad5bf: gTypeEffectiveness via type_gap; CalculateBaseDamage STAB/stat/ability facts.
// Knowledge is committed only from delivered foe lines, never from internal state polls.
import type {AgentMessage} from '@mariozechner/pi-agent-core';
import type {RunEvent} from './events.js';
import type {FeatureSet} from './features.js';
import type {RunRecorder} from './recorder.js';
import {TYPE_NAMES} from './catching-block.js';
import {multiplier} from './type-gap-team.js';

export const MATCHUP_ID='move-learn-type-matchup-v1';
export const MATCHUP_HEADER='Move matchups (Emerald game data; foes already seen this run):';
type State=Extract<RunEvent,{type:'state';started:boolean}>;
type Battler=NonNullable<NonNullable<State['battle']>['battlers']>[number];
type Mon=State['party'][number];
interface Foe {species:string;types:number[];turn:number;seq:number}
interface Move {name:string;type:number;power:number;fresh:boolean}
interface Delivered {state:State;text:string;seq:number;id:string|null}
const types=(ids:readonly number[])=>[...new Set(ids)].map(t=>TYPE_NAMES[t]??'unknown').join('/');
const validTypes=(ids:readonly number[])=>ids.length===2&&ids.every(t=>t>=0&&t<18&&t!==9);
const key=(f:Foe)=>`${f.species}:${f.types.join(',')}`;

export class MoveMatchups {
 private readonly states=new Map<number,State>();
 private readonly foes=new Map<string,Foe>();
 private current:Delivered|null=null;
 observe(e:RunEvent):void {
  if(e.type==='state'&&'started' in e){
   this.states.set(e.seq,e);
   if(this.states.size>512){const first=this.states.keys().next().value;if(first!==undefined)this.states.delete(first);}
   return;
  }
  if(e.type!=='tool_result'&&e.type!=='decision_input')return;
  if(e.type==='tool_result'&&e.is_error){this.current=null;return;}
  const state=e.state_seq===undefined?undefined:this.states.get(e.state_seq);
  if(state===undefined){this.current=null;return;}
  this.current={state,text:e.text,seq:e.seq,id:e.type==='tool_result'?e.id:null};
  for(const b of state.battle?.battlers??[]){
   if(b.position%2!==1||b.absent||!validTypes(b.types))continue;
   const label=`${b.species} Lv${String(b.level)} · ${types(b.types)} ·`;
   const unique=(state.battle?.battlers??[]).filter(x=>x.position%2===1&&x.species===b.species&&x.level===b.level).length===1;
   if(!e.text.split('\n').some(line=>(unique&&line.startsWith(`Foe ${label}`))||line.startsWith(`Battler ${String(b.battler)} ${label}`)))continue;
   const f={species:b.species,types:[...b.types],turn:e.turn,seq:e.seq};
   this.foes.delete(key(f));this.foes.set(key(f),f);
   if(this.foes.size>64){const first=this.foes.keys().next().value;if(first!==undefined)this.foes.delete(first);}
  }
 }
 evidence():number[]{return this.current===null?[]:[this.current.seq,...new Set([...this.foes.values()].map(f=>f.seq))];}
 matches(messages:readonly AgentMessage[]):boolean {
  const c=this.current;if(c===null)return false;
  for(const m of [...messages].reverse()){
   if(m.role==='assistant')return false;
   if(c.id!==null&&m.role==='toolResult'&&m.toolCallId===c.id)return true;
   if(c.id===null&&m.role==='user'){const text=typeof m.content==='string'?m.content:m.content.flatMap(p=>p.type==='text'?[p.text]:[]).join('\n');if(text.includes(c.text))return true;}
  }
  return false;
 }
 block():string|null {
  const c=this.current;if(c===null||!c.state.started)return null;
  const s=c.state,gap=s.type_gap;
  if(gap==null||gap.diagnostic!==null||gap.type_chart.length===0||this.foes.size===0)return null;
  const phase=s.active_ui?.phase??'';
  const offered=/^ {2}New move: (.+?) (NORMAL|FIGHTING|FLYING|POISON|GROUND|ROCK|BUG|GHOST|STEEL|FIRE|WATER|GRASS|ELECTRIC|PSYCHIC|ICE|DRAGON|DARK) (?:physical|special|status)(?: pow (\d+))?/m.exec(c.text);
  const learning=offered!==null&&(phase==='evolution_move_learning'||phase==='evolution_move_confirmation'||phase==='summary_move_forget'||s.battle?.prompt?.ready===true&&(s.battle.prompt.kind==='learn_move'||s.battle.prompt.kind==='stop_learning_move'));
  const battle=s.in_battle&&s.battle?.active===true&&s.battle.ready===true&&s.battle.outcome==='ongoing';
  if(!learning&&!battle)return null;
  const lines=[MATCHUP_HEADER,'Type × STAB is a partial multiplier, not predicted damage. Stats, abilities, hit count and battle conditions are separate.'];
  const actors: {slot:number;battler:Battler|null}[]=learning?[]:(s.battle?.battlers??[]).filter(b=>b.position%2===0&&!b.absent&&b.hp>0&&(s.battle?.player_inputs??[]).some(i=>i.battler===b.battler&&i.ready&&(i.phase==='action'||i.phase==='move'))).map(b=>({slot:b.party_slot,battler:b}));
  if(learning){
   const details=s.active_ui?.details;
   const slot=details?.pokemon_party_index??details?.party_slot;
   if(typeof slot==='number'&&Number.isInteger(slot))actors.push({slot,battler:null});
   else {
    // Battle-owned pages identify the learner in the comparison, never by the last attacker.
    const name=/^ {2}(.+?) \([A-Z/]+\) knows:$/m.exec(c.text)?.[1];
    const matches=s.party.flatMap((m,i)=>(m.nickname??m.species)===name?[i]:[]);
    if(matches.length===1&&matches[0]!==undefined)actors.push({slot:matches[0],battler:null});
   }
  }
  for(const actor of actors){
   const member=gap.party.find(p=>p.slot===actor.slot),live=actor.battler;
   const mon:Mon|undefined=s.party[actor.slot]??(live===null?undefined:{species:live.species,level:live.level,hp:live.hp,max_hp:live.max_hp});
   if(mon===undefined||mon.is_egg||mon.diagnostic!=null)continue;
   const ownTypes=live?.types??member?.species_types;
   if(ownTypes==null||!validTypes(ownTypes))continue;
   const sourceMoves=live===null?member?.moves??[]:live.moves.flatMap(m=>m.move_id!==0&&m.move_type!==null&&m.power!==null?[{name:m.name,move_type:m.move_type,power:m.power}]:[]);
   const moves:Move[]=sourceMoves.flatMap(m=>m.name===null?[]:[{name:m.name,type:m.move_type,power:m.power,fresh:false}]);
   if(learning){
    const name=offered[1]??'',type=(TYPE_NAMES as readonly string[]).indexOf(offered[2]??'');
    const expected=s.active_ui?.details?.new_move;
    if(typeof expected==='string'&&expected!==name)continue;
    moves.push({name,type,power:Number(offered[3]??0),fresh:true});
   }
   lines.push(`${live?.species??mon.species??'Learner'} · ${types(ownTypes)} · Attack ${String(live?.stats[0]??mon.attack??'unknown')} · Sp. Atk ${String(live?.stats[3]??mon.sp_attack??'unknown')}${live===null?' (party stats)':' (battle stats before stages)'}`);
   const currentFoes=[...this.foes.values()].filter(f=>battle&&f.seq===c.seq&&(s.battle?.battlers??[]).some(b=>b.position%2===1&&!b.absent&&b.hp>0&&b.species===f.species&&types(b.types)===types(f.types)));
   const rest=[...this.foes.values()].reverse().filter(f=>!currentFoes.includes(f));
   const shown=[...currentFoes,...rest].slice(0,12);
   if(this.foes.size>shown.length)lines.push(`${String(this.foes.size-shown.length)} older profiles omitted; latest 64 profiles retained. Full evidence remains in recording.`);
   for(const f of shown){
    lines.push(`- ${f.species} ${types(f.types)} — previously observed turn ${String(f.turn)}${currentFoes.includes(f)?'; current target type profile':''}`);
    for(const move of moves){
     const label=`  ${move.name}${move.fresh?' (new)':''}`;
     if(move.power===0){lines.push(`${label}: status move; no damage multiplier`);continue;}
     if(move.power===1||move.name==='HIDDEN POWER'||move.name==='WEATHER BALL'||move.name==='STRUGGLE'){lines.push(`${label}: special type/damage rules; partial multiplier unavailable`);continue;}
     const chart=multiplier(gap.type_chart,move.type,f.types),stab=ownTypes.includes(move.type)?1.5:1;
     lines.push(`${label}: ${TYPE_NAMES[move.type]??'unknown'} · type ×${String(chart)} · STAB ×${String(stab)} · type × STAB ×${String(chart*stab)} · uses ${move.type<9?'Attack':'Sp. Atk'}${move.name==='DOUBLE KICK'?' · 2 hits; power 30 per hit':''} · ${abilityFact(mon,live,move)}`);
    }
   }
  }
  if(lines.length===2)return null;
  if(battle&&s.party.length===0)lines.push('Current damage unavailable: save-backed party and field facts are unavailable in this snapshot.');
  lines.push('Historical foe stats, abilities and field conditions are not assumed current. For current battle damage, use the effective-damage readout; unsupported effects are explicitly unavailable. No move is selected or ranked.');
  return lines.join('\n');
 }
}

export function abilityFact(mon:Mon,live:Battler|null,move:Move):string {
 const id=live?.ability??mon.ability_id,hp=live?.hp??mon.hp,max=live?.max_hp??mon.max_hp,status=live?.status1??mon.status;
 const pinch:Readonly<Record<number,{name:string;type:number}>>={65:{name:'OVERGROW',type:12},66:{name:'BLAZE',type:10},67:{name:'TORRENT',type:11},68:{name:'SWARM',type:6}};
 const p=id==null?undefined:pinch[id];
 if(p!==undefined){
  if(hp==null||max==null||max<=0)return `${p.name} activation unknown`;
  const active=hp<=Math.floor(max/3);
  return `${p.name} ${active?'active':'inactive'}${move.type===p.type?(active?' (move power ×1.5)':' (requires HP at most one third)'):' (does not boost this move type)'}`;
 }
 if(id===37||id===74)return move.type<9?'HUGE/PURE POWER: Attack ×2':'HUGE/PURE POWER: no Sp. Atk bonus';
 if(id===62)return status==null?'GUTS activation unknown':status!==0&&move.type<9?'GUTS active: Attack ×1.5':'GUTS inactive for this move';
 if(id===55)return move.type<9?'HUSTLE: Attack ×1.5; physical accuracy ×0.8':'HUSTLE: no Sp. Atk bonus';
 return id===0?'ability none':id==null?'ability unknown':`ability ID ${String(id)}; effects not included in this partial multiplier`;
}

type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
export function moveMatchupContext(features:FeatureSet,recorder:Pick<RunRecorder,'subscribe'|'recordLedgerContext'>,base:Transform):Transform {
 if(!features[MATCHUP_ID])return base;
 const ledger=new MoveMatchups();let lastRecorded:number|undefined;
 recorder.subscribe(e=>{ledger.observe(e);},false,false,true);
 return async messages=>{
  const out=await base(messages);
  if(!ledger.matches(out))return out;
  const text=ledger.block();if(text===null)return out;
  const evidence=ledger.evidence();
  if(evidence[0]!==lastRecorded){recorder.recordLedgerContext({text,evidence});lastRecorded=evidence[0];}
  return [...out,{role:'user',content:text,timestamp:Date.now()}];
 };
}
