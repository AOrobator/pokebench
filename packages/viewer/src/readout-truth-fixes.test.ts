import {expect,it} from "vitest";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

// The 2026-10-17 readout fixes start OFF in the viewer's next run until an experiment supports them.
it.each(["tutorial-party-owner-v1","mid-frame-readout-v1","unset-dynamic-warp-v1","status-names-v1","surf-gated-exits-v2"])("%s is off in DEFAULT_NEXT_RUN",(id)=>{
 expect(Object.entries(DEFAULT_NEXT_RUN.features).find(([k])=>k===id)?.[1]).toBe(false);
});
