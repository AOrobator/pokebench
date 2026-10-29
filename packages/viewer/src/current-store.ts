import { DatabaseSync } from "node:sqlite";
import { mkdirSync, lstatSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { checkEvent, RUN_ID_PATTERN } from "@pokebench/agent/events";
import { parseCurrent, type CurrentState } from "./current-state.js";
import type {CurrentPublication} from "./current-projection.js";
export interface CurrentStoreOptions {readOnly?:boolean;auxBytes?:number;beforeCommit?:()=>void;beforeReadRows?:()=>void;publish?:(state:CurrentState,source:CurrentSource,revision:number,auxiliary:string)=>CurrentPublication}
export interface PublicationRow {run:string;generation:string;revision:number;started:number;ended:number|null;summary:string;detail?:string}

export interface CurrentSource { generation:string; identity:string; offset:number; size:number; mtime:number; anchor:string; evidence:string }
export interface HistoryOffset { seq:number; turn:number; offset:number; end:number }
export interface SavedCurrent { state:CurrentState; source:CurrentSource; revision:number }
export type CurrentChange = {run:string;removed:true}|{run:string;removed:false};
export interface CurrentChanges {reset:boolean;epoch:string;revision:number;runs:CurrentChange[]}
const idPattern=new RegExp(RUN_ID_PATTERN);
const id=(run:string):void=>{if(!idPattern.test(run))throw new Error("Invalid current run id");};
const coord=(n:number):boolean=>Number.isSafeInteger(n)&&n>=0;
const JSON_LIMIT=16*1024*1024;
export function checkCurrentState(value:unknown):CurrentState{
 const s=parseCurrent(value);for(const event of [s.start,s.state,s.partyState,s.end,s.health?.source??null,...s.milestones])if(event!==null)checkEvent(event);
 if(s.card!==null){if(s.state===null)throw new Error("Card requires state anchor");checkEvent({...s.state,...s.card});}
 if(s.health!==null){if(s.partyState===null)throw new Error("Health requires party anchor");checkEvent({...s.partyState,party:s.health.party});}
 return s;
}
function sourceOf(value:unknown):CurrentSource{
 if(typeof value!=="object"||value===null)throw new Error("Invalid source cursor");const s=value as Record<string,unknown>;
 if(!["generation","identity","anchor","evidence"].every(k=>typeof s[k]==="string")||!["offset","size","mtime"].every(k=>typeof s[k]==="number"&&Number.isFinite(s[k])&&s[k]>=0)||!coord(s["offset"] as number)||!coord(s["size"] as number)||(s["offset"] as number)>(s["size"] as number))throw new Error("Invalid source cursor");
 return value as CurrentSource;
}
export function openCurrentStore(path:string,options:CurrentStoreOptions={}){
 const auxBytes=options.auxBytes??65536;if(!coord(auxBytes)||auxBytes<1)throw new Error("Invalid auxiliary bound");
 const readOnly=options.readOnly===true;let closed=false;let lock:DatabaseSync|null=null;let db:DatabaseSync;let connection:DatabaseSync|undefined;
 for(const target of [path,`${path}.lock`,`${path}-wal`,`${path}-shm`,`${path}.lock-journal`]){
  if(lstatSync(target,{throwIfNoEntry:false})?.isSymbolicLink()===true)throw new Error("Current store refuses symbolic links");
 }
 if(!readOnly)mkdirSync(dirname(path),{recursive:true});
 try{
  if(!readOnly){lock=new DatabaseSync(`${path}.lock`);lock.exec("PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner (id INTEGER); BEGIN EXCLUSIVE;");}
  db=new DatabaseSync(path,{readOnly});connection=db;db.exec("PRAGMA busy_timeout=25");
  if(!readOnly)db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, epoch TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS current (run TEXT PRIMARY KEY, state TEXT NOT NULL, source TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS history (run TEXT NOT NULL, generation TEXT NOT NULL, seq INTEGER NOT NULL, turn INTEGER NOT NULL, offset INTEGER NOT NULL, end INTEGER NOT NULL, PRIMARY KEY(run,generation,seq)); CREATE TABLE IF NOT EXISTS changes (revision INTEGER PRIMARY KEY, run TEXT NOT NULL, removed INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS rebuild (run TEXT PRIMARY KEY, state TEXT NOT NULL, source TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS auxiliary (run TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(json_valid(value))); CREATE TABLE IF NOT EXISTS root_binding (id INTEGER PRIMARY KEY CHECK(id=1),identity TEXT NOT NULL); CREATE TABLE IF NOT EXISTS public_current (run TEXT PRIMARY KEY,generation TEXT NOT NULL,revision INTEGER NOT NULL,started REAL NOT NULL,ended REAL,summary TEXT NOT NULL CHECK(json_valid(summary)),detail TEXT NOT NULL CHECK(json_valid(detail))); CREATE INDEX IF NOT EXISTS public_recent ON public_current(ended,started,run); CREATE INDEX IF NOT EXISTS public_order ON public_current(started DESC,run DESC); CREATE TABLE IF NOT EXISTS discovery (id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL CHECK(json_valid(value)));");
  if(!readOnly)db.prepare("INSERT OR IGNORE INTO meta VALUES(1,1,?,0)").run(randomUUID());
  const meta=db.prepare("SELECT * FROM meta WHERE id=1").get();if(meta?.["version"]!==1||typeof meta["epoch"]!=="string")throw new Error("Incompatible current store");
 }catch(error){connection?.close();lock?.close();throw error;}
 const epoch=String(db.prepare("SELECT epoch FROM meta WHERE id=1").get()?.["epoch"]);
 const revision=():number=>Number(db.prepare("SELECT revision FROM meta WHERE id=1").get()?.["revision"]);
 const readSaved=(table:"current"|"rebuild",run:string):SavedCurrent|null=>{id(run);const row=db.prepare(`SELECT * FROM ${table} WHERE run=?`).get(run);if(row===undefined)return null;const state=checkCurrentState(JSON.parse(String(row["state"])) as unknown);if(state.run!==run)throw new Error("Foreign current snapshot");return {state,source:sourceOf(JSON.parse(String(row["source"])) as unknown),revision:Number(row["revision"])};};
 const get=(run:string):SavedCurrent|null=>readSaved("current",run);
 const setAux=(run:string,value:string):void=>{if(Buffer.byteLength(value)>auxBytes)throw new Error("Auxiliary checkpoint exceeds size limit");db.prepare("INSERT OR REPLACE INTO auxiliary VALUES(?,?)").run(run,value);};
 const valid=(state:CurrentState,source:CurrentSource,index:readonly HistoryOffset[]):void=>{checkCurrentState(state);id(state.run);sourceOf(source);if(Buffer.byteLength(JSON.stringify(state))>JSON_LIMIT)throw new Error("Current checkpoint exceeds size limit");for(const entry of index)if(![entry.seq,entry.turn,entry.offset,entry.end].every(coord)||entry.end>source.offset||entry.end<=entry.offset||entry.seq>state.seq)throw new Error("Invalid history coordinate");};
 const putIndex=(run:string,source:CurrentSource,index:readonly HistoryOffset[]):void=>{for(const entry of index)db.prepare("INSERT OR REPLACE INTO history VALUES(?,?,?,?,?,?)").run(run,source.generation,entry.seq,entry.turn,entry.offset,entry.end);};
 const transaction=<T>(fn:()=>T):T=>{db.exec("BEGIN IMMEDIATE");try{const result=fn();options.beforeCommit?.();db.exec("COMMIT");return result;}catch(error){db.exec("ROLLBACK");throw error;}};
 const readTransaction=<T>(fn:()=>T):T=>{db.exec("BEGIN");try{const result=fn();db.exec("COMMIT");return result;}catch(error){db.exec("ROLLBACK");throw error;}};
 const publication=(state:CurrentState,source:CurrentSource,rev:number,auxiliary:string|undefined):void=>{
  if(options.publish===undefined){db.prepare("DELETE FROM public_current WHERE run=?").run(state.run);return;}
  if(auxiliary===undefined)throw new Error("Current publication requires metadata");const p=options.publish(state,source,rev,auxiliary);
  if(Buffer.byteLength(p.summary)>65536||Buffer.byteLength(p.detail)>8*1024*1024||!coord(p.started)||(p.ended!==null&&!coord(p.ended)))throw new Error("Invalid current publication");
  db.prepare("INSERT OR REPLACE INTO public_current VALUES(?,?,?,?,?,?,?)").run(state.run,source.generation,rev,p.started,p.ended,p.summary,p.detail);
 };
 const rowOf=(row:Record<string,unknown>|undefined):PublicationRow|null=>row===undefined?null:{run:String(row["run"]),generation:String(row["generation"]),revision:Number(row["revision"]),started:Number(row["started"]),ended:row["ended"]===null?null:Number(row["ended"]),summary:String(row["summary"]),...(typeof row["detail"]!=="string"?{}:{detail:row["detail"]})};
 const publicRow=(run:string,detail:boolean):PublicationRow|null=>rowOf(db.prepare(`SELECT p.run,p.generation,p.revision,p.started,p.ended,p.summary${detail?",p.detail":""} FROM public_current p JOIN current c ON c.run=p.run AND c.revision=p.revision WHERE p.run=?`).get(run));
 const discovery=():string|null=>{const r=db.prepare("SELECT value FROM discovery WHERE id=1").get();return r===undefined?null:String(r["value"]);};
 const change=(run:string,removed:boolean,retain=1024):number=>{
  const rev=revision()+1;db.prepare("UPDATE meta SET revision=? WHERE id=1").run(rev);db.prepare("INSERT INTO changes VALUES(?,?,?)").run(rev,run,removed?1:0);db.prepare("DELETE FROM changes WHERE revision<=?").run(rev-retain);return rev;
 };
 return {epoch,revision,get,
  published:(run:string):boolean=>{id(run);return publicRow(run,false)!==null;},
  discovery:():string|null=>discovery(),
  setDiscovery:(value:string):void=>{if(Buffer.byteLength(value)>2048)throw new Error("Discovery metadata exceeds bound");if(discovery()!==value)transaction(()=>{db.prepare("INSERT OR REPLACE INTO discovery VALUES(1,?)").run(value);});},
  readPublicList:(since:number,after:{started:number;run:string}|null,limit:number)=>readTransaction(()=>{
   if(!coord(since)||!coord(limit)||limit<1||limit>100)throw new Error("Invalid current list bounds");const rev=revision();options.beforeReadRows?.();
   const rows=db.prepare("SELECT p.run,p.generation,p.revision,p.started,p.ended,p.summary FROM public_current p JOIN current c ON c.run=p.run AND c.revision=p.revision WHERE (p.ended IS NULL OR p.ended>=?) AND (? IS NULL OR p.started<? OR (p.started=? AND p.run<?)) ORDER BY p.started DESC,p.run DESC LIMIT ?").all(since,after?.started??null,after?.started??0,after?.started??0,after?.run??"",limit+1).map(r=>rowOf(r)).filter((r):r is PublicationRow=>r!==null);
   return {epoch,revision:rev,rows,known:Number(db.prepare("SELECT COUNT(*) n FROM current").get()?.["n"]),published:Number(db.prepare("SELECT COUNT(*) n FROM public_current p JOIN current c ON c.run=p.run AND c.revision=p.revision").get()?.["n"]),discovery:discovery()};
  }),
  readPublicCurrent:(run:string)=>readTransaction(()=>{id(run);const rev=revision();options.beforeReadRows?.();return {epoch,revision:rev,row:publicRow(run,true)};}),
  readPublicUpdates:(cursor:string,limit:number,selected?:string)=>readTransaction(()=>{
   if(!coord(limit)||limit<1||limit>256)throw new Error("Invalid current update bound");if(selected!==undefined)id(selected);const page=currentChangePage(db,epoch,cursor,limit);options.beforeReadRows?.();
   return {...page,rows:page.rows.map(c=>({...c,row:publicRow(c.run,c.run===selected),exists:db.prepare("SELECT 1 FROM current WHERE run=?").get(c.run)!==undefined}))};
  }),
  historyWindow:(run:string,before:number,lookback=0)=>readTransaction(()=>{id(run);if(!coord(before)||!coord(lookback))throw new Error("Invalid history cursor");const current=get(run),target=current===null?0:Math.min(before,current.state.seq+1),start=Math.max(0,target-1-lookback);return {epoch,revision:revision(),current,auxiliary:db.prepare("SELECT value FROM auxiliary WHERE run=?").get(run)?.["value"],entry:current===null||target===0?null:db.prepare("SELECT seq,turn,offset,end FROM history WHERE run=? AND generation=? AND seq<=? ORDER BY seq DESC LIMIT 1").get(run,current.source.generation,start)??null,following:current===null||target===0?null:db.prepare("SELECT seq,turn,offset,end FROM history WHERE run=? AND generation=? AND seq>? AND seq<? ORDER BY seq LIMIT 1").get(run,current.source.generation,start,target)??null};}),
  boundRoot:():string|null=>{const row=db.prepare("SELECT identity FROM root_binding WHERE id=1").get();return row===undefined?null:String(row["identity"]);},
  bindRoot:(identity:string):void=>{transaction(()=>{const row=db.prepare("SELECT identity FROM root_binding WHERE id=1").get();if(row!==undefined&&row["identity"]!==identity)throw new Error("Snapshot database belongs to another recordings root");db.prepare("INSERT OR IGNORE INTO root_binding VALUES(1,?)").run(identity);});},
  pending:():boolean=>db.prepare("SELECT 1 FROM auxiliary WHERE json_extract(value,'$.reconstruct')=1 AND json_extract(value,'$.complete')=0 AND json_extract(value,'$.problem') IS NULL LIMIT 1").get()!==undefined,
  runIds:():string[]=>db.prepare("SELECT run FROM current UNION SELECT run FROM rebuild ORDER BY run").all().map(row=>String(row["run"])),
  active:():string[]=>db.prepare("SELECT run FROM current WHERE json_extract(state,'$.end') IS NULL ORDER BY run").all().map(row=>String(row["run"])),
  seed:(state:CurrentState,source:CurrentSource,index:readonly HistoryOffset[],auxiliary:string):SavedCurrent=>transaction(()=>{
   valid(state,source,index);const revision=change(state.run,false);db.prepare("DELETE FROM history WHERE run=?").run(state.run);putIndex(state.run,source,index);setAux(state.run,auxiliary);
   for(const table of ["current","rebuild"])db.prepare(`INSERT OR REPLACE INTO ${table} VALUES(?,?,?,?)`).run(state.run,JSON.stringify(state),JSON.stringify(source),revision);
   publication(state,source,revision,auxiliary);
   return {state,source,revision};
  }),
  rebuilding:(run:string):SavedCurrent|null=>readSaved("rebuild",run),
  auxiliary:(run:string):string|null=>{id(run);const row=db.prepare("SELECT value FROM auxiliary WHERE run=?").get(run);return row===undefined?null:String(row["value"]);},
  stage:(state:CurrentState,source:CurrentSource,index:readonly HistoryOffset[],auxiliary:string):SavedCurrent=>transaction(()=>{
   valid(state,source,index);const prior=readSaved("rebuild",state.run);if(prior!==null&&prior.source.generation===source.generation&&(source.offset<prior.source.offset||state.seq<prior.state.seq))throw new Error("Stale reconstruction checkpoint");
   const rev=change(state.run,false);putIndex(state.run,source,index);setAux(state.run,auxiliary);db.prepare("INSERT OR REPLACE INTO rebuild VALUES(?,?,?,?)").run(state.run,JSON.stringify(state),JSON.stringify(source),rev);return {state,source,revision:rev};
  }),
  list:():SavedCurrent[]=>db.prepare("SELECT run FROM current ORDER BY run DESC").all().map(row=>get(String(row["run"]))).filter((s):s is SavedCurrent=>s!==null),
  commit:(state:CurrentState,source:CurrentSource,index:readonly HistoryOffset[],retain=1024,auxiliary?:string,promote=false):SavedCurrent=>transaction(()=>{
   valid(state,source,index);if(!coord(retain)||retain<1)throw new Error("Invalid journal bound");
   const prior=get(state.run);if(prior!==null&&prior.source.generation===source.generation&&(source.offset<prior.source.offset||state.seq<prior.state.seq))throw new Error("Stale current checkpoint");
   const text=JSON.stringify(state);
   const rev=change(state.run,false,retain);
   if((prior??readSaved("rebuild",state.run))?.source.generation!==source.generation)db.prepare("DELETE FROM history WHERE run=?").run(state.run);
   putIndex(state.run,source,index);
   db.prepare("INSERT OR REPLACE INTO current VALUES(?,?,?,?)").run(state.run,text,JSON.stringify(source),rev);
   if(auxiliary!==undefined)setAux(state.run,auxiliary);
   publication(state,source,rev,auxiliary);
   if(promote){if(auxiliary===undefined)throw new Error("Publication requires metadata");db.prepare("DELETE FROM rebuild WHERE run=?").run(state.run);}
   return {state,source,revision:rev};
  }),
  seek:(run:string,generation:string,before:number):HistoryOffset|null=>{id(run);if(!coord(before))throw new Error("Invalid history sequence");const row=db.prepare("SELECT seq,turn,offset,end FROM history WHERE run=? AND generation=? AND seq<? ORDER BY seq DESC LIMIT 1").get(run,generation,before);return row===undefined?null:{seq:Number(row["seq"]),turn:Number(row["turn"]),offset:Number(row["offset"]),end:Number(row["end"])};},
  changes:(cursor:string):CurrentChanges=>readCurrentChanges(db,epoch,cursor),
  remove:(run:string):void=>{id(run);transaction(()=>{db.prepare("DELETE FROM current WHERE run=?").run(run);db.prepare("DELETE FROM history WHERE run=?").run(run);db.prepare("DELETE FROM rebuild WHERE run=?").run(run);db.prepare("DELETE FROM auxiliary WHERE run=?").run(run);db.prepare("DELETE FROM public_current WHERE run=?").run(run);change(run,true);});},
  close:():void=>{if(!closed){closed=true;db.close();lock?.close();}},
 };
}
export type CurrentStore=ReturnType<typeof openCurrentStore>;

// One read transaction pins metadata, retained journal boundary and returned rows.
// The caller owns this connection; no nested transaction is allowed.
function currentChangePage(db:DatabaseSync,epoch:string,cursor:string,limit?:number){
 const rev=Number(db.prepare("SELECT revision FROM meta WHERE id=1").get()?.["revision"]),match=/^([^:]+):(\d+)$/.exec(cursor),since=Number(match?.[2]??-1),min=Number(db.prepare("SELECT MIN(revision) n FROM changes").get()?.["n"]??rev+1);
 const reset=match?.[1]!==epoch||!coord(since)||since>rev||since<min-1;
 const raw=reset?[]:limit===undefined?db.prepare("SELECT revision,run,removed FROM changes WHERE revision>? ORDER BY revision").all(since):db.prepare("SELECT revision,run,removed FROM changes WHERE revision>? ORDER BY revision LIMIT ?").all(since,limit);
 const rows=raw.map(r=>({revision:Number(r["revision"]),run:String(r["run"]),removed:r["removed"]===1})),through=reset?rev:rows.at(-1)?.revision??rev;
 return {reset,epoch,revision:rev,through,more:through<rev,rows};
}
export function readCurrentChanges(db:DatabaseSync,epoch:string,cursor:string):CurrentChanges{
 db.exec("BEGIN");try{const r=currentChangePage(db,epoch,cursor);db.exec("COMMIT");return {reset:r.reset,epoch:r.epoch,revision:r.revision,runs:r.rows.map(({run,removed})=>({run,removed}))};}catch(error){db.exec("ROLLBACK");throw error;}
}
