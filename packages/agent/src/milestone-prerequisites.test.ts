import {expect,it} from "vitest";
import {IN_GAME} from "../test-support/events.js";
import {parseGameState,type GameStateSnapshot} from "./game-state.js";
import {StateMilestones,qualifiedNativeMilestone} from "./milestones.js";
import {checkEvent} from "./events.js";
import {progressReached} from "./story-progress.js";

function harbor(unlocked=false):GameStateSnapshot {
 const flags=Buffer.alloc(300);if(unlocked)flags[0x6f>>3]=1<<(0x6f&7);
 return parseGameState({...IN_GAME,location:"SLATEPORT CITY HARBOR",map_id:[9,9],story_progress:{flags:flags.toString("hex"),rustboro_stage:0,devon_stage:0,letter:false}});
}
it("requires the Magma Hideout conclusion in addition to entering the harbor",()=>{
 expect(progressReached("SLATEPORT_HARBOR",harbor())).toBe(false);
 expect(progressReached("SLATEPORT_HARBOR",harbor(true))).toBe(true);
 expect(progressReached("SLATEPORT_HARBOR",{...harbor(true),map_id:[0,1]})).toBe(false);
 expect(progressReached("SLATEPORT_HARBOR",{...harbor(),story_progress:null})).toBeNull();
 expect(progressReached("SLATEPORT_HARBOR",{...harbor(true),screen:"field_transition"})).toBeNull();
});
it("records the newly qualified visit once, without backdating an early visit",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(harbor())});
 expect(tracker.observe(harbor(),1).filter(m=>m.name==="SLATEPORT_HARBOR")).toEqual([]);
 expect(tracker.observe(harbor(true),2).filter(m=>m.name==="SLATEPORT_HARBOR")).toEqual([expect.objectContaining({name:"SLATEPORT_HARBOR",origin:"observed",evidence:[2]})]);
 expect(tracker.observe(harbor(true),3).filter(m=>m.name==="SLATEPORT_HARBOR")).toEqual([]);
});
it("uses checkpoint-native prerequisites without inventing an earlier earned milestone",()=>{
 const tracker=new StateMilestones({read:()=>Promise.resolve(harbor(true))});tracker.initialize("save_state");
 expect(tracker.observe(harbor(true),1).find(m=>m.name==="SLATEPORT_HARBOR")).toMatchObject({origin:"present_at_start"});
 const unknown=new StateMilestones({read:()=>Promise.resolve(harbor())});unknown.initialize("save_state");
 unknown.observe({...harbor(),story_progress:null},1);
 expect(unknown.observe(harbor(true),2).find(m=>m.name==="SLATEPORT_HARBOR")).toMatchObject({origin:"present_at_start"});
});
it.each([false,true])("qualifies historical native harbor evidence only with prerequisite %s",unlocked=>{
 const s=checkEvent({v:1,run:"r",seq:1,t:"2026-10-25T12:00:00.000-04:00",type:"state",turn:1,...harbor(unlocked)});
 const m=checkEvent({v:1,run:"r",seq:2,t:"2026-10-25T12:00:01.000-04:00",type:"milestone",turn:1,name:"SLATEPORT_HARBOR",kind:"navigation",origin:"observed",evidence:[1],server_timestamp:1});
 if(m.type!=="milestone")throw Error("fixture milestone");
 expect(qualifiedNativeMilestone(m,[s])).toBe(unlocked);
});
