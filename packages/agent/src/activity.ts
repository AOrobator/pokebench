import type {BodyOf} from './events.js';
import type {GameStateSnapshot} from './game-state.js';

type Observation={state:GameStateSnapshot;seq:number};
type Activity=Omit<BodyOf<'activity'>,'type'|'turn'|'server_timestamp'>;
export const completedHeal=(state:GameStateSnapshot):boolean=>state.started&&state.screen==='overworld'&&!state.in_battle&&state.field_controls_locked===false&&state.party.length>0&&state.party.every(mon=>mon.diagnostic==null&&mon.max_hp!=null&&mon.hp!=null&&mon.max_hp>0&&mon.hp===mon.max_hp);
// Counters are native cumulative totals; the first sample establishes a baseline,
// never fabricated activity for a resumed save. Each timestamp is a poll upper bound.
export class StateActivities {
 private previous:Observation|null=null;
 private pendingHeal:{seq:number;baseline:number;value:number;count:number}|null=null;
 private healSeen=false;
 private readonly blackoutReceipts=new Set<number>();
 private sampledBlackoutsWithoutReceipt=0;
 private readonly counters=new Map<string,{value:number;seq:number}>();
 observe(state:GameStateSnapshot,seq:number):{activities:Activity[];firstHealEvidence:number[]|null} {
  const activities:Activity[]=[];
  const previous=this.previous;
  let firstHealEvidence:number[]|null=null;
  if(previous!==null&&state.started&&state.screen!=='field_transition') {
   for(const [field,kind] of [['pokemon_captures','capture'],['evolved_pokemon','evolution'],['saved_game','save_attempt']] as const) {
    const baseline=this.counters.get(field),after=state.game_stats?.[field];
    if(baseline!==undefined&&after!=null&&after>baseline.value)activities.push({kind,count:after-baseline.value,evidence:[baseline.seq,seq]});
   }
   const baseline=this.counters.get("used_pokecenter"),after=state.game_stats?.used_pokecenter;
   if(baseline!==undefined&&after!=null&&after<baseline.value)this.pendingHeal=null;
   if(baseline!==undefined&&after!=null&&after>baseline.value)this.pendingHeal={seq,baseline:baseline.seq,value:after,count:after-baseline.value};
   if(this.pendingHeal!==null&&seq>this.pendingHeal.seq&&state.game_stats?.used_pokecenter===this.pendingHeal.value&&completedHeal(state)) {
    const evidence=[this.pendingHeal.seq,seq];
    activities.push({kind:'heal',count:this.pendingHeal.count,evidence});
    if(!this.healSeen){firstHealEvidence=[this.pendingHeal.baseline,...evidence];this.healSeen=true;}
    this.pendingHeal=null;
   }
   const duplicated=new Set<string>();
   if(state.party_owner!=="tutorial"&&previous.state.party_owner!=="tutorial"&&state.party_owner!=="rental"&&previous.state.party_owner!=="rental") {
   for(const party of [previous.state.party,state.party]) {
    const seen=new Set<string>();
    for(const mon of party)if(mon.identity!=null){if(seen.has(mon.identity))duplicated.add(mon.identity);seen.add(mon.identity);}
   }
   const identities=new Map(previous.state.party.filter(mon=>mon.identity!=null&&!duplicated.has(mon.identity)).map(mon=>[mon.identity,mon]));
   const unique=new Set<string>();
   for(const mon of state.party) {
    if(mon.identity==null||unique.has(mon.identity))continue;
    unique.add(mon.identity);
    const old=identities.get(mon.identity);
    if(old!==undefined&&old.diagnostic==null&&mon.diagnostic==null&&old.level!=null&&mon.level!=null&&mon.species!=null&&mon.level>old.level)activities.push({kind:'level_up',count:mon.level-old.level,evidence:[previous.seq,seq],pokemon:{identity:mon.identity,species:mon.species,from_level:old.level,to_level:mon.level}});
   }
   }
  }
  const receipts=[...new Map([...(state.blackout_receipts??[]),...(state.blackout_receipt===undefined?[]:[state.blackout_receipt])].map(receipt=>[receipt.frame,receipt])).values()];
  if(receipts.length>0) {
   for(const receipt of receipts) {
   if(!this.blackoutReceipts.has(receipt.frame)) {
    this.blackoutReceipts.add(receipt.frame);
    if(this.sampledBlackoutsWithoutReceipt>0)this.sampledBlackoutsWithoutReceipt--;
    else activities.push({kind:'blackout',count:1,evidence:[previous?.seq??seq,seq]});
   }
   }
  } else if(previous?.state.blackout_active===false&&state.blackout_active===true) {
   this.sampledBlackoutsWithoutReceipt++;
   activities.push({kind:'blackout',count:1,evidence:[previous.seq,seq]});
  }
  if(state.started&&state.screen!=='field_transition')for(const [field,value] of Object.entries(state.game_stats??{}))if(value!==null)this.counters.set(field,{value,seq});
  this.previous={state,seq};
  return {activities,firstHealEvidence};
 }
}
