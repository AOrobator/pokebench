// cut-off-reply-feedback-v1: after a reply that stopped at max_tokens before any tool call, the next message says so.
// The plain NUDGE never said the reply was cut off, so models began the same long reasoning again.
import type {FeatureSet} from "./features.js";
import {playTools} from "./play-config.js";

export function cutOffReplyNotice(features:FeatureSet,maxTokens:number):string|undefined {
 if(!features["cut-off-reply-feedback-v1"])return undefined;
 const offered=playTools(features);
 const walk=["navigate_to_target","navigate_to"].filter(name=>offered.includes(name));
 const base=`Your last reply reached the output limit (${String(maxTokens)} tokens) before it made a tool call, so nothing happened in the game. Make one tool call now.`;
 if(walk.length===0)return base;
 const one=walk.length===1;
 return `${base} To walk somewhere, call ${walk.join(" or ")}: ${one?"it works":"they work"} out the path from the game's map, so the route does not have to be worked out in your reply.`;
}
