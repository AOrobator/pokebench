// The pre-registered tests of a fixed-run experiment: two-sided Fisher exact on reaching the
// primary milestone, log-rank on time to it (censored at the wall cap), and Mann-Whitney on
// furthest milestone depth then time; pooled and per lane, over valid trials only.
import { phaseOf, type FixedArm, type FixedDefinition } from "./fixed-design.js";
import { DEPTH_ORDER } from "@pokebench/agent/milestones";
import { classifyTrial, queueState, WALL_CAP, type FixedLedgerEntry } from "./fixed-ledger.js";

export interface AnalysisTrial {
  readonly slot: number;
  readonly lane: string;
  readonly arm: FixedArm;
  readonly run: string;
  readonly valid: boolean;
  readonly reason: string;
  readonly primaryReached: boolean;
  readonly primaryMs: number | null;
  readonly capMs: number;
  readonly furthest?: string | null;
  readonly furthestDepth: number;
  readonly furthestMs: number | null;
}

const logFactorials: number[] = [0];
function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++) logFactorials.push((logFactorials[i - 1] ?? 0) + Math.log(i));
  return logFactorials[n] ?? 0;
}

// Table [[a, b], [c, d]]; sums every table with the same margins no more likely than the observed one.
export function fisherExact(a: number, b: number, c: number, d: number): number {
  const row1 = a + b, row2 = c + d, col1 = a + c, n = a + b + c + d;
  if (n === 0) return 1;
  const logP = (x: number): number => logFactorial(row1) + logFactorial(row2) + logFactorial(col1) + logFactorial(n - col1) - logFactorial(n) - logFactorial(x) - logFactorial(row1 - x) - logFactorial(col1 - x) - logFactorial(row2 - col1 + x);
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, col1 - row2); x <= Math.min(row1, col1); x++) {
    const lp = logP(x);
    // Relative tolerance, as R and scipy use, so tables tied with the observed one count.
    if (lp <= observed + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

// erfc(x) = Q(1/2, x²), the regularized upper incomplete gamma function (series below a + 1, continued
// fraction above), accurate to ~1e-15 so that small p values keep their digits.
export function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  const z = x * x;
  if (z < 1.5) {
    let sum = 1 / 0.5, term = 1 / 0.5;
    for (let n = 1; n < 200; n++) {
      term *= z / (0.5 + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-16) break;
    }
    return 1 - sum * Math.exp(-z + 0.5 * Math.log(z) - logGammaHalf);
  }
  let b = z + 0.5, c = 1 / 1e-300, d = 1 / b, h = d;
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - 0.5);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-z + 0.5 * Math.log(z) - logGammaHalf) * h;
}
const logGammaHalf = 0.5 * Math.log(Math.PI);

const normalTwoSided = (z: number): number => Math.min(1, erfc(Math.abs(z) / Math.SQRT2));

export interface MannWhitney { readonly u: number; readonly z: number; readonly p: number; readonly superiority: number }

// U for x (larger values are better), normal approximation with tie and continuity corrections.
export function mannWhitney(x: readonly number[], y: readonly number[]): MannWhitney {
  const n1 = x.length, n2 = y.length;
  if (n1 === 0 || n2 === 0) return { u: 0, z: 0, p: 1, superiority: 0.5 };
  const all = [...x.map((v) => ({ v, x: true })), ...y.map((v) => ({ v, x: false }))].sort((a, b) => a.v - b.v);
  const n = all.length;
  let rankX = 0, ties = 0;
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && all[j + 1]?.v === all[i]?.v) j++;
    const rank = (i + j + 2) / 2, t = j - i + 1;
    ties += t * t * t - t;
    for (let k = i; k <= j; k++) if (all[k]?.x === true) rankX += rank;
    i = j + 1;
  }
  const u = rankX - (n1 * (n1 + 1)) / 2;
  const mean = (n1 * n2) / 2;
  const variance = ((n1 * n2) / 12) * (n + 1 - ties / (n * (n - 1)));
  if (variance <= 0) return { u, z: 0, p: 1, superiority: u / (n1 * n2) };
  const z = (Math.abs(u - mean) - 0.5) / Math.sqrt(variance);
  return { u, z: Math.sign(u - mean) * Math.max(0, z), p: normalTwoSided(Math.max(0, z)), superiority: u / (n1 * n2) };
}

