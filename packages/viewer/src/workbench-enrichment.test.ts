import { describe, expect, it } from "vitest";
import { needsCardEnrichment } from "./workbench-data.js";

const base = { projector: true, runId: "r", projectorRuns: 3, snapshot: null } as const;

describe("when the viewer loads /api/cards to enrich the workbench", () => {
  it("loads them when the current projector has no runs (no projector service on this runs root)", () => {
    expect(needsCardEnrichment({ ...base, projectorRuns: 0 })).toBe(true);
    expect(needsCardEnrichment({ ...base, projectorRuns: 0, snapshot: { metadata: true, card: true } })).toBe(true);
  });
  it("keeps every earlier answer", () => {
    expect(needsCardEnrichment({ ...base, projector: false })).toBe(true);
    expect(needsCardEnrichment({ ...base, projector: false, runId: null })).toBe(true);
    expect(needsCardEnrichment({ ...base, runId: null })).toBe(false);
    expect(needsCardEnrichment({ ...base, runId: null, projectorRuns: 0 })).toBe(false);
    expect(needsCardEnrichment(base)).toBe(false);
    expect(needsCardEnrichment({ ...base, snapshot: { metadata: true, card: true } })).toBe(false);
    expect(needsCardEnrichment({ ...base, snapshot: { metadata: false, card: true } })).toBe(true);
    expect(needsCardEnrichment({ ...base, snapshot: { metadata: true, card: false } })).toBe(true);
  });
});
