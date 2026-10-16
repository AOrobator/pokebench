// The experiment queue as party slots (design 11) that open in place into a
// battle card (design 18), with status chips that filter and a PENDING group
// on the same card. Used on the PokéNav page and on Runs & Comparisons. Read only:
// approval and running stay in the CLI.
import type { GateView } from "./experiment-gate-store.js";
import type { ArmSummary, ExperimentView, QueueSnapshot, TrialView } from "./experiment-store.js";
import type { FixedLaneStatus, FixedStatusView } from "./fixed-status.js";
import { esc } from "./format.js";

export const QUEUE_POLL_MS = 15_000;
export type QueueFilter = "all" | "running" | "held" | "approved" | "draft" | "stale" | "not-ready" | "blocked" | "pending" | "closed";
const FILTERS: readonly { readonly id: QueueFilter; readonly label: string }[] = [
  { id: "all", label: "ALL" }, { id: "running", label: "RUNNING" }, { id: "held", label: "HELD" }, { id: "approved", label: "APPROVED" },
  { id: "draft", label: "DRAFT" }, { id: "stale", label: "STALE" }, { id: "not-ready", label: "NOT READY" }, { id: "blocked", label: "BLOCKED" }, { id: "pending", label: "PENDING" }, { id: "closed", label: "DONE" },
];
const LABEL: Readonly<Record<string, string>> = { running: "RUNNING", held: "HELD", approved: "APPROVED", draft: "DRAFT", stale: "STALE", "not-ready": "NOT READY", pending: "PENDING", blocked: "BLOCKED", done: "DONE", discarded: "DISCARDED" };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): boolean => v === null || isNum(v);
function armOk(v: unknown): boolean {
  return isRecord(v) && isNum(v["finished"]) && isNum(v["reached"]) && numOrNull(v["medianPrimaryMs"]) && numOrNull(v["medianTurns"]) && numOrNull(v["reachedPer1kTurns"]);
}
const STATES = ["discarded", "pending", "blocked", "not-ready", "draft", "stale", "approved", "running", "held", "done"];
const TRIAL_STATES = ["waiting", "running", "done", "failed", "interrupted"];
const VERDICTS = ["improve", "regress", "inconclusive"], RECOMMENDATIONS = ["confirm", "keep", "discard", "retain", "repair_and_rerun"];
const oneOf = (v: unknown, values: readonly string[]): boolean => typeof v === "string" && values.includes(v);
function trialOk(v: unknown): boolean {
  return isRecord(v) && isNum(v["index"]) && (v["arm"] === "incumbent" || v["arm"] === "candidate") && oneOf(v["state"], TRIAL_STATES) && (v["reachedPrimary"] === null || typeof v["reachedPrimary"] === "boolean") && numOrNull(v["primaryMs"]) && numOrNull(v["turns"]);
}
const isStrings = (v: unknown): boolean => Array.isArray(v) && v.every((x) => typeof x === "string");
function readinessOk(r: unknown): boolean {
  return isRecord(r) && typeof r["ready"] === "boolean" && (r["basis"] === "comparable" || r["basis"] === "recent") && typeof r["milestone"] === "string" &&
    isNum(r["reached"]) && isNum(r["window"]) && isNum(r["minReached"]) && isStrings(r["considered"]);
}
function resultOk(r: unknown): boolean {
  return r === null || (isRecord(r) && oneOf(r["verdict"], VERDICTS) && oneOf(r["recommendation"], RECOMMENDATIONS) && typeof r["eligible"] === "boolean" && isStrings(r["problems"]));
}
function viewOk(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const strings = ["id", "title", "changedFeature", "hypothesis", "activationMilestone", "primaryMilestone", "modelLane", "state", "reason"];
  const arms = v["arms"], source = v["source"], recorded = v["recorded"];
  return strings.every((k) => typeof v[k] === "string") && oneOf(v["state"], STATES) && numOrNull(v["queuePosition"]) && isNum(v["trialsPerArm"]) && isNum(v["budgetMs"]) && isNum(v["usedMs"]) &&
    typeof v["approved"] === "boolean" && typeof v["incumbentOn"] === "boolean" && Array.isArray(v["trials"]) && v["trials"].every(trialOk) &&
    isRecord(arms) && armOk(arms["incumbent"]) && armOk(arms["candidate"]) && isRecord(source) && typeof source["commit"] === "string" &&
    readinessOk(v["readiness"]) && (recorded === null || (isRecord(recorded) && typeof recorded["verdict"] === "string" && typeof recorded["evidence"] === "string")) &&
    (v["notes"] === null || typeof v["notes"] === "string") && resultOk(v["result"]) && (v["buildCommit"] === null || typeof v["buildCommit"] === "string");
}
const GATE_STATES = ["waiting", "nominating", "finals", "held", "withdrawn", "declared", "inconclusive", "no-finalists"];
const isSwitches = (v: unknown): boolean => isRecord(v) && Object.values(v).every((x) => typeof x === "boolean");
function gateOk(g: unknown): boolean {
  if (!isRecord(g)) return false;
  const finals = g["finals"], decision = g["decision"];
  return typeof g["experiment"] === "string" && typeof g["title"] === "string" && oneOf(g["state"], GATE_STATES) && typeof g["reason"] === "string" &&
    isRecord(finals) && isNum(finals["runsPerArm"]) && isNum(finals["maxWallMs"]) &&
    Array.isArray(g["finalists"]) && g["finalists"].every((f) => isRecord(f) && typeof f["arm"] === "string" && isSwitches(f["switches"])) &&
    Array.isArray(g["trials"]) && g["trials"].every((t) => isRecord(t) && isNum(t["index"]) && typeof t["arm"] === "string" && oneOf(t["state"], TRIAL_STATES)) &&
    (g["winner"] === null || typeof g["winner"] === "string") &&
    (decision === null || (isRecord(decision) && Array.isArray(decision["verdicts"]) && decision["verdicts"].every((v) => isRecord(v) && typeof v["arm"] === "string" && typeof v["pass"] === "boolean" && isStrings(v["reasons"]) && isNum(v["wins"]) && isNum(v["ties"]) && isNum(v["pairs"]))));
}
const strOrNull = (v: unknown): boolean => v === null || typeof v === "string";
const laneOk = (l: unknown): boolean => isRecord(l) && typeof l["id"] === "string" && typeof l["gpu"] === "string" && strOrNull(l["arm"]) && strOrNull(l["run"]);
// JSON from /api/experiments into a typed snapshot.
export function queueSnapshotOf(value: unknown): QueuePayload {
  if (!isRecord(value)) throw new Error("malformed /api/experiments payload");
  const lists = ["queue", "pending", "closed"] as const;
  for (const key of lists) {
    const list = value[key];
    if (!Array.isArray(list) || !list.every(viewOk)) throw new Error(`malformed /api/experiments ${key}`);
  }
  if (!Array.isArray(value["problems"]) || !value["problems"].every((p) => typeof p === "string")) throw new Error("malformed /api/experiments problems");
  if (!Array.isArray(value["gate"]) || !value["gate"].every(gateOk) || !(value["gateBlock"] === null || typeof value["gateBlock"] === "string")) throw new Error("malformed /api/experiments gate");
  const incumbent = value["incumbent"];
  if (incumbent !== null && !(isRecord(incumbent) && typeof incumbent["from"] === "string" && typeof incumbent["arm"] === "string" && isSwitches(incumbent["features"]))) throw new Error("malformed /api/experiments incumbent");
  const autorun = value["autorun"];
  if (autorun !== undefined && autorun !== null && !(isRecord(autorun) && oneOf(autorun["state"], ["idle", "running", "error"]) && typeof autorun["message"] === "string")) throw new Error("malformed /api/experiments autorun");
  const fixedRuns = value["fixedRuns"];
  if (fixedRuns !== undefined && !(Array.isArray(fixedRuns) && fixedRuns.every((f) => isRecord(f) && typeof f["experiment"] === "string" && typeof f["title"] === "string" && isNum(f["valid"]) && isNum(f["total"]) && Array.isArray(f["lanes"]) && f["lanes"].every(laneOk) && Array.isArray(f["invalidTrials"]) && isRecord(f["reserve"])))) throw new Error("malformed /api/experiments fixedRuns");
  const runner = value["runner"];
  if (runner !== null && !(isRecord(runner) && typeof runner["experiment"] === "string" && isNum(runner["trial"]))) throw new Error("malformed /api/experiments runner");
  return value as unknown as QueuePayload;
}

