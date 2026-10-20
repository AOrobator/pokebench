import { expect, it } from "vitest";
import type { SwitchableFeature } from "@pokebench/agent/features";
import { DEFAULT_NEXT_RUN, parseNextRun, presetFor } from "./next-run.js";

const ID = "original-speed-pacing-v1" as SwitchableFeature;

it("keeps the generic next-run speed policy OFF, including historical omitted drafts", () => {
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
  const oldFeatures = Object.fromEntries(Object.entries(DEFAULT_NEXT_RUN.features).filter(([id]) => id !== ID));
  const draft = parseNextRun({ ...DEFAULT_NEXT_RUN, model: "diagnostic", features: oldFeatures });
  expect(draft.features[ID]).toBe(false);
  expect(presetFor(draft, "historical-speed-draft").features[ID]).toBe(false);
});

it("preserves an explicitly selected future 80 FPS preset without promoting the generic default", () => {
  const draft = parseNextRun({ ...DEFAULT_NEXT_RUN, model: "diagnostic",
    features: { ...DEFAULT_NEXT_RUN.features, [ID]: true } });
  expect(draft.features[ID]).toBe(true);
  expect(presetFor(draft, "operator-selected-speed").features[ID]).toBe(true);
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
});
