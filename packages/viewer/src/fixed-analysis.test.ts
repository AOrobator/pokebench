import { describe, expect, it } from "vitest";
import { DEPTH_ORDER, MILESTONE_ORDER } from "@pokebench/agent/milestones";
import { analyze, depthThenTime, fisherExact, logRank, mannWhitney, renderAnalysis, rescoreTrials, trialsFromLedger, type AnalysisTrial } from "./fixed-analysis.js";
import { definition } from "../test-support/fixed.js";
import type { FixedLedgerEntry } from "./fixed-ledger.js";

describe("fisherExact (two-sided)", () => {
  it("matches scipy.stats.fisher_exact", () => {
    expect(fisherExact(3, 1, 1, 3)).toBeCloseTo(0.485714285714, 9);
    expect(fisherExact(8, 2, 1, 5)).toBeCloseTo(0.034965034965, 9);
    expect(fisherExact(10, 22, 20, 12)).toBeCloseTo(0.0234138547183, 9);
    expect(fisherExact(0, 0, 0, 0)).toBe(1);
    expect(fisherExact(5, 0, 5, 0)).toBe(1);
  });
});

describe("mannWhitney (normal approximation, tie and continuity corrected)", () => {
  it("matches scipy.stats.mannwhitneyu(method='asymptotic')", () => {
    expect(mannWhitney([4, 5, 6], [1, 2, 3])).toMatchObject({ u: 9, superiority: 1 });
    expect(mannWhitney([4, 5, 6], [1, 2, 3]).p).toBeCloseTo(0.0808555983700, 9);
    const tied = mannWhitney([1, 2, 2, 3, 5], [2, 3, 3, 4, 6, 7]);
    expect(tied.u).toBe(7);
    expect(tied.p).toBeCloseTo(0.163045055854, 9);
  });
  it("returns p 1 when the samples cannot be compared", () => {
    expect(mannWhitney([], [1])).toEqual({ u: 0, z: 0, p: 1, superiority: 0.5 });
    expect(mannWhitney([2, 2], [2, 2]).p).toBe(1);
  });
});

describe("logRank", () => {
  it("matches lifelines.statistics.logrank_test, ties included", () => {
    const one = logRank([[100, true], [200, true], [300, true], [900, false], [900, false]].map(([time, event]) => ({ time: Number(time), event: Boolean(event) })), [[250, true], [400, true], [900, false], [900, false], [900, false]].map(([time, event]) => ({ time: Number(time), event: Boolean(event) })));
    expect(one.chi2).toBeCloseTo(0.704199858745, 9);
    expect(one.p).toBeCloseTo(0.401376069104, 9);
    const tied = logRank([{ time: 100, event: true }, { time: 200, event: true }, { time: 200, event: true }, { time: 900, event: false }], [{ time: 200, event: true }, { time: 300, event: true }, { time: 900, event: false }]);
    expect(tied.p).toBeCloseTo(0.534236374218, 9);
  });
  it("returns p 1 with no events", () => {
    expect(logRank([{ time: 9, event: false }], [{ time: 9, event: false }])).toEqual({ chi2: 0, p: 1 });
  });
});

describe("depthThenTime", () => {
  it("ranks a deeper milestone first, then the earlier one, and no milestone last", () => {
    const t = (furthestDepth: number, furthestMs: number | null) => ({ furthestDepth, furthestMs });
    const scores = [t(-1, null), t(2, 500), t(2, 100), t(3, 899_000)].map(depthThenTime);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });
});

function trial(slot: number, lane: string, arm: "bundle" | "control", reachedMs: number | null, valid = true): AnalysisTrial {
  return { slot, lane, arm, run: `r${String(slot)}`, valid, reason: valid ? "wall cap" : "emulator or game server crash", primaryReached: reachedMs !== null, primaryMs: reachedMs, capMs: 900_000, furthestDepth: reachedMs === null ? 3 : 9, furthestMs: reachedMs ?? 400_000 };
}

