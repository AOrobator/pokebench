import {serverOff, serverOffWith} from "../test-support/server-features.js";
import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {describe,expect,it} from "vitest";
import {SERVER_FEATURES,SWITCHABLE_FEATURES,dependencyProblems,featureInfo,playHarnessFeatures} from "./features.js";

const ID="battle-effective-damage-v1" as const;

describe(ID,()=>{
 it("is a default-off server observation switch that depends on battle details",()=>{
  expect(SWITCHABLE_FEATURES.at(129)).toBe(ID);
  expect(featureInfo(ID)).toMatchObject({group:"observation",needs:"battle-details-v2",switchable:true,title:"BATTLE EFFECTIVE DAMAGE"});
  expect(SERVER_FEATURES.at(47)).toBe(ID);
  expect(serverOff({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false})).toEqual(serverOffWith(ALL_ON,{off:[ID]}));
  expect(dependencyProblems({...ALL_ON,"battle-decision-ready-v1":false,"battle-details-v2":false})).toContain(`${ID} needs battle-details-v2`);
  expect(playHarnessFeatures({...ALL_ON,"battle-decision-ready-v1":false,[ID]:false},null)).not.toContain(ID);
  expect(playHarnessFeatures(ALL_ON,null)).toContain(ID);
 });
});
