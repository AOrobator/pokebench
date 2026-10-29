import {expect,it} from "vitest";
import {ALL_ON,featuresOf,featureInfo,serverFeatureEnv,SWITCHABLE_FEATURES,playHarnessFeatures} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt} from "./play-config.js";
const ID="player-map-visibility-v2";
it("registers V2 default off with independent server wiring and a matching prompt",()=>{
 const off={...ALL_ON,"player-map-visibility-v1":false,[ID]:false},on={...off,[ID]:true};
 expect(SWITCHABLE_FEATURES.at(-1)).toBe(ID);
 expect(featureInfo(ID).description).toContain("Off:");
 expect(normalizeFeatures(featuresOf([]))[ID]).toBe(false);
 expect(serverFeatureEnv(off).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
 expect(serverFeatureEnv(on).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
 expect(playHarnessFeatures(on,null)).toContain(ID);
 expect(playHarnessFeatures(off,null)).not.toContain(ID);
 expect(playSystemPrompt(on,null)).toContain("Fully lit maps show the whole current map");
 expect(playSystemPrompt(off,null)).not.toContain("Fully lit maps show the whole current map");
 expect(playSystemPrompt({...on,"player-map-visibility-v1":true},null)).not.toContain("to reveal more, choose a visible reachable tile");
});
