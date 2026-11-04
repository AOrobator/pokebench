// cut-off-reply-feedback-v1: 11 GLM replies stopped at max_tokens with no tool call (2026-10-21T05-17-26_glm53-mac_ad34
// seq 13818, 14408, 14998 in a row). Each was followed by the plain NUDGE, which never says the reply was cut off.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import type {AssistantMessage,ToolResultMessage} from "@mariozechner/pi-ai";
import {Governor,NUDGE,TEXT_ONLY_REMINDER,withoutTextOnlyReplies} from "./harness.js";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {cutOffReplyNotice} from "./cut-off-reply.js";
import {followUpText} from "./decision-probe.js";
import {ALL_ON as GYM_EVIDENCE_CURRENT_ALL_ON,SWITCHABLE_FEATURES,type FeatureSet} from "./features.js";
const ALL_ON={...GYM_EVIDENCE_CURRENT_ALL_ON,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false};

const ID="cut-off-reply-feedback-v1" as const;
const OFF=Object.fromEntries(SWITCHABLE_FEATURES.map(id=>[id,false])) as FeatureSet;
const reply=(stopReason:AssistantMessage["stopReason"],calls=0):AssistantMessage=>({role:"assistant",content:[{type:"thinking",thinking:"(0,0) (1,0) (2,0) …"},...Array.from({length:calls},(_,i)=>({type:"toolCall" as const,id:`c${String(i)}`,name:"observe",arguments:{}}))],api:"openai-completions",provider:"gateway",model:"m",usage:{input:0,output:4096,cacheRead:0,cacheWrite:0,totalTokens:4096,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason,timestamp:0});
const ok:ToolResultMessage[]=[{role:"toolResult",toolCallId:"c0",toolName:"observe",content:[{type:"text",text:"Screen: overworld"}],isError:false,timestamp:0}];
function governor(extra:Partial<ConstructorParameters<typeof Governor>[0]>={}){
 const retries:string[]=[];
 const g=new Governor({limits:{maxTurns:100,maxWallMs:3_600_000,failureLimit:3},retry:(why)=>{retries.push(why);},abort:()=>undefined,now:()=>0,...extra});
 return {g,retries};
}
const next=async(g:Governor)=>(await g.followUps()).map(m=>"content" in m?m.content:"");

describe("cutOffReplyNotice",()=>{
 it("OFF: no notice",()=>{expect(cutOffReplyNotice(OFF,4096)).toBeUndefined();});
 it("ON: says the reply hit the output limit before any tool call and names the walking tools the run has",()=>{
  expect(cutOffReplyNotice({...ALL_ON,[ID]:true},4096)).toBe("Your last reply reached the output limit (4096 tokens) before it made a tool call, so nothing happened in the game. Make one tool call now. To walk somewhere, call navigate_to_target or navigate_to: they work out the path from the game's map, so the route does not have to be worked out in your reply.");
  expect(cutOffReplyNotice({...OFF,[ID]:true,"bounded-navigation-v1":true},2048)).toBe("Your last reply reached the output limit (2048 tokens) before it made a tool call, so nothing happened in the game. Make one tool call now. To walk somewhere, call navigate_to: it works out the path from the game's map, so the route does not have to be worked out in your reply.");
  expect(cutOffReplyNotice({...OFF,[ID]:true},4096)).toBe("Your last reply reached the output limit (4096 tokens) before it made a tool call, so nothing happened in the game. Make one tool call now.");
 });
});

describe("Governor",()=>{
 it("OFF (no notice): a cut-off reply gets the usual NUDGE, as before",async()=>{
  const {g,retries}=governor();
  g.afterTurn(reply("length"),[]);
  expect(await next(g)).toEqual([NUDGE]);
  expect(retries).toEqual(["reply hit max_tokens"]);
 });
 it("ON: a cut-off reply with no tool call gets the notice; a text-only reply still gets NUDGE; the failure count is unchanged",async()=>{
  const notice=cutOffReplyNotice({...ALL_ON,[ID]:true},4096) ?? "";
  const {g,retries}=governor({cutOffNotice:notice});
  g.afterTurn(reply("length"),[]);
  expect(await next(g)).toEqual([notice]);
  g.afterTurn(reply("stop"),[]);
  expect(await next(g)).toEqual([NUDGE]);
  expect(retries).toEqual(["reply hit max_tokens","text-only reply"]);
  g.afterTurn(reply("length",1),ok);
  expect(await next(g)).toEqual([]);
 });
 it("ON: the due supervisor receives the cut-off cause along with its briefing",async()=>{
  const notice="CUT";
  const {g}=governor({cutOffNotice:notice,textOnlySupervisor:(r,n,cut)=>[cut,`NOTE ${String(r)} ${String(n)}`].filter(Boolean).join("\n"),textOnlyReminder:TEXT_ONLY_REMINDER});
  g.afterTurn(reply("length"),[]);expect(await next(g)).toEqual([notice]);
  g.afterTurn(reply("length"),[]);expect(await next(g)).toEqual([notice]);
  g.afterTurn(reply("length"),[]);expect(await next(g)).toEqual(["CUT\nNOTE 3 1"]);
 });
});

describe("the notice counts the cut-offs in a row",()=>{
 const ON={...ALL_ON,[ID]:true};
 it("the second and later notices say how many replies in a row have now been cut off",()=>{
  const one=cutOffReplyNotice(ON,8192)??"";
  const two=cutOffReplyNotice(ON,8192,2)??"";
  const three=cutOffReplyNotice(ON,8192,3)??"";
  expect(one).not.toContain("in a row");
  expect(two).toContain("This is reply 2 in a row that reached the limit without a tool call");
  expect(two).not.toContain("Make one tool call now.");
  expect(two).toContain("call exactly one tool now");
  expect(three).toContain("This is reply 3 in a row");
  expect(three).toContain("If you cannot choose, call observe, which returns the current state.");
 });
 it("the Governor walks 1, 2, 3 and a reply that makes a tool call resets the count",async()=>{
  // The third length reply reaches the default failure bound and stops the run, so the reset would be
  // asserted against a dead Governor. Raise the bound here: this test is about the streak, not the stop.
  const {g}=governor({cutOffNotice:(repeats)=>cutOffReplyNotice(ON,8192,repeats)??"",limits:{maxTurns:100,maxWallMs:3_600_000,failureLimit:10}});
  g.afterTurn(reply("length"),[]);
  expect((await next(g))[0] as string).not.toContain("in a row");
  g.afterTurn(reply("length"),[]);
  expect((await next(g))[0] as string).toContain("This is reply 2 in a row");
  g.afterTurn(reply("length",1),ok);
  expect(await next(g)).toEqual([]);
  g.afterTurn(reply("length"),[]);
  const reset=(await next(g))[0] as string;
  expect(reset).toContain("reached the output limit");
  expect(reset).not.toContain("in a row");
 });
 it("the truncated reply is not sent back on the retry: fresh-retry-v1 drops every reply that made no tool call",()=>{
  const task:AgentMessage={role:"user",content:"play",timestamp:0};
  const cut:AgentMessage=reply("length");
  const kept:AgentMessage=reply("length",1);
  expect(withoutTextOnlyReplies([task,cut])).toEqual([task]);
  expect(withoutTextOnlyReplies([task,cut,kept])).toEqual([task,kept]);
 });
});

describe("decision probes rebuild the same follow-up",()=>{
 it("followUpText picks the recorded supervisor note first, then the notice for a cut-off reply, else NUDGE",()=>{
  expect(followUpText({seq:10,stop_reason:"length"},undefined,"CUT")).toBe("CUT");
  expect(followUpText({seq:10,stop_reason:"length"},undefined,undefined)).toBe(NUDGE);
  expect(followUpText({seq:10,stop_reason:"stop"},undefined,"CUT")).toBe(NUDGE);
  expect(followUpText({seq:10,stop_reason:"length"},{seq:11,text:"NOTE"},"CUT")).toBe("NOTE");
  expect(followUpText({seq:10,stop_reason:"length"},{seq:9,text:"OLD"},"CUT")).toBe("CUT");
 });
});

it("replayed supervisor notes honor the target cut-off switch while recorded notes retain exact history",()=>{
 const reply={seq:10,stop_reason:"length"};
 const onNote={seq:11,text:"CUT\nNOTE"};
 expect(followUpText(reply,onNote,undefined)).toBe("CUT\nNOTE");
 expect(followUpText(reply,onNote,undefined,{cutOff:"CUT"})).toBe("NOTE");
 expect(followUpText(reply,{seq:11,text:"NOTE"},"CUT",{cutOff:undefined})).toBe("CUT\nNOTE");
 expect(followUpText(reply,onNote,"CUT",{cutOff:"CUT"})).toBe("CUT\nNOTE");
 expect(followUpText(reply,{seq:11,text:"OTHER NOTE"},undefined,{cutOff:"CUT"})).toBe("OTHER NOTE");
 expect(followUpText({seq:10,stop_reason:"stop"},{seq:11,text:"NOTE"},"CUT",{cutOff:undefined})).toBe("NOTE");
});
