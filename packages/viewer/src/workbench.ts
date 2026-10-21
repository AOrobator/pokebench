import { frontierLegend, type SwitchDescriptions } from "./frontier-legend.js";
import type { VersionIndex } from "./frontier-versions.js";
import { frontierReferences, frontierPlot, frontierVersions } from "./frontier.js";
import { esc } from "./format.js";
import { QUEUE_POLL_MS, QueuePanel } from "./queue-view.js";
import { WORKBENCH_POLL_MS, parseFeatureDescriptions, parseWorkbench, type WorkbenchData, type WorkbenchRun } from "./workbench-data.js";
import { backToViewer, currentRunLinks, liveOrPaused, partyHead, plateNotes, plateWhere, runDetails, runLanes, viewerUrl, type LaneUnknown, type RunLanes } from "./workbench-view.js";
import { browserGlyphSheet, drawGlyphs, fillCards, loadCardArt, syncCards, type LoadedArt } from "./card-dom.js";
import type { GlyphPixels, GlyphSheet } from "./game-font.js";
import { cardHtml, cardInputFor } from "./trainer-card.js";
// Replaces root's HTML only when it changed; a focused control inside it keeps focus by its data attributes.
function replaceKeepingFocus(root: HTMLElement, html: string): void {
  if (root.dataset.html === html) return;
  const active = root.ownerDocument.activeElement, keys = ["sw", "ver", "verMore", "what", "all", "bar", "legendToggle", "showAll"] as const;
  const found = active instanceof HTMLElement && root.contains(active) ? (active.tagName === "SUMMARY" ? active.parentElement : active) : null;
  const key = found === null ? undefined : keys.find(k => found.dataset[k] !== undefined);
  const selector = found === null || key === undefined ? null : `[data-${key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}${found.dataset[key] === "" ? "" : `="${found.dataset[key] ?? ""}"`}]`;
  root.innerHTML = html; root.dataset.html = html;
  if (selector === null) return;
  const next = root.querySelector<HTMLElement>(selector);
  (next?.tagName === "DETAILS" ? next.querySelector<HTMLElement>("summary") : next)?.focus({ preventScroll: true });
}
// fetchFeatures: the switch catalog (/api/features), read once for the legend's switch descriptions.
// fetchJson, loadGlyphSheet, drawGlyphs: optional trainer card artwork (/sprites).
export interface WorkbenchDeps { fetchSnapshot(): Promise<unknown>; fetchFeatures?(): Promise<unknown>; now(): number; width(): number; fetchJson?(url: string): Promise<unknown>; loadGlyphSheet?(url: string): Promise<GlyphSheet | null>; drawGlyphs?(canvas: HTMLCanvasElement, pixels: GlyphPixels): void }
// Calendar dates use the operator's timezone, independent of browser/server timezone and DST.
const runDateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
function runDate(started: string | null): string | null {
  const at = Date.parse(started ?? "");
  if (!Number.isFinite(at)) return null;
  const parts = runDateFormat.formatToParts(at), part = (type: string): string => parts.find(p => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
const HOVER_EVENTS = ["mouseover", "mouseout", "focusin", "focusout"] as const;
export class Workbench {
  private data: WorkbenchData = { version: 1, at: 0, milestones: [], runs: [], problems: [] };
  private busy = false;
  private disposed = false;
  private verified = false;
  private selected: { run: string; split: string | null } | null = null;
  private restoreFocus: HTMLElement | null = null;
  private detailHtml: string | null = null;
  private versions: VersionIndex = { versions: [], byRun: new Map() };
  private descriptions: SwitchDescriptions = new Map();
  private catalog: Promise<void> | null = null;
  private readonly versionColors = new Map<string, string>();
  // Legend state: the isolated version, what the operator opened or closed (null = the width's default) and the hovered version.
  private isolated: string | null = null;
  private hovered: string | null = null;
  private legendOpen: boolean | null = null;
  private marksOpen: boolean | null = null;
  private howOpen = false;
  private readonly changed = new Set<string>();
  private readonly allOn = new Set<string>();
  private readonly expanded = new Set<string>();
  private initialized = false;
  private scope = "all";
  private overlay = "all";
  private model = "all";
  private preset = "all";
  private dateFrom = "";
  private dateThrough = "";
  private zoom = true;
  private hideTimeOutliers = true;
  private runLanes: RunLanes | LaneUnknown = "loading";
  constructor(private readonly doc: Document, private readonly deps: WorkbenchDeps, private readonly back: string | null = null) {
    doc.addEventListener("change", this.onChange); doc.addEventListener("click", this.onClick); doc.addEventListener("keydown", this.onKey);
    doc.addEventListener("toggle", this.onToggle, true); for (const type of HOVER_EVENTS) doc.addEventListener(type, this.onHover);
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
  private cardArt: Promise<LoadedArt | null> | null = null;
  private art: LoadedArt | null = null;
  private readonly cardMemo = new WeakMap<Element, string>();
  async refresh(): Promise<void> {
    if (this.busy || !this.active()) return; this.busy = true;
    const deps = this.deps;
    this.cardArt ??= deps.fetchJson === undefined ? Promise.resolve(null) : loadCardArt((url) => deps.fetchJson?.(url) ?? Promise.resolve(null), (url) => deps.loadGlyphSheet?.(url) ?? Promise.resolve(null));
    this.art = await this.cardArt;
    try {
      const data = parseWorkbench(await this.deps.fetchSnapshot()); if (!this.active()) return;
      if (data.at < this.data.at) throw new Error("Outdated workbench snapshot ignored; last verified data retained.");
      this.data = data; this.versions = frontierVersions(data.runs, this.versionColors); for (const v of this.versions.versions) this.versionColors.set(v.key, v.color); this.verified = true;
      if (!this.initialized) {
        this.scope = "all"; this.initialized = true;
      }
      this.ui("problem").hidden = true; this.render();
    } catch (error) {
      if (this.active()) { this.verified = false; this.clock(); this.renderCharts(); const box = this.ui("problem"); box.hidden = false; box.textContent = error instanceof Error ? error.message : String(error); }
    } finally { this.busy = false; }
  }
  // Loads the switch descriptions once. Without them (no catalog, a failed or malformed fetch) the legend shows names and ids only.
  features(): Promise<void> {
    const deps = this.deps;
    this.catalog ??= deps.fetchFeatures === undefined ? Promise.resolve() : deps.fetchFeatures().then(value => {
      if (!this.active()) return;
      this.descriptions = parseFeatureDescriptions(value); if (this.initialized) this.renderCharts();
    }).catch(() => undefined);
    return this.catalog;
  }
  clock(): void {
    if (!this.active()) return;
    if (this.cards()) return;
    const host = this.ui("current"), live = this.verified ? liveOrPaused(this.data.runs) : [];
    if (live.length === 0) {
      const html = (this.verified ? "" : '<p class="wb-notice">Live status unavailable; charts retain the last verified snapshot.</p>') + backToViewer(this.back);
      if (host.innerHTML !== html) host.innerHTML = html;
      return;
    }
    if (host.querySelector(".wb-card-row") === null) host.innerHTML = `<div class="wb-party">${partyHead(live)}<p class="wb-notice">Trainer artwork unavailable. You can still watch each run.</p><div class="wb-card-row"></div></div>`;
    const head = host.querySelector(".wb-party-head"), row = host.querySelector(".wb-card-row"), nextHead = partyHead(live);
    if (head !== null && head.outerHTML !== nextHead) head.outerHTML = nextHead;
    if (row !== null) {
      const focused = row.contains(this.doc.activeElement) ? this.doc.activeElement?.closest<HTMLElement>("[data-watch]")?.dataset.watch : undefined;
      syncCards(row, currentRunLinks(live, this.runLanes), this.cardMemo);
      if (focused !== undefined) row.querySelector<HTMLElement>(`[data-watch="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    }
  }
  // Trainer cards share the viewer design; missing artwork uses ordinary Watch links.
  private cards(): boolean {
    const loaded = this.art, live = this.verified ? liveOrPaused(this.data.runs) : [];
    if (loaded === null || live.length === 0) return false;
    const host = this.ui("current");
    let party = host.querySelector(".wb-party.wb-cards");
    if (party === null) { host.innerHTML = `<div class="wb-party wb-cards">${partyHead(live)}<div class="wb-card-row"></div></div>`; party = host.querySelector(".wb-party.wb-cards"); }
    const head = party?.querySelector(".wb-party-head"), row = party?.querySelector(".wb-card-row");
    if (head == null || row == null) return false;
    const nextHead = partyHead(live);
    if (head.outerHTML !== nextHead) head.outerHTML = nextHead;
    const now = this.deps.now(), inputs = live.map(run => cardInputFor(run, this.data.at, now, run.status === "paused" ? "paused" : "live", this.data.runs, loaded.art));
    syncCards(row, inputs.map((input, i) => {
      const run = live[i];
      return `<div class="wb-card">${cardHtml(input, loaded.art, "wide", viewerUrl(input.runId))}${run === undefined ? "" : `<small class="wb-card-where">${plateWhere(run, this.runLanes)}</small>${plateNotes(run)}`}</div>`;
    }), this.cardMemo);
    fillCards([row], inputs, loaded, (canvas, pixels) => { this.deps.drawGlyphs?.(canvas, pixels); });
    return true;
  }
  // Lane, GPU and arm per run from the experiment queue's /api/experiments poll, or "unavailable" when it fails.
  lanes(lanes: RunLanes | "unavailable"): void { this.runLanes = lanes; this.clock(); }
  resize(): void { if (this.active()) this.renderCharts(); }
  destroy(): void {
    this.disposed = true; this.doc.removeEventListener("change", this.onChange); this.doc.removeEventListener("click", this.onClick); this.doc.removeEventListener("keydown", this.onKey);
    this.doc.removeEventListener("toggle", this.onToggle, true); for (const type of HOVER_EVENTS) this.doc.removeEventListener(type, this.onHover);
  }
  private filtered(): WorkbenchRun[] {
    const dated = this.dateFrom !== "" || this.dateThrough !== "";
    return this.data.runs.filter(r => {
      const day = dated ? runDate(r.started) : null;
      return (!dated || (day !== null && (this.dateFrom === "" || day >= this.dateFrom) && (this.dateThrough === "" || day <= this.dateThrough))) && (this.scope === "all" || r.cohort === this.scope) && (this.model === "all" || r.model === this.model) && (this.preset === "all" || r.config?.preset === this.preset);
    });
  }
  private renderCharts(): void {
    const runs = this.filtered(), width = this.deps.width();
    const refs = frontierReferences(this.data.runs), overlays = this.overlay === "none" ? [] : this.overlay === "all" ? runs : runs.filter(r => r.id === this.overlay);
    const current = this.verified ? runs.filter(r => r.status === "live" || r.status === "paused") : [], status = this.verified && (refs.best?.status === "live" || refs.best?.status === "paused") ? refs.best.status : null;
    const state = { isolated: this.isolated, legendOpen: this.legendOpen ?? false, marksOpen: this.marksOpen ?? false, howOpen: this.howOpen, changed: this.changed, all: this.allOn, expanded: this.expanded };
    const host = this.ui("frontier-legend");
    replaceKeepingFocus(host, frontierLegend(refs, [...overlays, ...current], this.versions, state, status, this.descriptions));
    if (this.hovered !== null && host.querySelector(`[data-ver="${this.hovered}"]`) === null) this.hovered = null;
    if (this.isolated !== null && host.querySelector(`[data-ver="${this.isolated}"]`) === null) { this.isolated = null; this.renderCharts(); return; }
    const plot = this.ui("frontier-full"), coverage = plot.querySelector<HTMLDetailsElement>("[data-frontier-coverage]");
    const active = this.doc.activeElement, coverageOpen = coverage?.open ?? false, coverageFocused = coverage?.querySelector("summary") === active;
    const replayHref = active?.tagName === "A" && coverage?.contains(active) === true ? active.getAttribute("href") : null;
    plot.innerHTML = frontierPlot(refs, overlays, width, this.versions, current, this.zoom, status, this.isolated ?? this.hovered, this.hideTimeOutliers);
    const nextCoverage = plot.querySelector<HTMLDetailsElement>("[data-frontier-coverage]");
    if (nextCoverage !== null) {
      nextCoverage.open = coverageOpen;
      if (coverageFocused || replayHref !== null) {
        const replay = replayHref === null ? null : [...nextCoverage.querySelectorAll("a")].find(link => link.getAttribute("href") === replayHref);
        (replay ?? nextCoverage.querySelector("summary"))?.focus({ preventScroll: true });
      }
    }
    const outliers = this.doc.querySelector<HTMLButtonElement>("[data-frontier-outliers]"), chart = this.ui("frontier-full").querySelector<SVGElement>("[data-hidden-outliers]");
    if (outliers !== null) {
      const count = chart?.dataset.hiddenOutliers ?? "0";
      outliers.textContent = `HIDE TIME OUTLIERS${count === "0" ? "" : ` (${count})`}`;
      outliers.title = chart?.dataset.outlierSummary || "Hide extreme ended overlay runs; references and current runs stay visible";
    }
    this.pressed();
  }
  // Fades every series but the hovered (else the isolated) version, without rebuilding the chart.
  private focus(): void {
    const focus = this.isolated ?? this.hovered, plot = this.ui("frontier-full");
    plot.querySelector(".wb-frontier-chart")?.classList.toggle("wb-dim", focus !== null);
    for (const series of plot.querySelectorAll<SVGGElement>(".wb-series")) series.classList.toggle("wb-on", focus !== null && (series.dataset.version === focus || series.dataset.member === focus));
  }
  private isolate(id: string | null): void { this.isolated = id === this.isolated ? null : id; this.renderCharts(); }
  private pressed(): void { for (const button of this.ui("frontier-view").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.hasAttribute("data-frontier-outliers") ? this.hideTimeOutliers : (button.dataset.frontierView === "zoom") === this.zoom)); }
  private render(): void {
    const dateProblem = this.ui("date-problem"), reversed = this.dateFrom !== "" && this.dateThrough !== "" && this.dateFrom > this.dateThrough;
    dateProblem.hidden = !reversed; dateProblem.textContent = reversed ? "From must be on or before Through." : "";
    for (const name of ["date-from", "date-through"]) this.ui(name).setAttribute("aria-invalid", String(reversed));
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
    if (target.closest("[data-show-all]") !== null) { this.isolate(null); return; }
    if (target.closest("[data-legend-toggle]") !== null) { this.legendOpen = !(this.legendOpen ?? false); this.renderCharts(); return; }
    const more = target.closest<HTMLElement>("[data-ver-more]");
    if (more !== null) { const id = more.dataset.verMore ?? ""; if (!this.expanded.delete(id)) this.expanded.add(id); this.renderCharts(); return; }
    const version = target.closest<HTMLElement>("[data-ver]");
    if (version !== null) { const inner = target.closest("details, summary, a, button"); if (inner === null || !version.contains(inner)) this.isolate(version.dataset.ver ?? null); return; }
    if (target.closest("[data-frontier-outliers]") !== null) { this.hideTimeOutliers = !this.hideTimeOutliers; if (this.initialized) this.renderCharts(); else this.pressed(); return; }
    if (target.closest("[data-clear-dates]") !== null) {
      this.dateFrom = ""; this.dateThrough = "";
      for (const name of ["date-from", "date-through"]) (this.ui(name) as HTMLInputElement).value = "";
      this.render(); return;
    }
    const view = target.closest<HTMLElement>("[data-frontier-view]"); if (view !== null) { this.zoom = view.dataset.frontierView === "zoom"; if (this.initialized) this.renderCharts(); else this.pressed(); return; }
    const mark = target.closest<HTMLElement>("[data-run]"); if (mark !== null) { event.preventDefault(); this.detail(mark.dataset.run ?? "", mark.dataset.split ?? null); }
  };
  private onKey = (event: Event): void => {
    const key = event as KeyboardEvent;
    if (key.key === "Escape" && this.selected !== null) { this.close(); key.preventDefault(); return; }
    const target = key.target as Element | null;
    if ((key.key === "Enter" || key.key === " ") && target?.matches("[data-ver]") === true) { key.preventDefault(); this.isolate(target.getAttribute("data-ver")); return; }
    if ((key.key === "Enter" || key.key === " ") && target?.matches('.wb-mark[role="button"]') === true) { key.preventDefault(); this.detail(target.getAttribute("data-run") ?? "", target.getAttribute("data-split")); }
    if (key.key === "Tab" && this.selected !== null) {
      const nodes = Array.from(this.ui("detail-body").querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
      const first = nodes[0], last = nodes.at(-1);
      if (key.shiftKey && this.doc.activeElement === first) { last?.focus(); key.preventDefault(); }
      else if (!key.shiftKey && this.doc.activeElement === last) { first?.focus(); key.preventDefault(); }
    }
  };
  private onToggle = (event: Event): void => {
    const details = event.target as HTMLDetailsElement | null; if (details?.tagName !== "DETAILS") return;
    const { what, all, bar } = details.dataset, open = details.open;
    const mark = (set: Set<string>, id: string): void => { if (open) set.add(id); else set.delete(id); };
    if (what !== undefined) mark(this.changed, what); else if (all !== undefined) mark(this.allOn, all); else if (bar === "marks") this.marksOpen = open; else if (bar === "how") this.howOpen = open;
  };
  // Hovering or focusing a version (a card, row or mark-key item) highlights its runs until the pointer or focus leaves it.
  private onHover = (event: Event): void => {
    const target = event.target as Element | null; if (target?.nodeType !== 1) return;
    const from = target.closest<HTMLElement>("[data-ver]"), entering = event.type === "mouseover" || event.type === "focusin";
    let hovered: string | null;
    if (entering) hovered = from?.dataset.ver ?? null;
    else {
      const next = (event as FocusEvent).relatedTarget as Element | null, to = next?.nodeType === 1 ? next.closest<HTMLElement>("[data-ver]") : null;
      hovered = to?.dataset.ver ?? null;
    }
    if (hovered === this.hovered) return;
    this.hovered = hovered; this.focus();
  };
  private onChange = (event: Event): void => {
    const element = event.target as HTMLSelectElement | HTMLInputElement; const name = element.dataset.wb;
    if (name === "date-from") this.dateFrom = element.value; else if (name === "date-through") this.dateThrough = element.value; else if (name === "overlay") this.overlay = element.value; else if (name === "cohort") this.scope = element.value; else if (name === "model") this.model = element.value; else if (name === "preset") this.preset = element.value; else return;
    this.render();
  };
}
export function bootWorkbench(win: Window): Workbench {
  const from = new URL(win.location.href).searchParams.get("from");
  const wb = new Workbench(win.document, {
    fetchSnapshot: async () => { const response = await win.fetch("/api/workbench", { signal: AbortSignal.timeout(180000) }); if (!response.ok) throw new Error(`Workbench request failed (${String(response.status)})`); return response.json() as Promise<unknown>; },
    fetchFeatures: async () => { const response = await win.fetch("/api/features"); if (!response.ok) throw new Error(`Feature catalog request failed (${String(response.status)})`); return response.json() as Promise<unknown>; },
    now: () => Date.now(), width: () => win.document.querySelector('[data-wb="frontier-full"]')?.getBoundingClientRect().width || win.document.documentElement.clientWidth || 640,
    fetchJson: async (url) => { const response = await win.fetch(url); if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`); return response.json() as Promise<unknown>; },
    loadGlyphSheet: browserGlyphSheet(win.document), drawGlyphs,
  }, from);
  const queueRoot = win.document.querySelector<HTMLElement>('[data-ui="experiment-queue"]');
  const experiments = queueRoot === null ? null : new QueuePanel(queueRoot, { fetchJson: async (url) => { const response = await win.fetch(url); if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`); return response.json() as Promise<unknown>; }, sendJson: async (method, url, body) => { const response = await win.fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const reply: unknown = await response.json(); if (!response.ok) throw new Error(typeof reply === "object" && reply !== null && "error" in reply ? String(reply.error) : `${method} ${url} returned HTTP ${String(response.status)}`); return reply; }, confirm: (text) => win.confirm(text), loaded: (snapshot) => { wb.lanes(runLanes(snapshot.fixedRuns ?? [])); }, unavailable: () => { wb.lanes("unavailable"); }, problem: (text) => { const el = queueRoot.querySelector('[data-eq="queue"]'); if (el !== null) el.innerHTML = `<pre class="eq-problems">${esc(text)}</pre>`; } });
  void experiments?.load();
  const queuePoll = win.setInterval(() => { void experiments?.load(); }, QUEUE_POLL_MS);
  void wb.features(); void wb.refresh(); const poll = win.setInterval(() => { void wb.refresh(); }, WORKBENCH_POLL_MS), clock = win.setInterval(() => { wb.clock(); }, 1000);
  win.addEventListener("resize", () => { wb.resize(); }); win.addEventListener("pagehide", () => { wb.destroy(); win.clearInterval(poll); win.clearInterval(clock); win.clearInterval(queuePoll); }, { once: true });
  return wb;
}
