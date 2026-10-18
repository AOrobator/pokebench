import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_ON, type FeatureSet } from "@pokebench/agent/features";

export const QUEUE_FEATURES: FeatureSet = { ...ALL_ON, "state-only-decisions-v1": false, "named-interactions-v1": false, "world-destinations-v1": false, "no-exit-here-v1": false, "bag-healing-items-v1": false, "battle-menu-loop-v1": false, "clock-view-loop-v1": false,"stale-story-goal-v1": false, "reopened-dialogue-loop-v1": false, "dialog-button-b-v1": false, "full-map-navigation-v1": false, "objective-tracking-v1": false, "repeat-attempt-guard-v1": false, "native-objective-completion-v1": false };

export function definition(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1, id, title: `Experiment ${id}`, changedFeature: "full-map-navigation-v1", hypothesis: "It helps.",
    activationMilestone: "FIRST_TRUCK_EXIT", primaryMilestone: "RIVAL_HOUSE_ENTERED", queuePosition: 1,
    source: { checkout: "main", commit: "a".repeat(40) },
    incumbent: { version: 2, id: "incumbent", target: null, limits: { maxTurns: 1500, maxWallMs: 1_800_000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: QUEUE_FEATURES },
    trialsPerArm: 4, modelLane: "think-fast", budget: { maxWallMs: 8 * 1_800_000 },
    criteria: { completionTolerance: 0, speedMarginPercent: 10 }, readiness: { window: 4, minReached: 3 },
    ...over,
  };
}

export function writeDefinition(dir: string, value: Record<string, unknown>, file = `${String(value["id"])}.json`): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), JSON.stringify(value));
}
