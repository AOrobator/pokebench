// Owned-process crash rehearsal. Never imported for execution by application code.
import {writeSync} from "node:fs";
import type {CurrentProjector,ProjectorOptions} from "../src/current-service.js";
import type {openCurrentStore as OpenStore} from "../src/current-store.js";
export type FixtureFrame={phase:"cli";ready:true;epoch:string;revision:number}|{phase:"ready";pid:number}|{phase:"armed"}|{phase:"before-commit"}|{phase:"state";seq:number|null;stageSeq:number|null;offset:number|null;stageOffset:number|null;input:number|null;complete:boolean|null;revision:number}|{phase:"error";message:string};
const emit=(frame:FixtureFrame):void=>{writeSync(1,JSON.stringify(frame)+"\n");};
const service:unknown=await import(new URL("../dist/current-service.js",import.meta.url).href),store:unknown=await import(new URL("../dist/current-store.js",import.meta.url).href);
if(typeof service!=="object"||service===null||!("createCurrentProjector" in service)||typeof service.createCurrentProjector!=="function"||typeof store!=="object"||store===null||!("openCurrentStore" in store)||typeof store.openCurrentStore!=="function")throw new Error("Compiled fixture modules unavailable");
const create=service.createCurrentProjector as (options:ProjectorOptions)=>CurrentProjector,open=store.openCurrentStore as typeof OpenStore;
const root=process.argv[2],database=process.argv[3],run=process.argv[4];if(root===undefined||database===undefined||run===undefined||process.send===undefined)throw new Error("Fixture child requires explicit root/database/run and IPC");
let armed=false,now=1000;
const actor=create({runsRoot:root,database,now:()=>now,limits:{records:1,tailBytes:1},storeFactory:(path,options)=>open(path,{...options,beforeCommit:()=>{if(armed){emit({phase:"before-commit"});Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10000);throw new Error("Fixture transaction barrier expired");}}})});
const state=():void=>{const current=actor.current(run),stage=actor.reconstruction(run);emit({phase:"state",seq:current?.state.seq??null,stageSeq:stage?.state.seq??null,offset:current?.source.offset??null,stageOffset:stage?.source.offset??null,input:current?.state.totals.input??null,complete:actor.status(run)?.complete??null,revision:actor.store.revision()});};
let pending=Promise.resolve();
process.on("message",(value:unknown)=>{pending=pending.then(async()=>{if(typeof value!=="object"||value===null||!("op" in value))throw new Error("Invalid fixture operation");if(value.op==="arm"){armed=true;emit({phase:"armed"});}else if(value.op==="read")state();else if(value.op==="step"){now+=1000;await actor.step();state();}else if(value.op==="quit"){actor.close();process.disconnect?.();}else throw new Error("Unknown fixture operation");}).catch((error:unknown)=>{emit({phase:"error",message:error instanceof Error?error.message:"Fixture child failed"});actor.close();process.exitCode=1;process.disconnect?.();});});
process.on("disconnect",()=>{actor.close();});emit({phase:"ready",pid:process.pid});
