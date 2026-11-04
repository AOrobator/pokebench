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
