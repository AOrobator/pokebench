import type { FixedDefinition } from "../src/fixed-design.js";
import { generatePlan } from "../src/fixed-design.js";

export const INCUMBENT_FEATURES: Readonly<Record<string, boolean>> = {
  "navigation-evidence-memory-v1": false, "automatic-running-v1": false, "expanded-menu-battle-information-v1": false, "ram-state-v1": true,
  "live-map-v1": true, "live-player-position-v1": true, "world-coordinate-grid-v1": true, "live-object-sprites-v1": true, "world-targets-v1": true,
  "named-interactions-v1": true, "world-destinations-v1": false, "bounded-navigation-v1": true, "grass-cost-navigation-v1": false,
  "field-dialogue-phase-v1": true, "dialogue-safe-batches-v1": false, "interaction-loop-detection-v1": true, "active-field-message-buffer-v1": true,
  "naming-cursor-v1": true, "story-state-v1": true, "coordinate-script-conditions-v1": true, "state-only-decisions-v1": false,
  "contextual-interface-docs-v1": true, "active-ui-ownership-v1": true, "press-result-v1": true, "field-control-lock": true,
  "warp-activation-guidance-v1": true, "ledge-hops-v1": true, "one-way-tiles-v1": true, "counter-talk-v1": false, "walkable-floor-v1": false,
  "deterministic-loop-guard-v1": true, "objective-tracking-v1": false, "repeat-attempt-guard-v1": false, "native-objective-completion-v1": false,
  "full-map-navigation-v1": false, "elevation-transitions-v1": true, "game-evidence-priority-v1": false, "dialogue-log-v1": false,
  "loop-guard-supervisor-v1": true, "instruction-ledger-v1": false, "next-milestone-hint-v1": false, "double-context-window-v1": false,
  "fresh-retry-v1": false, "named-warp-destinations-v1": false, "milestone-stall-stop-v1": false, "text-only-supervisor-v1": true,
};

export const START_SHA1 = "51007c05d2a4f1f3e0f2b0d0b6c7c4a3e2d1f0a9";
export const MODEL_PATH = "/models/q.gguf";

export function draftDefinition(overrides: Partial<Omit<FixedDefinition, "plan">> = {}): Omit<FixedDefinition, "plan"> {
  return {
    version: 1,
    id: "bundle-v-control",
    title: "Bundle vs fixed control",
    worklog: "docs/worklogs/active/2026-10-15_bundle-v-control.md",
    primaryMilestone: "RIVAL_MET",
    start: { kind: "save_state", path: "runs/launch-receipts/rival-push-checkpoint/CLOCK_SET.state", sha1: START_SHA1 },
    base: { target: null, limits: { maxTurns: 20000, failureLimit: 3, replyFailuresEndRun: false }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: INCUMBENT_FEATURES },
    switches: ["world-destinations-v1", "game-evidence-priority-v1", "named-warp-destinations-v1"],
    offInBoth: ["milestone-stall-stop-v1"],
    phases: [
      { id: "confirmatory", perArm: 4, maxWallMs: 900_000, primary: true },
      { id: "cook", perArm: 2, maxWallMs: 3_600_000, primary: false },
    ],
    lanes: [
      { id: "A", gpu: "GPU1", gamePort: 8071, modelUrl: "http://127.0.0.1:8091" },
      { id: "B", gpu: "GPU0", gamePort: 8072, modelUrl: "http://127.0.0.1:8098" },
    ],
    serving: { model: MODEL_PATH, build: "b10236-1464c62d8", contextTokens: 65536, slots: 1 },
    replacementReserveMs: 1_800_000,
    seed: "00c0ffee00c0ffee",
    ...overrides,
  };
}

export function definition(overrides: Partial<Omit<FixedDefinition, "plan">> = {}): FixedDefinition {
  const draft = draftDefinition(overrides);
  return { ...draft, plan: generatePlan(draft) };
}