const minutes = (ms: number | null): string => (ms === null ? "—" : `${String(Math.round(ms / 60_000))}m`);
const turns = (n: number | null): string => (n === null ? "—" : String(Math.round(n)));
const rate = (n: number | null): string => (n === null ? "—" : n.toFixed(2));
const chip = (state: string): string => `<span class="eq-st eq-${esc(state)}">${esc(LABEL[state] ?? state.toUpperCase())}</span>`;

function pip(t: TrialView): string {
  const arm = t.arm === "incumbent" ? "A" : "B";
  const outcome = t.state === "done" ? (t.reachedPrimary === true ? "ok" : "miss") : t.state;
  const detail = t.state === "done" ? `${t.reachedPrimary === true ? `reached in ${minutes(t.primaryMs)}` : "did not reach"}, ${turns(t.turns)} turns` : t.state;
  return `<span class="tp ${arm} ${esc(outcome)}" title="trial ${String(t.index + 1)} · ${arm} · ${esc(detail)}">${arm}</span>`;
}
const pips = (v: ExperimentView): string => `<span class="pipset">${v.trials.map(pip).join("")}</span>`;

function hp(v: ExperimentView): string {
  const bar = (label: string, a: ArmSummary, cls: string): string => {
    const width = v.trialsPerArm === 0 ? 0 : Math.min(100, (a.reached / v.trialsPerArm) * 100);
    return `<span>${label}</span><span class="eq-hb"><i class="${cls}" style="width:${width.toFixed(0)}%"></i></span><span>${String(a.reached)}/${String(a.finished)}</span>`;
  };
  return `<span class="eq-hp" aria-label="reached ${esc(v.primaryMilestone)}">${bar("A", v.arms.incumbent, "")}${bar("B", v.arms.candidate, "b")}</span>`;
}

