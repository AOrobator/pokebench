import type {RunEvent} from "./events.js";
interface Observation {readonly seq:number;readonly party:readonly {species:string|null;nickname:string|null|undefined}[];readonly battlers:readonly {identity:string;position:number;species:string;hp:number;max_hp:number}[]|null}
const DEFAULT_LIMITS={intervals:8,memory:512,pages:8,sources:60};
interface Entry {text:string;evidence:number[]}
// Delivered game pages and paired observations, never assistant recollections or inferred move damage.
// pret/pokeemerald731ad5b: battle_message.c STRINGID_USEDMOVE / sText_AttackerUsedX,
// sText_CriticalHit and sText_PkmnHurtByBurn. Prefixes are the printed side, not damage attribution.
export class BattleActionHistory {
 constructor(private readonly limits=DEFAULT_LIMITS){}
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
   this.wasBattle=active;this.latestSeq=e.seq;this.states.set(e.seq,{seq:e.seq,party:e.party.map(m=>({species:m.species,nickname:m.nickname})),battlers:e.battle?.battlers?.map(b=>({identity:b.identity,position:b.position,species:b.species,hp:b.hp,max_hp:b.max_hp}))??null});
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
   const lines:string[]=[];
   let lastSide="unknown side";
   for(const p of pages){
    if(/ used .+!$/.test(p.text)){
     const foe=/^Foe /.test(p.text),name=p.text.split(" used ")[0]?.replace(/^Foe /,"");
     const source=this.states.get(p.stateSeq);
     const player=!foe&&(source?.party.some(m=>m.species===name||m.nickname===name)===true||source?.battlers?.some(b=>b.position%2===0&&b.species===name)===true);
     lastSide=foe?"Foe":player?"Player":"Unknown side";
     lines.push(`${lastSide} ${p.text.replace(/^Foe /,"")}`);
    }else if(/critical hit/i.test(p.text))lines.push(`${lastSide} move page: ${p.text}`);
    else if(/burn|poison|restored|regained|healed|fainted/i.test(p.text))lines.push(`Game page (side as printed; otherwise unknown): ${p.text}`);
   }
   const before=this.previous;
   if(before!==null&&this.previousBattle===this.battle&&before.battlers!==null&&now.battlers!==null){
    for(const b of before.battlers){
     const matches=now.battlers.filter(n=>n.identity===b.identity&&n.position%2===b.position%2);
     const n=matches.length===1?matches[0]:undefined;
     if(n===undefined||n.max_hp!==b.max_hp)continue;
     if(n.hp!==b.hp)lines.push(`${b.position%2===0?"Player":"Foe"} ${b.species} HP ${String(b.hp)}/${String(b.max_hp)} → ${String(n.hp)}/${String(n.max_hp)} (net ${n.hp-b.hp>0?"+":""}${String(n.hp-b.hp)})`);
    }
   }
   lines.push("HP is net change across the delivered observation interval; attribution to individual moves is unknown. Missing or changed battlers/HP limits have no comparable HP delta.");
   const evidence=[...new Set([...(before===null?[]:[before.seq]),...pages.map(p=>p.seq),now.seq,e.seq])];
   this.entries.push({text:`- Observation interval ${String(before?.seq??"unknown")} → ${String(now.seq)}: ${lines.join("; ")}`,evidence});
   this.entries.splice(0,Math.max(0,this.entries.length-this.limits.intervals));
   while(new Set(this.entries.flatMap(entry=>entry.evidence)).size>this.limits.sources)this.entries.shift();
  }
  this.previous=now;this.previousBattle=this.battle;
 }
 context(maxSources=this.limits.sources):{text:string;evidence:number[]}|null {
  const entries=[...this.entries];
  while(entries.length>0&&new Set(entries.flatMap(entry=>entry.evidence)).size>Math.max(0,maxSources))entries.shift();
  if(entries.length===0)return null;
  return {text:["Observed battle actions (last 8 delivered intervals, up to 8 game pages each and 60 source rows; game pages and native HP, not advice):",...entries.map(e=>e.text)].join("\n"),evidence:[...new Set(entries.flatMap(e=>e.evidence))]};
 }
}
