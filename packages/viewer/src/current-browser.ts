import {parseCurrentAnswer,parseCurrentQuery,publicCurrentView,type CurrentAnswer,type CurrentSnapshot,type CurrentSummary} from "./current-public.js";
import type {RunEvent} from "@pokebench/agent/events";
export const CURRENT_BROWSER_LIMITS={runs:256,events:512,bytes:4*1024*1024,pages:4};
export interface CurrentBrowserState {epoch:string|null;cursor:string|null;runs:readonly CurrentSummary[];selected:string|null;snapshot:CurrentSnapshot|null;stale:boolean;indexing:boolean;problem:string|null;history:readonly RunEvent[];before:string|null;historyLoading:boolean;historyProblem:string|null;historyLimited:boolean}
export interface CurrentBrowserOptions {fetchJson:(url:string)=>Promise<unknown>;changed?:(state:Readonly<CurrentBrowserState>)=>void;limits?:Partial<typeof CURRENT_BROWSER_LIMITS>}
export interface CurrentBrowser {readonly state:Readonly<CurrentBrowserState>;start(run?:string|null):Promise<void>;select(run:string|null):Promise<void>;poll():Promise<void>;history(older?:boolean):Promise<void>;holdHistory(held:boolean):void;display():ReturnType<typeof publicCurrentView>|null;close():void}
type History=Extract<CurrentAnswer,{kind:"history"}>;
export function createCurrentBrowser(options:CurrentBrowserOptions):CurrentBrowser{
 const limits={...CURRENT_BROWSER_LIMITS,...options.limits};for(const key of Object.keys(limits) as (keyof typeof limits)[])if(!Number.isSafeInteger(limits[key])||limits[key]<1||limits[key]>CURRENT_BROWSER_LIMITS[key])throw new Error("Invalid current browser limits");
 const state:CurrentBrowserState={epoch:null,cursor:null,runs:[],selected:null,snapshot:null,stale:false,indexing:true,problem:null,history:[],before:null,historyLoading:false,historyProblem:null,historyLimited:false},rows=new Map<string,CurrentSummary>();let closed=false,serial=0,listSerial=0,held=false,listTask:Promise<void>|null=null,pollTask:Promise<void>|null=null,historyTask:Promise<void>|null=null,detailTask:{run:string;token:number;promise:Promise<void>}|null=null;
 const emit=():void=>{state.runs=[...rows.values()].sort((a,b)=>Date.parse(b.header.t)-Date.parse(a.header.t)||b.id.localeCompare(a.id));if(!closed)options.changed?.(state);};
 const validRun=(run:string):void=>{parseCurrentQuery({kind:"current",run,now:0});};
 const resetHistory=():void=>{serial++;historyTask=null;state.history=[];state.before=null;state.historyProblem=null;state.historyLoading=false;state.historyLimited=false;};
 const put=(s:CurrentSummary):void=>{const prior=rows.get(s.id);if(prior!==undefined&&(s.revision<prior.revision||(s.generation===prior.generation&&s.seq<prior.seq)))return;rows.set(s.id,s);while(rows.size>limits.runs){const oldest=[...rows.values()].filter(r=>r.id!==state.selected).sort((a,b)=>Date.parse(a.header.t)-Date.parse(b.header.t)||a.id.localeCompare(b.id))[0];if(oldest===undefined)break;rows.delete(oldest.id);}};
 const accept=(s:CurrentSnapshot):boolean=>{
  if(s.id!==state.selected)return false;const prior=state.snapshot;if(prior!==null&&(s.revision<prior.revision||(s.generation===prior.generation&&s.seq<prior.seq)))return false;
  if(prior!==null&&prior.generation!==s.generation)resetHistory();state.snapshot=s;state.stale=false;state.problem=null;put(s);emit();return true;
 };
 const request=async(url:string):Promise<CurrentAnswer>=>{const answer=parseCurrentAnswer(await options.fetchJson(url));if(answer.kind==="unavailable")throw new Error(answer.problem);return answer;};
 const mergeHistory=(h:History,older:boolean):void=>{
  const combined=new Map(state.history.map(e=>[e.seq,e]));for(const event of h.events){if(event.run!==state.selected||event.seq>(state.snapshot?.seq??-1))throw new Error("History does not belong to the selected current snapshot");const existing=combined.get(event.seq);if(existing!==undefined&&JSON.stringify(existing)!==JSON.stringify(event))throw new Error("History event changed within its source generation");combined.set(event.seq,event);}
  let events=[...combined.values()].sort((a,b)=>a.seq-b.seq),bytes=events.reduce((n,e)=>n+new TextEncoder().encode(JSON.stringify(e)).byteLength,0);
  if(events.length>limits.events||bytes>limits.bytes){state.historyLimited=true;if(older)return;events=h.events.slice();bytes=events.reduce((n,e)=>n+new TextEncoder().encode(JSON.stringify(e)).byteLength,0);while(events.length>limits.events||bytes>limits.bytes){const removed=events.shift();if(removed===undefined)break;bytes-=new TextEncoder().encode(JSON.stringify(removed)).byteLength;}}
  state.history=events;state.before=older||state.before===null?h.before:state.before;
 };
 const history=async(older=false):Promise<void>=>{
  if(closed||state.selected===null||state.snapshot===null)return;if(historyTask!==null)return historyTask;if(older&&(state.before===null||state.historyLimited))return;
  const run=state.selected,generation=state.snapshot.generation,epoch=state.epoch,token=serial,before=older?state.before:null;state.historyLoading=true;state.historyProblem=null;if(older)held=true;emit();
  const task=(async()=>{try{const answer=await request(`/api/runs/${encodeURIComponent(run)}/history${before===null?"":`?before=${encodeURIComponent(before)}`}`);if(closed||serial!==token||state.selected!==run)return;if(answer.kind!=="history")throw new Error("Invalid history response");if(answer.epoch!==epoch||answer.generation!==generation||answer.state==="reset"){resetHistory();state.historyProblem="History changed; reload current data";return;}if(answer.state!=="ready"){state.historyProblem=answer.state==="oversized"?"This history entry is too large to show":"History is still being indexed";return;}mergeHistory(answer,older);}catch(error){if(!closed&&serial===token)state.historyProblem=error instanceof Error?error.message:"History unavailable";}finally{if(!closed&&serial===token){state.historyLoading=false;historyTask=null;emit();}}})();historyTask=task;return task;
 };
 const select=async(run:string|null):Promise<void>=>{
  if(closed)return;if(run!==null)validRun(run);if(run!==state.selected){state.selected=run;state.snapshot=null;state.stale=false;resetHistory();detailTask=null;held=false;emit();}if(run===null)return;
  const token=serial;if(detailTask?.run===run&&detailTask.token===token)return detailTask.promise;
  const task=(async()=>{try{const answer=await request(`/api/runs/${encodeURIComponent(run)}/current`);if(closed||serial!==token||state.selected!==run)return;if(answer.kind!=="current")throw new Error("Invalid selected current response");if(answer.epoch!==state.epoch){state.stale=true;state.cursor=null;state.problem="Current data changed; refreshing";return;}if(answer.snapshot===null){state.indexing=true;return;}if(answer.snapshot.id!==run)throw new Error("Current response belongs to another run");if(accept(answer.snapshot)&&!held)void history();}catch(error){if(!closed&&serial===token){state.stale=true;state.problem=error instanceof Error?error.message:"Current data unavailable";}}finally{if(!closed&&serial===token){detailTask=null;emit();}}})();detailTask={run,token,promise:task};return task;
 };
 const list=async(replaceCursor=false):Promise<void>=>{
  if(closed)return;if(listTask!==null)return listTask;const token=++listSerial;
  const task=(async()=>{try{let after:string|null=null;for(let page=0;page<limits.pages;page++){
   const answer=await request(`/api/current-runs${after===null?"":`?after=${encodeURIComponent(after)}`}`);if(closed||listSerial!==token)return;if(answer.kind!=="list")throw new Error("Invalid current list response");
   if(page===0){if(state.epoch!==null&&state.epoch!==answer.epoch){resetHistory();state.snapshot=null;}if(replaceCursor||state.epoch===null||state.epoch!==answer.epoch)state.cursor=answer.cursor;state.epoch=answer.epoch;rows.clear();state.stale=false;state.problem=answer.problems.join("; ")||null;}else if(answer.epoch!==state.epoch)throw new Error("Current list changed during pagination");
   for(const s of answer.runs)put(s);state.indexing=answer.indexing;emit();after=answer.next;if(after===null)break;
  }}catch(error){if(!closed&&listSerial===token){state.stale=true;state.problem=error instanceof Error?error.message:"Current data unavailable";emit();}}finally{if(listSerial===token)listTask=null;}})();listTask=task;return task;
 };
 const start=async(run?:string|null):Promise<void>=>{if(closed)return;const selection=serial;await list(true);if(closed)return;const selected=(serial===selection?run:state.selected)??state.selected??state.runs.find(s=>s.run.status==="live"||s.run.status==="paused")?.id??state.runs[0]?.id??null;await select(selected);};
 const poll=async():Promise<void>=>{
  if(closed)return;if(pollTask!==null)return pollTask;const task=(async()=>{try{if(state.cursor===null||state.epoch===null){await start();return;}for(let page=0;page<limits.pages;page++){
   const answer=await request(`/api/current-updates?after=${encodeURIComponent(state.cursor??"")}${state.selected===null?"":`&run=${encodeURIComponent(state.selected)}`}`);if(closed)return;if(answer.kind!=="updates")throw new Error("Invalid current updates response");if(answer.reset||answer.epoch!==state.epoch){await start();return;}state.cursor=answer.cursor;state.stale=false;state.problem=null;let newest=false;
   for(const change of answer.changes){if(change.removed){rows.delete(change.id);if(state.selected===change.id){resetHistory();state.snapshot=null;state.problem="The selected run is no longer available";}continue;}put(change.summary);if(change.id===state.selected){if(change.snapshot!==undefined){const previous=state.snapshot;newest=accept(change.snapshot)&&(previous===null||previous.seq!==change.snapshot.seq||previous.generation!==change.snapshot.generation);}else void select(state.selected);}}
   emit();if(newest&&!held)void history();if(!answer.more)break;
  }if(state.indexing)await list();}catch(error){if(!closed){state.stale=true;state.problem=error instanceof Error?error.message:"Current updates unavailable";emit();}}finally{pollTask=null;}})();pollTask=task;return task;
 };
 return {get state(){return state;},start,select,poll,history,holdHistory:(value:boolean)=>{held=value;},display:()=>state.snapshot===null?null:publicCurrentView(state.snapshot),close:()=>{closed=true;serial++;listSerial++;historyTask=null;detailTask=null;}};
}
