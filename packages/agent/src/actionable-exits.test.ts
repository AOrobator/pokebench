import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {ALL_ON,featureInfo,featuresOf,playHarnessFeatures,SERVER_FEATURES,serverFeatureEnv,type SwitchableFeature} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
const IDS=["active-warp-exits-v1","available-exits-presentation-v1"] as const;
it.each(IDS)("%s defaults OFF, transports independently and has an explainer",id=>{
 const key=id as SwitchableFeature;
 expect(featureInfo(key).description).toContain(" Off: ");
 const old=Object.fromEntries(Object.entries(ALL_ON).filter(([k])=>!IDS.includes(k as typeof IDS[number]))) as Parameters<typeof normalizeFeatures>[0];
 expect(normalizeFeatures(old)[key]).toBe(false);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[key]).toBe(false);
 const features={...ALL_ON,[id]:true};
 expect(featuresOf(playHarnessFeatures(features,null))[key]).toBe(true);
 expect(SERVER_FEATURES).toContain(id);
 expect(serverFeatureEnv({...features,[id]:false})?.POKEBENCH_FEATURES_OFF.split(",")).toContain(id);
 expect(readFileSync(new URL("../../viewer/src/panels.ts",import.meta.url),"utf8")).toContain(`"${id}":"${id}.html"`);
});
