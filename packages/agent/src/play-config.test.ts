import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { ALL_ON as REGISTRY_ALL_ON, type FeatureSet, type SwitchableFeature } from "./features.js";
const ALL_ON={...REGISTRY_ALL_ON,"navigation-evidence-memory-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false};
import { CONTEXTUAL_CONTROLS, PLAY_SYSTEM_PROMPT, objectiveSwitches, playGoal, playSystemPrompt, playTools, toolSwitches } from "./play-config.js";
import { OBJECTIVE_PROMPT, objectivePrompt } from "./objective-tools.js";

const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const off = (...ids: SwitchableFeature[]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });

// Hashes of the prompts live.ts built at 0632fc0 (recorded in the worklog).
it("reproduces the pre-registry prompts for the four legacy flag combinations", () => {
  expect(sha(playSystemPrompt(off("dialogue-safe-batches-v1"), null))).toBe("9acbcc601390c879c1af3a8ff834d2b14fa8f76448b49dce4f8daa4502fe27ea");
  expect(sha(playSystemPrompt(off("dialogue-safe-batches-v1"), "PLAYER_NAME_CONFIRMED"))).toBe("f2f0dd351e6cc7e5e11979d0aa67c18473894dcc3b661cff7a369942b9c17630");
  expect(sha(playSystemPrompt(off("dialogue-safe-batches-v1","contextual-interface-docs-v1"), null))).toBe("c9ea0a800d7000717f3526405a8b3217c40d08aa5e14d59964a2e332e306e233");
  expect(sha(playSystemPrompt(off("dialogue-safe-batches-v1", "objective-tracking-v1", "repeat-attempt-guard-v1", "native-objective-completion-v1"), null))).toBe("5ea8916443c638c8c0cb3bd0706c6195cc251ca532ce140441b8aae007a05fcb");
  expect(sha(OBJECTIVE_PROMPT)).toBe("33c0b2a9ec5c8ee817154f6d3c5d56357116848c394667983e6e4b641a3659df");
  expect(objectivePrompt({ repeatGuard: true, nativeCompletion: true })).toBe(OBJECTIVE_PROMPT);
  expect(PLAY_SYSTEM_PROMPT).not.toContain(CONTEXTUAL_CONTROLS);
});

it("drops the readout promise when the RAM readout is off", () => {
  const prompt = playSystemPrompt(off("ram-state-v1"), null);
  expect(prompt).toContain("- observe: shows the current screen.\n");
  expect(prompt).toContain("then shows the new screen.\n");
  expect(prompt).not.toContain("text readout");
  expect(playSystemPrompt(ALL_ON, null)).toContain("text readout of the game state");
});

it("removes only the warp paragraph when warp guidance is off", () => {
  const before = playSystemPrompt(ALL_ON, null), after = playSystemPrompt(off("warp-activation-guidance-v1"), null);
  expect(before).toContain("\n\nWarps: W marks a transition location");
  expect(after).not.toContain("Warps:");
  expect(after.length).toBeLessThan(before.length);
  expect(after).toContain("Clock interface:");
});

it("states the objective rules the guards actually enforce", () => {
  const noRepeat = objectivePrompt({ repeatGuard: false, nativeCompletion: true });
  expect(noRepeat).not.toContain("Two matching failures warn");
  const noNative = objectivePrompt({ repeatGuard: true, nativeCompletion: false });
  expect(noNative).not.toContain("automatically completes");
  expect(noNative).toContain("Nothing completes automatically");
  expect(playSystemPrompt(off("native-objective-completion-v1"), null)).toContain(noNative);
});

it("names the goal and the tools for the selected switches", () => {
  expect(playGoal("RIVAL_MET")).toBe("Reach the native game milestone RIVAL MET.");
  expect(playTools(ALL_ON)).toEqual(["observe", "press", "get_objectives", "set_objective", "update_objective"]);
  expect(playTools(off("objective-tracking-v1"))).toEqual(["observe", "press"]);
});

it("hides objective-record facts whose observation switch is off", () => {
  expect(objectiveSwitches(ALL_ON)).toEqual({ repeatGuard: true, nativeCompletion: true, hiddenFacts: [] });
  expect(objectiveSwitches(off("live-player-position-v1", "naming-cursor-v1", "field-control-lock", "repeat-attempt-guard-v1"))).toEqual({ repeatGuard: false, nativeCompletion: true, hiddenFacts: ["position", "facing", "naming", "field_controls_locked"] });
});

it("maps observation switches onto the observe/press results", () => {
  expect(toolSwitches(ALL_ON)).toEqual({ safeInterfaces:true, automaticRunning:true, readout: true, pressResult: true, position: true, fieldLock: true });
  expect(toolSwitches(off("ram-state-v1", "press-result-v1", "live-player-position-v1", "field-control-lock"))).toEqual({ safeInterfaces:true, automaticRunning:true, readout: false, pressResult: false, position: false, fieldLock: false });
});

it("tells the model navigate_to hops ledges only when ledge hops are on",()=>{
 const nav={...REGISTRY_ALL_ON,"world-destinations-v1":false};
 expect(playSystemPrompt(nav,null)).toContain("It hops a ledge only in its arrow direction.");
 expect(playSystemPrompt(nav,null)).not.toContain("solve ledges");
 expect(playSystemPrompt({...nav,"ledge-hops-v1":false},null)).toContain("press A, surf or solve ledges.");
});

it("declares only the enabled navigation memory prompt and tool",()=>{const enabled={...ALL_ON,"navigation-evidence-memory-v1":true};expect(playTools(enabled)).toContain("remember_destination");expect(playSystemPrompt(enabled,null)).toContain("not required before acting");expect(playSystemPrompt(ALL_ON,null)).not.toContain("navigation evidence ledger");});
