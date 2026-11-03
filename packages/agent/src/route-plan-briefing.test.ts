import {describe,expect,it} from "vitest";
import {featuresOf} from "./features.js";
import {SupervisorBriefing} from "./loop-supervisor.js";
import {ROUTE_PLAN} from "./route-plan.js";
import type {RunEvent} from "./events.js";

const ID="story-route-plan-v1";
const milestone=(name:string,turn:number):RunEvent=>({type:"milestone",turn,name,seq:turn,kind:"story",origin:"observed",evidence:[1]} as unknown as RunEvent);
const turn=(at:number):RunEvent=>({type:"turn_start",turn:at,seq:at} as unknown as RunEvent);
const LINE=/- Position on the route: step \d+ of \d+ in .+; next waypoint: .+ \([A-Z0-9_]+\)(; off-plan since turn \d+)?/;

function briefed(featureIds:readonly string[],events:readonly RunEvent[]):string {
  const briefing=new SupervisorBriefing(featuresOf(featureIds));
  for(const event of events)briefing.observe(event);
  return briefing.stallText({kind:"milestone_drought",minutes:5},3);
}

describe("the route line in a briefing",()=>{
  it("stays out of the opening, where the hint arm answers",()=>{
    expect(briefed(["stall-briefing-v1",ID],[turn(40)])).not.toContain("Position on the route");
  });

  it("gives the step, the area, the waypoint and the drought date",()=>{
    const text=briefed(["stall-briefing-v1",ID],[milestone("STONE_BADGE",1552),turn(2210)]);
    const line=LINE.exec(text)?.[0]??"";
    expect(line).toContain(`step 2 of ${String(ROUTE_PLAN.length)} in Rusturf Tunnel`);
    expect(line).toContain("(DEVON_GOODS_RECOVERED)");
    expect(line).toContain("off-plan since turn 1552");
  });

  it("adds that line and nothing else",()=>{
    const events=[milestone("STONE_BADGE",1552),turn(2210)];
    const on=briefed(["stall-briefing-v1",ID],events);
    const off=briefed(["stall-briefing-v1"],events);
    expect(on.replace(`${LINE.exec(on)?.[0]??""}\n`,"")).toBe(off);
  });

  it("leaves the briefing exactly as it was with the switch off",()=>{
    expect(briefed(["stall-briefing-v1"],[milestone("STONE_BADGE",1552),turn(2210)])).not.toContain("Position on the route");
  });

  it("says nothing once the plan is finished",()=>{
    const events=ROUTE_PLAN.map((step,index)=>milestone(step.objective,index*10));
    expect(briefed(["stall-briefing-v1",ID],events)).not.toContain("Position on the route");
  });
});
