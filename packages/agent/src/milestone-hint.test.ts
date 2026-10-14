import {expect,it} from "vitest";
import type {AgentMessage} from "@mariozechner/pi-agent-core";
import {MILESTONE_HINTS,NextMilestoneHint,nextMilestoneHint} from "./milestone-hint.js";
import {MILESTONES} from "./milestones.js";
import {ALL_ON,featureInfo,stateOnlyProblems} from "./features.js";
import {playSystemPrompt,playTools} from "./play-config.js";
import {checkEvent,type RunEvent} from "./events.js";

const ev=(body:Record<string,unknown>,seq:number,turn=1):RunEvent=>checkEvent({v:1,run:"hint-test",t:"2026-10-14T12:00:00.000-04:00",turn,seq,...body});
const milestone=(name:string,seq:number,origin="observed")=>ev({type:"milestone",name,server_timestamp:1,kind:"story",origin,evidence:[seq-1]},seq);
const text=async(h:NextMilestoneHint)=>{const out=await h.tool().execute("t",{});const first=out.content[0];if(first?.type!=="text")throw Error("text");return first.text;};

it("follows the main story path in the order a human playthrough earned it, using native milestone names",()=>{
 const names=MILESTONE_HINTS.map(h=>h.name);
 for(const name of names)expect(MILESTONES.some(m=>m.name===name)).toBe(true);
 expect(new Set(names).size).toBe(names.length);
 expect(names.indexOf("CLOCK_SET")).toBeLessThan(names.indexOf("RIVAL_HOUSE_ENTERED"));
 expect(names.indexOf("RIVAL_MET")).toBeLessThan(names.indexOf("STARTER_CHOSEN"));
 expect(names.at(-1)).toBe("STONE_BADGE");
 for(const h of MILESTONE_HINTS)expect(h.goal.length).toBeGreaterThan(5);
});

it("names the first milestone not yet earned, counting milestones already present at a checkpoint start",async()=>{
 const h=new NextMilestoneHint();
 expect(await text(h)).toContain("Start a new game");
 for(const [i,name] of ["NEW_GAME_CREATED","PLAYER_NAME_CONFIRMED","FIRST_TRUCK_EXIT","PLAYER_HOUSE_ENTERED","MOM_CLOCK_INSTRUCTION","PLAYER_BEDROOM","CLOCK_SET"].entries())h.observe(milestone(name,i+2,"present_at_start"));
 const next=MILESTONE_HINTS.find(m=>m.name==="MOM_RIVAL_INSTRUCTION");
 expect(await text(h)).toContain(next?.goal);
 expect(await text(h)).toMatch(/7 of \d+ main story milestones/);
});

it("queues one message when a main-path milestone is earned, saying what was achieved and what is next",()=>{
 const h=new NextMilestoneHint();
 h.observe(milestone("CLOCK_SET",2,"present_at_start"));
 expect(h.take()).toBeNull();
 h.observe(milestone("MOM_RIVAL_INSTRUCTION",3));
 h.observe(milestone("ROUTE_102_TRAINER_RICK_DEFEATED",4));
 const message=h.take();
 expect(message).toContain("MILESTONE REACHED");
 expect(message).toContain(MILESTONE_HINTS.find(m=>m.name==="MOM_RIVAL_INSTRUCTION")?.done);
 expect(message).toContain("Next milestone:");
 expect(h.take()).toBeNull();
 h.observe(milestone("MOM_RIVAL_INSTRUCTION",5));
 expect(h.take()).toBeNull();
});

it("says when every main-path milestone is done",async()=>{
 const h=new NextMilestoneHint();
 for(const [i,m] of MILESTONE_HINTS.entries())h.observe(milestone(m.name,i+2));
 expect(await text(h)).toContain("every main story milestone in this list is done");
});

it("delivers the queued message once, records it, and passes context through otherwise",async()=>{
 const subscribers:((e:RunEvent)=>void)[]=[];const recorded:{text:string;milestone:string}[]=[];
 const recorder={subscribe:(fn:(e:RunEvent)=>void)=>{subscribers.push(fn);},recordMilestoneHint:(body:{text:string;milestone:string})=>{recorded.push(body);}};
 expect(nextMilestoneHint({...ALL_ON,"next-milestone-hint-v1":false},recorder,m=>Promise.resolve(m))).toBeNull();
 const wired=nextMilestoneHint({...ALL_ON,"next-milestone-hint-v1":true},recorder,m=>Promise.resolve(m));
 if(wired===null)throw Error("wired");
 expect(wired.tool.name).toBe("get_next_milestone");
 expect(await wired.transformContext([])).toEqual([]);
 for(const fn of subscribers)fn(milestone("NEW_GAME_CREATED",2));
 const out:AgentMessage[]=await wired.transformContext([]);
 expect(JSON.stringify(out.at(-1))).toContain("MILESTONE REACHED");
 expect(recorded).toHaveLength(1);expect(recorded[0]?.milestone).toBe("NEW_GAME_CREATED");
 expect(()=>checkEvent({v:1,run:"r",t:"2026-10-14T12:00:00.000-04:00",turn:1,seq:9,type:"milestone_hint",...recorded[0]})).not.toThrow();
 expect(await wired.transformContext([])).toEqual([]);
});

it("registers a separate hint switch with its tool, prompt line and state-only exclusion",()=>{
 expect(featureInfo("next-milestone-hint-v1")).toMatchObject({group:"guidance",needs:null,switchable:true});
 const on={...ALL_ON,"next-milestone-hint-v1":true},off={...ALL_ON,"next-milestone-hint-v1":false};
 expect(playTools(on)).toContain("get_next_milestone");expect(playTools(off)).not.toContain("get_next_milestone");
 expect(playSystemPrompt(on,null)).toContain("get_next_milestone");expect(playSystemPrompt(off,null)).not.toContain("get_next_milestone");
 expect(stateOnlyProblems({...ALL_ON,"state-only-decisions-v1":true})).toContain("state-only-decisions-v1 requires next-milestone-hint-v1 OFF");
});