export interface Survival { readonly time: number; readonly event: boolean }
export function logRank(a: readonly Survival[], b: readonly Survival[]): { chi2: number; p: number } {
  const times = [...new Set([...a, ...b].filter((s) => s.event).map((s) => s.time))].sort((x, y) => x - y);
  let observedMinusExpected = 0, variance = 0;
  for (const t of times) {
    const atRiskA = a.filter((s) => s.time >= t).length, atRiskB = b.filter((s) => s.time >= t).length;
    const n = atRiskA + atRiskB;
    const deathsA = a.filter((s) => s.event && s.time === t).length, deaths = deathsA + b.filter((s) => s.event && s.time === t).length;
    observedMinusExpected += deathsA - (deaths * atRiskA) / n;
    if (n > 1) variance += (deaths * (atRiskA / n) * (1 - atRiskA / n) * (n - deaths)) / (n - 1);
  }
  if (variance <= 0) return { chi2: 0, p: 1 };
  const chi2 = (observedMinusExpected * observedMinusExpected) / variance;
  return { chi2, p: normalTwoSided(Math.sqrt(chi2)) };
}

// One number per trial that ranks a deeper furthest milestone first, then reaching it sooner.
export function depthThenTime(t: Pick<AnalysisTrial, "furthestDepth" | "furthestMs">): number {
  if (t.furthestDepth < 0) return -1;
  return t.furthestDepth * 1e10 + (1e10 - 1 - (t.furthestMs ?? 0));
}

export interface ArmCount { readonly n: number; readonly reached: number }
export interface GroupResult {
  readonly name: string;
  readonly bundle: ArmCount;
  readonly control: ArmCount;
  readonly fisherP: number;
  readonly logRank: { chi2: number; p: number };
  readonly mannWhitney: MannWhitney;
}
export interface AnalysisReport {
  readonly groups: readonly GroupResult[];
  readonly invalid: readonly Pick<AnalysisTrial, "slot" | "lane" | "arm" | "run" | "reason">[];
  readonly endedEarly: readonly Pick<AnalysisTrial, "slot" | "lane" | "arm" | "run" | "reason">[];
}

const reachedInCap = (t: AnalysisTrial): boolean => t.primaryReached && t.primaryMs !== null && t.primaryMs <= t.capMs;

function group(name: string, trials: readonly AnalysisTrial[]): GroupResult {
  const arm = (a: FixedArm): AnalysisTrial[] => trials.filter((t) => t.arm === a);
  const count = (ts: readonly AnalysisTrial[]): ArmCount => ({ n: ts.length, reached: ts.filter(reachedInCap).length });
  const bundle = count(arm("bundle")), control = count(arm("control"));
  const survival = (ts: readonly AnalysisTrial[]): Survival[] => ts.map((t) => (reachedInCap(t) && t.primaryMs !== null ? { time: t.primaryMs, event: true } : { time: t.capMs, event: false }));
  return {
    name, bundle, control,
    fisherP: fisherExact(bundle.reached, bundle.n - bundle.reached, control.reached, control.n - control.reached),
    logRank: logRank(survival(arm("bundle")), survival(arm("control"))),
    mannWhitney: mannWhitney(arm("bundle").map(depthThenTime), arm("control").map(depthThenTime)),
  };
}

export function analyze(trials: readonly AnalysisTrial[], lanes: readonly string[]): AnalysisReport {
  const valid = trials.filter((t) => t.valid);
  return {
    groups: [group("pooled", valid), ...lanes.map((l) => group(l, valid.filter((t) => t.lane === l)))],
    invalid: trials.filter((t) => !t.valid).map(({ slot, lane, arm, run, reason }) => ({ slot, lane, arm, run, reason })),
    endedEarly: valid.filter((t) => t.reason !== WALL_CAP).map(({ slot, lane, arm, run, reason }) => ({ slot, lane, arm, run, reason })),
  };
}

const pct = (c: ArmCount): string => `${String(c.reached)}/${String(c.n)} (${c.n === 0 ? "–" : `${String(Math.round((100 * c.reached) / c.n))}%`})`;
const p4 = (p: number): string => p.toPrecision(4);
const below = (p: number, alpha: number): string => (p < alpha ? "yes" : "no");

