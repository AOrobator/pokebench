import { createHash } from "node:crypto";
import type { RunEvent } from "./events.js";
import { MILESTONES } from "./milestones.js";
import { summarize } from "./summary.js";

export interface TrialIssue { kind: "harness_bug" | "infrastructure"; message: string; evidence: number[]; invalidatesComparison: boolean }
export interface PatchTrial { events: RunEvent[]; environment: { fingerprint: string; receipt: string }; issues: TrialIssue[] }
export interface PatchArm { preset: string; flags: Record<string, boolean>; trials: PatchTrial[] }
export interface AllowedPromptChange { changedFeature: string; incumbentSha256: string; candidateSha256: string; auditReceipt: string }
export interface PatchComparison {
  patchId: string; target: string; changedFeature: string; stage: "screening" | "confirmation";
  speedMarginPercent: number; completionTolerance: number; incumbent: PatchArm; candidate: PatchArm; allowedPromptChange?: AllowedPromptChange;
}
export interface Distribution { median: number; min: number; max: number; count: number }
export interface TrialResult {
  arm: "incumbent" | "candidate"; run: string; outcome: "reached" | "not_reached" | "incomplete" | "unqualified" | "present_at_start";
  reason: string; elapsedMs: number | null; targetTurn: number | null; evidence: number[];
  tokens: { input: number; output: number }; turns: number; issues: TrialIssue[]; coverage: { positive: number; negative: number; unknown: number };
}
export interface ArmResult { preset: string; launched: number; reached: number; incomplete: number; elapsedMs: Distribution | null; targetTurns: Distribution | null; stopReasons: Record<string, number> }
export interface PatchResult {
  patchId: string; target: string; eligible: boolean; verdict: "improve" | "regress" | "inconclusive";
  recommendation: "confirm" | "keep" | "discard" | "retain" | "repair_and_rerun";
  incumbent: ArmResult; candidate: ArmResult; timeChangePercent: number | null;
  problems: string[]; trials: TrialResult[]; limitations: string[];
  configuration: { changedFeature: string; incumbentFlags: Record<string, boolean>; candidateFlags: Record<string, boolean>; allowedPromptChange?: AllowedPromptChange };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return value === undefined ? "undefined" : JSON.stringify(value);
}
function distribution(values: number[]): Distribution | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return { median: sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2, min: (sorted[0] ?? 0), max: (sorted.at(-1) ?? 0), count: values.length };
}
const EVALUATION_FEATURES={loopGuard:"deterministic-loop-guard-v1",activeUi:"active-ui-ownership-v1",interfaceDocs:"contextual-interface-docs-v1",objectives:"objective-tracking-v1"} as const;
function signature(e: Extract<RunEvent, { type: "run_start" }>, feature: string): string {
  const evaluation=e.evaluation===undefined?undefined:{target:e.evaluation.target,failure_limit:e.evaluation.failure_limit,flags:Object.fromEntries(Object.entries(e.evaluation.flags).filter(([flag])=>EVALUATION_FEATURES[flag as keyof typeof EVALUATION_FEATURES]!==feature))};
  return canonical({ evaluation, model: e.model, sampling: e.sampling, tools: e.tools, harness: e.harness, vendor: e.vendor_pin, pi: e.pi_version,
    start: e.start_state.kind === "boot" ? e.start_state : { kind: e.start_state.kind, sha1: e.start_state.sha1 },
    budgets: e.budgets, features: e.harness_features.filter((f) => f !== feature).sort() });
}

