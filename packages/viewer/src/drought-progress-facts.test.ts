import {expect,it} from "vitest";
import {BASE_MS,Log,START} from "../test-support/events.js";
import {RunView} from "./model.js";
import {eventText,inspector} from "./panels.js";
import {lanesSvg} from "./timeline.js";
const HELD="Not sent (drought-progress-facts-v1): the active drought clock reached 5 minutes of play, but a battle is on screen.";
it("keeps the new held-drought diagnostic in history and inspection without a timeline error mark",()=>{
 const log=new Log();log.add(0,START);
 const held=log.add(100,{type:"loop_guard",turn:278,kind:"milestone_drought",message:HELD,calls:0,evidence:[26726,26728],mode:"diagnostic",phase:"would_warn"});
 const v=new RunView();for(const e of log.events)v.apply(e);
 if(held.type!=="loop_guard")throw Error("wrong event");
 expect(eventText(held,v)).toContain("a battle is on screen");expect(inspector(held)).toContain("drought-progress-facts-v1");
 expect(v.errors).toEqual([]);expect(lanesSvg(v,BASE_MS+1000)).not.toContain("k-loop");
});
it("preserves existing timeline behavior for delivered notes and unrelated diagnostics",()=>{
 for(const extra of [{mode:"enforced",phase:"supervisor"},{mode:"diagnostic",phase:"would_stop"}] as const){
  const log=new Log();log.add(0,START);log.add(100,{type:"loop_guard",turn:278,kind:"milestone_drought",message:HELD,calls:0,evidence:[26726,26728],...extra});
  const v=new RunView();for(const e of log.events)v.apply(e);expect(v.errors).toHaveLength(1);
 }
});
