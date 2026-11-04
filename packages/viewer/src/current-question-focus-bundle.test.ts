import {parsePlayPreset} from "@pokebench/agent/play-preset";
import {expect,it} from "vitest";
import {recipeText} from "../test-support/recipe-text.js";
import {armFeatures,armPreset,parseFixedDefinition} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

const ID="current-question-focus-v1";
it("keeps the next-run default OFF",()=>{expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);});
