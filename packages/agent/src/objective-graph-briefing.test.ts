import {describe,expect,it} from "vitest";
import {featuresOf} from "./features.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import type {RunEvent} from "./events.js";

const ID="objective-graph-supervisor-v1";
const milestone=(name:string):RunEvent=>({type:"milestone",turn:1,name,seq:1,kind:"story",origin:"observed",evidence:[1]} as unknown as RunEvent);
const LINE=/- Next milestone: .+ \([A-Z0-9_]+\)/;

function briefed(featureIds:readonly string[],...reached:string[]):string {
  const briefing=new SupervisorBriefing(featuresOf(featureIds));
  for(const name of reached)briefing.observe(milestone(name));
  return briefing.stallText({kind:"milestone_drought",minutes:5},3);
}

describe("a drought briefing under the objective graph",()=>{
  it("names the next objective by label and id when the switch is on",()=>{
    const text=briefed(["stall-briefing-v1",ID],"STONE_BADGE");
    const line=LINE.exec(text)?.[0]??"";
    expect(line).toContain("(");
    // The id in the line is a real catalog id, not a label with underscores thrown in.
    expect(line).toMatch(/\([A-Z][A-Z0-9_]+\)$/);
  });

  it("adds that line and nothing else to the briefing",()=>{
    const on=briefed(["stall-briefing-v1",ID],"STONE_BADGE");
    const off=briefed(["stall-briefing-v1"],"STONE_BADGE");
    expect(on.replace(`${LINE.exec(on)?.[0]??""}\n`,"")).toBe(off);
  });

  it("leaves the briefing exactly as it was when the switch is off",()=>{
    expect(briefed(["stall-briefing-v1"],"STONE_BADGE")).not.toContain("- Next milestone:");
  });

  it("names it in the turn-drought briefing too",()=>{
    const features=["turn-drought-clock-v1",ID];
    const briefing=new SupervisorBriefing(featuresOf(features));
    briefing.observe(milestone("STONE_BADGE"));
    expect(briefing.stallText({kind:"action_drought",actions:30},4)).toMatch(LINE);
  });

  it("says nothing when the graph is off but the hint arm is on, and vice versa",()=>{
    expect(briefed(["stall-briefing-v1","next-milestone-hint-v1"],"STONE_BADGE")).not.toMatch(LINE);
  });
});
