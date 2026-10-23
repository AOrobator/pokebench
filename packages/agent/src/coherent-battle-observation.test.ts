import {expect,it} from "vitest";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
const id="coherent-battle-observation-v1";
it("registers an appended server switch and preserves all historical OFF defaults",()=>{
 expect(SWITCHABLE_FEATURES.at(-15)).toBe(id);
 expect(SERVER_FEATURES.at(-5)).toBe(id);
 expect(featureInfo(id)).toMatchObject({group:"observation",needs:"transition-coherence-v1",switchable:true});
 const { [id]: omitted,...historical}=ALL_ON;
 expect(omitted).toBe(true);
 const features=presetFeatures(parsePlayPreset({version:2,id:"coherence-legacy",target:null,limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...historical,"state-only-decisions-v1":false}}));
 expect(features[id]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
 expect(playHarnessFeatures(features,null)).not.toContain(id);
 expect(playHarnessFeatures(ALL_ON,null).at(-13)).toBe(id);
 expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",")).toContain(id);
 expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(id);
 expect(dependencyProblems({...ALL_ON,"transition-coherence-v1":false})).toContain(`${id} needs transition-coherence-v1`);
});

// Native observations cross the actual typed tool boundary before reaching pi.
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {observeTool} from "./game-tools.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {parseEvent} from "./events.js";
import {RUN_START_META} from "../test-support/events.js";
import {parseGameState} from "./game-state.js";
import {Value} from "typebox/value";
import {Type} from "typebox";
const fixtureSchema=Type.Object({rows:Type.Array(Type.Object({observation:Type.Object({state_text:Type.String(),screenshot_base64:Type.String(),state:Type.Unknown()})}),{minItems:2,maxItems:2})});
it.each([false,true])("delivers and records exact native battle capture (repair %s)",async enabled=>{
 const raw:unknown=JSON.parse(readFileSync(new URL("../../../env/tests/env/fixtures/coherent-battle-native.json",import.meta.url),"utf8"));
 if(!Value.Check(fixtureSchema,raw))throw new Error("native fixture shape");
 const payload=raw.rows[enabled?1:0]?.observation;if(payload===undefined)throw new Error("native fixture row");
 const native=parseGameState(payload.state);
 const root=mkdtempSync(join(tmpdir(),"coherent-battle-delivery-"));
 try{
  const log=RunLog.create(root,"2026-10-21T11-10-00_native-repair-test");
  const recorder=new RunRecorder({log,frames:new FrameStore(root,1000000,()=>{}),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(native)},now:()=>0});
  await recorder.start({...RUN_START_META,harness_features:enabled?[id,"transition-coherence-v1"]:[]},false);
  await recorder.transformContext([]);
  await recorder.emit({type:"tool_execution_start",toolCallId:"native-capture",toolName:"observe",args:{}});
  const result=await observeTool("http://127.0.0.1:1",()=>Promise.resolve(new Response(JSON.stringify(payload),{status:200}))).execute("native-capture",{});
  expect(result.content.filter(part=>part.type==="text")).toEqual([{type:"text",text:payload.state_text}]);
  await recorder.emit({type:"tool_execution_end",toolCallId:"native-capture",toolName:"observe",result,isError:false});
  const context=[{role:"toolResult" as const,toolCallId:"native-capture",toolName:"observe",content:result.content,isError:false,timestamp:0}];
  expect(await recorder.transformContext(context)).toEqual(context);
  recorder.end("budget");
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(parseEvent);
  const recorded=events.filter(e=>e.type==="tool_result");
  expect(recorded).toHaveLength(1);expect(recorded[0]?.text).toBe(payload.state_text);
  expect(recorded[0]?.text.includes("Effective damage (")).toBe(enabled);
  const states=events.filter(e=>e.type==="state");expect(states).toHaveLength(1);
  const capturedState=states[0];
  expect(capturedState!==undefined&&"settle" in capturedState?capturedState.settle:undefined).toEqual(enabled?{frames:1,reason:"coherence"}:undefined);
 }finally{rmSync(root,{recursive:true,force:true});}
});
