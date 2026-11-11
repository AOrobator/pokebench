// Immutable configuration is fetched once, not repeated in every live update.
import {isRunEvent} from "./model.js";
import {isWorkbenchConfig,type WorkbenchConfig} from "./workbench-data.js";
import type {CurrentSummary,CurrentSnapshot} from "./current-public.js";
export const CURRENT_METADATA_BYTES=1024*1024;
export interface CurrentMetadata {header:CurrentSummary["header"];config:WorkbenchConfig}
const record=(v:unknown):v is Record<string,unknown>=>typeof v==="object"&&v!==null&&!Array.isArray(v);
export const metadataReference=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
export function parseCurrentMetadata(value:unknown):CurrentMetadata {
 if(!record(value)||Object.keys(value).some(k=>k!=="header"&&k!=="config")||!isRunEvent(value["header"])||value["header"].type!=="run_start"||value["header"].seq!==0||value["header"].system_prompt!==""||value["config"]===null||!isWorkbenchConfig(value["config"])||new TextEncoder().encode(JSON.stringify(value)).byteLength>CURRENT_METADATA_BYTES)throw new Error("Invalid current metadata");
 return value as unknown as CurrentMetadata;
}
export function packCurrentSummary(s:CurrentSummary|CurrentSnapshot):unknown {
 if(s.metadata===undefined)return s;
 const rest=Object.fromEntries(Object.entries(s).filter(([key])=>key!=="header"&&key!=="run"));
 const {config,...runFacts}=s.run;
 return {...rest,run:{...runFacts,config:config?.extendedWallMs===undefined?null:{extendedWallMs:config.extendedWallMs}}};
}
export function unpackCurrentSummary(value:unknown,metadata:CurrentMetadata):unknown {
 if(!record(value)||!metadataReference(value["metadata"])||!record(value["run"])||value["id"]!==metadata.header.run)throw new Error("Foreign current metadata");
 const delta=value["run"]["config"];
 if(delta!==null&&(!record(delta)||Object.keys(delta).some(k=>k!=="extendedWallMs")||typeof delta["extendedWallMs"]!=="number"||!Number.isSafeInteger(delta["extendedWallMs"])||delta["extendedWallMs"]<0))throw new Error("Invalid effective configuration");
 return {...value,header:metadata.header,run:{...value["run"],config:{...metadata.config,...(delta??{})}}};
}
export function packCurrentAnswer(value:unknown):unknown {
 if(!record(value))return value;
 if(value["kind"]==="list"&&Array.isArray(value["runs"]))return {...value,runs:value["runs"].map(s=>packCurrentSummary(s as CurrentSummary))};
 if(value["kind"]==="current"&&value["snapshot"]!==null)return {...value,snapshot:packCurrentSummary(value["snapshot"] as CurrentSnapshot)};
 if(value["kind"]==="updates"&&Array.isArray(value["changes"]))return {...value,changes:value["changes"].map((c:unknown)=>record(c)&&c["removed"]===false?{...c,summary:packCurrentSummary(c["summary"] as CurrentSummary),...(c["snapshot"]===undefined?{}:{snapshot:packCurrentSummary(c["snapshot"] as CurrentSnapshot)})}:c)};
 return value;
}
export function currentMetadataCache(fetchMetadata:(run:string,reference:string,signal:AbortSignal)=>Promise<unknown>,maxBytes=16*1024*1024,maxEntries=256){
 const cache=new Map<string,{value:CurrentMetadata;bytes:number}>(),pending=new Map<string,Promise<CurrentMetadata>>();let bytes=0;
 const obtain=async(run:string,reference:string,signal:AbortSignal):Promise<CurrentMetadata>=>{
  const hit=cache.get(reference);if(hit!==undefined){if(hit.value.header.run!==run)throw new Error("Foreign cached metadata");cache.delete(reference);cache.set(reference,hit);return hit.value;}
  const flight=pending.get(reference);if(flight!==undefined){const value=await flight;if(value.header.run!==run)throw new Error("Foreign pending metadata");return value;}
  const task=(async()=>{const value=parseCurrentMetadata(await fetchMetadata(run,reference,signal));if(value.header.run!==run)throw new Error("Foreign fetched metadata");const size=new TextEncoder().encode(JSON.stringify(value)).byteLength;if(size>maxBytes)throw new Error("Metadata cache record too large");cache.set(reference,{value,bytes:size});bytes+=size;while(bytes>maxBytes||cache.size>maxEntries){const oldest=cache.keys().next().value;if(oldest===undefined)break;bytes-=cache.get(oldest)?.bytes??0;cache.delete(oldest);}return value;})();pending.set(reference,task);try{return await task;}finally{pending.delete(reference);}
 };
 const inflate=async(value:unknown,signal:AbortSignal):Promise<unknown>=>{if(!record(value)||value["header"]!==undefined||value["metadata"]===undefined)return value;if(!metadataReference(value["metadata"])||typeof value["id"]!=="string")throw new Error("Invalid metadata reference");return unpackCurrentSummary(value,await obtain(value["id"],value["metadata"],signal));};
 return {hydrate:async(value:unknown,signal:AbortSignal):Promise<unknown>=>{
  if(!record(value))return value;
  if(value["kind"]==="list"&&Array.isArray(value["runs"])){const runs=[];for(const run of value["runs"])runs.push(await inflate(run,signal));return {...value,runs};}
  if(value["kind"]==="current"&&value["snapshot"]!==null)return {...value,snapshot:await inflate(value["snapshot"],signal)};
  if(value["kind"]==="updates"&&Array.isArray(value["changes"])){const changes=[];for(const change of value["changes"]){if(!record(change)||change["removed"]!==false){changes.push(change);continue;}changes.push({...change,summary:await inflate(change["summary"],signal),...(change["snapshot"]===undefined?{}:{snapshot:await inflate(change["snapshot"],signal)})});}return {...value,changes};}
  return value;
 }};
}

export function needsCurrentMetadata(value:unknown):boolean {
 if(!record(value))return false;
 const packed=(s:unknown)=>record(s)&&s["header"]===undefined&&s["metadata"]!==undefined;
 return value["kind"]==="current"?packed(value["snapshot"]):value["kind"]==="list"&&Array.isArray(value["runs"])?value["runs"].some(packed):value["kind"]==="updates"&&Array.isArray(value["changes"])?value["changes"].some(c=>record(c)&&(packed(c["summary"])||packed(c["snapshot"]))):false;
}
