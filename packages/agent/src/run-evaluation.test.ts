import {describe,expect,it} from "vitest";
import {checkEvent} from "./events.js";
import {featuresSha256,runEvaluation} from "./run-evaluation.js";
import {presetFeatures,parsePlayPreset} from "./play-preset.js";
import {RUN_START} from "../test-support/events.js";
import {rayquazaLanePreset} from "../test-support/rayquaza-lane.js";

describe("featuresSha256",()=>{
 it("is independent of key order and sensitive to any value",()=>{
  expect(featuresSha256({a:true,b:false})).toBe(featuresSha256({b:false,a:true}));
  expect(featuresSha256({a:true,b:false})).not.toBe(featuresSha256({a:true,b:true}));
  expect(featuresSha256({a:true})).toMatch(/^[0-9a-f]{64}$/);
 });
});

describe("runEvaluation",()=>{
 const preset=parsePlayPreset(rayquazaLanePreset());
 const features=presetFeatures(preset);
 it("records the whole resolved switch list and its hash",()=>{
  const out=runEvaluation(preset,null,{failureLimit:3,replyFailuresEndRun:false},features,null);
  expect(out.features).toEqual(features);
  expect(out.features_sha256).toBe(featuresSha256(features));
  expect(out).toMatchObject({preset_id:preset.id,target:null,failure_limit:3,reply_failures_end_run:false});
 });
 it("is a valid run_start evaluation",()=>{
  const evaluation=runEvaluation(preset,null,{failureLimit:3},features,null);
  const event={...RUN_START,v:1,run:"r",seq:0,t:"2026-11-06T10:00:00.000-05:00",evaluation};
  expect(()=>checkEvent(event)).not.toThrow();
  expect(()=>checkEvent({...event,evaluation:{...evaluation,features_sha256:"short"}})).toThrow();
 });
 it("keeps the experiment and goal target when present",()=>{
  const experiment={id:"e",arm:"bundle",trial:1,of:1};
  const stopping={...preset,target:"STONE_BADGE",stopAt:"STONE_BADGE"};
  const out=runEvaluation(stopping,"STONE_BADGE",{failureLimit:3},features,experiment);
  expect(out).toMatchObject({experiment,goal_target:"STONE_BADGE",target:"STONE_BADGE"});
  expect(out).not.toHaveProperty("reply_failures_end_run");
 });
});
