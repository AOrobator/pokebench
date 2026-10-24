import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname,join} from "node:path";
import {main,type FixedCliDeps} from "./fixed-cli.js";
import {armFeatures,parseFixedDefinition,type FixedDefinition} from "./fixed-design.js";
import type {FixedHost,FixedRunOptions} from "./fixed-runner.js";
import {expect,it} from "vitest";
import {BASE_MS,Log,START} from "../test-support/events.js";
import {RunView} from "./model.js";
import {eventText,inspector} from "./panels.js";
import {lanesSvg} from "./timeline.js";
const HELD="Not sent (drought-progress-facts-v1): the active drought clock reached 5 minutes of play, but a battle is on screen.";
it("keeps the new held-drought diagnostic in history and inspection without a timeline error mark",()=>{
 const log=new Log();log.add(0,START);
 const held=log.add(100,{type:"loop_guard",turn:278,kind:"milestone_drought",message:HELD,calls:0,evidence:[26726,26728],mode:"diagnostic",phase:"would_warn"});
 const v=new RunView();for(const e of log.events)v.apply(e);
 if(held.type!=="loop_guard")throw Error("wrong event");
 expect(eventText(held,v)).toContain("a battle is on screen");expect(inspector(held)).toContain("drought-progress-facts-v1");
 expect(v.errors).toEqual([]);expect(lanesSvg(v,BASE_MS+1000)).not.toContain("k-loop");
});
it("preserves existing timeline behavior for delivered notes and unrelated diagnostics",()=>{
 for(const extra of [{mode:"enforced",phase:"supervisor"},{mode:"diagnostic",phase:"would_stop"}] as const){
  const log=new Log();log.add(0,START);log.add(100,{type:"loop_guard",turn:278,kind:"milestone_drought",message:HELD,calls:0,evidence:[26726,26728],...extra});
  const v=new RunView();for(const e of log.events)v.apply(e);expect(v.errors).toHaveLength(1);
 }
});

it.each([
 {id:"bundle-v-control-2h",lane:"B",wallMs:86_400_000,recipe:undefined},
 {id:"glm53-flash-4h",lane:"A",wallMs:604_800_000,recipe:"bundle-v-control"},
])("materializes the authorized factual switch in the single-trial $id recipe without invoking a runner",async scenario=>{
 const root=mkdtempSync(join(tmpdir(),"drought-recipe-"));
 const forbidden=():never=>{throw Error("rehearsal must not invoke a host, endpoint, lease or process");};
 const host:FixedHost={now:forbidden,sleep:forbidden,head:forbidden,sources:forbidden,verifyBuild:forbidden,serving:forbidden,portInUse:forbidden,runId:forbidden,launch:forbidden,alive:forbidden,log:forbidden};
 try{
  const defs=new Map<string,FixedDefinition>(),starts=new Map<string,string>();
  for(const id of [scenario.id,...(scenario.recipe===undefined?[]:[scenario.recipe])]){
   const text=readFileSync(new URL(`../../../experiments/fixed/${id}.json`,import.meta.url),"utf8"),def=parseFixedDefinition(text).definition;
   defs.set(id,def);const path=join(root,"experiments/fixed",`${id}.json`);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,text);
   const base=join(root,def.controlBase.path);mkdirSync(dirname(base),{recursive:true});writeFileSync(base,readFileSync(new URL(`../../../${def.controlBase.path}`,import.meta.url)));
   for(const phase of def.phases)if(phase.start.kind==="save_state")starts.set(join(root,phase.start.path),phase.start.sha1);
  }
  const target=defs.get(scenario.id);if(target===undefined)throw Error("missing target");
  for(const arm of ["bundle","control"] as const){
   const captured:FixedRunOptions[]=[],errors:string[]=[];
   const deps:FixedCliDeps={root,runsRoot:join(root,arm),out:()=>undefined,err:line=>errors.push(line),randomSeed:()=>"feedfacefeedface",interactive:false,prompt:forbidden,now:()=>new Date("2026-10-24T15:42:49Z"),user:"offline rehearsal",head:()=>"0".repeat(40),sha1File:path=>path==="/fake-rom"?target.romSha1:starts.get(path)??null,rom:"/fake-rom",run:options=>{captured.push(options);return Promise.resolve("finished");},host:()=>host};
   const argv=["dry-run",scenario.id,"--phase","cook","--wall-ms",String(scenario.wallMs),"--arm",arm,"--lane",scenario.lane,...(scenario.recipe===undefined?[]:["--feature-recipe",scenario.recipe])];
   expect(await main(argv,deps),errors.join("\n")).toBe(0);expect(errors).toEqual([]);expect(captured).toHaveLength(1);
   const options=captured[0];if(options===undefined)throw Error("fake run port not reached");
   expect(options.dryRun).toBe(true);expect(options.def.plan.map(p=>p.arm)).toEqual([arm]);
   expect(armFeatures(options.def,arm)["drought-progress-facts-v1"],`${scenario.id}/${arm}`).toBe(arm==="bundle");
   expect(options.def.phases[0]?.maxWallMs).toBe(scenario.wallMs);expect(options.def.lanes.map(l=>l.id)).toEqual([scenario.lane]);
   expect(options.def.serving).toEqual(target.serving);expect(options.def.phases[0]?.start).toEqual(target.phases[0]?.start);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
