import {expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {featureInfo,playHarnessFeatures} from "./features.js";
import {flagFeatures} from "./play-preset.js";
const ids=["ineffective-navigation-v2","supervisor-briefing-v2","reachable-story-guidance-v1","text-only-supervisor-v2"] as const;
it("keeps new switches OFF in legacy/default flags and control, ON only in the fixed bundle",()=>{
 const features=flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false});
 const def=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[]};
 for(const id of ids){expect(features[id]).toBe(false);expect(def.base.features[id]).toBe(false);expect(def.switches).toContain(id);expect(featureInfo(id).description).toContain(" Off: ");expect(playHarnessFeatures({...features,[id]:true},null)).toContain(id);}
});
