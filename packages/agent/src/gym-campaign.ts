import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {RunEvent} from "./events.js";
import type {FeatureSet} from "./features.js";
import type {RunRecorder} from "./recorder.js";

type State=Extract<RunEvent,{type:"state";started:boolean}>;
type Result=Extract<RunEvent,{type:"tool_result"}>;
type Advance=Extract<RunEvent,{type:"dialogue_auto_advance"}>;
type Transform=(messages:AgentMessage[])=>Promise<AgentMessage[]>;
// pret731ad5bf: town map.json gym warps; flags.h FLAG_BADGE01_GET..08_GET.
// Internal badge IDs only qualify completion; unseen badge/leader names are never supplied.
const GYMS=[
 ["RUSTBORO CITY","STONE"],["DEWFORD TOWN","KNUCKLE"],["MAUVILLE CITY","DYNAMO"],
 ["LAVARIDGE TOWN","HEAT"],["PETALBURG CITY","BALANCE"],["FORTREE CITY","FEATHER"],
 ["MOSSDEEP CITY","MIND"],["SOOTOPOLIS CITY","RAIN"],
] as const;
const normalized=(text:string)=>text.normalize("NFD").replace(/\p{M}/gu,"").replace(/’/g,"'").replace(/\s+/g," ").toUpperCase();
function namesGym(text:string,town:string):boolean {
 const s=normalized(text),place=town.replace(/ (?:CITY|TOWN)$/,"");
 return new RegExp(`\\b(?:${town}|${place})(?:'S)?(?: POKEMON)? GYM\\b|\\b(?:POKEMON )?GYM IN (?:${town}|${place})\\b|\\b${town} IS A GYM\\b`).test(s);
}
function observedLines(text:string):string {
 // Only current observation fields, never historical summaries, model goals or templates.
 return text.split("\n").filter(line=>/^(?:Location: |Sign text "|Warps: |Warp to |Exits you can walk to from where you stand: |Exits here you have not taken: )/.test(line)).join("\n");
}
function gymTown(location:string|null|undefined):string|null {
 if(location==null||location.trim()==="")return null;
 const loc=normalized(location);
 for(const [town] of GYMS)if(loc===town||loc.startsWith(`${town} `))return town;
 return null;
}

type Due={text:string;evidence:number[];token:string};

export function discoveredGymChecklist(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform):Transform {
 if(!features["discovered-gym-checklist-v1"])return base;
 let run:string|null=null,latest:State|null=null,current:Result|null=null;
 const pending=new Map<string,Advance[]>(),found=new Map<string,number>(),earned=new Set<string>();
 const completionEvidence=new Set<number>();
 let badgeState:number|null=null;
 let lastTown:string|null=null;
 let due:Due|null=null;
 let recordedToken:string|null=null;
 let deferralSaid=false;
 recorder.subscribe(event=>{
  run??=event.run;
  if(event.run!==run)return;
  if(event.type==="assistant"&&event.stop_reason!=="error"&&event.stop_reason!=="aborted"&&event.error===undefined&&due!==null){due=null;recordedToken=null;return;}
  if(event.type==="state"){latest="started" in event?event:null;return;}
  if(event.type==="dialogue_auto_advance"){pending.set(event.tool_call_id,[...(pending.get(event.tool_call_id)??[]),event]);if(pending.size>64)pending.delete(pending.keys().next().value??"");return;}
  if(event.type!=="tool_result")return;
  const pages=pending.get(event.id)??[];pending.delete(event.id);
  if(event.is_error||latest===null||event.state_seq!==latest.seq||!latest.started)return;
  current=event;
  const newlyEarned:string[]=[];
  if(latest.screen==="overworld"||latest.in_battle){
   badgeState=latest.seq;
   for(const [,badge] of GYMS)if(latest.badges.includes(badge)&&!earned.has(badge)){earned.add(badge);newlyEarned.push(badge);completionEvidence.add(latest.seq);completionEvidence.add(event.seq);}
  }
  const stateSeq=latest.seq;
  const dialogue=pages.flatMap(e=>e.pages).filter(p=>p.battle_turn===undefined&&p.battle_message_id===undefined&&p.state_seq!==null&&p.state_seq<=stateSeq&&normalized(event.text).includes(normalized(p.text))).map(p=>p.text).join("\n");
  const nativeDialog=latest.screen==="overworld"&&!latest.in_battle?[...event.text.matchAll(/^Dialog: "(.*)"$/gm)].map(match=>match[1]??"").join("\n"):"";
  const observed=`${observedLines(event.text)}\n${nativeDialog}`;
  const newlyFound:string[]=[];
  for(const [town] of GYMS)if(!found.has(town)&&(namesGym(observed,town)||namesGym(dialogue,town))){found.set(town,event.seq);newlyFound.push(town);}
  const closed=GYMS.filter(([town,badge])=>newlyEarned.includes(badge)&&found.has(town));
  const town=gymTown(latest.location);
  const prevTown=lastTown;
  lastTown=town;
  const lines:string[]=["DISCOVERED GYM CHECKLIST — harness-owned obligations, not a chosen route.",badgeState===null?"Badge state unavailable; completion is unknown.":`Native badges earned: ${String(earned.size)}/8.`];
  let token:string|null=null;
  if(newlyFound.length>0){
   lines.push(...newlyFound.map(t=>`${t} GYM — unfinished; discovered at result ${String(found.get(t))}.`));
   if(!deferralSaid){lines.push("Discovered gyms remain unfinished until native badge evidence confirms completion. You may defer a gym for story access, preparation or another task; leaving town and completing errands do not complete it. This checklist does not require an immediate battle or block travel.");deferralSaid=true;}
   token=`discover:${newlyFound.join(",")}:${String(event.seq)}`;
  }else if(closed.length>0){
   lines.push(...closed.map(([t,badge])=>`${t} GYM — completed (native ${badge} badge).`));
   token=`complete:${closed.map(([,b])=>b).join(",")}:${String(event.seq)}`;
  }else if(town!==null&&town!==prevTown&&found.has(town)&&!earned.has(GYMS.find(([t])=>t===town)?.[1]??"")){
   lines.push(`${town} GYM — unfinished; discovered at result ${String(found.get(town))}.`,`Entered ${town}. This checklist does not require an immediate battle or block travel.`);
   token=`enter:${town}:${String(event.seq)}`;
  }else if(prevTown!==null&&town!==prevTown&&found.has(prevTown)&&!earned.has(GYMS.find(([t])=>t===prevTown)?.[1]??"")){
   lines.push(`${prevTown} GYM — unfinished; discovered at result ${String(found.get(prevTown))}.`,`Left ${prevTown}. Leaving town does not complete it.`);
   token=`leave:${prevTown}:${String(event.seq)}`;
  }
  if(token!==null)due={text:lines.join("\n"),evidence:[...new Set([...found.values(),...completionEvidence,...(badgeState===null?[]:[badgeState]),event.seq])].sort((a,b)=>a-b),token};
 },true);
 return async messages=>{
  const out=await base(messages);
  const note=due;
  if(note===null||current===null)return out;
  if(out.some(m=>m.role==="user"&&m.content===note.text))return out;
  if(recordedToken!==note.token){recorder.recordLedgerContext({text:note.text,evidence:note.evidence});recordedToken=note.token;}
  return [...out,{role:"user",content:note.text,timestamp:Date.now()}];
 };
}
