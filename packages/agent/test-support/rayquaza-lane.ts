// The lane's plain preset, derived from control plus the overlay so no copy can drift from either.
import current from "../../../experiments/feature-configs/current.json" with {type:"json"};
import overlay from "../../../experiments/feature-configs/rayquaza-lane.json" with {type:"json"};
import definition from "../../../experiments/fixed/rayquaza-lane-8h-v3.json" with {type:"json"};
import type {FeatureSet} from "../src/features.js";

const all=(ids:readonly string[],value:boolean):Record<string,boolean>=>Object.fromEntries(ids.map(id=>[id,value]));
export const rayquazaLaneFeatures=():FeatureSet=>({...current.features,...all(current.switches,true),...all(overlay.on,true),...all(overlay.off,false)}) as FeatureSet;
export function rayquazaLanePreset(){
 const [phase]=definition.phases;
 if(phase===undefined)throw new Error("the lane definition has no phase");
 return {
  version:2,id:definition.id,target:definition.base.target,features:rayquazaLaneFeatures(),
  limits:{...definition.base.limits,maxWallMs:phase.maxWallMs},
  sampling:{...definition.base.sampling,maxTokens:definition.bundleMaxTokens},
 };
}
