import { DatabaseSync } from "node:sqlite";
import { mkdirSync, lstatSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { checkEvent, RUN_ID_PATTERN } from "@pokebench/agent/events";
import { parseCurrent, type CurrentState } from "./current-state.js";

export interface CurrentSource { generation:string; identity:string; offset:number; size:number; mtime:number; anchor:string; evidence:string }
export interface HistoryOffset { seq:number; turn:number; offset:number; end:number }
export interface SavedCurrent { state:CurrentState; source:CurrentSource; revision:number }
export type CurrentChange = {run:string;removed:true}|{run:string;removed:false};
export interface CurrentChanges {reset:boolean;epoch:string;revision:number;runs:CurrentChange[]}
const idPattern=new RegExp(RUN_ID_PATTERN);
const id=(run:string):void=>{if(!idPattern.test(run))throw new Error("Invalid current run id");};
const coord=(n:number):boolean=>Number.isSafeInteger(n)&&n>=0;
const JSON_LIMIT=16*1024*1024;
function strictState(value:unknown):CurrentState{
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
export function openCurrentStore(path:string,options:{readOnly?:boolean;auxBytes?:number;beforeCommit?:()=>void}={}){
 const auxBytes=options.auxBytes??65536;if(!coord(auxBytes)||auxBytes<1)throw new Error("Invalid auxiliary bound");
 const readOnly=options.readOnly===true;let closed=false;let lock:DatabaseSync|null=null;let db:DatabaseSync;let connection:DatabaseSync|undefined;
 for(const target of [path,`${path}.lock`,`${path}-wal`,`${path}-shm`,`${path}.lock-journal`]){
  if(lstatSync(target,{throwIfNoEntry:false})?.isSymbolicLink()===true)throw new Error("Current store refuses symbolic links");
 }
 if(!readOnly)mkdirSync(dirname(path),{recursive:true});
 try{
  if(!readOnly){lock=new DatabaseSync(`${path}.lock`);lock.exec("PRAGMA busy_timeout=0; CREATE TABLE IF NOT EXISTS owner (id INTEGER); BEGIN EXCLUSIVE;");}
  db=new DatabaseSync(path,{readOnly});connection=db;db.exec("PRAGMA busy_timeout=25");
  if(!readOnly)db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL, epoch TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS current (run TEXT PRIMARY KEY, state TEXT NOT NULL, source TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS history (run TEXT NOT NULL, generation TEXT NOT NULL, seq INTEGER NOT NULL, turn INTEGER NOT NULL, offset INTEGER NOT NULL, end INTEGER NOT NULL, PRIMARY KEY(run,generation,seq)); CREATE TABLE IF NOT EXISTS changes (revision INTEGER PRIMARY KEY, run TEXT NOT NULL, removed INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS rebuild (run TEXT PRIMARY KEY, state TEXT NOT NULL, source TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS auxiliary (run TEXT PRIMARY KEY,value TEXT NOT NULL CHECK(json_valid(value)));");
  if(!readOnly)db.prepare("INSERT OR IGNORE INTO meta VALUES(1,1,?,0)").run(randomUUID());
  const meta=db.prepare("SELECT * FROM meta WHERE id=1").get();if(meta?.["version"]!==1||typeof meta["epoch"]!=="string")throw new Error("Incompatible current store");
 }catch(error){connection?.close();lock?.close();throw error;}
 const epoch=String(db.prepare("SELECT epoch FROM meta WHERE id=1").get()?.["epoch"]);
 const revision=():number=>Number(db.prepare("SELECT revision FROM meta WHERE id=1").get()?.["revision"]);
 const readSaved=(table:"current"|"rebuild",run:string):SavedCurrent|null=>{id(run);const row=db.prepare(`SELECT * FROM ${table} WHERE run=?`).get(run);if(row===undefined)return null;const state=strictState(JSON.parse(String(row["state"])) as unknown);if(state.run!==run)throw new Error("Foreign current snapshot");return {state,source:sourceOf(JSON.parse(String(row["source"])) as unknown),revision:Number(row["revision"])};};
 const get=(run:string):SavedCurrent|null=>readSaved("current",run);
 const setAux=(run:string,value:string):void=>{if(Buffer.byteLength(value)>auxBytes)throw new Error("Auxiliary checkpoint exceeds size limit");db.prepare("INSERT OR REPLACE INTO auxiliary VALUES(?,?)").run(run,value);};
 const valid=(state:CurrentState,source:CurrentSource,index:readonly HistoryOffset[]):void=>{strictState(state);id(state.run);sourceOf(source);if(Buffer.byteLength(JSON.stringify(state))>JSON_LIMIT)throw new Error("Current checkpoint exceeds size limit");for(const entry of index)if(![entry.seq,entry.turn,entry.offset,entry.end].every(coord)||entry.end>source.offset||entry.end<=entry.offset||entry.seq>state.seq)throw new Error("Invalid history coordinate");};
 const putIndex=(run:string,source:CurrentSource,index:readonly HistoryOffset[]):void=>{for(const entry of index)db.prepare("INSERT OR REPLACE INTO history VALUES(?,?,?,?,?,?)").run(run,source.generation,entry.seq,entry.turn,entry.offset,entry.end);};
 const transaction=<T>(fn:()=>T):T=>{db.exec("BEGIN IMMEDIATE");try{const result=fn();options.beforeCommit?.();db.exec("COMMIT");return result;}catch(error){db.exec("ROLLBACK");throw error;}};
 const change=(run:string,removed:boolean,retain=1024):number=>{
  const rev=revision()+1;db.prepare("UPDATE meta SET revision=? WHERE id=1").run(rev);db.prepare("INSERT INTO changes VALUES(?,?,?)").run(rev,run,removed?1:0);db.prepare("DELETE FROM changes WHERE revision<=?").run(rev-retain);return rev;
 };
 return {epoch,revision,get,
  pending:():boolean=>db.prepare("SELECT 1 FROM auxiliary WHERE json_extract(value,'$.reconstruct')=1 AND json_extract(value,'$.complete')=0 AND json_extract(value,'$.problem') IS NULL LIMIT 1").get()!==undefined,
  active:():string[]=>db.prepare("SELECT run FROM current WHERE json_extract(state,'$.end') IS NULL ORDER BY run").all().map(row=>String(row["run"])),
  seed:(state:CurrentState,source:CurrentSource,index:readonly HistoryOffset[],auxiliary:string):SavedCurrent=>transaction(()=>{
   valid(state,source,index);const revision=change(state.run,false);db.prepare("DELETE FROM history WHERE run=?").run(state.run);putIndex(state.run,source,index);setAux(state.run,auxiliary);
   for(const table of ["current","rebuild"])db.prepare(`INSERT OR REPLACE INTO ${table} VALUES(?,?,?,?)`).run(state.run,JSON.stringify(state),JSON.stringify(source),revision);
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
   if(promote){if(auxiliary===undefined)throw new Error("Publication requires metadata");db.prepare("DELETE FROM rebuild WHERE run=?").run(state.run);}
   return {state,source,revision:rev};
  }),
  seek:(run:string,generation:string,before:number):HistoryOffset|null=>{id(run);if(!coord(before))throw new Error("Invalid history sequence");const row=db.prepare("SELECT seq,turn,offset,end FROM history WHERE run=? AND generation=? AND seq<? ORDER BY seq DESC LIMIT 1").get(run,generation,before);return row===undefined?null:{seq:Number(row["seq"]),turn:Number(row["turn"]),offset:Number(row["offset"]),end:Number(row["end"])};},
  changes:(cursor:string):CurrentChanges=>readCurrentChanges(db,epoch,cursor),
  remove:(run:string):void=>{id(run);transaction(()=>{db.prepare("DELETE FROM current WHERE run=?").run(run);db.prepare("DELETE FROM history WHERE run=?").run(run);db.prepare("DELETE FROM rebuild WHERE run=?").run(run);db.prepare("DELETE FROM auxiliary WHERE run=?").run(run);change(run,true);});},
  close:():void=>{if(!closed){closed=true;db.close();lock?.close();}},
 };
}
export type CurrentStore=ReturnType<typeof openCurrentStore>;

// One read transaction pins metadata, retained journal boundary and returned rows.
// The caller owns this connection; no nested transaction is allowed.
export function readCurrentChanges(db:DatabaseSync,epoch:string,cursor:string):CurrentChanges{
 db.exec("BEGIN");
 try{
  const rev=Number(db.prepare("SELECT revision FROM meta WHERE id=1").get()?.["revision"]),match=/^([^:]+):(\d+)$/.exec(cursor),since=Number(match?.[2]??-1);
  const min=Number(db.prepare("SELECT MIN(revision) n FROM changes").get()?.["n"]??rev+1);
  const result:CurrentChanges=match?.[1]!==epoch||!coord(since)||since>rev||since<min-1?{reset:true,epoch,revision:rev,runs:[]}:{reset:false,epoch,revision:rev,runs:db.prepare("SELECT run,removed FROM changes WHERE revision>? ORDER BY revision").all(since).map(row=>({run:String(row["run"]),removed:row["removed"]===1}))};
  db.exec("COMMIT");return result;
 }catch(error){db.exec("ROLLBACK");throw error;}
}
