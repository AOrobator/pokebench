import { expect, it } from "vitest";
import preset from "../../../experiments/presets/rayquaza-lane-8h.json" with { type: "json" };
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
});
