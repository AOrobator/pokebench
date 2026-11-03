import { Value } from "typebox/value";
import { SWITCHABLE_FEATURES, type FeatureSet } from "../src/features.js";
import { FeatureSetSchema, normalizeFeatures } from "../src/play-preset.js";

// A recorded run_start feature map names every switch that existed when the run began. Switches retired since
// then are still in the recording and must stay there: the artifact is evidence, not a preset. Project the map
// onto the current registry — a retired switch's behaviour is now unconditional, so dropping the id is exact.
export function recordedFeatures(raw: unknown): FeatureSet {
  const known = new Set<string>(SWITCHABLE_FEATURES);
  const projected = Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([id]) => known.has(id)));
  return normalizeFeatures(Value.Parse(FeatureSetSchema, projected));
}
