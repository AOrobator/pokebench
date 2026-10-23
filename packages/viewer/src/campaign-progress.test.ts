import {expect,it} from "vitest";
import {Log,START,state,BASE_MS} from "../test-support/events.js";
import {RunView,DEPTH_ORDER} from "./model.js";
import {splits} from "./panels.js";
import {FRONTIER_MILESTONES} from "./frontier.js";
const progress={flags:"00".repeat(300),rustboro_stage:0,devon_stage:0,letter:false,variables:"00".repeat(512),avatar_flags:1};
it("recovers older beach arrivals but never repairs a missing modern campaign event",()=>{
 for(const native of [false,true]){
  const log=new Log();log.add(0,{...START,harness_features:native?["campaign-story-milestones-v1"]:["all-gym-story-milestones-v1"]});
  log.add(1000,state({map_id:[0,11],field_controls_locked:false,story_progress:progress}));
  log.add(2000,state({map_id:[0,24],position:{x:21,y:23},field_controls_locked:false,story_progress:progress}));
  const view=new RunView();for(const e of log.events)view.apply(e);
  expect(view.milestones.filter(m=>m.name==="ROUTE_109_BEACH_REACHED")).toHaveLength(native?0:1);
 }
});
it("renders optional achievements separately and excludes them from campaign frontier/depth",()=>{
 const log=new Log();log.add(0,{...START,harness_features:["campaign-story-milestones-v1"]});
 log.add(1000,{type:"milestone",turn:1,name:"HM_FLASH_RECEIVED",kind:"story",origin:"observed",evidence:[1],server_timestamp:1});
 const view=new RunView();for(const e of log.events)view.apply(e);
 const rendered=splits(view,null,BASE_MS+2000);
 expect(rendered.summary).toContain("0 reached");
 expect(rendered.table).toContain("Optional achievements · separate from campaign progress");
 expect(rendered.table.indexOf("Optional achievements")).toBeLessThan(rendered.table.indexOf("hm flash received"));
 expect(DEPTH_ORDER).not.toContain("HM_FLASH_RECEIVED");
 expect(FRONTIER_MILESTONES.some(m=>m.id==="HM_FLASH_RECEIVED")).toBe(false);
});
