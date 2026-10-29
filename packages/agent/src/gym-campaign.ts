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

export function discoveredGymChecklist(features:FeatureSet,recorder:Pick<RunRecorder,"subscribe"|"recordLedgerContext">,base:Transform):Transform {
 if(!features["discovered-gym-checklist-v1"])return base;
 let run:string|null=null,latest:State|null=null,current:Result|null=null;
 const pending=new Map<string,Advance[]>(),found=new Map<string,number>(),earned=new Set<string>();
 const completionEvidence=new Set<number>();
 let badgeState:number|null=null;
 recorder.subscribe(event=>{
  run??=event.run;
  if(event.run!==run)return;
  if(event.type==="state"){latest="started" in event?event:null;return;}
  if(event.type==="dialogue_auto_advance"){pending.set(event.tool_call_id,[...(pending.get(event.tool_call_id)??[]),event]);if(pending.size>64)pending.delete(pending.keys().next().value??"");return;}
  if(event.type!=="tool_result")return;
  const pages=pending.get(event.id)??[];pending.delete(event.id);
  if(event.is_error||latest===null||event.state_seq!==latest.seq||!latest.started)return;
  current=event;
  if(latest.screen==="overworld"||latest.in_battle){
   badgeState=latest.seq;
   for(const [,badge] of GYMS)if(latest.badges.includes(badge)&&!earned.has(badge)){earned.add(badge);completionEvidence.add(latest.seq);completionEvidence.add(event.seq);}
  }
  const stateSeq=latest.seq;
  const dialogue=pages.flatMap(e=>e.pages).filter(p=>p.battle_turn===undefined&&p.battle_message_id===undefined&&p.state_seq!==null&&p.state_seq<=stateSeq&&normalized(event.text).includes(normalized(p.text))).map(p=>p.text).join("\n");
  const nativeDialog=latest.screen==="overworld"&&!latest.in_battle?[...event.text.matchAll(/^Dialog: "(.*)"$/gm)].map(match=>match[1]??"").join("\n"):"";
  const observed=`${observedLines(event.text)}\n${nativeDialog}`;
  for(const [town] of GYMS)if(!found.has(town)&&(namesGym(observed,town)||namesGym(dialogue,town)))found.set(town,event.seq);
 },true);
 return async messages=>{
  const out=await base(messages);
  if(current===null)return out;
  const unfinished=GYMS.filter(([town,badge])=>found.has(town)&&!earned.has(badge));
  const text=[
   "DISCOVERED GYM CHECKLIST — harness-owned obligations, not a chosen route.",
   badgeState===null?"Badge state unavailable; completion is unknown.":`Native badges earned: ${String(earned.size)}/8.`,
   ...unfinished.map(([town])=>`${town} GYM — unfinished; discovered at result ${String(found.get(town))}.`),
   ...(unfinished.length===0?["No discovered unfinished gyms."]:[]),
   "Discovered gyms remain unfinished until native badge evidence confirms completion. You may defer a gym for story access, preparation or another task; leaving town and completing errands do not complete it. Consider unfinished gyms when returning to or leaving their towns. This checklist does not require an immediate battle or block travel.",
  ].join("\n");
  recorder.recordLedgerContext({text,evidence:[...new Set([...found.values(),...completionEvidence,...(badgeState===null?[]:[badgeState]),current.seq])].sort((a,b)=>a-b)});
  return [...out,{role:"user",content:text,timestamp:Date.now()}];
 };
}
