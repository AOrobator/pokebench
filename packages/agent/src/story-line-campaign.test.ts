import {expect,it} from "vitest";
import {Type} from "typebox";
import type {AgentTool} from "@mariozechner/pi-agent-core";
import {checkEvent,type RunEvent} from "./events.js";
import {featureInfo,type FeatureSet} from "./features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {CampaignSteps,withStoryLineCampaign} from "./story-line-campaign.js";
import {SupervisorBriefing} from "./loop-supervisor.js";

let seq=0;
const milestone=(name:string,origin="observed",kind="story"):RunEvent=>checkEvent({v:1,run:"r",t:"2026-11-05T12:00:00.000-05:00",turn:1,seq:++seq,type:"milestone",name,server_timestamp:0,kind,origin});
const OLD="Story: player name confirmed; route104 cindy defeated";

it("appends every step the game confirmed after the readout's own list, whole and in order",()=>{
 const s=new CampaignSteps();
 s.observe(milestone("FEATHER_BADGE"));
 s.observe(milestone("FORTREE_GYM_COMPLETE"));
 expect(s.line(`Location: X\n${OLD}\nPlayer: A`)).toBe(`Location: X\n${OLD}; feather badge; fortree gym complete\nPlayer: A`);
});

it("repeats no step, and ignores steps not observed in this run, optional activities and other kinds",()=>{
 const s=new CampaignSteps();
 s.observe(milestone("FEATHER_BADGE"));s.observe(milestone("FEATHER_BADGE"));
 s.observe(milestone("WINONA_DEFEATED","present_at_start"));
 s.observe(milestone("ROUTE_121","observed","navigation"));
 expect(s.line(OLD)).toBe(`${OLD}; feather badge`);
});

it("replaces no-completion text, and leaves an unreadable story line and other text alone",()=>{
 const s=new CampaignSteps();s.observe(milestone("FEATHER_BADGE"));
 expect(s.line("Story: no completion confirmed")).toBe("Story: feather badge");
 expect(s.line("Story: unavailable (story state not readable right now)")).toBe("Story: unavailable (story state not readable right now)");
 expect(s.line("no line here")).toBe("no line here");
});

const tool:AgentTool={name:"observe",label:"o",description:"d",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:OLD}],details:{}})};
function wired(features:FeatureSet){
 const listeners:((e:RunEvent)=>void)[]=[];
 const tools=withStoryLineCampaign([tool],features,{subscribe:fn=>{listeners.push(fn);}});
 return {tools,emit:(e:RunEvent)=>{for(const l of listeners)l(e);}};
}
const textOf=async(t:AgentTool|undefined)=>{const r=await t?.execute("c",{});const p=r?.content[0];return p?.type==="text"?p.text:null;};

it("off: tools are the same tools and nothing is added",async()=>{
 const {tools,emit}=wired({...ALL_ON,"story-line-campaign-flags-v1":false});
 emit(milestone("FEATHER_BADGE"));
 expect(tools[0]).toBe(tool);
 expect(await textOf(tools[0])).toBe(OLD);
});

it("on: the production wrapper rewrites the Story line in the result",async()=>{
 const {tools,emit}=wired({...ALL_ON,"story-line-campaign-flags-v1":true});
 emit(milestone("FEATHER_BADGE"));
 expect(await textOf(tools[0])).toBe(`${OLD}; feather badge`);
});

it("registers the switch with an Off clause",()=>{
 expect(featureInfo("story-line-campaign-flags-v1").description).toContain(" Off: ");
});

it("on: the supervisor briefing lists each step once when the Story line already carries it",()=>{
 const features:FeatureSet={...ALL_ON,"story-briefing-native-milestones-v1":true,"story-line-campaign-flags-v1":true,"story-state-v1":true,"loop-guard-supervisor-v1":true};
 const b=new SupervisorBriefing(features);
 b.observe(milestone("FEATHER_BADGE"));
 b.observe(checkEvent({v:1,run:"r",t:"2026-11-05T12:00:00.000-05:00",turn:2,seq:++seq,type:"tool_result",id:"x",name:"observe",is_error:false,duration_ms:1,text:`${OLD}; feather badge`,frames:[]}));
 expect(b.stallText({kind:"interface_dwell",name:"menu",calls:30},30).match(/feather badge/g)).toHaveLength(1);
});