function assess(trial: PatchTrial, arm: TrialResult["arm"], target: string, problems: string[]): TrialResult {
  const es = trial.events;
  const start = es[0];
  if (start?.type !== "run_start") throw new Error("Patch trial must begin with run_start");
  const run = start.run;
  if (es.some((e, i) => e.run !== run || (i > 0 && e.seq <= (es[i - 1]?.seq ?? -1))) || es.filter((e) => e.type === "run_start").length !== 1 || es.filter((e) => e.type === "run_end").length > 1) problems.push(`${run}: invalid event identity/order`);
  const ended = es.findIndex((e) => e.type === "run_end");
  if (ended >= 0 && ended !== es.length - 1) problems.push(`${run}: events after terminal`);
  if (start.isolation.run_data_id !== run) problems.push(`${run}: isolation identity disagrees with run`);
  if (start.harness.dirty) problems.push(`${run}: dirty provenance`);
  if (start.harness_features.includes("probe")) problems.push(`${run}: probe is not a benchmark trial`);
  if (!/^[a-f0-9]{64}$/.test(trial.environment.fingerprint) || trial.environment.receipt.trim() === "") problems.push(`${run}: missing environment provenance receipt`);
  const definition = MILESTONES.find((m) => m.name === target && m.kind !== "legacy");
  if (definition === undefined) throw new Error(`Target ${target} is not a native story/navigation milestone`);
  const bySeq = new Map(es.map((e) => [e.seq, e]));
  const markers = es.filter((e): e is Extract<RunEvent, { type: "milestone" }> => e.type === "milestone" && e.name === target);
  const present = markers.some((e) => e.origin === "present_at_start");
  const marker = markers.find((e) => {
    const refs = e.evidence;
    if (e.origin !== "observed" || e.kind !== definition.kind || refs === undefined || refs.length === 0) return false;
    const lastSeq = refs.at(-1);
    const last = lastSeq === undefined ? undefined : bySeq.get(lastSeq);
    const latestRecorded = es.filter((state) => state.type === "state" && state.seq < e.seq).at(-1);
    if (last?.type !== "state" || !("started" in last) || last.seq !== latestRecorded?.seq || definition.reached(last) !== true) return false;
    if (!refs.every((seq) => seq < e.seq && bySeq.get(seq)?.run === run && bySeq.get(seq)?.type === "state")) return false;
    return target !== "FIRST_TRUCK_EXIT" || refs.some((seq) => {
      const before = bySeq.get(seq);
      return before?.type === "state" && "started" in before && before.seq < last.seq && before.location === "INSIDE OF TRUCK";
    });
  });
  const summary = summarize(es);
  const observed = es.flatMap((e) => e.type === "state" && "started" in e ? [definition.reached(e)] : []);
  const coverage = { positive: observed.filter((v) => v === true).length, negative: observed.filter((v) => v === false).length, unknown: observed.filter((v) => v === null).length };
  const neverQualified = coverage.positive + coverage.negative === 0;
  const positive = es.find((e) => e.type === "state" && "started" in e && definition.reached(e) === true);
  const missingMarker = markers.length === 0 && positive !== undefined;
  const issues = trial.issues.map((issue) => ({ ...issue, evidence: [...issue.evidence] }));
  if (missingMarker) issues.push({ kind: "harness_bug", message: "Native target event missing despite a positive state", evidence: [positive.seq], invalidatesComparison: true });
  const unqualified = (markers.length > 0 && marker === undefined && !present) || missingMarker || neverQualified;
  if (neverQualified) problems.push(`${run}: target state never qualified`);
  if (present) problems.push(`${run}: target already present at start`);
  if (unqualified) {
    problems.push(`${run}: unqualified native target evidence`);
    for (const claim of markers) {
      const seq = claim.evidence?.at(-1);
      const state = seq === undefined ? undefined : bySeq.get(seq);
      if (state?.type === "state" && "started" in state) {
        const value = definition.reached(state);
        if (value !== true) problems.push(`${run}: latest target proof expected true, observed ${String(value)} at state #${String(state.seq)} (milestone #${String(claim.seq)})`);
      }
    }
  }
  for (const issue of issues) {
    if (issue.evidence.length === 0 || issue.evidence.some((seq) => !bySeq.has(seq))) problems.push(`${run}: issue lacks recorded evidence`);
    if (issue.invalidatesComparison) problems.push(`${run}: ${issue.kind === "harness_bug" ? "harness bug" : "infrastructure"}: ${issue.message}`);
  }
  const elapsed = marker === undefined ? null : Date.parse(marker.t) - Date.parse(start.t);
  const invalidTime = elapsed !== null && (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > summary.wallMs);
  if (invalidTime) problems.push(`${run}: invalid target timing`);
  const pastCap=elapsed!==null&&start.evaluation!==undefined&&start.budgets.max_wall_ms!==undefined&&elapsed>start.budgets.max_wall_ms;
  const terminal=es.at(-1);
  if(pastCap&&terminal?.type==="run_end"&&terminal.reason==="milestone"&&terminal.target_proof?.name===target)problems.push(`${run}: target stop exceeds evaluation wall cap`);
  const qualified = marker !== undefined && !present && !invalidTime && !pastCap;
  return { arm, run, outcome: present ? "present_at_start" : unqualified || invalidTime ? "unqualified" : summary.reason === "incomplete" ? "incomplete" : qualified ? "reached" : "not_reached",
    reason: summary.reason, elapsedMs: qualified ? elapsed : null, targetTurn: qualified ? marker.turn : null, evidence: (qualified||pastCap)&&marker!==undefined ? [...(marker.evidence ?? []), marker.seq] : [],
    tokens: { ...summary.tokens }, turns: summary.turns, issues, coverage };
}
function armResult(preset: string, trials: TrialResult[]): ArmResult {
  const reasons: Record<string, number> = {};
  for (const trial of trials) reasons[trial.reason] = (reasons[trial.reason] ?? 0) + 1;
  return { preset, launched: trials.length, reached: trials.filter((t) => t.elapsedMs !== null).length, incomplete: trials.filter((t) => t.reason === "incomplete").length,
    elapsedMs: distribution(trials.flatMap((t) => t.elapsedMs === null ? [] : [t.elapsedMs])), targetTurns: distribution(trials.flatMap((t) => t.targetTurn === null ? [] : [t.targetTurn])), stopReasons: reasons };
}

