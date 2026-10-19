import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const ID="named-warp-destinations-v1";

describe(ID,()=>{
 it("is off in the fixed control and flipped on only by the bundle",()=>{
  const def=JSON.parse(readFileSync(new URL("../../../experiments/fixed/bundle-v-control.json",import.meta.url),"utf8")) as {base:{features:Record<string,boolean>};switches:string[];onInBoth:string[]};
  expect(def.base.features[ID]).toBe(false);
  expect(def.switches).toContain(ID);
  expect(def.onInBoth).not.toContain(ID);
  expect(def.base.features["displayed-place-names-v1"]).toBe(true);
 });
});
