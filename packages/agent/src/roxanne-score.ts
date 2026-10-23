import type {RunEvent} from "./events.js";

export interface CapabilityMon {readonly identity:string;readonly species:number;readonly level:number;readonly moves:readonly number[]}
export interface RecoveryFrame {readonly seq:number;readonly turn:number;readonly elapsedMs:number;readonly map:readonly number[];readonly party:readonly CapabilityMon[];readonly roxanneBattle:boolean;readonly victory:boolean;readonly coherent:boolean}
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
const moveSet=(p:CapabilityMon)=>[...p.moves].sort((a,b)=>a-b).join(",");
export function capabilityChanges(before:readonly CapabilityMon[],after:readonly CapabilityMon[]):CapabilityChange[]{
 const a=index(before),b=index(after),changes=new Set<CapabilityChange>();
 for(const [id,p]of b){const old=a.get(id);if(old===undefined){changes.add("member");continue;}if(p.level>old.level)changes.add("level");if(p.species!==old.species)changes.add("evolution");if(moveSet(p)!==moveSet(old))changes.add("moves");}
 return (["level","evolution","moves","member"] as const).filter(k=>changes.has(k));
}
export interface RecoveryScore {readonly verified:boolean;readonly departed:boolean;readonly strictRecovery:boolean;readonly eventualRecovery:boolean;readonly unchangedRematches:number;readonly recoverySeq:number|null;readonly victory:boolean;readonly changes:readonly CapabilityChange[];readonly evidence:readonly number[]}
const gym=(s:RecoveryFrame)=>s.map.length===2&&s.map[0]===11&&s.map[1]===3;
export function scoreRecovery(frames:readonly RecoveryFrame[]):RecoveryScore{
 const first=frames[0];if(first===undefined||!gym(first)||first.roxanneBattle||first.victory)throw new Error("episode must start inside gym before the rematch, without prior victory");
 index(first.party);
 let verified=true,departed=false,recovered=false,unchanged=0,recoverySeq:number|null=null,wasBattle=false,lastSeq=-1,lastMs=-1,lastTurn=-1,victory=false;
 let gainedOutside=false;let changes:CapabilityChange[]=[];const evidence:number[]=[first.seq];
 for(const f of frames){
  if(!Number.isSafeInteger(f.seq)||f.seq<=lastSeq||f.elapsedMs<lastMs||f.turn<lastTurn||!Number.isFinite(f.elapsedMs)||f.elapsedMs<0)throw new Error("nonmonotone recovery evidence");lastSeq=f.seq;lastMs=f.elapsedMs;lastTurn=f.turn;
  if(!f.coherent){verified=false;continue;}
  if(f.map.length!==2||f.map.some(v=>!Number.isSafeInteger(v)||v<0)){verified=false;continue;}
  const changed=capabilityChanges(first.party,f.party);
  if(!gym(f)){if(!departed)evidence.push(f.seq);departed=true;if(changed.length>0)gainedOutside=true;}
  if(f.roxanneBattle&&!wasBattle){
   if(changed.length===0){unchanged++;evidence.push(f.seq);}
   else if(departed&&gainedOutside&&!recovered){recovered=true;recoverySeq=f.seq;changes=changed;evidence.push(f.seq);}
  }
  wasBattle=f.roxanneBattle;
  if(f.victory){victory=true;evidence.push(f.seq);}
 }
 return {verified,departed,strictRecovery:verified&&recovered&&unchanged===0,eventualRecovery:verified&&recovered,unchangedRematches:unchanged,recoverySeq,victory:verified&&victory,changes,evidence};
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
export function recoveryFrames(events:readonly RunEvent[],afterSeq:number):RecoveryFrame[]{
 const states=events.filter((e):e is Extract<RunEvent,{type:"state";started:boolean}>=>e.type==="state"&&"started" in e&&e.seq>=afterSeq);
 const started=states[0];if(started===undefined)throw new Error("missing episode native start");
 const t0=Date.parse(started.t);const out:RecoveryFrame[]=[];const victories=new Set(events.flatMap(e=>e.type==="milestone"&&e.name==="ROXANNE_DEFEATED"&&e.origin==="observed"&&e.seq>=afterSeq?(e.evidence??[]):[]));
 for(const s of states){
  const party:CapabilityMon[]=[];let coherent=s.started&&s.raw_ram!==undefined&&s.map_id!==null&&s.party.length>0;
  for(const p of s.party){if(p.identity===undefined||p.identity===null||p.species_id===undefined||p.species_id===null||p.level===null||p.moves===undefined||p.moves===null||p.diagnostic){coherent=false;continue;}party.push({identity:p.identity,species:p.species_id,level:p.level,moves:p.moves.map(m=>m.move_id)});}
  out.push({seq:s.seq,turn:s.turn-started.turn,elapsedMs:Date.parse(s.t)-t0,map:s.map_id??[],party,roxanneBattle:s.trainer_opponent?.battle_active===true&&s.trainer_opponent.trainer_id===265&&s.in_battle,victory:victories.has(s.seq),coherent});
 }
 return out;
}
