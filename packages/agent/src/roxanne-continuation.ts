import type {ContextBudget,ContextBudgetState} from "./context-budget.js";
import {digest} from "./roxanne-campaign.js";
import type {Message} from "@mariozechner/pi-ai";
import type {FeatureSet} from "./features.js";
import {verifyRestoreBundle,insertReminder,type RestoreBundle,type ReminderReceipt} from "./roxanne-restore.js";

/** Single production preparation seam for baseline and candidate episodes. Never appends a boot task. */
export function prepareContinuation(features:FeatureSet,bundle:RestoreBundle,state:Buffer,history:readonly Message[],prefix:string,prompt:string,conversation?:readonly Message[],runtime?:{readonly systemPrompt:string;readonly toolsHash:string;readonly budget?:ContextBudget;readonly budgetState?:ContextBudgetState;readonly qualifiedRuntime?:{readonly sourceBundleHash:string;readonly systemPrompt:string;readonly toolsHash:string}}):{messages:readonly Message[];receipt:ReminderReceipt|null}{
 verifyRestoreBundle(bundle,state,history,prefix);
 const qualified=runtime?.qualifiedRuntime;
 if(qualified!==undefined&&qualified.sourceBundleHash!==digest(bundle))throw new Error("qualified runtime source bundle mismatch");
 if(bundle.conversationHash!==undefined&&(runtime?.systemPrompt!==(qualified?.systemPrompt??bundle.systemPrompt)||runtime.toolsHash!==(qualified?.toolsHash??bundle.toolsHash)))throw new Error("runtime prompt or tool definitions differ from qualified context");
 if(bundle.budgetHash!==undefined){
  if(runtime?.budget===undefined||runtime.budgetState===undefined||digest(runtime.budgetState)!==bundle.budgetHash)throw new Error("context budget restoration digest mismatch");
  runtime.budget.restore(runtime.budgetState);
 }
 if(bundle.conversationHash!==undefined&&(conversation===undefined||digest(conversation)!==bundle.conversationHash))throw new Error("persistent conversation digest mismatch");
 return insertReminder(conversation??history,features["roxanne-campaign-reminder-v1"],prompt);
}
/** Qualification must use a separately constructed production wiring instance: it consumes one-shot notes. */
export async function qualifyRestoredContext(reference:readonly Message[],persistent:readonly Message[],render:(history:readonly Message[])=>Promise<readonly Message[]>):Promise<{passed:true;referenceHash:string}>{
 const actual=await render(persistent);
 const normalize=(messages:readonly Message[])=>messages.map(m=>({...m,timestamp:0}));
 if(digest(normalize(actual))!==digest(normalize(reference)))throw new Error("restored production context differs from the frozen first-decision reference");
 return {passed:true,referenceHash:digest(normalize(reference))};
}
