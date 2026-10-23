import type {RunEvent} from "./events.js";

export interface CapabilityMon {readonly identity:string;readonly species:number;readonly level:number;readonly moves:readonly number[]}
export interface RecoveryFrame {readonly seq:number;readonly turn:number;readonly elapsedMs:number;readonly map:readonly number[];readonly party:readonly CapabilityMon[];readonly roxanneBattle:boolean;readonly victory:boolean;readonly coherent:boolean;readonly transition?:true}
export type CapabilityChange="level"|"evolution"|"moves"|"member";
function index(party:readonly CapabilityMon[]):Map<string,CapabilityMon>{
 const out=new Map<string,CapabilityMon>();
 if(party.length<1||party.length>6)throw new Error("invalid party size");
 for(const p of party){
  if(!p.identity||out.has(p.identity)||!Number.isInteger(p.species)||p.species<1||!Number.isInteger(p.level)||p.level<1||p.level>100||p.moves.length!==4||p.moves.some(m=>!Number.isInteger(m)||m<0||m>354))throw new Error("unknown or duplicated native party identity/capability");
  out.set(p.identity,p);
 }
 return out;
}
export function capabilityChanges(before:readonly CapabilityMon[],after:readonly CapabilityMon[]):CapabilityChange[]{
 const a=index(before),b=index(after),changes=new Set<CapabilityChange>();
 for(const [id,p]of b){const old=a.get(id);if(old===undefined){changes.add("member");continue;}if(p.level>old.level)changes.add("level");if(p.species!==old.species)changes.add("evolution");if(p.moves.some(m=>m!==0&&!old.moves.includes(m)))changes.add("moves");}
 return (["level","evolution","moves","member"] as const).filter(k=>changes.has(k));
}
/** Attribute each retained gain to the outside transition that actually acquired it. */
function retainedGain(initial:readonly CapabilityMon[],before:readonly CapabilityMon[],outside:readonly CapabilityMon[],current:readonly CapabilityMon[]):boolean{
 const base=index(initial),prior=index(before),now=index(current);
 return outside.some(p=>{
  const old=base.get(p.identity),previous=prior.get(p.identity),held=now.get(p.identity);
  if(held===undefined)return false;
  if(old===undefined)return previous===undefined;
  if(previous===undefined)return false;
  return p.level>old.level&&p.level>previous.level&&held.level>=p.level
   ||p.species!==old.species&&p.species!==previous.species&&held.species===p.species
   ||p.moves.some(m=>m!==0&&!old.moves.includes(m)&&!previous.moves.includes(m)&&held.moves.includes(m));
 });
}
export interface RecoveryScore {readonly verified:boolean;readonly departed:boolean;readonly strictRecovery:boolean;readonly eventualRecovery:boolean;readonly unchangedRematches:number;readonly recoverySeq:number|null;readonly victory:boolean;readonly changes:readonly CapabilityChange[];readonly evidence:readonly number[]}
const gym=(s:RecoveryFrame)=>s.map.length===2&&s.map[0]===11&&s.map[1]===3;
export function scoreRecovery(frames:readonly RecoveryFrame[],cap:{readonly turns:number;readonly ms:number}={turns:210,ms:1_800_000}):RecoveryScore{
 const first=frames[0];if(first===undefined||!gym(first)||first.roxanneBattle||first.victory)throw new Error("episode must start inside gym before the rematch, without prior victory");
 index(first.party);
 let verified=true,departed=false,recovered=false,unchanged=0,recoverySeq:number|null=null,wasBattle=false,lastSeq=-1,lastMs=-1,lastTurn=-1,victory=false;
 const outsideGains:{before:readonly CapabilityMon[];after:readonly CapabilityMon[]}[]=[];let previousParty:readonly CapabilityMon[]=first.party;let changes:CapabilityChange[]=[];const evidence:number[]=[first.seq];
 for(const f of frames){
  if(f.turn>cap.turns||f.elapsedMs>cap.ms)break;
  if(!Number.isSafeInteger(f.seq)||f.seq<=lastSeq||f.elapsedMs<lastMs||f.turn<lastTurn||!Number.isFinite(f.elapsedMs)||f.elapsedMs<0)throw new Error("nonmonotone recovery evidence");lastSeq=f.seq;lastMs=f.elapsedMs;lastTurn=f.turn;
  if(f.victory){victory=true;evidence.push(f.seq);}
  if(!f.coherent){verified=false;continue;}
  if(f.transition===true)continue;
  if(f.map.length!==2||f.map.some(v=>!Number.isSafeInteger(v)||v<0)){verified=false;continue;}
  const changed=capabilityChanges(first.party,f.party);
  if(!gym(f)){if(!departed)evidence.push(f.seq);departed=true;if(!wasBattle&&capabilityChanges(previousParty,f.party).length>0)outsideGains.push({before:previousParty,after:f.party});}
  if(f.roxanneBattle&&!wasBattle){
   if(changed.length===0){unchanged++;evidence.push(f.seq);}
   else if(departed&&outsideGains.some(g=>retainedGain(first.party,g.before,g.after,f.party))&&!recovered){recovered=true;recoverySeq=f.seq;changes=changed;evidence.push(f.seq);}
  }
  previousParty=f.party;wasBattle=f.roxanneBattle;
 }
 return {verified,departed,strictRecovery:verified&&recovered&&unchanged===0,eventualRecovery:verified&&recovered,unchangedRematches:unchanged,recoverySeq,victory,changes,evidence};
}
export interface ValidationRow{readonly family:string;readonly recovered:boolean;readonly victory:boolean;readonly verified:boolean}
export function provisionalWinner(candidate:readonly ValidationRow[],baseline:readonly ValidationRow[],controls:readonly boolean[],baselineControls:readonly boolean[]):boolean{
 if(candidate.length!==8||baseline.length!==8||controls.length!==4||baselineControls.length!==4||!controls.every(Boolean)||[...candidate,...baseline].some(r=>!r.verified))return false;
 const families=[...new Set(candidate.map(r=>r.family))].sort();if(families.length!==2||new Set(baseline.map(r=>r.family)).size!==2)return false;
 for(const family of families){const c=candidate.filter(r=>r.family===family),b=baseline.filter(r=>r.family===family);if(c.length!==4||b.length!==4||c.filter(r=>r.recovered).length<3)return false;}
 const count=(rows:readonly ValidationRow[],key:"recovered"|"victory")=>rows.filter(r=>r[key]).length;
 return count(candidate,"recovered")>=6&&count(candidate,"recovered")-count(baseline,"recovered")>=3&&count(candidate,"victory")>=count(baseline,"victory");
}

