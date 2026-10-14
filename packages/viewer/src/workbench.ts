import { esc, hms } from "./format.js";
import { parseWorkbench, type WorkbenchData, type WorkbenchRun } from "./workbench-data.js";
import { METRICS, color, currentRunHtml, eligible, median, metricText, ribbonPlot, runDetails, timingPlot, type Metric } from "./workbench-view.js";
export interface WorkbenchDeps { fetchSnapshot(): Promise<unknown>; now(): number; width(): number }
export class Workbench {
  private data: WorkbenchData = { version: 1, at: 0, milestones: [], runs: [], queue: [], problems: [] };
  private busy = false;
  private disposed = false;
  private verified = false;
  private selected: { run: string; split: string | null } | null = null;
  private restoreFocus: HTMLElement | null = null;
  private initialized = false;
  private scope = "all";
  private model = "all";
  private preset = "all";
  private milestone = "PLAYER_NAME_CONFIRMED";
  private feature = "deterministic-loop-guard-v1";
  private metric: Metric = "elapsedMs";
  constructor(private readonly doc: Document, private readonly deps: WorkbenchDeps, private readonly back: string | null = null) {
    doc.addEventListener("change", this.onChange); doc.addEventListener("click", this.onClick); doc.addEventListener("keydown", this.onKey);
  }
  private ui(name: string): HTMLElement {
    const e = this.doc.querySelector<HTMLElement>(`[data-wb="${name}"]`); if (e === null) throw new Error(`Workbench is missing ${name}`); return e;
  }
  private options(name: string, values: readonly { id: string; label: string }[], selected: string): void {
    const element = this.ui(name) as HTMLSelectElement;
    const choices = values.some(v => v.id === selected) ? values : [...values, { id: selected, label: `${selected} (no current records)` }];
    const signature = JSON.stringify(choices);
    if (element.dataset.options !== signature) {
      element.replaceChildren(...choices.map(v => { const option = this.doc.createElement("option"); option.value = v.id; option.textContent = v.label; return option; })); element.dataset.options = signature;
    }
    element.value = selected;
  }
  private active(): boolean { return !this.disposed; }
  async refresh(): Promise<void> {
    if (this.busy || !this.active()) return; this.busy = true;
    try {
      const data = parseWorkbench(await this.deps.fetchSnapshot()); if (!this.active()) return;
      if (data.at < this.data.at) throw new Error("Outdated workbench snapshot ignored; last verified data retained.");
      this.data = data; this.verified = true;
      if (!this.initialized) {
        this.scope = data.runs.find(r => r.id === this.back)?.cohort ?? data.runs.find(r => r.cohort !== null)?.cohort ?? "all"; this.initialized = true;
      }
      this.ui("problem").hidden = true; this.render();
    } catch (error) {
      if (this.active()) { this.verified = false; this.clock(); const box = this.ui("problem"); box.hidden = false; box.textContent = error instanceof Error ? error.message : String(error); }
    } finally { this.busy = false; }
  }
  clock(): void { if (this.active()) this.ui("current").innerHTML = (this.verified ? "" : '<p class="wb-notice">Live status unavailable; charts retain the last verified snapshot.</p>') + currentRunHtml(this.verified ? this.data.runs : [], this.data.at, this.deps.now(), this.back); }
  resize(): void { if (this.active()) this.renderCharts(); }
  destroy(): void { this.disposed = true; this.doc.removeEventListener("change", this.onChange); this.doc.removeEventListener("click", this.onClick); this.doc.removeEventListener("keydown", this.onKey); }
  private filtered(): WorkbenchRun[] {
    return this.data.runs.filter(r => (this.scope === "all" || r.cohort === this.scope) && (this.model === "all" || r.model === this.model) && (this.preset === "all" || r.config?.preset === this.preset));
  }
  private renderCharts(): void {
    const runs = this.filtered(), width = this.deps.width();
    this.ui("timing").innerHTML = timingPlot(runs, this.milestone, this.feature, this.metric, width);
    this.ui("ribbons").innerHTML = ribbonPlot(runs, width);
  }
  private render(): void {
    const cohorts = Array.from(new Set([...this.data.runs.flatMap(r => r.cohort === null ? [] : [r.cohort]), ...this.data.queue.flatMap(q => q.cohort === null ? [] : [q.cohort])]));
    this.options("cohort", [{ id: "all", label: "All recorded runs" }, ...cohorts.map(id => ({ id, label: id }))], this.scope);
    this.options("model", [{ id: "all", label: "All models" }, ...Array.from(new Set(this.data.runs.flatMap(r => r.model === null ? [] : [r.model]))).map(id => ({ id, label: id }))], this.model);
    this.options("preset", [{ id: "all", label: "All configurations" }, ...Array.from(new Set(this.data.runs.flatMap(r => r.config?.preset == null ? [] : [r.config.preset]))).map(id => ({ id, label: id }))], this.preset);
    this.options("milestone", this.data.milestones, this.milestone);
    const features = new Map<string, string>(); for (const r of this.data.runs) for (const f of r.config?.features ?? []) features.set(f.id, f.label);
    this.options("feature", [...features].map(([id, label]) => ({ id, label })), this.feature);
    this.options("metric", Object.entries(METRICS).map(([id, label]) => ({ id, label })), this.metric);
    const runs = this.filtered(), finished = runs.filter(r => eligible(r) && r.status === "ended");
    const reached = finished.flatMap(r => r.splits.filter(s => s.name === this.milestone)), middle = median(reached.map(s => s[this.metric]));
    this.ui("summary").innerHTML = `<div><small>${esc(METRICS[this.metric])} · ${esc(this.milestone.replace(/_/g, " "))}</small><b>${middle === null ? "—" : metricText(middle, this.metric)}</b><span>median among successful finished runs</span></div><div><small>COMPLETION</small><b>${String(reached.length)} / ${String(finished.length)}</b><span>reached / eligible finished runs</span></div><div><small>MODEL TURNS</small><b>${median(reached.map(s => s.turn)) === null ? "—" : String(median(reached.map(s => s.turn)))}</b><span>median to the selected checkpoint</span></div>`;
    this.ui("timing-label").textContent = `${this.milestone.replace(/_/g, " ")} · ${METRICS[this.metric]}`;
    this.ui("encoding").textContent = `Lane and fill show ${features.get(this.feature) ?? this.feature}: ON, OFF or unknown. Median ticks summarize observations, not a controlled improvement claim.`;
    const names = Array.from(new Set(runs.filter(eligible).flatMap(r => r.splits.map(s => s.name))));
    this.ui("legend").innerHTML = names.map(n => `<span><i style="background:${color(n)}"></i>${esc(n.replace(/_/g, " "))}</span>`).join("");
    this.ui("outcomes").innerHTML = runs.length === 0 ? '<p class="wb-empty">No runs in this selection.</p>' : runs.map(r => `<button type="button" class="wb-run-row" data-run="${esc(r.id)}"><span><strong>${esc(r.model ?? "Model not recorded")}</strong><small>${esc(r.id)}</small></span><span>${esc(r.reason ?? r.status)}${r.excluded === null ? "" : " · excluded from timing"}</span><span>${r.splits.find(s => s.name === this.milestone) === undefined ? "not reached" : hms((r.splits.find(s => s.name === this.milestone)?.elapsedMs ?? 0) / 1000)}</span></button>`).join("");
    const queue = this.data.queue.filter(q => this.scope === "all" || q.cohort === null || q.cohort === this.scope);
    this.ui("queue-title").textContent = `EXECUTION QUEUE · ${String(queue.filter(q => q.status === "queued").length)} WAITING · ${String(queue.filter(q => q.status === "withheld").length)} WITHHELD`;
    this.ui("queue").innerHTML = queue.length === 0 ? '<p class="wb-empty">No runs are queued. An editable next-run draft is not a scheduled run.</p>' : queue.map((q, i) => `<div class="wb-queue-row"><span class="wb-queue-state ${q.status}">${esc(q.status === "queued" ? `QUEUED ${String(i + 1)}` : q.status.toUpperCase())}</span><span><strong>${esc(q.model ?? "Model not recorded")}${q.arm === null ? "" : ` · ${esc(q.arm)}`}</strong><small>${esc(q.id)}</small><small>${esc(q.reason ?? "")}</small></span></div>`).join("");
    this.ui("data-problems").textContent = this.data.problems.join("\n"); this.ui("data-problems").hidden = this.data.problems.length === 0;
    this.clock(); this.renderCharts(); if (this.selected !== null) this.detail(this.selected.run, this.selected.split, false);
  }
  private detail(id: string, split: string | null, focus = true): void {
    const run = this.data.runs.find(r => r.id === id); this.selected = { run: id, split };
    if (focus) this.restoreFocus = this.doc.activeElement as HTMLElement | null;
    const body = this.ui("detail-body"), hadFocus = body.contains(this.doc.activeElement);
    const html = run === undefined ? '<p>The selected run is no longer available.</p><button type="button" class="wb-button" data-close-detail>Close</button>' : runDetails(run, split);
    if (body.innerHTML !== html) body.innerHTML = html;
    this.ui("detail").hidden = false;
    if (focus || hadFocus) body.querySelector<HTMLElement>("[data-close-detail]")?.focus();
  }

