// Browser-safe display protocol. It is deliberately not a resumable checkpoint.
import {emptyCurrent,parseCurrent,currentView,MAX_OPEN_TOOLS,type CurrentState} from "./current-state.js";
import {parseWorkbench,type WorkbenchRun} from "./workbench-data.js";
import {isRunEvent} from "./model.js";
import type {RunEvent} from "@pokebench/agent/events";
export interface CurrentSummary {
 version:1;id:string;generation:string;revision:number;seq:number;at:number;clockAt:number;updatedAt:number;observedAt:number;complete:boolean;
 header:NonNullable<CurrentState["start"]>;run:WorkbenchRun;endedAt:number|null;totals:CurrentState["totals"]|null;control:CurrentState["control"]|null;
 context:CurrentState["context"];retry:CurrentState["retry"];warning:string|null;problem:string|null;
 phase:{kind:"indexing"|"thinking"|"tool"|"idle"|"paused"|"ended";pending:number;tools:string[]};
 health:{enabled:boolean;owner:boolean;ok:boolean|null;checkedAt:number|null};
 progress:{validation:"unverified";recorded:{name:string;seq:number;turn:number;at:number}[]};
}
export interface CurrentSnapshot extends CurrentSummary {end:CurrentState["end"];display:Pick<CurrentState,"state"|"partyState"|"card"|"health"|"frame"|"thought"|"streaming">&{thinkingSince:number|null}}
export type CurrentQuery={kind:"list";now:number;after?:string|null;limit?:number}|{kind:"current";run:string;now:number}|{kind:"updates";after:string|null;now:number;run?:string}|{kind:"history";run:string;before:string|null;now:number};
export type CurrentAnswer=
 |{kind:"list";version:1;epoch:string;cursor:string;runs:CurrentSummary[];next:string|null;indexing:boolean;problems:string[]}
 |{kind:"current";version:1;epoch:string;cursor:string;snapshot:CurrentSnapshot|null}
 |{kind:"updates";version:1;epoch:string;cursor:string;reset:boolean;more:boolean;changes:({id:string;removed:true}|{id:string;removed:false;summary:CurrentSummary;snapshot?:CurrentSnapshot})[]}
 |{kind:"history";version:1;epoch:string;generation:string;state:"ready"|"indexing"|"reset"|"oversized";events:RunEvent[];before:string|null}
 |{kind:"unavailable";version:1;problem:string};
const object=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const n=(v:unknown):v is number=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const integer=(v:unknown):v is number=>n(v)&&Number.isSafeInteger(v);
const nullableN=(v:unknown)=>v===null||n(v);
const nullableText=(v:unknown)=>v===null||typeof v==="string";
const only=(v:unknown,allowed:readonly string[]):boolean=>object(v)&&Object.keys(v).every(k=>allowed.includes(k));
const keys=["version","id","generation","revision","seq","at","clockAt","updatedAt","observedAt","complete","header","run","endedAt","totals","control","context","retry","warning","problem","phase","health","progress"];
export function publicCheckpoint(s:CurrentSummary,display:CurrentSnapshot["display"]={state:null,partyState:null,card:null,health:null,frame:null,thought:null,streaming:{thinking:"",text:""},thinkingSince:null},end:CurrentState["end"]=null):CurrentState{
 const blank=emptyCurrent();return parseCurrent({...blank,run:s.id,seq:s.seq,nextSeq:s.seq+1,at:s.at,turn:s.run.turn,start:s.header,end,state:display.state,partyState:display.partyState,card:display.card,health:display.health,frame:display.frame,thought:display.thought,streaming:display.streaming,requestAt:display.thinkingSince,context:s.context,retry:s.retry,totals:s.totals??blank.totals,control:s.control??blank.control,warning:s.warning});
}
function summary(value:unknown,detail:boolean):CurrentSummary{
 const fail=():never=>{throw new Error("Invalid current display response");};if(!object(value))return fail();const v=value;
 if(Object.keys(v).some(k=>!keys.includes(k)&&!(detail&&(k==="display"||k==="end"))))return fail();
 if(v["version"]!==1||typeof v["id"]!=="string"||typeof v["generation"]!=="string"||v["generation"].length>256||!["revision","seq","at","clockAt","updatedAt","observedAt"].every(k=>integer(v[k]))||typeof v["complete"]!=="boolean"||!nullableN(v["endedAt"])||!nullableText(v["warning"])||!nullableText(v["problem"]))return fail();
 const h=v["health"],p=v["phase"],g=v["progress"];
 if(!only(h,["enabled","owner","ok","checkedAt"])||!object(h)||typeof h["enabled"]!=="boolean"||typeof h["owner"]!=="boolean"||(h["ok"]!==null&&typeof h["ok"]!=="boolean")||!nullableN(h["checkedAt"]))return fail();
 if(!only(p,["kind","pending","tools"])||!object(p)||!["indexing","thinking","tool","idle","paused","ended"].includes(String(p["kind"]))||!integer(p["pending"])||!Array.isArray(p["tools"])||p["pending"]>MAX_OPEN_TOOLS||p["tools"].length>16||p["tools"].length>p["pending"]||!p["tools"].every((t:unknown)=>typeof t==="string"))return fail();
 if(!only(g,["validation","recorded"])||!object(g)||g["validation"]!=="unverified"||!Array.isArray(g["recorded"])||g["recorded"].length>1024||!g["recorded"].every((r:unknown)=>object(r)&&typeof r["name"]==="string"&&integer(r["seq"])&&integer(r["turn"])&&integer(r["at"])))return fail();
 const data=parseWorkbench({version:1,at:0,milestones:[],runs:[v["run"]],problems:[]}),run=data.runs[0];
 if(run===undefined||run.id!==v["id"]||run.splits.length!==0||run.measurement!==undefined||run.excluded!==null)return fail();
 if(v["complete"]?(v["totals"]===null||v["control"]===null):(v["totals"]!==null||v["control"]!==null||run.elapsedMs!==null))return fail();
 if(!only(v["context"],["estimated","measured"])||!object(v["context"]))return fail();
 for(const reading of [v["context"]["estimated"],v["context"]["measured"]])if(reading!==null&&!only(reading,["tokens","turn","seq","at"]))return fail();
 if(v["totals"]!==null&&!only(v["totals"],["input","output","retries","modelErrors","toolErrors","compactions","requests","latencyMs"]))return fail();
 if(v["control"]!==null&&!only(v["control"],["state","pausedMs","pauseAt","maxWallMs","maxTurns","lastExtensionRequest","emulatorFrozen"]))return fail();
 if(v["retry"]!==null&&!only(v["retry"],["count","attempt","limit"]))return fail();
 const s=value as unknown as CurrentSummary;if(s.header.system_prompt!=="")return fail();publicCheckpoint(s);return s;
}
export const parseCurrentSummary=(value:unknown):CurrentSummary=>summary(value,false);
export function parseCurrentSnapshot(value:unknown):CurrentSnapshot{
 summary(value,true);const display=object(value)?value["display"]:null;if(!object(value)||value["end"]===undefined||!only(display,["state","partyState","card","health","frame","thought","streaming","thinkingSince"])||!object(display)||!["state","partyState","card","health","frame","thought","streaming","thinkingSince"].every(k=>Object.hasOwn(display,k)))throw new Error("Invalid current display response");const s=value as unknown as CurrentSnapshot;publicCheckpoint(s,s.display,s.end);return s;
}
export function publicCurrentView(s:CurrentSnapshot){return currentView(publicCheckpoint(s,s.display,s.end));}

