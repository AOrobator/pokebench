// presence-penalty-v1: Qwen3.6-35B-A3B's model card recommends presence_penalty 1.5 for thinking
// mode on general tasks (temperature 1.0, top_p 0.95, top_k 20, min_p 0); the serving lane's
// default is 0. llama-server reads presence_penalty from an OpenAI chat request and lists it in
// /props default_generation_settings.params.
import type {FeatureSet} from "./features.js";

export const PRESENCE_PENALTY=1.5;

export interface SamplingExtras {readonly presence_penalty?:number}

export function samplingExtras(features:FeatureSet):SamplingExtras {
 return features["presence-penalty-v1"]?{presence_penalty:PRESENCE_PENALTY}:{};
}

// What run_start records under sampling: the value sent, only when it is sent.
export function playSampling(features:FeatureSet,thinking:string,maxTokens:number):{thinking_level:string;max_tokens:number}&SamplingExtras {
 return {thinking_level:thinking,max_tokens:maxTokens,...samplingExtras(features)};
}
