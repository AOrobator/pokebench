import type {AgentLoopConfig} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import type {Governor} from "./harness.js";
import type {RunRecorder} from "./recorder.js";
import {CONTEXTUAL_CONTROLS,playGoal,toolSwitches} from "./play-config.js";
import {stateDecisions} from "./state-decision.js";
import {decisionActions,readDecisionSnapshot} from "./state-decision-adapter.js";
export {stateOnlyProblems} from "./features.js";
import {stateOnlyProblems} from "./features.js";
export function stateOnlyPrompt(features:FeatureSet,target:string|null):string{
 return `You play Pokémon Emerald. ${playGoal(target)}\n\nYou receive a fresh snapshot of the current screen and game-state readout before every decision. No conversation history is supplied. Choose exactly one act action: press 1–8 buttons in order, or wait 1–2000 milliseconds of host time without pressing buttons. Waiting allows time to pass but does not guarantee frame progression; inspect the next snapshot. Use current evidence, not assumptions from earlier decisions.\n\n${features["contextual-interface-docs-v1"]?CONTEXTUAL_CONTROLS.replaceAll("observe again","choose wait to let the transition progress"):"A confirms or interacts; B cancels or dismisses ordinary dialogue. Controls depend on the current screen."}`;
}
interface StateRuntimeOptions{
 readonly features:FeatureSet;readonly target:string|null;readonly serverUrl:string;readonly recorder:RunRecorder;
 readonly governor:Governor;readonly base:AgentLoopConfig;readonly signal:AbortSignal;readonly gate:(signal?:AbortSignal)=>Promise<void>;readonly inputEpoch?:()=>number;
}
export function runStateMode(options:StateRuntimeOptions){
 const {recorder,serverUrl,features}=options;const problems=stateOnlyProblems(features);
 if(problems.length)throw new Error(problems.join("; "));
 return stateDecisions({systemPrompt:stateOnlyPrompt(features,options.target),goal:playGoal(options.target),base:options.base,governor:options.governor,signal:options.signal,gate:options.gate,...(options.inputEpoch===undefined?{}:{inputEpoch:options.inputEpoch}),readSnapshot:signal=>readDecisionSnapshot(serverUrl,fetch,signal),recordSnapshot:snapshot=>{recorder.recordDecisionSnapshot(snapshot);return Promise.resolve();},execute:decisionActions(serverUrl,{beforePress:(id,buttons,timing,before)=>{recorder.buttonPress(id,buttons,timing,before);},afterPress:()=>recorder.afterPress(),beforeWait:(id,ms)=>{recorder.recordWaitInput(id,ms);}},fetch,undefined,toolSwitches(features)),transformContext:recorder.transformContext,emit:recorder.emit});
}