/** Pure offline evaluation. Environment receipt identity is supplied by the audited manifest, not inferred from event metadata. */
export function comparePatchResults(input: PatchComparison): PatchResult {
  if (!Number.isFinite(input.speedMarginPercent) || input.speedMarginPercent <= 0 || input.speedMarginPercent > 100 || !Number.isInteger(input.completionTolerance) || input.completionTolerance < 0 || input.completionTolerance > 4) throw new Error("Invalid predeclared comparison margins");
  const problems: string[] = [];
  const keys = new Set([...Object.keys(input.incumbent.flags), ...Object.keys(input.candidate.flags)]);
  const differing = [...keys].filter((key) => input.incumbent.flags[key] !== input.candidate.flags[key]);
  if (differing.length !== 1 || differing[0] !== input.changedFeature || [...keys].some((key) => !(key in input.incumbent.flags) || !(key in input.candidate.flags))) problems.push("Expected exactly one changed flag with explicit values in both presets");
  const trials: TrialResult[] = [];
  const seen = new Set<string>();
  let common: string | undefined;
  let environment: string | undefined;
  const armPrompts: Partial<Record<TrialResult["arm"], string>> = {};
  for (const arm of ["incumbent", "candidate"] as const) {
    const config = input[arm];
    if (config.trials.length !== 4) problems.push(`${arm}: expected four trials, got ${String(config.trials.length)}`);
    let prompt: string | undefined;
    for (const trial of config.trials) {
      const first = trial.events[0]; if (first?.type !== "run_start") throw new Error("Patch trial must begin with run_start");
      if (seen.has(first.run)) problems.push(`${first.run}: duplicate trial`); seen.add(first.run);
      if (Object.entries(config.flags).some(([flag, enabled]) => first.harness_features.includes(flag) !== enabled)) problems.push(`${first.run}: flags disagree with recorded features`);
      if(first.evaluation!==undefined){
        if(first.budgets.max_wall_ms===undefined||first.budgets.max_wall_ms<=0)problems.push(`${first.run}: missing positive evaluation wall cap`);
        if(first.evaluation.target!==input.target)problems.push(`${first.run}: evaluation target disagrees with comparison target`);
        for(const [flag,feature] of Object.entries(EVALUATION_FEATURES))if(first.evaluation.flags[flag as keyof typeof EVALUATION_FEATURES]!==first.harness_features.includes(feature))problems.push(`${first.run}: evaluation ${flag} disagrees with recorded feature ${feature}`);
        if(first.evaluation.target!==null&&!first.harness_features.includes("native-target-stop-v1"))problems.push(`${first.run}: missing native target stop feature`);
      }
      const sig = signature(first, input.changedFeature);
      if (common !== undefined && sig !== common) problems.push(`${first.run}: incompatible run provenance`); common ??= sig;
      if (environment !== undefined && trial.environment.fingerprint !== environment) problems.push(`${first.run}: incompatible environment provenance`); environment ??= trial.environment.fingerprint;
      if (prompt !== undefined && first.system_prompt !== prompt) problems.push(`${first.run}: prompt changed within arm`); prompt ??= first.system_prompt;
      armPrompts[arm] ??= first.system_prompt;
      const declaration = input.allowedPromptChange;
      if (declaration !== undefined) {
        const expectedHash = arm === "incumbent" ? declaration.incumbentSha256 : declaration.candidateSha256;
        if (createHash("sha256").update(first.system_prompt).digest("hex") !== expectedHash) problems.push(`${first.run}: prompt differs from audited hash`);
      }
      trials.push(assess(trial, arm, input.target, problems));
    }
  }
  const declaration = input.allowedPromptChange;
  if (declaration === undefined) {
    if (armPrompts.incumbent !== undefined && armPrompts.candidate !== undefined && armPrompts.incumbent !== armPrompts.candidate) problems.push("Undeclared cross-arm prompt difference; provide an audited prompt-change contract");
  } else if (declaration.changedFeature !== input.changedFeature || !/^[a-f0-9]{64}$/.test(declaration.incumbentSha256) || !/^[a-f0-9]{64}$/.test(declaration.candidateSha256) || declaration.auditReceipt.trim() === "") {
    problems.push("Invalid audited prompt-change contract: changed feature, SHA256 pair and receipt required");
  }
  const incumbent = armResult(input.incumbent.preset, trials.filter((t) => t.arm === "incumbent"));
  const candidate = armResult(input.candidate.preset, trials.filter((t) => t.arm === "candidate"));
  if (incumbent.incomplete + candidate.incomplete > 0) problems.push("Incomplete trials cannot qualify promotion");
  const timeChangePercent = incumbent.elapsedMs !== null && incumbent.elapsedMs.median > 0 && candidate.elapsedMs !== null ? 100 * (candidate.elapsedMs.median - incumbent.elapsedMs.median) / incumbent.elapsedMs.median : null;
  const eligible = problems.length === 0;
  let verdict: PatchResult["verdict"] = "inconclusive";
  if (eligible) {
    if (candidate.reached < incumbent.reached - input.completionTolerance) verdict = "regress";
    else if (candidate.reached > incumbent.reached) verdict = "improve";
    else if (candidate.reached === incumbent.reached && timeChangePercent !== null) {
      if (timeChangePercent <= -input.speedMarginPercent) verdict = "improve";
      else if (timeChangePercent >= input.speedMarginPercent) verdict = "regress";
    }
  }
  const bug = trials.some((t) => t.issues.some((i) => i.kind === "harness_bug" && i.invalidatesComparison));
  return { patchId: input.patchId, target: input.target, eligible, verdict, recommendation: bug ? "repair_and_rerun" : verdict === "regress" ? "discard" : verdict === "improve" ? input.stage === "confirmation" ? "keep" : "confirm" : "retain",
    incumbent, candidate, timeChangePercent, configuration: { changedFeature: input.changedFeature, incumbentFlags: { ...input.incumbent.flags }, candidateFlags: { ...input.candidate.flags }, ...(declaration === undefined ? {} : { allowedPromptChange: { ...declaration } }) }, problems: [...new Set(problems)], trials,
    limitations: ["Four per arm does not establish statistical confidence.", "Times are among native target completers; missing splits remain explicit.", "Evaluation target observations after the wall cap are censored; positive coverage and native event evidence remain visible.", "Not reached means no qualified recorded completion, not an inference about unseen game state.", "Environment identity is an externally supplied receipt, not independently verified here.", "Prompt audit receipt content is reviewed externally; exact observed hashes are checked here.", "Recommendation does not execute promotion or rollback; downstream qualification is separate."] };
}


