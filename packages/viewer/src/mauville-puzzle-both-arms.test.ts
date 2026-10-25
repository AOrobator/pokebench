import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures,normalizeFeatures,flagFeatures} from "@pokebench/agent/play-preset";
import {featureInfo,serverFeatureEnv,playHarnessFeatures} from "@pokebench/agent/features";
import {readFixedDefinition} from "./fixed-definition.js";
import {armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";
import {FEATURE_EXPLAINERS} from "./panels.js";
const root=fileURLToPath(new URL("../../../",import.meta.url));
const ID="mauville-puzzle-readout-v1";
it("enables the correctness fix in materialized control AND bundle arms",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(true);
 expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null});
 expect(FEATURE_EXPLAINERS[ID]).toBe(`${ID}.html`);
 for(const name of ["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"]){
  const {definition:d}=readFixedDefinition(root,name);
  expect(d.onInBoth).toContain(ID);expect(d.switches).not.toContain(ID);
  for(const phase of d.phases)for(const arm of ["control","bundle"] as const){
   const f=presetFeatures(parsePlayPreset(armPreset(d,phase.id,arm)));
   expect(f[ID],`${name}/${phase.id}/${arm}`).toBe(true);
   expect(playHarnessFeatures(f,null)).toContain(ID);
   expect(serverFeatureEnv(f).POKEBENCH_FEATURES_OFF?.split(",")).not.toContain(ID);
   expect(serverFeatureEnv({...f,[ID]:false}).POKEBENCH_FEATURES_OFF?.split(",")).toContain(ID);
  }
 }
});
it("defaults on for new presets while preserving an explicit off choice",()=>{
 const f=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(f[ID]).toBe(true);
 const { [ID]: _old,...old}=f;expect(normalizeFeatures(old)[ID]).toBe(true);
 expect(normalizeFeatures({...f,[ID]:false})[ID]).toBe(false);
});
