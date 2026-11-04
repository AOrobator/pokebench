import {expect,it} from "vitest";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
// active-warp-exits-v1 was promoted to both arms (the operator 2026-11-02) beside warp-target-navigation-v1,
// which accepts the warp records it filters; the presentation switch stays bundle-only.
const BOTH=["active-warp-exits-v1"] as const;
const BUNDLE_ONLY=["available-exits-presentation-v1"] as const;
const IDS=[...BOTH,...BUNDLE_ONLY] as const;
it.each(IDS)("%s stays default OFF",id=>{expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);});