function side(v: ExperimentView, arm: "incumbent" | "candidate"): string {
  const a = v.arms[arm], on = arm === "incumbent" ? v.incumbentOn : !v.incumbentOn;
  return `<div class="eq-side ${arm === "incumbent" ? "A" : "B"}"><span>${arm === "incumbent" ? "A · INCUMBENT" : "B · CANDIDATE"} · SWITCH ${on ? "ON" : "OFF"}</span><big>${String(a.reached)}/${String(a.finished)}</big>` +
    `<dl><dt>median time</dt><dd>${minutes(a.medianPrimaryMs)}</dd><dt>median turns</dt><dd>${turns(a.medianTurns)}</dd><dt>reach / 1k turns</dt><dd>${rate(a.reachedPer1kTurns)}</dd></dl></div>`;
}

function readinessLine(v: ExperimentView): string {
  const r = v.readiness;
  return `${String(r.reached)} of the last ${String(r.considered.length)} ${r.basis === "comparable" ? "comparable" : "recent"} ${esc(v.modelLane)} runs reached ${esc(r.milestone)} (needs ${String(r.minReached)} of ${String(r.window)})`;
}

// Approve or withdraw from the card; the viewer's queue runner starts approved experiments.
function actions(v: ExperimentView): string {
  if (v.state === "draft" || v.state === "stale") return `<div class="eq-actions"><button type="button" class="eq-approve" data-approve="${esc(v.id)}">APPROVE ${String(v.trialsPerArm * 2)} RUNS</button></div>`;
  if (v.approved && (v.state === "approved" || v.state === "running" || v.state === "held")) return `<div class="eq-actions"><button type="button" class="eq-revoke" data-revoke="${esc(v.id)}">WITHDRAW APPROVAL</button></div>`;
  return "";
}

