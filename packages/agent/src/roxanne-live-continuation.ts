import {createHash} from "node:crypto";
import type {GameStateSnapshot} from "./game-state.js";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import type {FeatureSet} from "./features.js";
import {FeatureSetSchema,normalizeFeatures} from "./play-preset.js";
import {recordedFeatures} from "./decision-probe.js";
import type {ContextBudget} from "./context-budget.js";
import {prepareContinuation} from "./roxanne-continuation.js";
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {Type} from "typebox";
import {Value} from "typebox/value";
import {digest} from "./roxanne-campaign.js";
import {parseRun} from "./decision-probe.js";
import {parseRestoredMessages,verifyRestoreBundle,type RestoreBundle} from "./roxanne-restore.js";
const closed={additionalProperties:false} as const;
const Sha=Type.String({pattern:"^[a-f0-9]{64}$"});
const Descriptor=Type.Object({directory:Type.String({minLength:1}),prompt:Type.String({maxLength:2500}),runtimeBaselineSha256:Type.Optional(Sha),frameRoot:Type.Optional(Type.String({minLength:1})),seed:Type.Integer({minimum:0,maximum:2147483647}),stopAt:Type.Optional(Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER}))},closed);
const RuntimeBaseline=Type.Object({version:Type.Literal(1),sourceBundleHash:Sha,sourceCommit:Type.String({pattern:"^[a-f0-9]{40}$"}),features:FeatureSetSchema,systemPrompt:Type.String({minLength:1}),tools:Type.Array(Type.Object({name:Type.String({minLength:1}),description:Type.String(),parameters:Type.Unknown()},closed),{minItems:1}),referenceHash:Sha,passed:Type.Literal(true)},closed);
const BudgetState=Type.Object({limit:Type.Integer({minimum:1}),sent:Type.Union([Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER}),Type.Null()]),anchor:Type.Union([Type.Object({weight:Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER}),tokens:Type.Integer({minimum:0,maximum:Number.MAX_SAFE_INTEGER}),basis:Type.Enum(["usage","overflow"])},closed),Type.Null()])},closed);
const Qualification=Type.Object({passed:Type.Literal(true),productionToolsMatch:Type.Literal(true)});
/** Pure disk preparation. Must finish before endpoint discovery or any model call. */
export function loadLiveContinuation(descriptor:unknown,read:(path:string)=>Buffer=readFileSync){
 if(!Value.Check(Descriptor,descriptor))throw new Error("invalid campaign continuation descriptor");
 const directory=resolve(descriptor.directory),text=(name:string)=>read(join(directory,name)).toString("utf8"),json=(name:string):unknown=>JSON.parse(text(name)) as unknown;
 if(!Value.Check(Qualification,json("continuation-qualification.json")))throw new Error("production continuation qualification missing");
 const statePath=join(directory,"checkpoint.state"),state=read(statePath),prefix=text("events-prefix.jsonl"),history=parseRestoredMessages(json("history.json")),value=json("bundle.json");
 verifyRestoreBundle(value,state,history,prefix);
 // verifyRestoreBundle validates the complete closed schema and every digest above.
 const bundle=value as RestoreBundle;
 if(bundle.conversationHash===undefined||bundle.budgetHash===undefined)throw new Error("persistent conversation and learned budget bindings required");
 const conversation=parseRestoredMessages(json("persistent-history.json")),budget=json("budget.json"),tools=json("tools.json");
 if(digest(conversation)!==bundle.conversationHash)throw new Error("persistent conversation digest mismatch");
 if(!Value.Check(BudgetState,budget)||digest(budget)!==bundle.budgetHash)throw new Error("learned context budget digest mismatch");
 if(digest(tools)!==bundle.toolsHash)throw new Error("source tools digest mismatch");
 const source=parseRun(prefix);if(source.events.some((e,i)=>e.run!==bundle.sourceRun||e.type==="run_end"||e.seq<=(source.events[i-1]?.seq??-1)))throw new Error("invalid continuation event provenance");
 const native=source.events.find(e=>e.seq===bundle.stateSeq);
 if(source.start.run!==bundle.sourceRun||source.start.harness.commit!==bundle.sourceCommit||source.start.system_prompt!==bundle.systemPrompt||native?.type!=="state"||!("started"in native)||native.raw_ram?.frame!==bundle.nativeReceipt.frame||native.map_id?.[0]!==11||native.map_id[1]!==3||native.in_battle)throw new Error("native source provenance or gym start mismatch");
 const originalFeatures=recordedFeatures(source);
 let runtime={features:originalFeatures,systemPrompt:bundle.systemPrompt,tools,sourceCommit:bundle.sourceCommit},restoreHash=digest(bundle);
 if(descriptor.runtimeBaselineSha256!==undefined){
  const bytes=read(join(directory,"runtime-baseline.json"));
  if(createHash("sha256").update(bytes).digest("hex")!==descriptor.runtimeBaselineSha256)throw new Error("runtime baseline digest mismatch");
  const baseline:unknown=JSON.parse(bytes.toString("utf8"));
  if(!Value.Check(RuntimeBaseline,baseline)||baseline.sourceBundleHash!==digest(bundle)||baseline.referenceHash!==digest(history.map(m=>({...m,timestamp:0}))))throw new Error("invalid qualified runtime baseline provenance");
  const features=normalizeFeatures(baseline.features),required=["move-learn-tool-v1","move-learn-offer-identity-v1"];
  if(required.some(key=>baseline.features[key as keyof typeof baseline.features]!==true)||Object.entries(features).some(([key,on])=>on!==(required.includes(key)?true:originalFeatures[key as keyof FeatureSet])))throw new Error("runtime migration changes unapproved features");
  runtime={features,systemPrompt:baseline.systemPrompt,tools:baseline.tools,sourceCommit:baseline.sourceCommit};restoreHash=digest({bundle,runtimeBaseline:baseline});
 }
 return {directory,statePath,state,prefix,history,conversation,budget,tools,bundle,source,runtime,restoreHash,...(descriptor.runtimeBaselineSha256===undefined?{}:{runtimeBaselineSha256:descriptor.runtimeBaselineSha256}),prompt:descriptor.prompt,seed:descriptor.seed,...(descriptor.frameRoot===undefined?{}:{frameRoot:resolve(descriptor.frameRoot)}),...(descriptor.stopAt===undefined?{}:{stopAt:descriptor.stopAt}),rtcMs:Math.round(bundle.rtcUnixMs)};
}

