import {recipeText} from "../test-support/recipe-text.js";
import {expect,it} from "vitest";
import {BASE_MS,Log,START} from "../test-support/events.js";
import {RunView} from "./model.js";
import {eventText,inspector} from "./panels.js";
import {lanesSvg} from "./timeline.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";

const ID="milestone-drought-suppression-v1";
it("keeps suppressed droughts visible as diagnostics, without timeline marks or error counts",()=>{
 const log=new Log();log.add(0,START);
 const n=log.add(100,{type:"loop_guard",turn:313,kind:"milestone_drought",message:`Not sent (${ID}): No new story milestone for 5 minutes of play.`,calls:0,evidence:[24542],mode:"diagnostic",phase:"would_warn"});
 const v=new RunView();for(const e of log.events)v.apply(e);
 expect(eventText(n,v)).toContain(ID);expect(inspector(n)).toContain("would_warn");
 expect(v.errors).toEqual([]);expect(lanesSvg(v,BASE_MS+1000)).not.toContain("k-loop");
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
});
it("registers an unqueued one-switch experiment and enables only the current bundle arms",()=>{
 const read=(path:string):unknown=>JSON.parse(recipeText(new URL(`../../../${path}`,import.meta.url),"utf8"));
 for(const name of ["bundle-v-control","bundle-cook-1h","whole-map-cook-1h","whole-map-pair-2h","bundle-v-control-2h","glm53-flash-4h"]){
  const f=read(`experiments/fixed/${name}.json`) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[];offInBoth:string[]};
  expect(f.base.features[ID],name).toBe(false);expect(f.switches.indexOf(ID),name).toBeGreaterThan(f.switches.indexOf("berry-readout-v1"));
  expect(f.onInBoth,name).not.toContain(ID);expect(f.offInBoth,name).not.toContain(ID);
  expect(f.base.features["positive-supervisor-v1"],name).toBe(false);expect(f.switches,name).not.toContain("positive-supervisor-v1");
  const {definition}=parseFixedDefinition(JSON.stringify(f));
  for(const phase of definition.phases){
   expect(presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"bundle")))[ID],name).toBe(true);
   expect(presetFeatures(parsePlayPreset(armPreset(definition,phase.id,"control")))[ID],name).toBe(false);
  }
 }
});