function battle(v: ExperimentView, controls: boolean): string {
  return `<div class="eq-battle">${controls ? actions(v) : ""}<div class="eq-vs">${side(v, "incumbent")}<b class="eq-vsb">VS</b>${side(v, "candidate")}</div>` +
    `<p class="eq-why">${esc(v.reason)}</p><dl class="eq-facts"><dt>hypothesis</dt><dd>${esc(v.hypothesis)}</dd><dt>graded on</dt><dd>${esc(v.primaryMilestone)}</dd><dt>acts at</dt><dd>${esc(v.activationMilestone)}${v.state === "blocked" ? "" : ` · ${readinessLine(v)}`}</dd>` +
    `${v.result === null ? "" : `<dt>verdict</dt><dd>${esc(v.result.verdict.toUpperCase())} → ${esc(v.result.recommendation.toUpperCase().replace(/_/g, " "))}${v.result.eligible ? "" : ` (not eligible: ${v.result.problems.map(esc).join("; ")})`}</dd>`}<dt>build</dt><dd>${v.buildCommit === null ? "main as of its first trial" : `main @ ${esc(v.buildCommit.slice(0, 7))}`}</dd><dt>budget</dt><dd>${(v.usedMs / 3_600_000).toFixed(1)} of ${(v.budgetMs / 3_600_000).toFixed(1)} h</dd>${v.recorded === null ? "" : `<dt>readiness.md</dt><dd>${esc(v.recorded.verdict)}</dd>`}</dl></div>`;
}

function slot(v: ExperimentView, open: boolean, controls = false): string {
  const pos = v.queuePosition === null ? "" : `#${String(v.queuePosition)} `;
  return `<article class="eq-slot eq-s-${esc(v.state)}${open ? " open" : ""}" data-experiment="${esc(v.id)}">` +
    `<button type="button" class="eq-head" data-toggle="${esc(v.id)}" aria-expanded="${String(open)}"><span class="eq-ball" aria-hidden="true"></span>` +
    `<span class="eq-name">${pos}${esc(v.title.toUpperCase())} ${chip(v.state)}<code>${esc(v.changedFeature)}</code>${pips(v)}</span>` +
    `<span class="eq-glance">${hp(v)}<span class="eq-turns">${turns(v.arms.incumbent.medianTurns)} · ${turns(v.arms.candidate.medianTurns)} median turns (A · B)</span></span></button>` +
    (open ? battle(v, controls) : "") + `</article>`;
}

function pendingCard(v: ExperimentView, open: boolean): string {
  return `<article class="eq-mon${open ? " open" : ""}" data-experiment="${esc(v.id)}"><button type="button" class="eq-head" data-toggle="${esc(v.id)}" aria-expanded="${String(open)}">` +
    `<span class="eq-ball dim" aria-hidden="true"></span><span class="eq-name">${esc(v.title.toUpperCase())} ${chip(v.state)}<code>${esc(v.changedFeature)}</code><span class="eq-why">${v.state === "blocked" ? esc(v.reason) : `Waits for ${esc(v.activationMilestone)}: ${readinessLine(v)}`}</span></span></button>` +
    (open ? `<div class="eq-battle"><p class="eq-why">${esc(v.reason)}</p><dl class="eq-facts"><dt>hypothesis</dt><dd>${esc(v.hypothesis)}</dd>${v.recorded === null ? "" : `<dt>readiness.md</dt><dd>${esc(v.recorded.verdict)}</dd>`}<dt>runs checked</dt><dd>${v.readiness.considered.map(esc).join(", ") || "none yet"}</dd></dl></div>` : "") + `</article>`;
}

