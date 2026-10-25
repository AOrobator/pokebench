// cut-off-reply-feedback-v1: 11 GLM replies stopped at max_tokens with no tool call (2026-10-21T05-17-26_glm53-mac_ad34
// seq 13818, 14408, 14998 in a row). Each was followed by the plain NUDGE, which never says the reply was cut off.
import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import type {AssistantMessage,ToolResultMessage} from "@mariozechner/pi-ai";
import {Governor,NUDGE,TEXT_ONLY_REMINDER} from "./harness.js";
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

describe("decision probes rebuild the same follow-up",()=>{
 it("followUpText picks the recorded supervisor note first, then the notice for a cut-off reply, else NUDGE",()=>{
  expect(followUpText({seq:10,stop_reason:"length"},undefined,"CUT")).toBe("CUT");
  expect(followUpText({seq:10,stop_reason:"length"},undefined,undefined)).toBe(NUDGE);
  expect(followUpText({seq:10,stop_reason:"stop"},undefined,"CUT")).toBe(NUDGE);
  expect(followUpText({seq:10,stop_reason:"length"},{seq:11,text:"NOTE"},"CUT")).toBe("NOTE");
  expect(followUpText({seq:10,stop_reason:"length"},{seq:9,text:"OLD"},"CUT")).toBe("CUT");
 });
});

describe("production wiring",()=>{
 const source=(file:string)=>readFileSync(fileURLToPath(new URL(`./${file}`,import.meta.url)),"utf8");
 it("live.ts builds the Governor's notice from the FeatureSet and the run's max tokens",()=>{
  const live=source("live.ts");
  expect(live).toContain("const cutOff = cutOffReplyNotice(features,maxTokens);");
  const call=live.slice(live.indexOf("controlledRun("));
  expect(call.slice(0,call.indexOf("});"))).toContain("{ cutOffNotice: cutOff }");
 });
 it("decision probes pass the same notice, from the probed switches and the recorded max tokens, to both histories",()=>{
  const probe=source("decision-probe.ts");
  expect(probe).toContain("const cutOff = cutOffReplyNotice(features, start.sampling.max_tokens);");
  expect(probe.match(/conversation\(prior, goal, byId, notes, .*?, start\.model\.id, cutOff(?:,|\))/g)).toHaveLength(2);
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
