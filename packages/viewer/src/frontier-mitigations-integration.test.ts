import {recipeText} from "../test-support/recipe-text.js";
import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {featureInfo} from "@pokebench/agent/features";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {armPreset,parseFixedDefinition} from "./fixed-design.js";

const IDS=["coherent-healing-feedback-v1","explorer-family-guidance-v1","battle-move-learn-input-v1","rejected-movement-stride-v1","leader-loss-comparison-v1","npc-approach-feedback-v1","boundary-crossing-facts-v1","delivered-place-evidence-v1","reachable-section-alternatives-v1","owned-battle-context-v1","static-npc-template-approach-v1"] as const;
it.each(IDS)("%s has an unqueued one-switch pending comparison",id=>{
 expect(featureInfo(id).description).toContain("Off:");
});

// Frozen historical recipe bytes from review base a0c3d6138, independent of current registry defaults.