/** Native recorder states only. Narration, selected calls and citation diagnostics never create progress. */
export function recoveryFrames(events:readonly RunEvent[],afterSeq:number,episodeStartedAtMs?:number,verifiedTransitions:ReadonlySet<number>=new Set()):RecoveryFrame[]{
 const eligible=events.filter(e=>e.seq>=afterSeq);
 const started=eligible.find((e):e is Extract<RunEvent,{type:"state";started:boolean}>=>e.type==="state"&&"started" in e);
 if(started===undefined)throw new Error("missing episode native start");
 const t0=episodeStartedAtMs??Date.parse(started.t),out:RecoveryFrame[]=[];
 const victories=new Set(eligible.flatMap(e=>e.type==="milestone"&&e.name==="ROXANNE_DEFEATED"&&e.origin==="observed"?(e.evidence??[]):[]));
 let battlePending=false,roxanne=false,lastNativeId:number|null=null;let coverage=true;
 for(const event of eligible){
  if(event.type==="native_action"){
   if(lastNativeId!==null&&event.id!==lastNativeId+1)coverage=false;lastNativeId=event.id;
   if(event.kind==="battle_started"){battlePending=true;roxanne=false;}
   if(event.kind==="battle_ended"){if(battlePending)coverage=false;battlePending=false;roxanne=false;}
  }
  if(event.type!=="state"||!("started" in event))continue;
  const s=event,party:CapabilityMon[]=[];let coherent=s.started&&s.raw_ram!==undefined&&s.map_id!==null&&s.party.length>0;
  for(const p of s.party){if(p.identity===undefined||p.identity===null||p.species_id===undefined||p.species_id===null||p.level===null||p.moves===undefined||p.moves===null||p.diagnostic){coherent=false;continue;}party.push({identity:p.identity,species:p.species_id,level:p.level,moves:p.moves.map(m=>m.move_id)});}
  if(coherent&&battlePending&&s.in_battle&&s.battle?.initialized===true){
   if(s.trainer_opponent?.battle_active===true){roxanne=s.trainer_opponent.trainer_id===265;battlePending=false;}
   else if(s.battle.battle_type!==null&&(s.battle.battle_type&8)===0)battlePending=false;
  }
  const transition=verifiedTransitions.has(s.seq)&&s.map_id===null&&s.party.length===0&&s.raw_ram!==undefined;
  out.push({...(transition?{transition:true as const}:{}),seq:s.seq,turn:s.turn-started.turn,elapsedMs:Date.parse(s.t)-t0,map:s.map_id??[],party,roxanneBattle:roxanne,victory:victories.has(s.seq),coherent:coverage&&(coherent||transition)});
 }
 if(battlePending||lastNativeId===null){const last=out.at(-1);if(last!==undefined)out[out.length-1]={...last,coherent:false};}
 return out;
}

/** A qualified ready control must actually start the battle without discarding its observed capabilities. */
export function scoreReadiness(frames:readonly RecoveryFrame[]):boolean{
 const first=frames[0];if(first===undefined||!first.coherent||first.victory)return false;
 const original=index(first.party);
 for(const f of frames){
  if(!f.coherent||f.elapsedMs>600_000||f.turn>70)return false;
  if(f.transition===true)continue;
  if(!f.roxanneBattle)continue;
  const now=index(f.party);
  return [...original].every(([id,old])=>{const p=now.get(id);return p!==undefined&&p.level>=old.level&&p.species===old.species&&old.moves.filter(m=>m!==0).every(m=>p.moves.includes(m));});
 }
 return false;
}
