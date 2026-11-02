import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect,it} from "vitest";
import {parsePlayPreset,presetFeatures} from "@pokebench/agent/play-preset";
import {featureInfo,playHarnessFeatures} from "@pokebench/agent/features";
import {armFeatureBits,armFeatures,armPreset} from "./fixed-design.js";
import {readFixedDefinition} from "./fixed-definition.js";
import {DEFAULT_NEXT_RUN} from "./next-run.js";

// the operator 2026-11-01: a reply that calls no tool is left out of the retry, so the model sees its last
// tool result and the nudge instead of re-reading its own truncated answer and reasoning. It is
// harness support, not a treatment: the arms must still differ only by the recipe's switches, so
// both arms carry it. Before this, the flag was off in both arms and the measured cost was the
// 2026-11-01T01-37-02_hyperqwen-gpu0_7da5 stall (286 max_tokens retries, 552 no_tool_call breaks).
const ID="fresh-retry-v1";
const root=fileURLToPath(new URL("../../../",import.meta.url));
const fixedDir=join(root,"experiments/fixed");
const CURRENT=readdirSync(fixedDir)
 .filter(name=>name.endsWith(".json"))
 .sort()
 .filter(name=>(JSON.parse(readFileSync(join(fixedDir,name),"utf8")) as {featureRecipe?:unknown}).featureRecipe==="current")
 .map(name=>name.slice(0,-".json".length));

it("covers every definition that reads the current recipe",()=>{
 expect(CURRENT).toContain("bundle-v-control");
 expect(CURRENT.length).toBeGreaterThan(0);
});

it.each(CURRENT)("current recipe %s keeps the fresh retry on in both arms",name=>{
 const {definition:d}=readFixedDefinition(root,name);
 expect(d.switches,name).not.toContain(ID);
 expect(d.onInBoth,name).toContain(ID);
 expect(d.offInBoth,name).not.toContain(ID);
 expect(d.base.features[ID],name).toBe(true);
 for(const arm of ["control","bundle"] as const){
  expect(armFeatures(d,arm)[ID],`${name}/${arm}`).toBe(true);
  expect(armFeatureBits(d,arm)[ID],`${name}/${arm}`).toBe(true);
  for(const phase of d.phases){
   const f=presetFeatures(parsePlayPreset(armPreset(d,phase.id,arm)));
   expect(f[ID],`${name}/${phase.id}/${arm}`).toBe(true);
   // The server and the harness both read the resolved preset, not the recipe.
   expect(playHarnessFeatures(f,null)).toContain(ID);
   expect(playHarnessFeatures({...f,[ID]:false},null)).not.toContain(ID);
  }
 }
});

// The recipe, not the registry default, carries the fix: a fresh run stays on the previous behavior
// until an operator turns the switch on.
it("stays a default-off guard outside the recipe",()=>{
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
 expect(featureInfo(ID)).toMatchObject({group:"guard",needs:null,switchable:true});
});