const switchList = (switches: Readonly<Record<string, boolean>>): string => Object.entries(switches).map(([id, on]) => `<code>${esc(id)}</code> ${on ? "ON" : "OFF"}`).join(", ") || "no switch change";
const GATE_LABEL: Readonly<Record<string, string>> = { waiting: "WAITING", nominating: "NOMINATING", finals: "FINALS", held: "HELD", withdrawn: "WITHDRAWN", declared: "WINNER", inconclusive: "NO WINNER", "no-finalists": "NO FINALISTS" };
function gatePip(t: GateView["trials"][number], finalists: readonly string[]): string {
  const label = t.arm === "incumbent" ? "A" : String(finalists.indexOf(t.arm) + 1);
  return `<span class="tp ${t.arm === "incumbent" ? "A" : "B"} ${esc(t.state === "done" ? "ok" : t.state)}" title="finals run ${String(t.index + 1)} · ${esc(t.arm)} · ${esc(t.state)}">${esc(label)}</span>`;
}
// The winner gate (operator 2026-10-15): finalists run from boot before anything new starts.
// Withdrawn finals are past work: they fold into a closed entry that still offers RESUME FINALS.
function gateCard(s: QueueSnapshot, controls: boolean, paused: string | null, open: ReadonlySet<string>): string {
  if (s.gate.length === 0 && s.incumbent === null) return "";
  const rows = s.gate.map((g) => {
    const arms = g.finalists.map((f) => f.arm);
    const verdicts = g.decision === null ? "" : `<dt>verdicts</dt><dd>${g.decision.verdicts.map((v) => `${esc(v.arm)}: ${v.pass ? `PASS, better in ${String(v.wins)} and tied in ${String(v.ties)} of ${String(v.pairs)} pairs` : `FAIL (${v.reasons.map(esc).join("; ")})`}`).join("<br>")}</dd>`;
    const button = !controls ? "" : g.state === "finals" || g.state === "held" ? `<button type="button" class="eq-revoke" data-finals-withdraw="${esc(g.experiment)}">WITHDRAW FINALS</button>` : g.state === "withdrawn" ? `<button type="button" class="eq-approve" data-finals-resume="${esc(g.experiment)}">RESUME FINALS</button>` : "";
    const actionsHtml = button === "" ? "" : `<span class="eq-actions">${button}</span>`;
    const body = `<p class="eq-why">${esc(g.reason)}</p>${g.trials.length === 0 ? "" : `<span class="pipset">${g.trials.map((t) => gatePip(t, arms)).join("")}</span>`}` +
      `<dl class="eq-facts"><dt>finalists</dt><dd>${g.finalists.length === 0 ? "none" : g.finalists.map((f, i) => `${String(i + 1)} · ${esc(f.arm)}: ${switchList(f.switches)}`).join("<br>")}</dd>` +
      `<dt>finals</dt><dd>${String(g.finals.runsPerArm)} runs each from boot, ${String(Math.round(g.finals.maxWallMs / 60_000))} min${g.finals.target === null ? "" : `, stop at ${esc(g.finals.target)}`}</dd>${verdicts}</dl>`;
    if (g.state === "withdrawn") {
      const done = g.trials.filter((t) => t.state === "done").length;
      return `<details class="eq-gate eq-g-withdrawn eq-past" data-gate="${esc(g.experiment)}"${open.has(`gate:${g.experiment}`) ? " open" : ""}><summary class="eq-gate-head" data-toggle="gate:${esc(g.experiment)}"><span class="eq-name">PAST · ${esc(g.title.toUpperCase())} FINALS WITHDRAWN after ${String(done)} of ${String(g.trials.length)} runs</span></summary>${actionsHtml}${body}</details>`;
    }
    return `<article class="eq-gate eq-g-${esc(g.state)}" data-gate="${esc(g.experiment)}"><div class="eq-gate-head"><span class="eq-name">${esc(g.title.toUpperCase())} <span class="eq-st eq-${esc(g.state)}">${esc(GATE_LABEL[g.state] ?? g.state.toUpperCase())}</span></span>${actionsHtml}</div>${body}</article>`;
  }).join("");
  const incumbent = s.incumbent === null ? "" : `<p class="eq-why">INCUMBENT · ${esc(s.incumbent.arm)} from the ${esc(s.incumbent.from)} finals: ${switchList(s.incumbent.features)}</p>`;
  const block = s.gateBlock === null ? "" : `<p class="eq-notice">New experiments wait: ${paused === null ? esc(s.gateBlock) : `the queue is paused while the fixed-run experiment ${esc(paused)} runs.`}</p>`;
  return `<section class="eq-gates"><h4 class="eq-sub">WINNER GATE · FINALISTS RUN FROM BOOT</h4>${block}${incumbent}${rows}</section>`;
}

// Operator-approved or running work lists above drafts; the stable sort keeps queue order within each group.
const approvedFirst = (v: ExperimentView): number => (v.approved || v.state === "running" ? 0 : 1);

