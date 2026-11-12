import {EventEmitter} from "node:events";
import type {IncomingMessage,ServerResponse} from "node:http";
import {expect,it} from "vitest";
import {createCurrentApi} from "./current-api.js";
import {CurrentPoolError,type CurrentPool} from "./current-pool.js";
import type {CurrentQuery,CurrentAnswer} from "./current-public.js";
class Response extends EventEmitter {status=0;body="";destroyed=false;headers=new Map<string,string>();setHeader(key:string,value:string){this.headers.set(key,value);}writeHead(status:number){this.status=status;}end(body=""){this.body=body;this.emit("finish");}destroy(){this.destroyed=true;this.emit("close");}}
const request=(url:string,headers:Record<string,string>={}):IncomingMessage=>({url,headers} as unknown as IncomingMessage);
const response=(r:Response):ServerResponse=>r as unknown as ServerResponse;
function pool(answer:(query:CurrentQuery)=>Promise<CurrentAnswer>):CurrentPool{return {query:answer,close:async()=>{}};}
it("maps only the four current paths, validates parameters and preserves conditional replies",async()=>{
 const queries:CurrentQuery[]=[],api=createCurrentApi(pool(q=>{queries.push(q);return Promise.resolve<CurrentAnswer>({kind:"unavailable",version:1,problem:"indexing"});}));
 for(const [path,parts,query] of [["/api/current-runs?limit=2",["api","current-runs"],{kind:"list",now:7,after:null,limit:2}],["/api/current-updates?after=cursor&run=fixture",["api","current-updates"],{kind:"updates",now:7,after:"cursor",run:"fixture"}],["/api/runs/fixture/current",["api","runs","fixture","current"],{kind:"current",now:7,run:"fixture"}],["/api/runs/fixture/history?before=cursor",["api","runs","fixture","history"],{kind:"history",now:7,run:"fixture",before:"cursor"}]] as const){const r=new Response();expect(await api.handle(request(path),response(r),parts,7)).toBe(true);expect(queries.at(-1)).toEqual(query);expect(r.status).toBe(503);}
 const unrelated=new Response();expect(await api.handle(request("/api/cards"),response(unrelated),["api","cards"],7)).toBe(false);expect(unrelated.status).toBe(0);
 for(const path of ["/api/current-runs?limit=2&limit=3","/api/current-runs?unknown=1"]){const r=new Response();await api.handle(request(path),response(r),["api","current-runs"],7);expect(r.status).toBe(400);}expect(queries).toHaveLength(4);
 const ready=createCurrentApi(pool(()=>Promise.resolve<CurrentAnswer>({kind:"list",version:1,epoch:"e",cursor:"c",runs:[],next:null,indexing:false,problems:[]}))),first=new Response();await ready.handle(request("/api/current-runs"),response(first),["api","current-runs"],7);expect(first.status).toBe(200);const tag=first.headers.get("etag");expect(tag).toMatch(/^"[a-f0-9]{64}"$/);const cached=new Response();await ready.handle(request("/api/current-runs",{"if-none-match":tag??""}),response(cached),["api","current-runs"],7);expect(cached.status).toBe(304);expect(cached.body).toBe("");
});
it("returns explicit indexing, cursor reset, oversized and bounded failure statuses",async()=>{const values:CurrentAnswer[]=[{kind:"current",version:1,epoch:"e",cursor:"c",snapshot:null},...["indexing","reset","oversized","ready"].map(state=>({kind:"history" as const,version:1 as const,epoch:"e",generation:"g",state:state as "indexing"|"reset"|"oversized"|"ready",events:[],before:null}))];for(const [i,value] of values.entries()){const r=new Response();await createCurrentApi(pool(()=>Promise.resolve(value))).handle(request("/api/runs/fixture/current"),response(r),["api","runs","fixture","current"],7);expect(r.status).toBe([202,202,409,413,200][i]);}for(const error of [new CurrentPoolError(400,"bad cursor"),new Error("private failure")]){const r=new Response();await createCurrentApi(pool(()=>Promise.reject(error))).handle(request("/api/current-runs"),response(r),["api","current-runs"],7);expect(r.status).toBe(error instanceof CurrentPoolError?400:503);expect(r.body).not.toContain("private failure");}
 const r=new Response();await createCurrentApi(pool(()=>Promise.resolve<CurrentAnswer>({kind:"unavailable",version:1,problem:"x".repeat(1000)})),{maxBytes:128}).handle(request("/api/current-runs"),response(r),["api","current-runs"],7);expect(r.status).toBe(413);expect(Buffer.byteLength(r.body)).toBeLessThanOrEqual(128);
});
it("closes a held current response at the injected tiny production deadline",async()=>{const r=new Response(),closed=new Promise<string>(resolve=>{r.once("close",()=>{resolve("closed");});});let timer:ReturnType<typeof setTimeout>|undefined;void createCurrentApi(pool(()=>new Promise(()=>{})),{responseMs:1}).handle(request("/api/current-runs"),response(r),["api","current-runs"],7);const outcome=await Promise.race([closed,new Promise<string>(resolve=>{timer=setTimeout(()=>{resolve("deadline not enforced");},20);})]);clearTimeout(timer);try{expect(outcome).toBe("closed");expect(r.destroyed).toBe(true);}finally{r.destroy();}});

it("routes immutable metadata and checkpoint progress independently from live polling",async()=>{
 const queries:CurrentQuery[]=[],api=createCurrentApi(pool(q=>{queries.push(q);return Promise.resolve({kind:"unavailable",version:1,problem:"fixture"});}));
 for(const [url,operation] of [["/api/runs/fixture/metadata?reference="+"a".repeat(64),"metadata"],["/api/runs/fixture/progress?generation=g&after=cursor","progress"]]){const r=new Response();await api.handle(request(url??""),response(r),["api","runs","fixture",operation??""],7);}
 expect(queries).toEqual([{kind:"metadata",run:"fixture",reference:"a".repeat(64),now:7},{kind:"progress",run:"fixture",generation:"g",after:"cursor",now:7}]);
});
it("enriches display answers before applying the byte limit and ETag",async()=>{
 const original:CurrentAnswer={kind:"history",version:1,epoch:"e",generation:"g",state:"ready",events:[],before:null};
 let calls=0;
 const api=createCurrentApi(pool(()=>Promise.resolve(original)),{enrich:answer=>{calls++;return Promise.resolve({...answer,epoch:"bridge"});}}),r=new Response();
 await api.handle(request("/api/runs/fixture/history"),response(r),["api","runs","fixture","history"],7);
 expect(calls).toBe(1);expect(JSON.parse(r.body)).toMatchObject({epoch:"bridge"});expect(original.epoch).toBe("e");
 const cached=new Response();await api.handle(request("/api/runs/fixture/history",{"if-none-match":r.headers.get("etag")??""}),response(cached),["api","runs","fixture","history"],7);expect(cached.status).toBe(304);
});
