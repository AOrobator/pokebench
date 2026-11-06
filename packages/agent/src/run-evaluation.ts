import {createHash} from "node:crypto";
import type {BodyOf} from "./events.js";
import {presetFlags,type PlayPreset} from "./play-preset.js";

type Evaluation=NonNullable<BodyOf<"run_start">["evaluation"]>;
// Sorted so the digest names the switch settings, not the order a recipe happened to list them.
export function featuresSha256(features:Readonly<Record<string,boolean>>):string {
 const entries=Object.entries(features).sort(([a],[b])=>a<b?-1:a>b?1:0);
 return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}
export function runEvaluation(preset:PlayPreset,target:string|null,limits:{readonly failureLimit:number;readonly replyFailuresEndRun?:boolean},features:Readonly<Record<string,boolean>>,experiment:Evaluation["experiment"]|null):Evaluation {
 return {preset_id:preset.id,target,...(preset.stopAt===undefined?{}:{goal_target:preset.target}),failure_limit:limits.failureLimit,...(limits.replyFailuresEndRun===undefined?{}:{reply_failures_end_run:limits.replyFailuresEndRun}),flags:presetFlags(preset),features:{...features},features_sha256:featuresSha256(features),...(experiment===null||experiment===undefined?{}:{experiment})};
}