export function countsOf(s: QueueSnapshot): Readonly<Record<QueueFilter, number>> {
  const counts: Record<QueueFilter, number> = { all: s.queue.length + s.pending.length + s.closed.length, running: 0, held: 0, approved: 0, draft: 0, stale: 0, "not-ready": 0, blocked: 0, pending: s.pending.length, closed: s.closed.length };
  for (const v of s.queue) if (v.state in counts && v.state !== "pending") counts[v.state as QueueFilter] += 1;
  for (const v of s.pending) if (v.state === "blocked") counts.blocked += 1;
  return counts;
}

export interface AutoRunLine { readonly state: "idle" | "running" | "error"; readonly message: string }
export type QueuePayload = QueueSnapshot & { readonly autorun?: AutoRunLine | null; readonly fixedRuns?: readonly FixedStatusView[] };

const gpuHours = (ms: number): string => (ms / 3_600_000).toFixed(2);
function fixedLane(l: FixedLaneStatus): string {
  const retry = l.retryAt === null ? "" : ` · retry ${esc(l.retryAt)}`;
  const run = l.run === null ? "" : ` · ${esc(l.run)}`;
  const error = l.lastError === null || l.lastError === l.reason ? "" : `<br><span class="eq-fixed-err">last error: ${esc(l.lastError)}</span>`;
  return `<li class="eq-fixed-lane eq-fixed-${l.state}"><b>LANE ${esc(l.id)} · ${esc(l.gpu)} · :${String(l.port)}</b> <span class="eq-fixed-state">${l.state.toUpperCase()}</span> ${String(l.valid)} / ${String(l.total)}<br>${esc(l.reason)}${run}${retry}${error}</li>`;
}
// Fixed-run experiments (one runner, one lane per GPU): progress, every lane's state and the last error.
export function fixedRunCards(runs: readonly FixedStatusView[]): string {
  return runs.map((r) => {
    const gone = !r.runnerAlive && r.state !== "finished" ? `<p class="eq-fixed-gone" role="alert">RUNNER NOT RUNNING (pid ${String(r.pid)}, last update ${esc(r.updatedAt)})</p>` : "";
    const lastError = r.lastError === null ? "" : `<p class="eq-fixed-err"><b>LAST ERROR</b> ${esc(r.lastError)}</p>`;
    const invalid = r.invalidTrials.length === 0 ? "" : `<details class="eq-fixed-invalid"><summary>INVALID TRIALS (${String(r.invalidTrials.length)})</summary><ul>${r.invalidTrials.map((t) => `<li>#${String(t.slot)} lane ${esc(t.lane)} ${esc(t.arm)} ${esc(t.phase)} · ${esc(t.run)}: ${esc(t.reason)}</li>`).join("")}</ul></details>`;
    return `<section class="eq-fixed" aria-label="${esc(r.title)}"><h4 class="eq-sub">${esc(r.title)} · ${r.state.toUpperCase()}</h4>${gone}<p class="eq-fixed-sum">${String(r.valid)} / ${String(r.total)} done · ${String(r.invalid)} invalid · reserve ${gpuHours(r.reserve.usedMs)} / ${gpuHours(r.reserve.totalMs)} GPU-h · updated ${esc(r.updatedAt)}</p><ul class="eq-fixed-lanes">${r.lanes.map(fixedLane).join("")}</ul>${lastError}${invalid}</section>`;
  }).join("");
}
export interface QueueRender { readonly chips: string; readonly queue: string; readonly pending: string }
export function renderQueue(s: QueuePayload, filter: QueueFilter, open: ReadonlySet<string>, controls = false, notice: string | null = null): QueueRender {
  const counts = countsOf(s);
  const chips = `<div class="eq-chips" role="toolbar" aria-label="Filter experiments by status">${FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => `<button type="button" class="eq-chip${f.id === filter ? " on" : ""}" data-filter="${f.id}" aria-pressed="${String(f.id === filter)}">${f.label} <b>${String(counts[f.id])}</b></button>`).join("")}</div>`;
  const showQueue = filter !== "pending" && filter !== "closed";
  const queued = s.queue.filter((v) => filter === "all" || v.state === filter).sort((a, b) => approvedFirst(a) - approvedFirst(b));
  const closed = filter === "all" || filter === "closed" ? s.closed : [];
  // Only a live fixed-run runner in state running holds the gameplay lease, so only it is what the idle queue waits on.
  const paused = (s.fixedRuns ?? []).find((f) => f.runnerAlive && f.state === "running")?.title ?? null;
  const runnerMessage = s.autorun?.state === "idle" && paused !== null ? `Paused while the fixed-run experiment ${esc(paused)} runs.` : esc(s.autorun?.message ?? "");
  const runner = s.autorun === undefined || s.autorun === null ? "" : `<p class="eq-runner eq-runner-${s.autorun.state}">QUEUE RUNNER · ${s.autorun.state.toUpperCase()} · ${runnerMessage}</p>`;
  const queue = fixedRunCards(s.fixedRuns ?? []) + runner + (notice === null ? "" : `<p class="eq-notice" role="alert">${esc(notice)}</p>`) + (showQueue ? gateCard(s, controls, paused, open) : "") + (showQueue ? (queued.length === 0 ? `<p class="eq-empty">${filter === "all" ? "Nothing is queued. Experiments join the queue once models reliably reach the milestone each one acts on." : "No experiments in this state."}</p>` : queued.map((v) => slot(v, open.has(v.id), controls)).join("")) : "") +
    (closed.length === 0 ? "" : `<h4 class="eq-sub">DONE</h4>${closed.map((v) => slot(v, open.has(v.id))).join("")}`) +
    (s.problems.length === 0 ? "" : `<pre class="eq-problems">${s.problems.map(esc).join("\n")}</pre>`);
  const showPending = filter === "all" || filter === "pending" || (filter === "blocked" && s.pending.some((v) => v.state === "blocked"));
  const pendingShown = filter === "blocked" ? s.pending.filter((v) => v.state === "blocked") : s.pending;
  const pending = showPending ? `<div class="eq-pc"><h4 class="eq-sub">PENDING · MERGED BEHIND A SWITCH, NOT QUEUED (${String(pendingShown.length)})</h4>${pendingShown.length === 0 ? `<p class="eq-empty">No pending experiments.</p>` : pendingShown.map((v) => pendingCard(v, open.has(v.id))).join("")}<p class="eq-why">A pending experiment joins the queue once models reliably reach the milestone it acts on.</p></div>` : "";
  return { chips, queue, pending };
}