export function renderAnalysis(report: AnalysisReport, title: string): string {
  const lines = [
    `# ${title}`, "",
    ...(report.endedEarly.length === 0 ? ["Every valid trial ended at its wall cap.", ""] : [
      `## WARNING: ${String(report.endedEarly.length)} valid trial${report.endedEarly.length === 1 ? "" : "s"} ended before ${report.endedEarly.length === 1 ? "its" : "their"} wall cap`, "",
      "The pre-registration lets only the wall cap end a trial. These are counted below as they ended; review them before reading the tests.", "",
      "| Slot | Lane | Arm | Run | Reason |", "|---|---|---|---|---|",
      ...report.endedEarly.map((t) => `| ${String(t.slot)} | ${t.lane} | ${t.arm} | ${t.run} | ${t.reason} |`), "",
    ]),
    "Valid trials only. Two-sided tests; the pre-registered thresholds are p < 0.05 and p < 0.10.", "",
    "## Fisher exact on reaching the primary milestone", "",
    "| Group | Bundle | Control | p | p < 0.05 | p < 0.10 |", "|---|---|---|---|---|---|",
    ...report.groups.map((g) => `| ${g.name} | ${pct(g.bundle)} | ${pct(g.control)} | ${p4(g.fisherP)} | ${below(g.fisherP, 0.05)} | ${below(g.fisherP, 0.1)} |`), "",
    "## Log-rank on time to the primary milestone, censored at the wall cap", "",
    "| Group | χ² | p | p < 0.05 | p < 0.10 |", "|---|---|---|---|---|",
    ...report.groups.map((g) => `| ${g.name} | ${g.logRank.chi2.toFixed(3)} | ${p4(g.logRank.p)} | ${below(g.logRank.p, 0.05)} | ${below(g.logRank.p, 0.1)} |`), "",
    "## Mann-Whitney on furthest milestone depth, then time to it", "",
    "| Group | U (bundle) | P(bundle ranks above control) | z | p | p < 0.05 | p < 0.10 |", "|---|---|---|---|---|---|---|",
    ...report.groups.map((g) => `| ${g.name} | ${String(g.mannWhitney.u)} | ${g.mannWhitney.superiority.toFixed(3)} | ${g.mannWhitney.z.toFixed(3)} | ${p4(g.mannWhitney.p)} | ${below(g.mannWhitney.p, 0.05)} | ${below(g.mannWhitney.p, 0.1)} |`), "",
    "## Invalid trials (infrastructure failures, kept in the record and replaced)", "",
    ...(report.invalid.length === 0 ? ["No invalid trials."] : ["| Slot | Lane | Arm | Run | Reason |", "|---|---|---|---|---|", ...report.invalid.map((t) => `| ${String(t.slot)} | ${t.lane} | ${t.arm} | ${t.run} | ${t.reason} |`)]),
    "",
  ];
  return lines.join("\n");
}

// Ledger entries keep the depth index they were graded with, on the order of their day. Re-grade
// depth from the trial's own complete log (run_start first, run_end last); otherwise re-map the
// stored furthest name onto DEPTH_ORDER. A stored activity name with no usable log cannot be
// re-graded, so it is listed. The primary outcome and validity always stay as the ledger has them.
export function rescoreTrials(trials: readonly AnalysisTrial[], events: (run: string) => string | null, progressOrder?:readonly string[]): { trials: AnalysisTrial[]; unscored: string[] } {
  const unscored: string[] = [];
  const rescored = trials.map((t) => {
    const text = events(t.run);
    if (text !== null && completeLog(text, t.run)) {
      const o = classifyTrial(text, { maxWallMs: t.capMs, primary: "",...(progressOrder===undefined?{}:{progressOrder}) }, undefined);
      return { ...t, furthest: o.furthest, furthestDepth: o.furthestDepth, furthestMs: o.furthestMs };
    }
    if (t.furthest === undefined || t.furthest === null) return t;
    const depth = (progressOrder??DEPTH_ORDER).indexOf(t.furthest);
    if (depth < 0) { unscored.push(t.run); return t; }
    return { ...t, furthestDepth: depth };
  });
  return { trials: rescored, unscored };
}

// Every line is one of this run's events, the first is run_start and the last is run_end.
function completeLog(text: string, run: string): boolean {
  const types: unknown[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let e: unknown;
    try { e = JSON.parse(line); } catch { return false; }
    if (typeof e !== "object" || e === null || !("run" in e) || e.run !== run || !("type" in e)) return false;
    types.push(e.type);
  }
  return types[0] === "run_start" && types.at(-1) === "run_end";
}

export function trialsFromLedger(def: FixedDefinition, entries: readonly FixedLedgerEntry[], phase: string): AnalysisTrial[] {
  const capMs = phaseOf(def, phase).maxWallMs;
  const state = queueState(def, entries);
  return state.slots.filter((s) => s.phase === phase).flatMap((s) => {
    const o = state.outcomes.get(s.slot);
    if (o === undefined) return [];
    return [{ slot: s.slot, lane: s.lane, arm: s.arm, run: o.run, valid: o.valid, reason: o.reason, primaryReached: o.primaryReached, primaryMs: o.primaryMs, capMs, furthest: o.furthest, furthestDepth: o.furthestDepth, furthestMs: o.furthestMs }];
  });
}
