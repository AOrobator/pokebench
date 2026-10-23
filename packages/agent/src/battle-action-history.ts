import type {RunEvent} from "./events.js";
interface Observation {readonly seq:number;readonly battle:number;readonly party:readonly {species:string|null;nickname:string|null|undefined}[];readonly battlers:readonly {identity:string;position:number;party_slot:number;species:string;absent:boolean;hp:number;max_hp:number}[]|null}
export const BATTLE_HISTORY_CONTEXT_CHARS=6000;
const DEFAULT_LIMITS={intervals:8,memory:512,pages:8,sources:60};
interface Entry {text:string;evidence:number[]}
const HEADER="Observed battle actions (last 8 delivered intervals, up to 8 game pages each and 60 source rows; game pages and native HP, not advice):\nHP is net change between the stated battle snapshots; attribution to individual moves is unknown.";
// Delivered game pages and paired observations, never assistant recollections or inferred move damage.
// pret/pokeemerald731ad5b: battle_message.c STRINGID_USEDMOVE / sText_AttackerUsedX,
// sText_CriticalHit, sText_PkmnHurtByBurn and sText_FoePkmnPrefix/sText_WildPkmnPrefix.
// Prefixes are the printed side, not damage attribution; ambiguous native nicknames stay unknown.
export class BattleActionHistory {
 constructor(private readonly limits:Readonly<typeof DEFAULT_LIMITS>=DEFAULT_LIMITS){}
 private readonly states=new Map<number,Observation>();
 private readonly pending=new Map<string,{tool:string;pages:{text:string;seq:number;stateSeq:number}[]}>();
 private previous:Observation|null=null;
 private latestSeq:number|null=null;
 private battle=0;
 private previousBattle=-1;
 private wasBattle=false;
 private readonly entries:Entry[]=[];
 observe(e:RunEvent):void {
  if(e.type==="state"){
   if(!("started" in e)){this.previous=null;this.latestSeq=null;this.wasBattle=false;return;}
   const active=e.in_battle||e.screen==="battle";
   if(active&&!this.wasBattle)this.battle+=1;
   this.wasBattle=active;this.latestSeq=e.seq;this.states.set(e.seq,{seq:e.seq,battle:this.battle,party:e.party.map(m=>({species:m.species,nickname:m.nickname})),battlers:e.battle?.battlers?.map(b=>({identity:b.identity,position:b.position,party_slot:b.party_slot,species:b.species,absent:b.absent,hp:b.hp,max_hp:b.max_hp}))??null});
   if(this.states.size>this.limits.memory){const first=this.states.keys().next().value;if(first!==undefined)this.states.delete(first);}
   return;
  }
  if(e.type==="dialogue_auto_advance"){
   const old=this.pending.get(e.tool_call_id);
   const pages=old?.tool===e.tool?old.pages:[];
   for(const p of e.pages)if(p.battle_message_id!==undefined&&p.state_seq!==null&&this.states.has(p.state_seq))pages.push({text:p.text.replace(/\s+/g," ").trim(),seq:e.seq,stateSeq:p.state_seq});
   this.pending.set(e.tool_call_id,{tool:e.tool,pages:pages.slice(-this.limits.pages)});
   if(this.pending.size>this.limits.memory){const first=this.pending.keys().next().value;if(first!==undefined)this.pending.delete(first);}
   return;
  }
  if(e.type!=="tool_result")return;
  const pending=this.pending.get(e.id);this.pending.delete(e.id);
  if(e.is_error){this.previous=null;return;}
  const now=e.state_seq==null?undefined:this.states.get(e.state_seq);
  if(now===undefined||now.seq!==this.latestSeq){this.previous=null;return;}
  const pages=pending?.tool===e.name?pending.pages:[];
  const actions=pages.filter(p=>/ used .+!$/.test(p.text));
  if(actions.length>0||pages.some(p=>/burn|poison|restored|regained|healed|fainted/i.test(p.text))){
   const lines:string[]=[],nameSources=new Set<number>();
   let lastSide="unknown side";
   for(const p of pages){
    if(/ used .+!$/.test(p.text)){
     const actor=p.text.split(" used ")[0]??"",source=this.states.get(p.stateSeq);
     // Names can be omitted from fast snapshots. Reuse only a preceding party read in
     // this battle, never a later read after a capture/rename or an earlier battle's party.
     const partyRead=source!==undefined&&source.party.length>0?source:[...this.states.values()].findLast(s=>s.battle===source?.battle&&s.seq<=p.stateSeq&&s.party.length>0);
     const player=partyRead?.party.some(m=>m.species===actor||m.nickname===actor)===true||source?.battlers?.some(b=>b.position%2===0&&b.species===actor)===true;
     const prefixed=/^(?:Foe|Wild) /.test(actor),completeNames=partyRead!==undefined&&partyRead.party.every(m=>m.species!==null&&m.nickname!=null);
     if(partyRead!==undefined&&(prefixed||player))nameSources.add(partyRead.seq);
     lastSide=prefixed?(player||!completeNames?"Unknown side":"Foe"):player?"Player":"Unknown side";
     lines.push(`${lastSide} ${lastSide==="Foe"?p.text.replace(/^(?:Foe|Wild) /,""):p.text}`);
    }else if(/critical hit/i.test(p.text))lines.push(`${lastSide} move page: ${p.text}`);
    else if(/burn|poison|restored|regained|healed|fainted/i.test(p.text))lines.push(`Game page (side as printed; otherwise unknown): ${p.text}`);
   }
   const before=this.previous;
   // A whiteout/result can end on the field. Keep HP through a delivered battle-page snapshot,
   // explicitly distinct from the later (possibly healed) final observation.
   const pageEnd=pages.map(p=>this.states.get(p.stateSeq)).findLast(s=>s!==undefined&&s.battle===this.battle&&s.battlers!==null&&s.battlers.length>0);
   const end=now.battlers!==null&&now.battlers.length>0?now:pageEnd??null;
   if(before!==null&&end!==null&&this.previousBattle===end.battle&&before.battlers!==null&&end.battlers!==null){
    for(const b of before.battlers){
     if(b.absent)continue;
     const matches=end.battlers.filter(n=>!n.absent&&n.identity===b.identity&&n.party_slot===b.party_slot&&n.species===b.species&&n.position%2===b.position%2);
     const n=matches.length===1?matches[0]:undefined;
     if(n===undefined||n.max_hp!==b.max_hp){lines.push(`${b.position%2===0?"Player":"Foe"} ${b.species}: no comparable HP delta for this member.`);continue;}
     lines.push(`${b.position%2===0?"Player":"Foe"} ${b.species} HP ${String(b.hp)}/${String(b.max_hp)} → ${String(n.hp)}/${String(n.max_hp)} (net ${n.hp-b.hp>0?"+":""}${String(n.hp-b.hp)})`);
    }
   }else lines.push("HP changes: unknown (paired battle snapshots unavailable).");
   const evidence=[...new Set([...(before===null?[]:[before.seq]),...pages.map(p=>p.seq),...nameSources,...(end===null?[]:[end.seq]),now.seq,e.seq])];
   this.entries.push({text:`- Turn ${String(e.turn)} · observation interval ${String(before?.seq??"unknown")} → ${String(now.seq)}${end!==null&&end.seq!==now.seq?`; HP endpoint ${String(end.seq)} (last delivered battle-page snapshot; final observation ${String(now.seq)})`:""}: ${lines.join("; ")}`,evidence});
   this.entries.splice(0,Math.max(0,this.entries.length-this.limits.intervals));
  }
  this.previous=now;this.previousBattle=this.battle;
 }
 context(maxSources=this.limits.sources,maxChars=BATTLE_HISTORY_CONTEXT_CHARS):{text:string;evidence:number[]}|null {
  const entries=[...this.entries];
  let chars=HEADER.length+entries.reduce((sum,entry)=>sum+entry.text.length+1,0);
  while(entries.length>0&&(new Set(entries.flatMap(entry=>entry.evidence)).size>Math.max(0,maxSources)||chars>maxChars)){const removed=entries.shift();if(removed!==undefined)chars-=removed.text.length+1;}
  if(entries.length===0)return null;
  return {text:[HEADER,...entries.map(e=>e.text)].join("\n"),evidence:[...new Set(entries.flatMap(e=>e.evidence))]};
 }
}
