import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "./play-preset.js";

const root = new URL("../../../", import.meta.url);
const json = <T>(path: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(path, root)), "utf8")) as T;

const PRESET = "experiments/presets/current-control-24h-8k.json";
const RECIPE = "experiments/feature-configs/current.json";

interface Recipe { readonly features: Record<string, boolean> }

// A preset outranks PLAY_MAX_TOKENS in live.ts, so the control arm's cap has to be pinned here:
// the 8K default alone never reaches a run that carries a preset.
it("runs the 24h control arm at the 8K cap and the unchanged thinking level", () => {
  const preset = parsePlayPreset(json(PRESET));
  expect(preset.id).toBe("current-control-24h-8k");
  expect(preset.target).toBeNull();
  expect(json<Record<string, unknown>>(PRESET)["start"]).toBeUndefined();
  expect(preset.sampling).toEqual({ thinkingLevel: "medium", maxTokens: 8192 });
  expect(preset.limits).toEqual({ maxTurns: 20000, maxWallMs: 86_400_000, failureLimit: 3, replyFailuresEndRun: false });
});

// Fails when the recipe gains or flips a switch, so the promoted preset cannot drift off the arm.
it("keeps the promoted 24h preset on the current control arm", () => {
  const recipe = json<Recipe>(RECIPE);
  const features = presetFeatures(parsePlayPreset(json(PRESET))) as unknown as Record<string, boolean>;
  for (const [id, on] of Object.entries(recipe.features)) expect(features[id]).toBe(on);
  expect(Object.values(features).filter(Boolean)).toHaveLength(Object.values(recipe.features).filter(Boolean).length);
});

// Fixed trials stay on their frozen 4K base: their recorded comparisons are not re-cut by this cap.
it("leaves the frozen fixed-run control base at 4096", () => {
  const frozen = json<{ sampling: { maxTokens: number } }>("experiments/fixed/control-bases/whole-map-bundle-fd95.json");
  expect(frozen.sampling.maxTokens).toBe(4096);
});