describe("analyze and renderAnalysis", () => {
  const trials: AnalysisTrial[] = [
    ...[100, 200, 300, null, null].map((ms, i) => trial(i + 1, "A", "bundle", ms === null ? null : ms * 1000)),
    ...[250, 400, null, null, null].map((ms, i) => trial(i + 6, "A", "control", ms === null ? null : ms * 1000)),
    ...[150, null].map((ms, i) => trial(i + 11, "B", "bundle", ms === null ? null : ms * 1000)),
    ...[null, null].map((_ms, i) => trial(i + 13, "B", "control", null)),
    trial(15, "B", "bundle", null, false),
  ];
  const report = analyze(trials, ["A", "B"]);

  it("tests pooled and per lane over valid trials only, and lists the invalid ones", () => {
    expect(report.groups.map((g) => g.name)).toEqual(["pooled", "A", "B"]);
    const pooled = report.groups[0];
    expect(pooled).toMatchObject({ bundle: { n: 7, reached: 4 }, control: { n: 7, reached: 2 } });
    expect(pooled?.fisherP).toBeCloseTo(fisherExact(4, 3, 2, 5), 12);
    const laneA = report.groups[1];
    expect(laneA?.logRank.chi2).toBeCloseTo(0.704199858745, 9);
    expect(report.invalid).toEqual([{ slot: 15, lane: "B", arm: "bundle", run: "r15", reason: "emulator or game server crash" }]);
  });

  it("renders the pre-registered thresholds and every test", () => {
    const text = renderAnalysis(report, "bundle-v-control confirmatory");
    expect(text).toContain("# bundle-v-control confirmatory");
    expect(text).toMatch(/\| pooled \| 4\/7 \(57%\) \| 2\/7 \(29%\) \| [0-9.]+ \| no \| no \|/);
    expect(text).toContain("Log-rank");
    expect(text).toContain("Mann-Whitney");
    expect(text).toContain("| 15 | B | bundle | r15 | emulator or game server crash |");
    expect(renderAnalysis(analyze([], ["A"]), "empty")).toContain("No invalid trials.");
  });
});

describe("trials that ended before the wall cap", () => {
  it("lists every valid trial that did not end at the wall cap, loudly, and says so when there are none", () => {
    const early = { ...trial(3, "B", "bundle", null), reason: "ended stuck before the wall cap" };
    const text = renderAnalysis(analyze([early, trial(4, "B", "control", null)], ["B"]), "x");
    expect(text).toContain("## WARNING: 1 valid trial ended before its wall cap");
    expect(text).toContain("| 3 | B | bundle | r3 | ended stuck before the wall cap |");
    expect(renderAnalysis(analyze([trial(4, "B", "control", null)], ["B"]), "x")).toContain("Every valid trial ended at its wall cap.");
  });
});

describe("analyze against the cap", () => {
  it("counts a primary milestone after the cap as a miss in Fisher as well as log-rank", () => {
    const late = { ...trial(1, "A", "bundle", 900_500), primaryMs: 900_500 };
    const report = analyze([late, trial(2, "A", "control", null)], ["A"]);
    expect(report.groups[0]?.bundle).toEqual({ n: 1, reached: 0 });
  });
});

describe("trialsFromLedger", () => {
  it("takes the phase's trials with an outcome, with the phase's cap", () => {
    const def = definition();
    const slot = def.plan[0];
    const cook = def.plan.find((s) => s.phase === "cook");
    if (slot === undefined || cook === undefined) throw new Error("fixture");
    const entries: FixedLedgerEntry[] = [
      { kind: "launch", slot: slot.slot, lane: slot.lane, phase: slot.phase, arm: slot.arm, run: "r1", at: "x", commit: "c", sources: "s", presetSha256: "p", serving: "f" },
      { kind: "outcome", slot: slot.slot, run: "r1", at: "x", valid: true, reason: "wall cap", endReason: "budget", primaryReached: true, primaryMs: 5, furthest: "RIVAL_MET", furthestDepth: 9, furthestMs: 5, wallMs: 900_000, turns: 3 },
      { kind: "launch", slot: cook.slot, lane: cook.lane, phase: "cook", arm: cook.arm, run: "r2", at: "x", commit: "c", sources: "s", presetSha256: "p", serving: "f" },
      { kind: "outcome", slot: cook.slot, run: "r2", at: "x", valid: true, reason: "wall cap", endReason: "budget", primaryReached: false, primaryMs: null, furthest: null, furthestDepth: -1, furthestMs: null, wallMs: 3_600_000, turns: 3 },
      { kind: "launch", slot: 99, lane: "A", phase: "confirmatory", arm: "bundle", run: "r3", at: "x", commit: "c", sources: "s", presetSha256: "p", serving: "f" },
    ];
    expect(trialsFromLedger(def, entries, "confirmatory")).toEqual([{ slot: slot.slot, lane: slot.lane, arm: slot.arm, run: "r1", valid: true, reason: "wall cap", primaryReached: true, primaryMs: 5, capMs: 900_000, furthestDepth: 9, furthestMs: 5 }]);
    expect(trialsFromLedger(def, entries, "cook")).toHaveLength(1);
  });
});

