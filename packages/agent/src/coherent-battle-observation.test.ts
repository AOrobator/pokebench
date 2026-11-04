import {expect,it} from "vitest";
import {ALL_ON,SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures,serverFeatureEnv} from "./features.js";
import {flagFeatures,parsePlayPreset,presetFeatures} from "./play-preset.js";
const id="coherent-battle-observation-v1";
it("registers an appended server switch and preserves all historical OFF defaults",()=>{
 expect(SWITCHABLE_FEATURES.at(233)).toBe(id);
 expect(SERVER_FEATURES.at(77)).toBe(id);
 expect(featureInfo(id)).toMatchObject({group:"observation",needs:"transition-coherence-v1",switchable:true});
 const { [id]: omitted,...historical}=ALL_ON;
 expect(omitted).toBe(true);
 const features=presetFeatures(parsePlayPreset({version:2,id:"coherence-legacy",target:null,limits:{maxTurns:100,maxWallMs:60000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:4096},features:{...historical,"screenshot-button-baseline-v1":false,"instruction-goal-ledger-v1":false,"state-only-decisions-v1":false}}));
 expect(features[id]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
 expect(playHarnessFeatures(features,null)).not.toContain(id);
 expect(playHarnessFeatures(ALL_ON,null).at(257)).toBe(id);
 expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",")).toContain(id);
 expect(serverFeatureEnv(ALL_ON).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(id);
 expect(dependencyProblems({...ALL_ON,"transition-coherence-v1":false})).toContain(`${id} needs transition-coherence-v1`);
});

// Native observations cross the actual typed tool boundary before reaching pi.
import {readFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {observeTool} from "./game-tools.js";
import {RunRecorder} from "./recorder.js";
import {RunLog} from "./run-log.js";
import {FrameStore} from "./frames.js";
import {parseEvent} from "./events.js";
import {RUN_START_META} from "../test-support/events.js";
import {parseGameState} from "./game-state.js";
import {Value} from "typebox/value";
import {Type} from "typebox";
