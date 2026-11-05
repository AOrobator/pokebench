import {LEGACY_ALL_ON as REGISTERED_ALL_ON} from "../../agent/test-support/legacy-features.js";
import { describe, expect, it } from "vitest";

import { DEFAULT_NEXT_RUN, healthProbe, presetFor } from "./next-run.js";

const ALL_ON = { ...REGISTERED_ALL_ON, "visited-terrain-navigation-v1": false, "battle-effective-damage-v1": false, "semantic-navigation-v1":false, "deterministic-exploration-v1":false };
Object.assign(ALL_ON,{"safe-navigation-strides-v1":false});
// Game servers that answer /health in these tests.
const draft = { ...DEFAULT_NEXT_RUN, model: "Qwen3.8-Flash" };

describe("next-run draft", () => {

  it("turns a draft into a v2 play preset", () => {
    expect(presetFor({ ...draft, target: "RIVAL_MET" }, "r1")).toEqual({ version: 2, id: "viewer-r1", target: "RIVAL_MET", limits: { maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 8192 }, features: { ...ALL_ON,"reasoning-effort-request-v1":true,"mauville-puzzle-readout-v1":true,"map-observability-v1":true,"semantic-navigation-v2":false,"evolution-decision-v1":false,"starter-decision-salience-v1":false,"battle-decision-ready-v1":false,"battle-refusal-loop-v1":false, "scripted-place-guidance-v1": false, "trigger-script-loop-v1": false, "state-only-decisions-v1": false, "pushback-loop-detection-v1": false, "pushback-press-result-v1": false, "battle-observation-loop-v1": false, "explorer-guidance-v1": false, "in-game-naming-readout-v1": false, "no-nickname-guidance-v1": false, "battle-text-auto-advance-v1": false, "battle-message-waiting-v1": false, "connection-edge-tiles-v1": false, "named-interactions-v1": false, "world-destinations-v1": false, "bounded-navigation-v1": false, "full-map-navigation-v1": false, "grass-cost-navigation-v1": false, "game-evidence-priority-v1": false, "dialogue-log-v1": false, "loop-guard-supervisor-v1": false, "instruction-ledger-v1": false, "next-milestone-hint-v1": false, "double-context-window-v1": false, "fresh-retry-v1": false, "named-warp-destinations-v1": false, "milestone-stall-stop-v1": false, "text-only-supervisor-v1": false, "character-presence-v1": false, "navigation-refusal-reasons-v1": false, "transition-press-result-v1": false, "stall-briefing-v1": false, "battle-details-v2": false, "dialogue-auto-advance-v1": false, "warp-arrival-settle-v1": false, "dialogue-context-kept-v1": false, "displayed-place-names-v1": false, "transition-loop-detection-v1": false, "blocked-batch-result-v1": false, "adjacent-tiles-v1": false, "battle-triage-guidance-v1": false, "readout-rules-in-prompt-v1": false, "offscreen-objects-v1": false, "navigate-first-prompt-v1": false, "presence-penalty-v1": false, "levelup-box-v1": false, "disproved-beliefs-v1": false, "same-plan-breaker-v1": false, "navigation-truth-v1": false, "navigation-refusal-reasons-v2": false, "script-line-presence-v1": false, "briefing-exits-v1": false, "untaken-exits-v1": false, "people-ledger-v1": false, "people-id-cards-v1": false, "open-goal-prompt-v1": false, "transition-coherence-v1": false, "trainer-heal-guidance-v1": false, "low-hp-trainer-warning-v1": false,"low-hp-trainer-warning-v2":false, "briefing-battle-outcomes-v1": false, "blocked-exit-fact-v1": false, "battle-loss-recap-v1": false, "readout-truth-v1": false, "birch-speech-pages-v1": false, "blackout-readout-v1": false, "surf-gated-exits-v1": false, "story-destinations-v1": false, "instruction-ledger-v2": false, "harness-trust-v1": false, "cited-destination-v1": false, "harness-trust-v2": false, "battle-move-tool-v1": false, "tutorial-party-owner-v1": false, "mid-frame-readout-v1": false, "unset-dynamic-warp-v1": false, "status-names-v1": false, "surf-gated-exits-v2": false, "no-exit-here-v1": false, "bag-healing-items-v1": false, "battle-menu-loop-v1": false, "clock-view-loop-v1": false,"stale-story-goal-v1":false,"stale-story-goal-v2":false,"context-token-budget-v1":false, "briefing-repeat-count-v1":false, "navigate-already-here-v1":false, "deterministic-warp-navigation-v1":false, "input-cuts-v1": false, "loop-guard-screen-v1": false, "reopened-dialogue-loop-v1": false, "just-in-time-prompt-v1": false,"just-in-time-prompt-v2":false,"faced-interaction-history-v1":false,"save-state-task-truth-v1":false,"cache-aligned-window-v1":false,"jit-guide-reuse-v1":false,"dialog-button-b-v1": false, "exit-reachability-v1": false, "heal-before-trainers-v1": false, "cross-map-goal-v1": false, "explorer-guidance-v2": false, "ineffective-loops-v1": false, "stable-map-codes-v1": false, "solid-tile-leads-v1": false, "auto-talk-interrupt-note-v1": false } });
  });
});

describe("operator control requests", () => {

  it("asks the run's game server for /health on loopback", async () => {
    const seen: string[] = [];
    const probe = healthProbe((input) => { seen.push(typeof input === "string" ? input : ""); return Promise.resolve(new Response("{}", { status: seen.length === 1 ? 200 : 503 })); });
    expect([await probe(9001), await probe(9002)]).toEqual([true, false]);
    expect(seen).toEqual(["http://127.0.0.1:9001/health", "http://127.0.0.1:9002/health"]);
    expect(await healthProbe(() => Promise.reject(new Error("refused")))(9003)).toBe(false);
  });
});