describe("rescoreTrials", () => {
  const trial = (run: string, furthest: string | null, furthestDepth: number): AnalysisTrial => ({ slot: 1, lane: "A", arm: "bundle", run, valid: true, reason: "wall cap", primaryReached: true, primaryMs: 5, capMs: 900_000, furthest, furthestDepth, furthestMs: 7 });
  const t0 = "2026-10-16T10:00:00.000-04:00";
  const at = (ms: number) => new Date(Date.parse(t0) + ms).toISOString();
  const log = (run: string, ended: boolean) => [
    { v: 1, run, seq: 1, turn: 0, t: t0, type: "run_start" },
    ...[[1000, "ROUTE_103"], [2000, "FIRST_POKECENTER_HEAL"]].map(([ms, name], i) => ({ v: 1, run, seq: i + 2, turn: 1, t: at(Number(ms)), type: "milestone", name, kind: "story", origin: "observed", server_timestamp: 1, evidence: [1] })),
    ...(ended ? [{ v: 1, run, seq: 9, turn: 1, t: at(5000), type: "run_end", reason: "budget", furthest_milestone: "FIRST_POKECENTER_HEAL", turns: 1, wall_ms: 5000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } }] : []),
  ].map((e) => JSON.stringify(e)).join("\n") + "\n";
  const logs: Record<string, string> = { complete: log("complete", true), truncated: log("truncated", false), corrupt: "not json\n" };
  const read = (run: string) => logs[run] ?? null;
  const oldDepth = (name: string) => MILESTONE_ORDER.indexOf(name);
  it("re-grades only depth, and only from a complete log, so the primary outcome stays as the ledger recorded it", () => {
    const { trials, unscored } = rescoreTrials([trial("complete", "FIRST_POKECENTER_HEAL", oldDepth("FIRST_POKECENTER_HEAL"))], read);
    expect(trials).toEqual([{ ...trial("complete", "ROUTE_103", DEPTH_ORDER.indexOf("ROUTE_103")), furthestMs: 1000 }]);
    expect(unscored).toEqual([]);
  });
  it("re-maps a stored name onto the depth order when the log is missing, truncated or corrupt, and lists what it cannot re-grade", () => {
    const { trials, unscored } = rescoreTrials([trial("missing", "ROUTE_102", oldDepth("ROUTE_102")), trial("truncated", "RIVAL_MET", oldDepth("RIVAL_MET")), trial("corrupt", "FIRST_POKECENTER_HEAL", oldDepth("FIRST_POKECENTER_HEAL")), trial("../escape", "ROUTE_102", 1), trial("nothing", null, -1)], read);
    expect(trials.map((t) => [t.run, t.furthest, t.furthestDepth, t.primaryReached])).toEqual([
      ["missing", "ROUTE_102", DEPTH_ORDER.indexOf("ROUTE_102"), true],
      ["truncated", "RIVAL_MET", DEPTH_ORDER.indexOf("RIVAL_MET"), true],
      ["corrupt", "FIRST_POKECENTER_HEAL", oldDepth("FIRST_POKECENTER_HEAL"), true],
      ["../escape", "ROUTE_102", DEPTH_ORDER.indexOf("ROUTE_102"), true],
      ["nothing", null, -1, true],
    ]);
    expect(unscored).toEqual(["corrupt"]);
  });
});
