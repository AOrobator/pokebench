import { describe, expect, it } from "vitest";
import type { RunEvent } from "./events.js";
import { IN_GAME, START_META } from "../test-support/events.js";
import { comparePatchResults, type PatchTrial, type PatchComparison } from "./patch-results.js";

const target = "LITTLEROOT_TOWN";
const time = (ms: number) => new Date(Date.UTC(2026, 9, 13, 0, 0, 0, ms)).toISOString().replace("Z", "-04:00");
function trial(run: string, arm: "incumbent" | "candidate", ms: number | null = 1000): PatchTrial {
  const feature = arm === "candidate" ? ["action-bias-v1"] : [];
  const events: RunEvent[] = [
    { ...START_META, type: "run_start", v: 1, run, seq: 0, turn: 0, t: time(0), harness_features: feature },
    { ...IN_GAME, type: "state", v: 1, run, seq: 1, turn: 1, t: time(ms ?? 1000) },
    ...(ms === null ? [] : [{ type: "milestone" as const, v: 1 as const, run, seq: 2, turn: 1, t: time(ms), name: target, kind: "navigation" as const, origin: "observed" as const, evidence: [1], server_timestamp: 0 }]),
    { type: "run_end", v: 1, run, seq: 3, turn: 1, t: time(ms ?? 1000), reason: ms === null ? "budget" : "milestone", furthest_milestone: ms === null ? null : target, turns: 1, wall_ms: ms ?? 1000, tokens: { input: 100, output: 20 } },
  ];
  return { events, environment: { fingerprint: "e".repeat(64), receipt: "runtime-and-rom.json" }, issues: [] };
}
function input(): PatchComparison {
  return { patchId: "action-bias", target, changedFeature: "action-bias-v1", stage: "screening", speedMarginPercent: 10, completionTolerance: 0,
    incumbent: { preset: "inc-v1", flags: { "action-bias-v1": false }, trials: Array.from({ length: 4 }, (_, i) => trial(`inc-${String(i)}`, "incumbent", 1000 + i * 100)) },
    candidate: { preset: "candidate-v1", flags: { "action-bias-v1": true }, trials: Array.from({ length: 4 }, (_, i) => trial(`new-${String(i)}`, "candidate", 500 + i * 100)) } };
}

describe("passive patch comparison", () => {
  it("reports four-per-arm completion and speed, requiring fresh confirmation", () => {
    const r = comparePatchResults(input());
    expect(r.eligible).toBe(true); expect(r.verdict).toBe("improve"); expect(r.recommendation).toBe("confirm");
    expect(r.incumbent.reached).toBe(4); expect(r.incumbent.elapsedMs?.median).toBe(1150); expect(r.candidate.elapsedMs?.median).toBe(650);
    expect(r.trials[0]?.evidence).toEqual([1, 2]);
  });
  it("does not mistake fast failures for a faster speedrun", () => {
    const p = input(); p.candidate.trials = Array.from({ length: 4 }, (_, i) => trial(`fail-${String(i)}`, "candidate", null));
    const r = comparePatchResults(p); expect(r.verdict).toBe("regress"); expect(r.recommendation).toBe("discard"); expect(r.candidate.elapsedMs).toBeNull();
  });
  it("retains incomplete runs without promoting a partial cohort", () => {
    const p = input(); p.candidate.trials[0]!.events = p.candidate.trials[0]!.events.slice(0, -1);
    const r = comparePatchResults(p); expect(r.eligible).toBe(false); expect(r.recommendation).toBe("retain"); expect(r.candidate.incomplete).toBe(1);
  });
  it("rejects historical three-per-arm data and records actual denominators", () => {
    const p = input(); p.incumbent.trials.pop(); const r = comparePatchResults(p);
    expect(r.eligible).toBe(false); expect(r.incumbent.launched).toBe(3); expect(r.problems.join(" ")).toContain("four");
  });
  it.each(["legacy", "present", "missing", "false"])("does not earn progress from %s evidence", (mode) => {
    const p = input(); const es = p.candidate.trials[0]!.events;
    const m = es.find((e) => e.type === "milestone"); const s = es.find((e) => e.type === "state");
    if (m?.type !== "milestone" || s?.type !== "state" || !("started" in s)) throw new Error("fixture");
    if (mode === "legacy") m.kind = "legacy";
    if (mode === "present") m.origin = "present_at_start";
    if (mode === "missing") m.evidence = [900];
    if (mode === "false") s.location = "INSIDE OF TRUCK";
    const r = comparePatchResults(p); expect(r.candidate.reached).toBe(3); expect(r.eligible).toBe(false);
  });
  it("fails closed on multiple changed flags and a metadata mismatch", () => {
    const p = input(); p.candidate.flags["other"] = true;
    expect(comparePatchResults(p).eligible).toBe(false);
    const q = input(); const e = q.candidate.trials[0]!.events[0]; if (e?.type !== "run_start") throw new Error("fixture"); e.harness.commit = "d".repeat(40);
    expect(comparePatchResults(q).problems.join(" ")).toContain("provenance");
  });
  it("names harness bugs and retains affected trials", () => {
    const p = input(); p.candidate.trials[0]!.issues.push({ kind: "harness_bug", message: "Wrong selected option", evidence: [1], invalidatesComparison: true });
    const r = comparePatchResults(p); expect(r.eligible).toBe(false); expect(r.recommendation).toBe("repair_and_rerun"); expect(r.trials).toHaveLength(8); expect(r.problems.join(" ")).toContain("harness bug");
  });
});
