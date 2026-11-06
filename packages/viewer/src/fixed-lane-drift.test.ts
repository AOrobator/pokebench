import {describe,expect,it} from "vitest";
import {featuresSha256} from "@pokebench/agent/run-evaluation";
import overlay from "../../../experiments/feature-configs/rayquaza-lane.json" with {type:"json"};
import {lastLaneRun,laneDriftLines,laneDriftReport,type LaneRunReads,type RecordedLaneRun} from "./fixed-lane-drift.js";
import {definition} from "../test-support/fixed.js";

const launch=(run:string,at:string,arm="bundle"):string=>JSON.stringify({kind:"launch",slot:1,lane:"A",phase:"cook",arm,run,at,commit:"c",sources:"s",presetSha256:"p",serving:"v"});
const start=(features:Record<string,boolean>):string=>JSON.stringify({type:"run_start",evaluation:{features}});
function reads(over:Partial<LaneRunReads>={}):LaneRunReads {
 return {
  recipeText:()=>JSON.stringify(overlay),
  definitionIds:()=>["lane-v1","lane-v2","other","broken"],
  definitionText:id=>id==="broken"?"not json":JSON.stringify({featureRecipe:id==="other"?"current":"rayquaza-lane"}),
  ledgerText:id=>id==="lane-v1"?launch("old","2026-11-05T10:00:00.000Z"):id==="lane-v2"?launch("new","2026-11-06T10:00:00.000Z","control"):id==="other"?launch("newest","2026-11-07T10:00:00.000Z"):null,
  runStartLine:run=>run==="new"?start({a:true}):run==="old"?start({a:false}):null,
  ...over,
 };
}

describe("lastLaneRun",()=>{
 it("finds the newest launch among definitions using the recipe, across experiments",()=>{
  expect(lastLaneRun("rayquaza-lane",reads())).toEqual({experiment:"lane-v2",run:"new",at:"2026-11-06T10:00:00.000Z",arm:"control",features:{a:true}});
 });
 it("falls back past a run whose run_start is missing or carries no features",()=>{
  for(const line of [null,"{torn",JSON.stringify({type:"run_start"})]){
   const out=lastLaneRun("rayquaza-lane",reads({runStartLine:run=>run==="new"?line:start({a:false})}));
   expect(out?.run).toBe("old");
  }
 });
 it("fails on an unreadable ledger rather than comparing with an older run",()=>{
  expect(()=>lastLaneRun("rayquaza-lane",reads({ledgerText:id=>id==="lane-v2"?"{torn":null}))).toThrow("lane-v2 ledger:");
 });
 it("is null when the recipe has no recorded run",()=>{
  expect(lastLaneRun("rayquaza-lane",reads({ledgerText:()=>null}))).toBeNull();
 });
});

describe("laneDriftLines",()=>{
 const recorded:RecordedLaneRun={experiment:"lane-v2",run:"r1",at:"2026-11-06T10:00:00.000Z",arm:"bundle",features:{a:true,b:false,gone:true}};
 it("names every switch that changed since the recorded run, with both hashes",()=>{
  const now={a:false,b:false,fresh:true};
  expect(laneDriftLines("rayquaza-lane",recorded,()=>now)).toEqual([
   `lane recipe rayquaza-lane: resolved bundle features sha256 ${featuresSha256(now)}; last recorded run r1 (lane-v2, 2026-11-06T10:00:00.000Z) sha256 ${featuresSha256(recorded.features)}`,
   "switches changed since that run: a true -> false, fresh unset -> true, gone true -> unset",
  ]);
 });
 it("says so when nothing changed",()=>{
  expect(laneDriftLines("rayquaza-lane",recorded,()=>recorded.features)[1]).toBe("no switches changed since that run");
 });
 it("compares the arm the run recorded",()=>{
  const seen:string[]=[];
  laneDriftLines("rayquaza-lane",{...recorded,arm:"control"},arm=>{seen.push(arm);return recorded.features;});
  expect(seen).toEqual(["control"]);
 });
 it("reports a lane with no recorded run",()=>{
  expect(laneDriftLines("rayquaza-lane",null,()=>({a:true}))).toEqual([`lane recipe rayquaza-lane: resolved bundle features sha256 ${featuresSha256({a:true})}; no recorded run`]);
 });
});

describe("laneDriftReport",()=>{
 it("prints nothing for a definition with no recipe or a complete recipe",()=>{
  expect(laneDriftReport(definition(),null,reads())).toEqual([]);
  expect(laneDriftReport(definition(),"current",reads({recipeText:()=>JSON.stringify({version:1,id:"current"})}))).toEqual([]);
 });
 it("reads the last run through the injected reads and compares it with the definition's arm",()=>{
  const lines=laneDriftReport(definition(),"rayquaza-lane",reads());
  expect(lines[0]).toContain("last recorded run new (lane-v2");
  expect(lines[1]).toContain("switches changed since that run:");
 });
});
