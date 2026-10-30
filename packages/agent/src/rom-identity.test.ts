import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {featuresOf,SWITCHABLE_FEATURES,playHarnessFeatures} from "./features.js";
import {normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt,playTools} from "./play-config.js";
const ID="rom-identity-v1";
const TEXT="This is standard Pokémon Emerald running from a hash-verified, unmodified ROM. No ROM hacks, randomizer, or custom story changes are applied.";
it("keeps ROM identity default off and preserves the pre-change system prompt",()=>{
 const off=featuresOf([]);
 const legacy={...off};Reflect.deleteProperty(legacy,ID);
 expect(normalizeFeatures(legacy)).toHaveProperty(ID,false);
 expect(createHash("sha256").update(playSystemPrompt(off,null)).digest("hex")).toBe("d5fc2e2ddc6a70cb012644f1362aed62786e9f915a88eb38f3b6f65d850639e9");
});
it("appends exactly the tested paragraph through the production prompt factory without changing tools",()=>{
 const off=featuresOf([]),on={...off,[ID]:true};
 expect(SWITCHABLE_FEATURES[313]).toBe(ID);
 for(const scene of ["unknown","overworld","battle","menu","core"] as const){
  expect(playSystemPrompt(on,null,scene)).toBe(playSystemPrompt(off,null,scene)+"\n\n"+TEXT);
 }
 expect(playTools(on)).toEqual(playTools(off));
 expect(playHarnessFeatures(on,null)).toContain(ID);
 expect(playHarnessFeatures(off,null)).not.toContain(ID);
});