/** Reuse production event-memory restoration and consume historical one-shot notes once. */
export async function restoreLiveContinuation(loaded:ReturnType<typeof loadLiveContinuation>,features:FeatureSet,recorder:{restoreHistory:(beforeTurn:(turn:number)=>Promise<void>)=>Promise<void>},context:{transformContext:(messages:AgentMessage[])=>Promise<AgentMessage[]>},runtime:{systemPrompt:string;tools:readonly unknown[];budget?:ContextBudget}){
 validateLiveContinuationFeatures(loaded,features);
 await recorder.restoreHistory(async()=>{await context.transformContext([]);});
 return prepareContinuation(features,loaded.bundle,loaded.state,loaded.history,loaded.prefix,loaded.prompt,loaded.conversation,{systemPrompt:runtime.systemPrompt,toolsHash:digest(runtime.tools),...(runtime.budget===undefined?{}:{budget:runtime.budget,budgetState:loaded.budget}),...(loaded.runtimeBaselineSha256===undefined?{}:{qualifiedRuntime:{sourceBundleHash:digest(loaded.bundle),systemPrompt:loaded.runtime.systemPrompt,toolsHash:digest(loaded.runtime.tools)}})});
}
export function validateLiveContinuationFeatures(loaded:ReturnType<typeof loadLiveContinuation>,features:FeatureSet):void{
 if(digest({...features,"roxanne-campaign-reminder-v1":false})!==digest({...loaded.runtime.features,"roxanne-campaign-reminder-v1":false}))throw new Error("runtime features differ from qualified continuation");
}
export function liveContinuationFromEnv(env:Readonly<Record<string,string|undefined>>,read:(path:string)=>Buffer=readFileSync):ReturnType<typeof loadLiveContinuation>|null{
 const path=env["POKEBENCH_CAMPAIGN_CONTINUATION"];
 return path===undefined?null:loadLiveContinuation(JSON.parse(read(path).toString("utf8")) as unknown,read);
}

/** Reject a mismatched save before even discovering the model endpoint. */
export function validateLiveContinuationStart(loaded:ReturnType<typeof loadLiveContinuation>,start:{readonly kind:string;readonly path?:string;readonly sha1?:string}):void{
 if(start.kind!=="save_state"||start.path===undefined||resolve(start.path)!==loaded.statePath||start.sha1!==createHash("sha1").update(loaded.state).digest("hex"))throw new Error("campaign preset start differs from qualified checkpoint");
}
export function validateLiveContinuationModel(loaded:ReturnType<typeof loadLiveContinuation>,model:{readonly id:string;readonly contextWindow:number;readonly maxTokens:number},sampling:{readonly thinkingLevel:string;readonly maxTokens:number}):void{
 const original=loaded.source.start;
 if(model.id!==original.model.id||model.contextWindow!==original.model.context_window||model.maxTokens!==original.model.max_tokens||sampling.thinkingLevel!==original.sampling.thinking_level||sampling.maxTokens!==original.sampling.max_tokens)throw new Error("campaign model or sampling differs from source context");
}
/** A measurement anchor only: never dispatched into model memories as a new turn. */
export function captureContinuationStart(loaded:ReturnType<typeof loadLiveContinuation>,snapshot:GameStateSnapshot){
 const source=loaded.source.events.find(e=>e.seq===loaded.bundle.stateSeq);
 const capabilities=(state:GameStateSnapshot)=>state.party.map(p=>({identity:p.identity,species:p.species_id,level:p.level,moves:p.moves?.map(m=>m.move_id),diagnostic:p.diagnostic}));
 if(source?.type!=="state"||!("started"in source)||!("started"in snapshot)||!snapshot.started||snapshot.raw_ram===undefined||snapshot.in_battle||digest(snapshot.map_id)!==digest(source.map_id)||digest(snapshot.position)!==digest(source.position)||digest(capabilities(snapshot))!==digest(capabilities(source)))throw new Error("live predecision native state differs from qualified start");
 return {snapshot,historyMessages:loaded.conversation.length,restoreHash:loaded.restoreHash,stateSha1:createHash("sha1").update(loaded.state).digest("hex")};
}

/** Controlled seed is identical across matched arms; retain the exact outgoing body. */
export function continuationPayload(seed:number,payload:unknown,retain:(body:string)=>void):unknown{
 if(typeof payload!=="object"||payload===null||Array.isArray(payload))throw new Error("invalid campaign request payload");
 const body={...payload,seed};retain(JSON.stringify(body));return body;
}