/** Markdown artifact from the structured report; no writes, inference or promotion. */
export function renderPatchResults(report: PatchResult): string {
  const cell = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
  const duration = (stats: Distribution | null) => stats === null ? "not reached" : `${String(stats.median)} ms [${String(stats.min)}–${String(stats.max)}], n=${String(stats.count)}`;
  const lines = [
    `# Patch ${cell(report.patchId)}: ${report.verdict}`,
    `Recommendation: **${report.recommendation}**. Comparison ${report.eligible ? "eligible" : "NOT eligible"}; native target: ${cell(report.target)}.`,
    "", "| Arm / preset | Target reached | Incomplete | Time among completers |", "|---|---:|---:|---|",
    ...(["incumbent", "candidate"] as const).map((arm) => { const r = report[arm]; return `| ${arm}: ${cell(r.preset)} | ${String(r.reached)}/${String(r.launched)} | ${String(r.incomplete)} | ${duration(r.elapsedMs)} |`; }),
    "", `Changed feature: ${cell(report.configuration.changedFeature)}.`,
    `Incumbent flags: ${cell(canonical(report.configuration.incumbentFlags))}.`, `Candidate flags: ${cell(canonical(report.configuration.candidateFlags))}.`,
    ...(report.configuration.allowedPromptChange === undefined ? ["Cross-arm prompts must be identical; no change declared."] : [`Audited prompt change: ${cell(report.configuration.allowedPromptChange.changedFeature)}; incumbent SHA256 ${cell(report.configuration.allowedPromptChange.incumbentSha256)}; candidate SHA256 ${cell(report.configuration.allowedPromptChange.candidateSha256)}; receipt ${cell(report.configuration.allowedPromptChange.auditReceipt)}.`]),
    "", "## Evidence and failures", "",
    ...report.trials.map((t) => `- ${cell(t.run)} (${t.arm}): ${t.outcome}; stop ${cell(t.reason)}; ${String(t.turns)} total turns; input/output tokens ${String(t.tokens.input)}/${String(t.tokens.output)}; target evidence [${t.evidence.join(", ")}]; target-state coverage +${String(t.coverage.positive)}/-${String(t.coverage.negative)}/unknown ${String(t.coverage.unknown)}.${t.issues.map((i) => ` ${i.kind === "harness_bug" ? "HARNESS BUG" : "Infrastructure"}: ${cell(i.message)} [${i.evidence.join(", ")}].`).join("")}`),
    "", "## Qualification limits", "", ...[...report.problems, ...report.limitations].map((p) => `- ${cell(p)}`),
  ];
  return lines.join("\n") + "\n";
}