export interface QueueDeps {
  fetchJson(url: string): Promise<unknown>;
  problem(text: string): void;
  // Present on pages that may approve: POST and a confirmation prompt.
  sendJson?(method: "POST", url: string, body: unknown): Promise<unknown>;
  confirm?(text: string): boolean;
  // Present where another part of the page reads the same snapshot (the stats page's current-run plates).
  loaded?(snapshot: QueuePayload): void;
  // Called when a load fails, so that reader stops trusting the last snapshot.
  unavailable?(): void;
}
// Binds one rendering to a container holding [data-eq=chips], [data-eq=queue] and [data-eq=pending].
export class QueuePanel {
  snapshot: QueuePayload | null = null;
  filter: QueueFilter = "all";
  readonly open = new Set<string>();
  private loading = false;
  private notice: string | null = null;

  constructor(private readonly root: HTMLElement, private readonly deps: QueueDeps) {
    root.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const filter = target.closest<HTMLElement>("[data-filter]")?.dataset["filter"];
      if (filter !== undefined) {
        this.filter = FILTERS.some((f) => f.id === filter) ? (filter as QueueFilter) : "all";
        this.render();
        return;
      }
      const withdraw = target.closest<HTMLElement>("[data-finals-withdraw]")?.dataset["finalsWithdraw"];
      const resume = target.closest<HTMLElement>("[data-finals-resume]")?.dataset["finalsResume"];
      if (withdraw !== undefined || resume !== undefined) {
        void this.finals(withdraw ?? resume ?? "", withdraw !== undefined);
        return;
      }
      const approve = target.closest<HTMLElement>("[data-approve]")?.dataset["approve"];
      const revoke = target.closest<HTMLElement>("[data-revoke]")?.dataset["revoke"];
      if (approve !== undefined || revoke !== undefined) {
        void this.act(approve ?? revoke ?? "", approve !== undefined ? "approve" : "revoke");
        return;
      }
      const toggle = target.closest<HTMLElement>("[data-toggle]")?.dataset["toggle"];
      if (toggle === undefined) return;
      // A <summary> would also toggle its <details> natively; the re-render owns the open state.
      if (target.closest("summary") !== null) event.preventDefault();
      if (this.open.has(toggle)) this.open.delete(toggle);
      else this.open.add(toggle);
      this.render();
    });
  }

  private part(name: string): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`[data-eq="${name}"]`);
  }

  async act(id: string, action: "approve" | "revoke"): Promise<void> {
    const view = this.snapshot === null ? undefined : [...this.snapshot.queue, ...this.snapshot.pending].find((v) => v.id === id);
    if (view === undefined || this.deps.sendJson === undefined || this.deps.confirm === undefined) return;
    const question = action === "approve"
      ? `Approve ${view.title} for ${String(view.trialsPerArm * 2)} measured runs (about ${String(Math.round((view.trialsPerArm * 2 * 30) / 60))} hours)? The queue runs it when it reaches the front.`
      : `Withdraw approval for ${view.title}? The trial already running finishes; no further trials start until it is approved again.`;
    if (!this.deps.confirm(question)) return;
    try {
      this.snapshot = queueSnapshotOf(await this.deps.sendJson("POST", `/api/experiments/${encodeURIComponent(id)}/${action}`, {}));
      this.notice = null;
      this.deps.loaded?.(this.snapshot);
    } catch (error) {
      this.notice = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  async finals(id: string, withdraw: boolean): Promise<void> {
    const gate = this.snapshot?.gate.find((g) => g.experiment === id);
    if (gate === undefined || this.deps.sendJson === undefined || this.deps.confirm === undefined) return;
    const question = withdraw ? `Withdraw the ${gate.title} finals? The run in progress finishes; new experiments keep waiting until you resume the finals or discard the experiment.` : `Resume the ${gate.title} finals from boot?`;
    if (!this.deps.confirm(question)) return;
    try {
      this.snapshot = queueSnapshotOf(await this.deps.sendJson("POST", `/api/experiments/${encodeURIComponent(id)}/${withdraw ? "finals-withdraw" : "finals-resume"}`, {}));
      this.notice = null;
      this.deps.loaded?.(this.snapshot);
    } catch (error) {
      this.notice = error instanceof Error ? error.message : String(error);
    }
    this.render();
  }

  async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    try {
      this.snapshot = queueSnapshotOf(await this.deps.fetchJson("/api/experiments"));
      this.notice = null;
      this.deps.loaded?.(this.snapshot);
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.problem(`experiment queue: ${message}`);
      this.deps.unavailable?.();
      this.notice = `Could not load the experiment queue (${message}).${/\b404\b/.test(message) ? " This viewer was started before the queue existed: restart the viewer." : ""}`;
      if (this.snapshot === null) {
        const queue = this.part("queue");
        if (queue !== null) queue.innerHTML = `<p class="eq-notice" role="alert">${esc(this.notice)}</p>`;
      } else this.render();
    } finally {
      this.loading = false;
    }
  }

  render(): void {
    if (this.snapshot === null) return;
    const html = renderQueue(this.snapshot, this.filter, this.open, this.deps.sendJson !== undefined, this.notice);
    // Re-rendering replaces the buttons; keep keyboard focus on the same control.
    const active = this.root.ownerDocument.activeElement;
    const focused = active instanceof HTMLElement && this.root.contains(active) ? (active.dataset["approve"] !== undefined || active.dataset["revoke"] !== undefined ? `[data-toggle="${active.dataset["approve"] ?? active.dataset["revoke"] ?? ""}"]` : active.dataset["toggle"] !== undefined ? `[data-toggle="${active.dataset["toggle"]}"]` : active.dataset["filter"] !== undefined ? `[data-filter="${active.dataset["filter"]}"]` : null) : null;
    for (const name of ["chips", "queue", "pending"] as const) {
      const element = this.part(name);
      if (element !== null && element.innerHTML !== html[name]) element.innerHTML = html[name];
    }
    if (focused !== null && this.root.ownerDocument.activeElement !== active) this.root.querySelector<HTMLElement>(focused)?.focus();
  }
}
