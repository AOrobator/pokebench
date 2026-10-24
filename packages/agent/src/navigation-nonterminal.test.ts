import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {checkEvent} from "./events.js";
import {parseGameState} from "./game-state.js";
import {NavigationRecovery,NAVIGATION_RECOVERY_CALLS} from "./loop/navigation-recovery.js";
import type {LoopNotice} from "./loop/types.js";

const fixture=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/navigation-recovery-ba89.json.gz",import.meta.url))).toString()) as {run:string;state:unknown;stop:unknown;end:unknown};
const recorded=checkEvent(fixture.state);
const state=parseGameState(Object.fromEntries(Object.entries(recorded).filter(([k])=>!["v","run","seq","t","type","turn"].includes(k))));
it("grounds ba89 #8178 in its paired recorded state and both foot doors",()=>{
 expect(checkEvent(fixture.stop)).toMatchObject({seq:8178,phase:"stop",kind:"map_cycle"});
 expect(checkEvent(fixture.end)).toMatchObject({reason:"stuck"});
 expect(recorded).toMatchObject({seq:8176,map_id:[1,4],position:{x:6,y:12},exit_reach:{connections:[],warps:[{x:6,y:12,reach:"foot"},{x:7,y:12,reach:"foot"}]}});
 const r=new NavigationRecovery(()=>undefined,"enforced",true);r.state(state);r.cycle("cycle",[8176],1);
 expect(r.context()).toContain('warp (6,12)');expect(r.context()).toContain('warp (7,12)');
 expect(r.context()).toContain('"kind":"warp","x":7,"y":12');expect(r.context()).not.toContain("none qualified");
});
for(const detailed of [false,true])for(const kind of ["map_cycle","rejection"] as const)it(`never ends repeated ${kind} recovery (detailed=${String(detailed)})`,()=>{
 const notices:LoopNotice[]=[];const r=new NavigationRecovery(n=>notices.push(n),"enforced",false,detailed);r.state(state);
 for(let window=0;window<3;window++){
  if(kind==="map_cycle")r.cycle("cycle",[8176],window*20);
  else for(let i=0;i<2;i++)r.complete({name:"navigate_to",args:{map_id:[0,9]},acted:false,isError:false,text:"",state,seq:8176},window*20+i);
  r.context();
  for(let i=0;i<NAVIGATION_RECOVERY_CALLS;i++)r.complete({name:"observe",args:{},isError:false,text:"",state,seq:8177+i},window*20+i+2);
  expect(notices.at(-1)).toMatchObject({phase:"supervisor"});
  expect(r.context()).toBe(notices.at(-1)?.message);expect(r.context()).toContain("run continues");
  expect(r.stopped).toBe(false);
  r.complete({name:"observe",args:{},isError:false,text:"",state},window*20+19);
 }
 expect(notices.filter(n=>n.phase==="supervisor")).toHaveLength(3);
 expect(notices.some(n=>n.phase==="stop")).toBe(false);
});

import {attachLoopGuard,Governor} from "./harness.js";
import type {RunEvent} from "./events.js";
for(const enforced of [false,true])it(`keeps generic threshold nonterminal and bounded; enforced=${String(enforced)}`,()=>{
 const notices:LoopNotice[]=[];const subscribers:((e:RunEvent)=>void)[]=[];
 const governor=new Governor({limits:{maxTurns:200,maxWallMs:60000,failureLimit:3},retry:()=>undefined,abort:()=>{throw Error("guard aborted run");},now:()=>0});
 const d=attachLoopGuard({subscribe:f=>{subscribers.push(f);},recordLoopGuard:n=>notices.push(n)},governor,undefined,enforced?"enforced":"diagnostic");
 for(const f of subscribers)f(recorded);
 for(let i=0;i<30;i++){d.context();d.complete({name:"observe",args:{},isError:false,text:"same observation",state,seq:8200+i});}
 expect(governor.stopReason).toBe(null);expect(d.stopped).toBe(false);
 expect(notices.map(n=>n.phase)).toEqual(enforced?["warning","supervisor"]:["would_warn"]);
 if(enforced)expect(d.context()).toContain("run continues");else expect(d.context()).toBe(null);
});
