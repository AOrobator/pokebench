// reasoning-effort-request-v1: pi's qwen-chat-template format sends only enable_thinking and preserve_thinking,
// so a served template falls back to its own default effort (xhigh on Qwen3.8, Max on GLM-5.3). The effort goes in
// chat_template_kwargs because vLLM's /tokenize, which sizes the context, ignored the top-level reasoning_effort.
import type {FeatureSet} from "./features.js";

export function sentEffort(features:Pick<FeatureSet,"reasoning-effort-request-v1">,thinking:string):string|null {
 return features["reasoning-effort-request-v1"]&&thinking!=="off"?thinking:null;
}

// Every request gets it, so run_start's record of what requests carry holds for any body.
export function withReasoningEffort(payload:unknown,effort:string):unknown {
 if(typeof payload!=="object"||payload===null)return payload;
 const kwargs="chat_template_kwargs" in payload&&typeof payload.chat_template_kwargs==="object"?payload.chat_template_kwargs:{};
 return {...payload,chat_template_kwargs:{...kwargs,reasoning_effort:effort}};
}
