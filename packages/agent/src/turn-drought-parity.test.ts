// turn-drought-clock-v1 OFF parity (round-1 review): production-shaped traces through the production stallBriefing
// factory, the real loop guard and supervisor, with the switch OFF, give exactly the loop_guard events, stall_gate
// events and delivered supervisor contexts that main's pre-change code (632089f43) gave for the same traces.
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import {expect,it} from "vitest";
import {parityTraces,runParity,type ParityResult} from "../test-support/stall-parity.js";

const GOLDEN=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/stall-parity-golden.json.gz",import.meta.url))).toString("utf8")) as ParityResult[];

it("covers ordinary droughts, suppression, battle/heal holds, gate holds, map cycles and interface dwell",()=>{
 const kinds=new Set(GOLDEN.flatMap(r=>r.guards.map(g=>`${g.kind}/${g.phase}`)));
 for(const k of ["milestone_drought/supervisor","milestone_drought/would_warn","map_cycle/supervisor","interface_dwell/supervisor"])expect(kinds).toContain(k);
 expect(GOLDEN.some(r=>r.held.length>0)).toBe(true);
 expect(GOLDEN.find(r=>r.name==="battle and heal hold")?.guards.some(g=>g.message.startsWith("Not sent (drought-battle-heal-hold-v1)"))).toBe(true);
 expect(GOLDEN.find(r=>r.name==="suppression on")?.guards.some(g=>g.message.startsWith("Not sent (milestone-drought-suppression-v1)"))).toBe(true);
});

for(const trace of parityTraces()){
 it(`OFF reproduces main's output exactly: ${trace.name}`,()=>{
  expect(trace.features["turn-drought-clock-v1"]).toBe(false);
  expect(JSON.parse(JSON.stringify(runParity(trace)))).toEqual(GOLDEN.find(r=>r.name===trace.name));
 });
}
