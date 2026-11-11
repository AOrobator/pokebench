import {expect,it} from "vitest";
import {currentFixture} from "../test-support/current.js";
import {RUN} from "../test-support/events.js";
import {createCurrentBrowser} from "./current-browser.js";
import type {CurrentAnswer} from "./current-public.js";

it("keeps the opened trainer card while a same-epoch list refresh waits for its later page",async()=>{
 const f=currentFixture(),other=currentFixture({run:"other-run"});let lists=0,watch=false,release:(value:CurrentAnswer)=>void=()=>{};
 const held=new Promise<CurrentAnswer>(resolve=>{release=resolve;}),visible:boolean[]=[];
 const client=createCurrentBrowser({fetchJson:async url=>{
  if(url==="/api/current-runs"){lists++;return lists===1?{...f.list,indexing:true}:{...f.list,runs:[other.summary],next:"page-two",indexing:true};}
  if(url.includes("current-runs?after"))return held;
  if(url.endsWith("/current"))return f.detail;
  if(url.includes("current-updates"))return {kind:"updates",version:1,epoch:"epoch",cursor:"updated",reset:false,more:false,changes:[]} satisfies CurrentAnswer;
  return new Promise<CurrentAnswer>(()=>{});
 },changed:s=>{if(watch)visible.push(s.runs.some(run=>run.id===RUN));}});
 try{await client.start(RUN);watch=true;await client.poll();expect(lists).toBe(2);expect(visible).not.toContain(false);release({...f.list,next:null});await Promise.resolve();await Promise.resolve();expect(client.state.runs.some(run=>run.id===RUN)).toBe(true);}finally{client.close();}
});
