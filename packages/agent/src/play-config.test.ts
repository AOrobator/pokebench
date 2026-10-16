import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { ALL_ON as REGISTRY_ALL_ON, type FeatureSet, type SwitchableFeature } from "./features.js";
const ALL_ON={...REGISTRY_ALL_ON,"dialogue-auto-advance-v1":false,"navigation-evidence-memory-v1":false,"world-destinations-v1":false,"bounded-navigation-v1":false,"game-evidence-priority-v1":false,"dialogue-log-v1":false,"loop-guard-supervisor-v1":false,"instruction-ledger-v1":false,"next-milestone-hint-v1":false};
import { CONTEXTUAL_CONTROLS, GAME_EVIDENCE_SECTION, NAVIGATE_TO_USAGE, PLAY_SYSTEM_PROMPT, objectiveSwitches, playGoal, playSystemPrompt, playTools, toolSwitches } from "./play-config.js";
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
  expect(toolSwitches(ALL_ON)).toEqual({ safeInterfaces:true, automaticRunning:true, readout: true, pressResult: true, position: true, fieldLock: true, transitions: true, blockedBatch: true, liveMap: true });
  expect(toolSwitches(off("ram-state-v1", "press-result-v1", "live-player-position-v1", "field-control-lock"))).toEqual({ safeInterfaces:true, automaticRunning:true, readout: false, pressResult: false, position: false, fieldLock: false, transitions: true, blockedBatch: true, liveMap: true });
});

it("describes whole-map navigation only when that treatment is on", () => {
  const local = playSystemPrompt({ ...ALL_ON, "bounded-navigation-v1": true, "full-map-navigation-v1": false }, null);
  const full = playSystemPrompt({ ...ALL_ON, "bounded-navigation-v1": true, "full-map-navigation-v1": true }, null);
  expect(local).toContain("up to eight ordinary button attempts");
  expect(local).not.toContain("whole current map");
  expect(full).toContain("whole current map");
  expect(full).not.toContain("up to eight ordinary button attempts");
  expect(full).toContain("never crosses a warp unless it is the destination");
});

it("tells the model navigate_to hops ledges only when ledge hops are on",()=>{
 const nav={...REGISTRY_ALL_ON,"world-destinations-v1":false};
 expect(playSystemPrompt(nav,null)).toContain("It hops a ledge only in its arrow direction.");
 expect(playSystemPrompt(nav,null)).not.toContain("solve ledges");
 expect(playSystemPrompt({...nav,"ledge-hops-v1":false},null)).toContain("press A, surf or solve ledges.");
});

it("declares only the enabled navigation memory prompt and tool",()=>{const enabled={...ALL_ON,"navigation-evidence-memory-v1":true};expect(playTools(enabled)).toContain("remember_destination");expect(playSystemPrompt(enabled,null)).toContain("not required before acting");expect(playSystemPrompt(ALL_ON,null)).not.toContain("navigation evidence ledger");});
const EVIDENCE_SHA="f5b38faa608109f47cb570284de898dc3df4bf1007b3232d65ec40ea5d7491bf",NAVIGATE_SHA="b6e6d33e6071350ae185fa42d8a705aada6578d26d8b7ebe6f739db5ac74d5b2";
const PLAIN={...ALL_ON,"objective-tracking-v1":false,"repeat-attempt-guard-v1":false,"native-objective-completion-v1":false};
it("puts game evidence above remembered Pokémon knowledge only when that treatment is on",()=>{
 const on={...PLAIN,"game-evidence-priority-v1":true};
 expect(playSystemPrompt(on,null)).toBe(`${playSystemPrompt(PLAIN,null)}\n\n${GAME_EVIDENCE_SECTION}`);
 expect(playSystemPrompt(ALL_ON,null)).not.toContain(GAME_EVIDENCE_SECTION.slice(0,40));
 expect(createHash("sha256").update(GAME_EVIDENCE_SECTION).digest("hex")).toBe(EVIDENCE_SHA);
});
it("adds navigate_to usage guidance only when navigation is also on",()=>{
 const nav={...PLAIN,"bounded-navigation-v1":true,"game-evidence-priority-v1":true};
 expect(playSystemPrompt(nav,null)).toBe(`${playSystemPrompt({...nav,"game-evidence-priority-v1":false},null)}\n\n${GAME_EVIDENCE_SECTION}\n\n${NAVIGATE_TO_USAGE}`);
 expect(NAVIGATE_TO_USAGE).toContain("Use navigate_to for any walk of two or more tiles");
 expect(NAVIGATE_TO_USAGE).toContain("give the warp's own coordinates");
 expect(createHash("sha256").update(NAVIGATE_TO_USAGE).digest("hex")).toBe(NAVIGATE_SHA);
 expect(playSystemPrompt({...nav,"bounded-navigation-v1":false},null)).not.toContain(NAVIGATE_TO_USAGE.slice(0,40));
});
it("keeps the evidence sections free of any character, place or story-step name",()=>{
 const names=/\b(rival|birch|professor|may|brendan|mom|neighbou?r|next door|lab|littleroot|oldale|petalburg|rustboro|route|starter|gym|badge|pok[eé]dex|truck|clock|bedroom|house|town|city)\b/i;
 expect(GAME_EVIDENCE_SECTION).not.toMatch(names);expect(NAVIGATE_TO_USAGE).not.toMatch(names);
});
