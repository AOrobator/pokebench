import { frontierReferences, frontierPlot, frontierModelColors } from "./frontier.js";
import { esc } from "./format.js";
import { QUEUE_POLL_MS, QueuePanel } from "./queue-view.js";
import { WORKBENCH_POLL_MS, parseWorkbench, type WorkbenchData, type WorkbenchRun } from "./workbench-data.js";
import { currentRunHtml, runDetails } from "./workbench-view.js";
export interface WorkbenchDeps { fetchSnapshot(): Promise<unknown>; now(): number; width(): number }
export class Workbench {
  private data: WorkbenchData = { version: 1, at: 0, milestones: [], runs: [], queue: [], problems: [] };
  private busy = false;
  private disposed = false;
  private verified = false;
  private selected: { run: string; split: string | null } | null = null;
  private restoreFocus: HTMLElement | null = null;
  private detailHtml: string | null = null;
  private modelColors: ReadonlyMap<string, string> = new Map();
  private initialized = false;
  private scope = "all";
  private overlay = "all";
  private model = "all";
  private preset = "all";
  private zoom = true;
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
      this.data = data; this.modelColors = frontierModelColors(data.runs, this.modelColors); this.verified = true;
      if (!this.initialized) {
        this.scope = "all"; this.initialized = true;
      }
      this.ui("problem").hidden = true; this.render();
    } catch (error) {
      if (this.active()) { this.verified = false; this.clock(); this.renderCharts(); const box = this.ui("problem"); box.hidden = false; box.textContent = error instanceof Error ? error.message : String(error); }
    } finally { this.busy = false; }
  }
  clock(): void {
    if (!this.active()) return;
    const host = this.ui("current"), template = this.doc.createElement("template");
    template.innerHTML = (this.verified ? "" : '<p class="wb-notice">Live status unavailable; charts retain the last verified snapshot.</p>') + currentRunHtml(this.verified ? this.data.runs : [], this.data.at, this.deps.now(), this.back);
    const before = [...host.querySelectorAll<HTMLAnchorElement>(".wb-current")], after = [...template.content.querySelectorAll<HTMLAnchorElement>(".wb-current")];
    if (before.length > 0 && before.length === after.length && before.every((link, i) => link.getAttribute("href") === after[i]?.getAttribute("href"))) {
      before.forEach((link, i) => {
        for (const field of after[i]?.querySelectorAll<HTMLElement>("[data-current-field]") ?? []) {
          const target = link.querySelector<HTMLElement>(`[data-current-field="${field.dataset.currentField ?? ""}"]`);
          if (target !== null && target.textContent !== field.textContent) target.textContent = field.textContent;
        }
      });
    } else if (host.innerHTML !== template.innerHTML) host.replaceChildren(template.content);
  }
  resize(): void { if (this.active()) this.renderCharts(); }
  destroy(): void { this.disposed = true; this.doc.removeEventListener("change", this.onChange); this.doc.removeEventListener("click", this.onClick); this.doc.removeEventListener("keydown", this.onKey); }
  private filtered(): WorkbenchRun[] {
    return this.data.runs.filter(r => (this.scope === "all" || r.cohort === this.scope) && (this.model === "all" || r.model === this.model) && (this.preset === "all" || r.config?.preset === this.preset));
  }
  private renderCharts(): void {
    const runs = this.filtered(), width = this.deps.width();
    const refs = frontierReferences(this.data.runs), overlays = this.overlay === "none" ? [] : this.overlay === "all" ? runs : runs.filter(r => r.id === this.overlay);
    this.ui("frontier-full").innerHTML = frontierPlot(refs, overlays, width, this.modelColors, this.verified ? this.data.runs.filter(r => r.status === "live" || r.status === "paused") : [], this.zoom);
    this.pressed();
  }
  private pressed(): void { for (const button of this.ui("frontier-view").querySelectorAll("button")) button.setAttribute("aria-pressed", String((button.dataset.frontierView === "zoom") === this.zoom)); }
  private render(): void {
    const cohorts = Array.from(new Set([...this.data.runs.flatMap(r => r.cohort === null ? [] : [r.cohort]), ...this.data.queue.flatMap(q => q.cohort === null ? [] : [q.cohort])]));
    this.options("cohort", [{ id: "all", label: "All recorded runs" }, ...cohorts.map(id => ({ id, label: id }))], this.scope);
    this.options("model", [{ id: "all", label: "All models" }, ...Array.from(new Set(this.data.runs.flatMap(r => r.model === null ? [] : [r.model]))).map(id => ({ id, label: id }))], this.model);
    this.options("preset", [{ id: "all", label: "All configurations" }, ...Array.from(new Set(this.data.runs.flatMap(r => r.config?.preset == null ? [] : [r.config.preset]))).map(id => ({ id, label: id }))], this.preset);
    this.options("overlay", [{ id: "all", label: "All filtered runs" }, { id: "none", label: "References only" }, ...this.filtered().map(r => ({ id: r.id, label: `${r.model ?? "Unknown"} · ${r.id}` }))], this.overlay);
    const queue = this.data.queue.filter(q => this.scope === "all" || q.cohort === null || q.cohort === this.scope);
    this.ui("queue-title").textContent = `EXECUTION QUEUE · ${String(queue.filter(q => q.status === "queued").length)} WAITING · ${String(queue.filter(q => q.status === "withheld").length)} WITHHELD`;
    this.ui("queue").innerHTML = queue.length === 0 ? '<p class="wb-empty">No runs are queued. An editable next-run draft is not a scheduled run.</p>' : queue.map((q, i) => `<div class="wb-queue-row"><span class="wb-queue-state ${q.status}">${esc(q.status === "queued" ? `QUEUED ${String(i + 1)}` : q.status.toUpperCase())}</span><span><strong>${esc(q.model ?? "Model not recorded")}${q.arm === null ? "" : ` · ${esc(q.arm)}`}</strong><small>${esc(q.id)}</small><small>${esc(q.reason ?? "")}</small></span></div>`).join("");
    this.ui("data-problems").textContent = this.data.problems.join("\n"); this.ui("data-problems").hidden = this.data.problems.length === 0;
    this.clock(); this.renderCharts(); if (this.selected !== null) this.detail(this.selected.run, this.selected.split, false);
  }
  private detail(id: string, split: string | null, focus = true): void {
    const run = this.data.runs.find(r => r.id === id); this.selected = { run: id, split };
    if (focus) this.restoreFocus = this.doc.activeElement as HTMLElement | null;
    const body = this.ui("detail-body"), scrollTop = body.scrollTop;
    const controls = 'a[href], button:not([disabled])';
    const focusedIndex = Array.from(body.querySelectorAll(controls)).findIndex(node => node === this.doc.activeElement);
    const html = run === undefined ? '<p>The selected run is no longer available.</p><button type="button" class="wb-button" data-close-detail>Close</button>' : runDetails(run, split);
    const changed = this.detailHtml !== html;
    if (changed) { body.innerHTML = html; this.detailHtml = html; }
    this.ui("detail").hidden = false;
    if (focus) body.querySelector<HTMLElement>("[data-close-detail]")?.focus({ preventScroll: true });
    else if (changed && focusedIndex >= 0) {
      const replacement = body.querySelectorAll<HTMLElement>(controls)[focusedIndex] ?? body.querySelector<HTMLElement>("[data-close-detail]");
      replacement?.focus({ preventScroll: true });
    }
    body.scrollTop = focus ? 0 : scrollTop;
  }

  private close(): void {
    const selected = this.selected; this.ui("detail").hidden = true; this.selected = null;
    if (this.restoreFocus?.isConnected === true) { this.restoreFocus.focus(); return; }
    const marks = Array.from(this.ui("frontier-full").querySelectorAll<HTMLElement>("[data-run]")).filter(m => m.dataset.run === selected?.run);
    (marks.find(m => (m.dataset.split ?? null) === selected?.split) ?? marks[0])?.focus();
  }
  private onClick = (event: Event): void => {
    const target = event.target as Element | null; if (target?.nodeType !== 1) return;
    if (target.closest("[data-close-detail]") !== null || target === this.ui("detail")) { this.close(); return; }
    const view = target.closest<HTMLElement>("[data-frontier-view]"); if (view !== null) { this.zoom = view.dataset.frontierView === "zoom"; if (this.initialized) this.renderCharts(); else this.pressed(); return; }
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
    if (name === "overlay") this.overlay = element.value; else if (name === "cohort") this.scope = element.value; else if (name === "model") this.model = element.value; else if (name === "preset") this.preset = element.value; else return;
    this.render();
  };
}
export function bootWorkbench(win: Window): Workbench {
  const from = new URL(win.location.href).searchParams.get("from");
  const wb = new Workbench(win.document, {
    fetchSnapshot: async () => { const response = await win.fetch("/api/workbench", { signal: AbortSignal.timeout(180000) }); if (!response.ok) throw new Error(`Workbench request failed (${String(response.status)})`); return response.json() as Promise<unknown>; },
    now: () => Date.now(), width: () => win.document.querySelector('[data-wb="frontier-full"]')?.getBoundingClientRect().width || win.document.documentElement.clientWidth || 640,
  }, from);
  const queueRoot = win.document.querySelector<HTMLElement>('[data-ui="experiment-queue"]');
  const experiments = queueRoot === null ? null : new QueuePanel(queueRoot, { fetchJson: async (url) => { const response = await win.fetch(url); if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`); return response.json() as Promise<unknown>; }, sendJson: async (method, url, body) => { const response = await win.fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const reply: unknown = await response.json(); if (!response.ok) throw new Error(typeof reply === "object" && reply !== null && "error" in reply ? String(reply.error) : `${method} ${url} returned HTTP ${String(response.status)}`); return reply; }, confirm: (text) => win.confirm(text), problem: (text) => { const el = queueRoot.querySelector('[data-eq="queue"]'); if (el !== null) el.innerHTML = `<pre class="eq-problems">${esc(text)}</pre>`; } });
  void experiments?.load();
  const queuePoll = win.setInterval(() => { void experiments?.load(); }, QUEUE_POLL_MS);
  void wb.refresh(); const poll = win.setInterval(() => { void wb.refresh(); }, WORKBENCH_POLL_MS), clock = win.setInterval(() => { wb.clock(); }, 1000);
  win.addEventListener("resize", () => { wb.resize(); }); win.addEventListener("pagehide", () => { wb.destroy(); win.clearInterval(poll); win.clearInterval(clock); win.clearInterval(queuePoll); }, { once: true });
  return wb;
}
