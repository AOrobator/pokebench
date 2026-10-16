import { frontierReferences, frontierPlot, frontierModelColors } from "./frontier.js";
import { esc } from "./format.js";
import { QUEUE_POLL_MS, QueuePanel } from "./queue-view.js";
import { WORKBENCH_POLL_MS, parseWorkbench, type WorkbenchData, type WorkbenchRun } from "./workbench-data.js";
import { currentRunHtml, runDetails, runLanes, type LaneUnknown, type RunLanes } from "./workbench-view.js";
// Copies changed [data-current-field] content and styles from `next` onto `root`; false when their fields differ.
function patchFields(root: Element, next: Element): boolean {
  const was = [...root.querySelectorAll<HTMLElement>("[data-current-field]")], now = [...next.querySelectorAll<HTMLElement>("[data-current-field]")];
  if (was.length !== now.length || was.some((field, i) => field.dataset.currentField !== now[i]?.dataset.currentField)) return false;
  was.forEach((field, i) => {
    const fresh = now[i] ?? field, style = fresh.getAttribute("style");
    if (field.innerHTML !== fresh.innerHTML) field.innerHTML = fresh.innerHTML;
    if (style !== null && field.getAttribute("style") !== style) field.setAttribute("style", style);
  });
  return true;
}
export interface WorkbenchDeps { fetchSnapshot(): Promise<unknown>; now(): number; width(): number }
export class Workbench {
  private data: WorkbenchData = { version: 1, at: 0, milestones: [], runs: [], problems: [] };
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
  private runLanes: RunLanes | LaneUnknown = "loading";
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
    template.innerHTML = (this.verified ? "" : '<p class="wb-notice">Live status unavailable; charts retain the last verified snapshot.</p>') + currentRunHtml(this.verified ? this.data.runs : [], this.data.at, this.deps.now(), this.back, this.runLanes);
    // Plates are reconciled by run id and patched field by field, so a focused plate link survives clock
    // ticks and other runs joining or leaving, and the blinking NEW MILESTONE! chip is not re-created
    // (restarting its animation) every tick.
    const list = host.querySelector(".wb-plates"), nextList = template.content.querySelector(".wb-plates");
    const head = host.querySelector(".wb-party-head"), nextHead = template.content.querySelector(".wb-party-head");
    if (list === null || nextList === null || head === null || nextHead === null || this.verified !== (host.querySelector(".wb-notice") === null)) {
      if (host.innerHTML !== template.innerHTML) host.replaceChildren(template.content);
      return;
    }
    patchFields(head, nextHead);
    const wanted = [...nextList.querySelectorAll<HTMLAnchorElement>(".wb-plate")], keep = new Set(wanted.map(p => p.getAttribute("href")));
    const existing = new Map<string | null, HTMLAnchorElement>();
    for (const plate of list.querySelectorAll<HTMLAnchorElement>(".wb-plate")) { if (keep.has(plate.getAttribute("href"))) existing.set(plate.getAttribute("href"), plate); else plate.remove(); }
    let cursor = list.firstElementChild;
    for (const fresh of wanted) {
      const old = existing.get(fresh.getAttribute("href"));
      if (old === undefined) { list.insertBefore(fresh, cursor); continue; }
      if (old.className !== fresh.className) old.className = fresh.className;
      if (!patchFields(old, fresh)) old.replaceChildren(...fresh.childNodes);
      if (cursor === old) cursor = old.nextElementSibling; else list.insertBefore(old, cursor);
    }
  }
  // Lane, GPU and arm per run from the experiment queue's /api/experiments poll, or "unavailable" when it fails.
  lanes(lanes: RunLanes | "unavailable"): void { this.runLanes = lanes; this.clock(); }
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
    // Newest experiment first: each entry is placed by its first trial; undated entries go last.
    const first = new Map<string, number>();
    for (const r of this.data.runs) if (r.cohort !== null) { const at = Date.parse(r.started ?? ""), prior = first.get(r.cohort); first.set(r.cohort, prior === undefined || Number.isNaN(prior) || at < prior ? at : prior); }
    const when = (id: string): number => { const at = first.get(id) ?? Number.NaN; return Number.isNaN(at) ? -Infinity : at; };
    const cohorts = [...first.keys()].sort((a, b) => when(b) - when(a) || a.localeCompare(b));
    const labels = new Map((this.data.cohorts ?? []).map(c => [c.id, c.label]));
    this.options("cohort", [{ id: "all", label: "All recorded runs" }, ...cohorts.map(id => ({ id, label: labels.get(id) ?? id }))], this.scope);
    this.options("model", [{ id: "all", label: "All models" }, ...Array.from(new Set(this.data.runs.flatMap(r => r.model === null ? [] : [r.model]))).map(id => ({ id, label: id }))], this.model);
    this.options("preset", [{ id: "all", label: "All configurations" }, ...Array.from(new Set(this.data.runs.flatMap(r => r.config?.preset == null ? [] : [r.config.preset]))).map(id => ({ id, label: id }))], this.preset);
    this.options("overlay", [{ id: "all", label: "All filtered runs" }, { id: "none", label: "References only" }, ...this.filtered().map(r => ({ id: r.id, label: `${r.model ?? "Unknown"} · ${r.id}` }))], this.overlay);
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
  const experiments = queueRoot === null ? null : new QueuePanel(queueRoot, { fetchJson: async (url) => { const response = await win.fetch(url); if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`); return response.json() as Promise<unknown>; }, sendJson: async (method, url, body) => { const response = await win.fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const reply: unknown = await response.json(); if (!response.ok) throw new Error(typeof reply === "object" && reply !== null && "error" in reply ? String(reply.error) : `${method} ${url} returned HTTP ${String(response.status)}`); return reply; }, confirm: (text) => win.confirm(text), loaded: (snapshot) => { wb.lanes(runLanes(snapshot.fixedRuns ?? [])); }, unavailable: () => { wb.lanes("unavailable"); }, problem: (text) => { const el = queueRoot.querySelector('[data-eq="queue"]'); if (el !== null) el.innerHTML = `<pre class="eq-problems">${esc(text)}</pre>`; } });
  void experiments?.load();
  const queuePoll = win.setInterval(() => { void experiments?.load(); }, QUEUE_POLL_MS);
  void wb.refresh(); const poll = win.setInterval(() => { void wb.refresh(); }, WORKBENCH_POLL_MS), clock = win.setInterval(() => { wb.clock(); }, 1000);
  win.addEventListener("resize", () => { wb.resize(); }); win.addEventListener("pagehide", () => { wb.destroy(); win.clearInterval(poll); win.clearInterval(clock); win.clearInterval(queuePoll); }, { once: true });
  return wb;
}
