import { describe, expect, it } from "vitest";
import { distinctLabels, legacyCohort, taggedCohorts } from "./experiment-cohorts.js";
describe("experiment cohort definitions and labels", () => {
  it("orders tagged entries by first trial, tolerating unknown start times, and labels legacy values", () => {
    const defs = new Map([["exp", { id: "exp", title: "Experiment" }]]), A = "a".repeat(40), B = "b".repeat(40);
    const { membership, cohorts } = taggedCohorts([
      { run: "r1", experiment: "exp", commit: B, started: "2026-10-16T12:00:00.000-04:00" },
      { run: "r2", experiment: "exp", commit: B, started: "2026-10-16T11:00:00.000-04:00" },
      { run: "r3", experiment: "exp", commit: A, started: null },
      { run: "r4", experiment: "exp", commit: A, started: "2026-10-16T09:05:00.000-04:00" },
      { run: "r5", experiment: "loose-dryrun-x", commit: A, started: null },
      { run: "r6", experiment: "zz", commit: A, started: null },
    ], defs);
    expect(membership.get("r1")).toBe(`experiment:exp@${B.slice(0, 12)}`);
    expect(cohorts.map(c => c.label)).toEqual(["Experiment · build aaaaaaa, first trial Oct 16, 9:05 AM ET", "Experiment · build bbbbbbb, first trial Oct 16, 11:00 AM ET", "loose-dryrun-x", "zz"]);
    expect(cohorts[2]).toMatchObject({ experiment: "loose-dryrun-x", dryRun: true });
    expect(taggedCohorts([{ run: "r", experiment: "exp", commit: A, started: null }, { run: "s", experiment: "exp", commit: B, started: null }], defs).cohorts.map(c => c.label)).toEqual(["Experiment · build aaaaaaa, first trial unknown", "Experiment · build bbbbbbb, first trial unknown"]);
    expect(legacyCohort("experiment:exp-dryrun", defs)).toEqual({ id: "experiment:exp-dryrun", label: "Experiment (dry run)", experiment: "exp-dryrun", build: null, dryRun: true });
    expect(legacyCohort("experiment:nope:finals", defs).label).toBe("experiment:nope:finals");
    expect(taggedCohorts([{ run: "s1", experiment: "exp-solo-bundle-b-2", commit: A, started: null }, { run: "s2", experiment: "nope-solo-bundle-b-1", commit: A, started: null }], defs).cohorts.map(c => [c.label, c.experiment, c.dryRun])).toEqual([["Experiment (exploratory: bundle only, lane B, #2)", "exp-solo-bundle-b-2", false], ["nope-solo-bundle-b-1", "nope-solo-bundle-b-1", false]]);
    expect(legacyCohort("exp", defs).label).toBe("Experiment");
    const entry = (id: string, label: string) => ({ id, label, experiment: null, build: null, dryRun: false });
    expect(distinctLabels([entry("a", "L"), entry("b", "L")]).map(c => c.label)).toEqual(["L", "L (b)"]);
    const labels = distinctLabels([entry("a", "L"), entry("b", "L"), entry("c", "L (b)"), entry("d", "L (b) (c)"), entry("e", "L (b)")]).map(c => c.label);
    expect(new Set(labels).size).toBe(5); expect(labels.slice(0, 2)).toEqual(["L", "L (b)"]);
  });
});
