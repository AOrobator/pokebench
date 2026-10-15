// The experiment queue as party slots (design 11) that open in place into a
// battle card (design 18), with status chips that filter and a separate
// PENDING box. Used on the PokéNav page and on Runs & Comparisons. Read only:
// approval and running stay in the CLI.
import type { ArmSummary, ExperimentView, QueueSnapshot, TrialView } from "./experiment-store.js";
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
    (v["notes"] === null || typeof v["notes"] === "string") && resultOk(v["result"]);
}
// JSON from /api/experiments into a typed snapshot.
export function queueSnapshotOf(value: unknown): QueuePayload {
  if (!isRecord(value)) throw new Error("malformed /api/experiments payload");
  const lists = ["queue", "pending", "closed"] as const;
  for (const key of lists) {
    const list = value[key];
    if (!Array.isArray(list) || !list.every(viewOk)) throw new Error(`malformed /api/experiments ${key}`);
  }
  if (!Array.isArray(value["problems"]) || !value["problems"].every((p) => typeof p === "string")) throw new Error("malformed /api/experiments problems");
  const autorun = value["autorun"];
  if (autorun !== undefined && autorun !== null && !(isRecord(autorun) && oneOf(autorun["state"], ["idle", "running", "error"]) && typeof autorun["message"] === "string")) throw new Error("malformed /api/experiments autorun");
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
    `<p class="eq-why">${esc(v.reason)}</p><dl class="eq-facts"><dt>hypothesis</dt><dd>${esc(v.hypothesis)}</dd><dt>graded on</dt><dd>${esc(v.primaryMilestone)}</dd><dt>acts at</dt><dd>${esc(v.activationMilestone)} · ${readinessLine(v)}</dd>` +
    `${v.result === null ? "" : `<dt>verdict</dt><dd>${esc(v.result.verdict.toUpperCase())} → ${esc(v.result.recommendation.toUpperCase().replace(/_/g, " "))}${v.result.eligible ? "" : ` (not eligible: ${v.result.problems.map(esc).join("; ")})`}</dd>`}<dt>build</dt><dd>main @ ${esc(v.source.commit.slice(0, 7))}</dd><dt>budget</dt><dd>${(v.usedMs / 3_600_000).toFixed(1)} of ${(v.budgetMs / 3_600_000).toFixed(1)} h</dd>${v.recorded === null ? "" : `<dt>readiness.md</dt><dd>${esc(v.recorded.verdict)}</dd>`}</dl></div>`;
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
    `<span class="eq-ball dim" aria-hidden="true"></span><span class="eq-name">${esc(v.title.toUpperCase())} ${chip(v.state)}<code>${esc(v.changedFeature)}</code><span class="eq-why">Waits for ${esc(v.activationMilestone)}: ${readinessLine(v)}</span></span></button>` +
    (open ? `<div class="eq-battle"><p class="eq-why">${esc(v.reason)}</p><dl class="eq-facts"><dt>hypothesis</dt><dd>${esc(v.hypothesis)}</dd>${v.recorded === null ? "" : `<dt>readiness.md</dt><dd>${esc(v.recorded.verdict)}</dd>`}<dt>runs checked</dt><dd>${v.readiness.considered.map(esc).join(", ") || "none yet"}</dd></dl></div>` : "") + `</article>`;
}

export function countsOf(s: QueueSnapshot): Readonly<Record<QueueFilter, number>> {
  const counts: Record<QueueFilter, number> = { all: s.queue.length + s.pending.length + s.closed.length, running: 0, held: 0, approved: 0, draft: 0, stale: 0, "not-ready": 0, blocked: 0, pending: s.pending.length, closed: s.closed.length };
  for (const v of s.queue) if (v.state in counts && v.state !== "pending") counts[v.state as QueueFilter] += 1;
  for (const v of s.pending) if (v.state === "blocked") counts.blocked += 1;
  return counts;
}

export interface AutoRunLine { readonly state: "idle" | "running" | "error"; readonly message: string }
export type QueuePayload = QueueSnapshot & { readonly autorun?: AutoRunLine | null };
export interface QueueRender { readonly chips: string; readonly queue: string; readonly pending: string }
export function renderQueue(s: QueuePayload, filter: QueueFilter, open: ReadonlySet<string>, controls = false, notice: string | null = null): QueueRender {
  const counts = countsOf(s);
  const chips = `<div class="eq-chips" role="toolbar" aria-label="Filter experiments by status">${FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => `<button type="button" class="eq-chip${f.id === filter ? " on" : ""}" data-filter="${f.id}" aria-pressed="${String(f.id === filter)}">${f.label} <b>${String(counts[f.id])}</b></button>`).join("")}</div>`;
  const showQueue = filter !== "pending" && filter !== "closed";
  const queued = s.queue.filter((v) => filter === "all" || v.state === filter);
  const closed = filter === "all" || filter === "closed" ? s.closed : [];
  const runner = s.autorun === undefined || s.autorun === null ? "" : `<p class="eq-runner eq-runner-${s.autorun.state}">QUEUE RUNNER · ${s.autorun.state.toUpperCase()} · ${esc(s.autorun.message)}</p>`;
  const queue = runner + (notice === null ? "" : `<p class="eq-notice" role="alert">${esc(notice)}</p>`) + (showQueue ? (queued.length === 0 ? `<p class="eq-empty">${filter === "all" ? "Nothing is queued. Experiments join the queue once models reliably reach the milestone each one acts on." : "No experiments in this state."}</p>` : queued.map((v) => slot(v, open.has(v.id), controls)).join("")) : "") +
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
      const approve = target.closest<HTMLElement>("[data-approve]")?.dataset["approve"];
      const revoke = target.closest<HTMLElement>("[data-revoke]")?.dataset["revoke"];
      if (approve !== undefined || revoke !== undefined) {
        void this.act(approve ?? revoke ?? "", approve !== undefined ? "approve" : "revoke");
        return;
      }
      const toggle = target.closest<HTMLElement>("[data-toggle]")?.dataset["toggle"];
      if (toggle === undefined) return;
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
      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.problem(`experiment queue: ${message}`);
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
