// cut-off-reply-feedback-v1: after a reply that stopped at max_tokens before any tool call, the next message says so.
// The plain NUDGE never said the reply was cut off, so models began the same long reasoning again.
// Repeating one sentence did not stop the repeats either (the 2026-11-02 run cut off thirteen times, six of
// them on the same target), so the second and later notices in a row count themselves and drop the invitation
// to plan, leaving one tool call and its result as the only way forward.
import type {FeatureSet} from "./features.js";
import {playTools} from "./play-config.js";

export function cutOffReplyNotice(features:FeatureSet,maxTokens:number,repeats=1):string|undefined {
 if(!features["cut-off-reply-feedback-v1"])return undefined;
 const offered=playTools(features);
 const walk=["navigate_to_target","navigate_to"].filter(name=>offered.includes(name));
 const base=`Your last reply reached the output limit (${String(maxTokens)} tokens) before it made a tool call, so nothing happened in the game.`;
 const streak=repeats<=1?base:`${base} This is reply ${String(repeats)} in a row that reached the limit without a tool call: nothing in the game has changed since the first one, and no reply of this length will change it.`;
 const order=repeats<=1?"Make one tool call now.":`Do not work the route or the plan out in your reply this time: call exactly one tool now, read its result, then decide the next step from that. ${repeats>=3?"If you cannot choose, call observe, which returns the current state.":"One call is enough to continue."}`;
 const notice=`${streak} ${order}`;
 if(walk.length===0)return notice;
 const one=walk.length===1;
 return `${notice} To walk somewhere, call ${walk.join(" or ")}: ${one?"it works":"they work"} out the path from the game's map, so the route does not have to be worked out in your reply.`;
}
