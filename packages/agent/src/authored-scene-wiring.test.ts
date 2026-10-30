import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {FEATURES,featuresOf,playHarnessFeatures,SERVER_FEATURES,SWITCHABLE_FEATURES} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";

const ID="authored-scene-labels-v1";
it("registers the authored scene treatment append-only and globally OFF",()=>{
 expect(SWITCHABLE_FEATURES.map(String).indexOf(ID)).toBe(316);
 expect(FEATURES.find(f=>f.id===ID)).toMatchObject({needs:"dialogue-auto-advance-v1",switchable:true});
 expect(featuresOf([])[ID]).toBe(false);
 expect(flagFeatures({loopGuard:false,activeUi:false,interfaceDocs:false,objectives:false})[ID]).toBe(false);
 expect(normalizeFeatures(featuresOf([]))[ID]).toBe(false);
 expect(SERVER_FEATURES.map(String)).toContain(ID);
 expect(playHarnessFeatures({...featuresOf(["ram-state-v1","dialogue-auto-advance-v1"]),[ID]:true},null).at(-1)).toBe(ID);
});
it("keeps the experimental scene labels OFF in both future recipe arms",()=>{
 const recipe=JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json",import.meta.url),"utf8")) as {features:Record<string,boolean>;switches:string[];offInBoth:string[]};
 expect(recipe.features[ID]).toBe(false);expect(recipe.offInBoth.filter(id=>id===ID)).toEqual([ID]);expect(recipe.switches).not.toContain(ID);
});
