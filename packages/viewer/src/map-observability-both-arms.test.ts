import {FROZEN_SWITCHES} from "../../agent/test-support/legacy-features.js";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures,normalizeFeatures,flagFeatures} from "@pokebench/agent/play-preset";
import {featureInfo,serverFeatureEnv,playHarnessFeatures,featuresOf} from "@pokebench/agent/features";
import {readFixedDefinition} from "./fixed-definition.js";
import {armPreset} from "./fixed-design.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

const root=fileURLToPath(new URL("../../../",import.meta.url));
const ID="map-observability-v1";

it("declares unified map observations ON in fresh control and bundle configurations",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(true);
 expect(featureInfo(ID)).toMatchObject({group:"observation",needs:null});
// The three switches registered last when the legacy fixtures froze. Membership only — the registry is a set, so
// this asserts which ids were frozen, not what order they happen to sit in.
 for(const frozen of ["instruction-goal-advisory-v1","goal-review-repair-feedback-v1",ID] as const)expect(FROZEN_SWITCHES.has(frozen)).toBe(true);
 for(const name of ["bundle-v-control","bundle-v-control-2h","glm53-flash-4h","gym-rustboro-torchic","gym-rustboro-torchic-healed","random-starter-2h"]){
  const {definition:d}=readFixedDefinition(root,name);
  if(["bundle-v-control","bundle-v-control-2h","glm53-flash-4h"].includes(name))expect(d.onInBoth).toContain(ID);
  expect(d.switches).not.toContain(ID);
  for(const phase of d.phases)for(const arm of ["control","bundle"] as const){
   const f=presetFeatures(parsePlayPreset(armPreset(d,phase.id,arm)));
   expect(f[ID],`${name}/${phase.id}/${arm}`).toBe(true);
   expect(playHarnessFeatures(f,null)).toContain(ID);
   expect(playHarnessFeatures({...f,[ID]:false},null)).toEqual(playHarnessFeatures(f,null).filter(id=>id!==ID));
   expect(serverFeatureEnv(f).POKEBENCH_FEATURES_OFF.split(",")).not.toContain(ID);
   expect(serverFeatureEnv({...f,[ID]:false}).POKEBENCH_FEATURES_OFF.split(",")).toContain(ID);
  }
 }
});

it("defaults missing future-preset keys ON, keeps explicit OFF and never invents historical recording activation",()=>{
 const f=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 expect(f[ID]).toBe(true);
 const {[ID]:present,...old}=f;
 expect(present).toBe(true);
 expect(normalizeFeatures(old)[ID]).toBe(true);
 expect(normalizeFeatures({...f,[ID]:false})[ID]).toBe(false);
 expect(featuresOf(["mauville-puzzle-readout-v1"])[ID]).toBe(false);
});