  private close(): void { this.ui("detail").hidden = true; this.selected = null; if (this.restoreFocus?.isConnected === true) this.restoreFocus.focus();
    else this.ui("outcomes").querySelector<HTMLElement>("button")?.focus(); }
  private onClick = (event: Event): void => {
    const target = event.target as Element | null; if (target?.nodeType !== 1) return;
    if (target.closest("[data-close-detail]") !== null || target === this.ui("detail")) { this.close(); return; }
    const mark = target.closest<HTMLElement>("[data-run]"); if (mark !== null) { event.preventDefault(); this.detail(mark.dataset.run ?? "", mark.dataset.split ?? null); }
  };
  private onKey = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (key.key === "Escape" && this.selected !== null) { this.close(); key.preventDefault(); return; }
    const target = key.target as Element | null;
    if ((key.key === "Enter" || key.key === " ") && target?.matches('.wb-mark[role="button"]') === true) { key.preventDefault(); this.detail(target.getAttribute("data-run") ?? "", target.getAttribute("data-split")); }
    if (key.key === "Tab" && this.selected !== null) {
      const nodes = Array.from(this.ui("detail-body").querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      const first = nodes[0], last = nodes.at(-1);
      if (key.shiftKey && this.doc.activeElement === first) { last?.focus(); key.preventDefault(); }
      else if (!key.shiftKey && this.doc.activeElement === last) { first?.focus(); key.preventDefault(); }
    }
  };
  private onChange = (event: Event): void => {
    const element = event.target as HTMLSelectElement; const name = element.dataset.wb;
    if (name === "cohort") this.scope = element.value; else if (name === "model") this.model = element.value; else if (name === "preset") this.preset = element.value; else if (name === "milestone") this.milestone = element.value; else if (name === "feature") this.feature = element.value;
    else if (name === "metric" && Object.hasOwn(METRICS, element.value)) this.metric = element.value as Metric; else return;
    this.render();
  };
}
export function bootWorkbench(win: Window): Workbench {
  const from = new URL(win.location.href).searchParams.get("from");
  const wb = new Workbench(win.document, {
    fetchSnapshot: async () => { const response = await win.fetch("/api/workbench", { signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error(`Workbench request failed (${String(response.status)})`); return response.json() as Promise<unknown>; },
    now: () => Date.now(), width: () => win.document.querySelector('[data-wb="timing"]')?.getBoundingClientRect().width || win.document.documentElement.clientWidth || 640,
  }, from);
  void wb.refresh(); const poll = win.setInterval(() => { void wb.refresh(); }, 5000), clock = win.setInterval(() => { wb.clock(); }, 1000);
  win.addEventListener("resize", () => { wb.resize(); }); win.addEventListener("pagehide", () => { wb.destroy(); win.clearInterval(poll); win.clearInterval(clock); }, { once: true });
  return wb;
}
