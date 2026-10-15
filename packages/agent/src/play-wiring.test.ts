import {expect,it} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {contextTools,loopSupervisor} from "./play-wiring.js";
import {ALL_ON,type FeatureSet} from "./features.js";
import {parsePlayPreset,presetFeatures} from "./play-preset.js";
import {playTools} from "./play-config.js";
import {checkEvent,type RunEvent} from "./events.js";
import {DOUBLE_WINDOW,WINDOW} from "./harness.js";
import {featureInfo,stateOnlyProblems} from "./features.js";

const NEW=["game-evidence-priority-v1","dialogue-log-v1","loop-guard-supervisor-v1","instruction-ledger-v1","next-milestone-hint-v1"] as const;
const OFF:FeatureSet={...ALL_ON,"navigation-evidence-memory-v1":false,...Object.fromEntries(NEW.map(id=>[id,false]))};
function recorder(){
 const subscribers:((e:RunEvent)=>void)[]=[];const delivered:string[]=[];
 return {subscribers,delivered,api:{subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordNavigationContext:()=>{delivered.push("navigation");},recordLedgerContext:()=>{delivered.push("ledger");},recordMilestoneHint:()=>{delivered.push("hint");}}};
}
const base=(messages:AgentMessage[])=>Promise.resolve(messages);

it("adds no tool, subscriber or context when every memory switch is off",async()=>{
 const r=recorder();const wired=contextTools(OFF,r.api,base);
 expect(wired.tools).toEqual([]);expect(r.subscribers).toHaveLength(0);
 expect(await wired.transformContext([])).toEqual([]);
 expect(loopSupervisor(OFF,r.api)).toBeUndefined();expect(r.subscribers).toHaveLength(0);
});

it("wires each switch's tool, matching the recorded tool list, and chains both pinned contexts",async()=>{
 const on={...OFF,"navigation-evidence-memory-v1":true,"dialogue-log-v1":true,"instruction-ledger-v1":true};
 const r=recorder();const wired=contextTools(on,r.api,base);
 expect(wired.tools.map(t=>t.name)).toEqual(playTools(on).filter(name=>["remember_destination","recall_dialogue","note_contradiction","get_next_milestone"].includes(name)));
 const out=await wired.transformContext([]);
 expect(r.delivered).toEqual(["ledger","navigation"]);
 expect(out.map(m=>JSON.stringify(m)).join()).toContain("INSTRUCTION LEDGER");
 expect(out.map(m=>JSON.stringify(m)).join()).toContain("NAVIGATION EVIDENCE MEMORY");
 const brief=loopSupervisor({...OFF,"loop-guard-supervisor-v1":true},r.api);
 r.subscribers.at(-1)?.(checkEvent({v:1,run:"w",t:"2026-10-14T12:00:00.000-04:00",turn:1,seq:1,type:"turn_start",context:{messages:1,images:0,est_tokens:10}}));
 expect(brief?.("cycle",3)).toContain("SUPERVISOR");
});

it("reads v2 presets written before these switches as all OFF",()=>{
 const features=Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>!(NEW as readonly string[]).includes(id)));
 const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features});
 for(const id of NEW)expect(presetFeatures(preset)[id]).toBe(false);
});

it("hands the play loop the incumbent window unless double-context-window-v1 is on",()=>{
 const r=recorder();
 expect(contextTools(OFF,r.api,base).window).toBe(WINDOW);
 expect(contextTools({...OFF,"double-context-window-v1":true},r.api,base).window).toBe(DOUBLE_WINDOW);
 expect(featureInfo("double-context-window-v1")).toMatchObject({group:"guidance",needs:null,switchable:true});
 expect(featureInfo("double-context-window-v1").description).toContain(" Off: ");
 expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires double-context-window-v1 OFF");
 const preset=parsePlayPreset({version:2,id:"old",target:null,limits:{maxTurns:1500,maxWallMs:1800000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:Object.fromEntries(Object.entries({...ALL_ON,"state-only-decisions-v1":false}).filter(([id])=>id!=="double-context-window-v1"))});
 expect(presetFeatures(preset)["double-context-window-v1"]).toBe(false);
});