export function parseCurrentQuery(value:unknown):CurrentQuery{
 const fail=():never=>{throw new Error("Invalid current query");};if(!object(value)||!integer(value["now"]))return fail();const kind=value["kind"];
 const text=(v:unknown):boolean=>typeof v==="string"&&v.length<=512;
 const run=(v:unknown):boolean=>typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
 if(kind==="list"&&only(value,["kind","now","after","limit"])&&(value["after"]==null||text(value["after"]))&&(value["limit"]===undefined||(integer(value["limit"])&&value["limit"]>=1&&value["limit"]<=100)))return value as unknown as CurrentQuery;
 if(kind==="current"&&only(value,["kind","now","run"])&&run(value["run"]))return value as unknown as CurrentQuery;
 if(kind==="updates"&&only(value,["kind","now","after","run"])&&(value["after"]===null||text(value["after"]))&&(value["run"]===undefined||run(value["run"])))return value as unknown as CurrentQuery;
 if(kind==="history"&&only(value,["kind","now","run","before"])&&run(value["run"])&&(value["before"]===null||text(value["before"])))return value as unknown as CurrentQuery;
 return fail();
}
export function parseCurrentAnswer(value:unknown):CurrentAnswer{
 const fail=():never=>{throw new Error("Invalid current worker response");};if(!object(value)||value["version"]!==1)return fail();
 const text=(v:unknown,max=512):boolean=>typeof v==="string"&&v.length<=max;
 const nullable=(v:unknown):boolean=>v===null||text(v);
 if(value["kind"]==="unavailable"&&only(value,["kind","version","problem"])&&text(value["problem"],1024))return value as unknown as CurrentAnswer;
 if(!text(value["epoch"],128))return fail();
 if(value["kind"]==="list"&&only(value,["kind","version","epoch","cursor","runs","next","indexing","problems"])&&text(value["cursor"])&&nullable(value["next"])&&typeof value["indexing"]==="boolean"&&Array.isArray(value["problems"])&&value["problems"].length<=16&&value["problems"].every(p=>text(p,1024))&&Array.isArray(value["runs"])&&value["runs"].length<=100){value["runs"].forEach(parseCurrentSummary);return value as unknown as CurrentAnswer;}
 if(value["kind"]==="current"&&only(value,["kind","version","epoch","cursor","snapshot"])&&text(value["cursor"])){if(value["snapshot"]!==null)parseCurrentSnapshot(value["snapshot"]);return value as unknown as CurrentAnswer;}
 if(value["kind"]==="updates"&&only(value,["kind","version","epoch","cursor","reset","more","changes"])&&text(value["cursor"])&&typeof value["reset"]==="boolean"&&typeof value["more"]==="boolean"&&Array.isArray(value["changes"])&&value["changes"].length<=256){
  for(const change of value["changes"]){if(!object(change)||!text(change["id"],200))return fail();if(change["removed"]===true&&only(change,["id","removed"]))continue;if(change["removed"]!==false||!only(change,["id","removed","summary","snapshot"]))return fail();const s=parseCurrentSummary(change["summary"]);if(s.id!==change["id"])return fail();if(change["snapshot"]!==undefined){const d=parseCurrentSnapshot(change["snapshot"]);if(d.id!==s.id||d.revision!==s.revision||d.generation!==s.generation)return fail();}}
  if(value["reset"]&&(value["more"]||value["changes"].length!==0))return fail();return value as unknown as CurrentAnswer;
 }
 if(value["kind"]==="history"&&only(value,["kind","version","epoch","generation","state","events","before"])&&text(value["generation"],256)&&["ready","indexing","reset","oversized"].includes(String(value["state"]))&&nullable(value["before"])&&Array.isArray(value["events"])&&value["events"].length<=64&&value["events"].every(isRunEvent)&&(value["state"]==="ready"||value["events"].length===0))return value as unknown as CurrentAnswer;
 return fail();
}
