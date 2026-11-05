import { expect, it } from "vitest";
import preset from "../../../experiments/presets/rayquaza-lane-8h.json" with { type: "json" };
import { contextBudget } from "./play-wiring.js";
import { parsePlayPreset } from "./play-preset.js";

it("the Rayquaza preset is valid and keeps the lane's switches", () => {
  const parsed = parsePlayPreset(preset);
  expect(parsed.id).toBe("rayquaza-lane-8h");
  expect(parsed.limits.maxWallMs).toBe(8 * 3600 * 1000);
  if (parsed.version !== 2) throw new Error("version");
  expect(parsed.features["rq-milestone-guide-v1"]).toBe(true);
  expect(parsed.features["rq-battle-explainer-v1"]).toBe(true);
  expect(parsed.features["no-story-foreknowledge-v1"]).toBe(false);
  expect(parsed.features["coherent-battle-observation-v1"]).toBe(true);
  expect(parsed.features["just-in-time-prompt-v2"]).toBe(true);
  expect(parsed.features["jit-guide-reuse-v1"]).toBe(true);
  expect(parsed.features["rq-slim-prompt-v1"]).toBe(true);
  expect(parsed.features["context-exact-count-v1"]).toBe(false);
  expect(parsed.start).toBeUndefined();
});

it("keeps a hard context cap in the lane without the exact count", () => {
  const parsed = parsePlayPreset(preset);
  if (parsed.version !== 2) throw new Error("version");
  const fit = contextBudget(parsed.features, { contextWindow: 262_144 }, 8192, { compaction: () => undefined });
  expect(fit.exact).toBeUndefined();
  expect(fit.budget?.limit).toBe(262_144 - 8192 - 2048);
});
