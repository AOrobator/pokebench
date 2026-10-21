import { cardWorkbench } from "./workbench-store.js";
import { expect, it } from "vitest";
import { RunView } from "./model.js";
import { visualSplitView } from "./visual-split-view.js";
import type { WorkbenchRun } from "./workbench-data.js";
import { Log, START } from "../test-support/events.js";
it("shows reviewed first-interaction evidence only at or after its screenshot, without changing replay",()=>{
 const log=new Log();const start=log.add(0,START);const view=new RunView();view.apply(start);
 const run:WorkbenchRun={id:start.run,cohort:null,arm:null,model:null,started:start.t,status:"ended",reason:"budget",problem:null,excluded:null,elapsedMs:2000,turn:0,config:null,
 measurement:{controller:"human",features:[],logSha256:"a".repeat(64),pausedMs:0,rawSplits:[{name:"ROXANNE_FIRST_INTERACTION",elapsedMs:1000,evidence:[1]}]},
 splits:[{name:"ROXANNE_FIRST_INTERACTION",elapsedMs:1000,segmentMs:1000,seq:1,turn:0,inputTokens:0,outputTokens:0,derived:true,screenshotEvidence:[{seq:1,path:"frames/000001_0.png",sha1:"a".repeat(40)}]}]};
 const at=Date.parse(start.t);
 expect(visualSplitView(new RunView(),run,at+2000).milestones).toEqual([]);
 expect(visualSplitView(view,undefined,at+2000)).toBe(view);
 expect(visualSplitView(view,{...run,id:"other"},at+2000)).toBe(view);
 expect(visualSplitView(view,run,at+999)).toBe(view);
 const projected=visualSplitView(view,run,at+1000);expect(projected.milestones).toMatchObject([{name:"ROXANNE_FIRST_INTERACTION",ms:at+1000,derived:true,evidence:[1],screenshotEvidence:[{seq:1}]}]);
 expect(view.milestones).toEqual([]);
 expect(visualSplitView(projected,run,at+2000)).toBe(projected);
 expect(visualSplitView(view,run,at)).toBe(view);
 const missing={...run};delete missing.measurement;expect(visualSplitView(view,missing,at+2000)).toBe(view);
 const card=cardWorkbench({version:1,at,milestones:[],problems:[],runs:[{...missing,splits:missing.splits.map(s=>({...s,observedMs:at+1000}))}]},start.run).runs[0];expect(visualSplitView(view,card,at+2000).milestones).toMatchObject([{ms:at+1000,evidence:[1]}]);
});
