import {expect,it} from "vitest";
import {ALL_ON,SWITCHABLE_FEATURES,playHarnessFeatures} from "./features.js";
import {flagFeatures,normalizeFeatures} from "./play-preset.js";
import {playSystemPrompt,stableJitPrompts} from "./play-config.js";

const id="decision-commentary-v1";
const note="Decision commentary: Before each tool call, write one or two short sentences in ordinary response text stating the relevant observation, your immediate intent, and why the chosen action fits. Mention uncertainty when it matters. Keep routine actions brief. Give a concise decision explanation, not private internal reasoning. Then call the tool in the same response.";
it("registers an optional default-OFF prompt treatment without changing legacy arms",()=>{
 expect(SWITCHABLE_FEATURES.indexOf(id)).toBe(390);
 expect(flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false})[id]).toBe(false);
 const {[id]:_omitted,...old}=ALL_ON;void _omitted;
 expect(normalizeFeatures(old)[id]).toBe(false);
 expect(playHarnessFeatures({...ALL_ON,[id]:true})).toContain(id);
 expect(playHarnessFeatures({...ALL_ON,[id]:false})).not.toContain(id);
});
it("wires only the commentary paragraph through every production prompt variant",()=>{
 for(const screenshot of [false,true])for(const scene of ["unknown","core","battle","overworld","menu"] as const){
  const off={...ALL_ON,[id]:false,"screenshot-button-baseline-v1":screenshot};
  expect(playSystemPrompt({...off,[id]:true},null,scene)).toBe(`${playSystemPrompt(off,null,scene)}\n\n${note}`);
 }
 const f={...ALL_ON,[id]:true,"screenshot-button-baseline-v1":false,"just-in-time-prompt-v1":true,"rq-slim-prompt-v1":true,"rq-milestone-guide-v1":true};
 expect(stableJitPrompts(f,null,"battle").core).toContain(note);
 expect(stableJitPrompts({...f,[id]:false},null,"battle").core).not.toContain("Decision commentary:");
});
