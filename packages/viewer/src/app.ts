// Browser glue: picks a run, follows its event stream, and renders the Open
// PokéNav layout either live (wall clock) or as a replay (cursor clock).
import type { RunEvent } from "@pokebench/agent/events";
import { esc, eventMs, hms } from "./format.js";
import { gbaSvg, litButtons } from "./gba.js";
import { RunView, isRunEvent } from "./model.js";
import { actionRow, brand, budgets, counters, fieldContext, objectivePanel, objectiveStatus, inspector, party, splits, thinkingDialog, trainerCard, type Baseline } from "./panels.js";
import { ReplayClock } from "./replay.js";
import { lanesSvg } from "./timeline.js";
import { ABORT_HOLD_MS, availableActions, controlBar, overlay, overlayKind, runSeconds, sideStats, splitStrip, stateLabel, type ControlAction } from "./controls.js";
import { NextRunPanel } from "./nextpanel.js";

export interface StreamLike {
  addEventListener(type: string, listener: (message: { data: string }) => void): void;
  close(): void;
}

export interface AppDeps {
  fetchJson(url: string): Promise<unknown>;
  sendJson(method: "POST" | "PUT", url: string, body: unknown): Promise<unknown>;
  openStream(url: string): StreamLike;
  now(): number;
  readonly hash: string;
}

export type Mode = "loading" | "live" | "replay" | "idle";

interface RunChoice {
  readonly id: string;
  readonly ended?: boolean;
  readonly started?: string | null;
  readonly model?: string | null;
  readonly problem?: string | null;
  // The server's answer to "is its game server up?"; absent from older servers.
  readonly live?: boolean;
}

const LIVE_SCREEN_MS = 500;
const LIVE_RETRY_MS = 5_000;
export const RUN_LIST_MS = 3_000;
const MODE_TEXT: Record<Mode, string> = { loading: "LOADING", live: "LIVE", replay: "REPLAY", idle: "NO RUNS" };

function runChoices(value: unknown): RunChoice[] {
  if (!Array.isArray(value) || !value.every((run) => typeof run === "object" && run !== null && typeof (run as { id?: unknown }).id === "string")) {
    throw new Error("malformed /api/runs payload");
  }
  return (value as RunChoice[]).slice().sort((a, b) => {
    const liveA = a.ended === false && a.problem === null && a.live !== false;
    const liveB = b.ended === false && b.problem === null && b.live !== false;
    return Number(liveB) - Number(liveA) || (Date.parse(b.started ?? "") || 0) - (Date.parse(a.started ?? "") || 0);
  });
}

function baselineOf(value: unknown): Baseline {
  const record = value as { run?: unknown; milestones?: unknown };
  const milestones = record.milestones;
  if (
    typeof record.run !== "string" ||
    !Array.isArray(milestones) ||
    !milestones.every((m: { name?: unknown; offsetMs?: unknown }) => typeof m.name === "string" && typeof m.offsetMs === "number")
  ) {
    throw new Error("malformed baseline payload");
  }
  return { run: record.run, milestones: milestones as Baseline["milestones"] };
}

function option(doc: Document, value: string, label: string): HTMLOptionElement {
  const element = doc.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

export class App {
  mode: Mode = "loading";
  clock: ReplayClock | null = null;
  view = new RunView();
  private shown = new RunView();
  private runs: RunChoice[] = [];
  // Set when the newest run is opened; a later refresh may list a newer one first.
  private following = false;
  private followThinking = true;
  private runId: string | null = null;
  private stream: StreamLike | null = null;
  private baseline: Baseline | null = null;
  private baselineRequest = 0;
  private best: Baseline | null = null;
  private comparisonRequest = 0;
  private problems: string[] = [];
  private logged = 0;
  private screenTick = 0;
  private sinceScreen = 0;
  private liveFailedAt: number | null = null;
  private readonly html = new Map<HTMLElement, string>();
  // Hold-to-confirm abort: when X (or the button) went down; null when released.
  private holdStart: number | null = null;
  private overlayClosed = false;
  private wasLive = false;
  readonly next: NextRunPanel;

  constructor(
    private readonly doc: Document,
    private readonly deps: AppDeps,
  ) {
    this.next = new NextRunPanel(doc, { fetchJson: (url) => deps.fetchJson(url), sendJson: (method, url, body) => deps.sendJson(method, url, body), problem: (text) => { this.problem(text); } });
  }

  private get live(): boolean {
    return this.mode === "live" && this.view.end === null && this.runs.find((run) => run.id === this.runId)?.live !== false;
  }

  // An unended run whose game server no longer answers: not controllable.
  private get unresponsive(): boolean {
    return this.mode === "live" && this.view.end === null && this.runs.find((run) => run.id === this.runId)?.live === false;
  }

  async control(action: ControlAction): Promise<void> {
    if (this.runId === null || !availableActions(this.view, this.live).has(action)) return;
    try {
      await this.deps.sendJson("POST", `/api/runs/${encodeURIComponent(this.runId)}/control`, { action });
    } catch (error) {
      this.problem(`${action.replace("_", " ")}: ${String(error)}`);
    }
  }

  private holdFraction(): number | null {
    return this.holdStart === null ? null : Math.min(1, (this.deps.now() - this.holdStart) / ABORT_HOLD_MS);
  }

  pressAbort(): void {
    if (this.holdStart === null && availableActions(this.view, this.live).has("abort")) this.holdStart = this.deps.now();
    this.render();
  }

  releaseAbort(): void {
    this.holdStart = null;
    this.render();
  }

  key(event: { key: string; type: string; repeat?: boolean; target: EventTarget | null }): boolean {
    const target = event.target as HTMLElement | null;
    if (target !== null && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return false;
    const key = event.key.toLowerCase();
    if (event.type === "keyup") {
      if (key === "x") this.releaseAbort();
      return key === "x";
    }
    if (event.repeat === true && key !== "x") return false;
    const state = this.view.control.state;
    if (key === "p") void this.control(state === "paused" || state === "pause_pending" ? "resume" : "pause");
    else if (key === "s") void this.control(state === "stop_pending" ? "cancel_stop" : "stop");
    else if (key === "x") this.pressAbort();
    else if (key === "b" || key === "escape") { this.overlayClosed = true; this.render(); }
    else return false;
    return true;
  }

  private ui(name: string): HTMLElement {
    const element = this.doc.querySelector<HTMLElement>(`[data-ui="${name}"]`);
    if (element === null) throw new Error(`page is missing [data-ui="${name}"]`);
    return element;
  }

  private picker(name: string): HTMLSelectElement {
    return this.ui(name) as HTMLSelectElement;
  }

  private setHtml(name: string, html: string): void {
    const element = this.ui(name);
    if (this.html.get(element) === html) return;
    this.html.set(element, html);
    element.innerHTML = html;
  }

  async init(): Promise<void> {
    this.ui("gba").innerHTML = gbaSvg();
    this.wire();
    void this.next.load();
    this.listRuns(runChoices(await this.deps.fetchJson("/api/runs")));
    const wanted = /^#run=(.+)$/.exec(this.deps.hash)?.[1];
    const fromHash = wanted === undefined ? undefined : this.runs.find((run) => run.id === decodeURIComponent(wanted));
    const first = fromHash ?? this.runs[0];
    if (first === undefined) {
      this.mode = "idle";
      this.render();
      return;
    }
    this.select(first.id);
  }

  private listRuns(runs: RunChoice[]): void {
    this.runs = runs;
    const picker = this.picker("run");
    // Unended runs whose game server no longer answers are not live.
    const isLive = (run: RunChoice): boolean => run.ended === false && run.problem === null && run.live !== false;
    picker.replaceChildren(...runs.map((run) => option(this.doc, run.id, `${isLive(run) ? "LIVE · " : run.ended === false && run.problem === null ? "NOT RESPONDING · " : ""}${run.id}`)));
    if (this.runId !== null) picker.value = this.runId;
    const live = runs.filter(isLive);
    const box = this.ui("live-runs");
    box.hidden = live.length === 0;
    box.replaceChildren();
    for (const run of live) {
      const button = this.doc.createElement("button");
      button.dataset.label = run.model ?? run.id;
      button.title = run.id;
      button.dataset.run = run.id;
      button.addEventListener("click", () => { this.select(run.id); });
      box.append(button);
    }
    this.markSelectedRun();
  }

  private markSelectedRun(): void {
    for (const button of this.ui("live-runs").querySelectorAll<HTMLButtonElement>("button")) {
      const selected = button.dataset.run === this.runId;
      button.setAttribute("aria-pressed", String(selected));
      button.textContent = `${selected ? "WATCHING" : "LIVE"} · ${button.dataset.label ?? ""}`;
    }
  }

  // Runs start after the page loads (a batch of measured runs); pick them up
  // without ever switching away from a run that is live or deliberately chosen.
  async refreshRuns(): Promise<void> {
    let runs: RunChoice[];
    try {
      runs = runChoices(await this.deps.fetchJson("/api/runs"));
    } catch (error) {
      this.problem(`run list: ${String(error)}`);
      return;
    }
    this.listRuns(runs);
    const newest = this.runs[0];
    if (newest === undefined || newest.id === this.runId) return;
    if (this.runId === null) {
      const wanted = /^#run=(.+)$/.exec(this.deps.hash)?.[1];
      this.select(runs.find((run) => wanted !== undefined && run.id === decodeURIComponent(wanted))?.id ?? newest.id);
    } else if (this.following && this.view.end !== null) {
      this.select(newest.id);
    }
  }

  private wire(): void {
    const controls = this.ui("run-controls");
    controls.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-control]")?.dataset.control;
      if (action !== undefined && action !== "abort") void this.control(action as ControlAction);
    });
    controls.addEventListener("pointerdown", (event) => {
      if ((event.target as HTMLElement).closest("[data-control=abort]") !== null) this.pressAbort();
    });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) controls.addEventListener(type, () => { if (this.holdStart !== null) this.releaseAbort(); });
    for (const type of ["keydown", "keyup"]) this.doc.addEventListener(type, (event) => { if (this.key(event as KeyboardEvent)) event.preventDefault(); });
    // A hold that loses focus never sees its keyup; never let it complete an abort.
    this.doc.addEventListener("visibilitychange", () => { if (this.holdStart !== null) this.releaseAbort(); });
    this.doc.defaultView?.addEventListener("blur", () => { if (this.holdStart !== null) this.releaseAbort(); });
    for (const button of this.doc.querySelectorAll<HTMLButtonElement>("[data-page]")) {
      button.addEventListener("click", () => { this.showPage(button.dataset.page ?? "trainer"); });
    }
    this.ui("objective-link").addEventListener("click", () => {
      this.showPage("objectives");
      this.doc.querySelector(".inspection-nav")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    this.ui("think-body").addEventListener("scroll", () => {
      const body = this.ui("think-body");
      this.followThinking = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
      this.ui("follow-thinking").setAttribute("aria-pressed", String(this.followThinking));
    });
    this.ui("follow-thinking").addEventListener("click", () => {
      this.followThinking = !this.followThinking;
      this.ui("follow-thinking").setAttribute("aria-pressed", String(this.followThinking));
      if (this.followThinking) this.ui("think-body").scrollTop = this.ui("think-body").scrollHeight;
    });
    this.picker("run").addEventListener("change", (event) => {
      this.select((event.target as HTMLSelectElement).value);
    });
    this.ui("play").addEventListener("click", () => {
      if (this.clock === null) return;
      if (this.clock.playing) this.clock.pause();
      else this.clock.play();
      this.render();
    });
    this.picker("speed").addEventListener("change", (event) => {
      this.clock?.setSpeed(Number((event.target as HTMLSelectElement).value));
    });
    (this.ui("scrub") as HTMLInputElement).addEventListener("input", (event) => {
      this.clock?.seekFraction(Number((event.target as HTMLInputElement).value) / 1000);
      this.render();
    });
    this.ui("log").addEventListener("click", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".ev");
      if (row === null) return;
      for (const selected of this.ui("log").querySelectorAll(".ev.sel")) selected.classList.remove("sel");
      row.classList.add("sel");
      this.setHtml("inspector", inspector(this.view.bySeq(Number(row.dataset.seq))));
    });
    this.picker("baseline").addEventListener("change", (event) => {
      void this.pickBaseline((event.target as HTMLSelectElement).value);
    });
    this.ui("screen").addEventListener("error", () => {
      if (this.mode === "live") this.liveFailedAt = this.deps.now();
    });
  }

  private showPage(name: string): void {
    for (const panel of this.doc.querySelectorAll<HTMLElement>("[data-nav-page]")) panel.hidden = panel.dataset.navPage !== name;
    for (const button of this.doc.querySelectorAll<HTMLButtonElement>("[data-page]")) button.setAttribute("aria-pressed", String(button.dataset.page === name));
  }

  private async pickBaseline(runId: string): Promise<void> {
    const request = ++this.baselineRequest;
    this.baseline = null;
    this.render();
    if (runId === "") return;
    try {
      const baseline = baselineOf(await this.deps.fetchJson(`/api/runs/${encodeURIComponent(runId)}/milestones`));
      // A newer pick or a run switch supersedes this response.
      if (request !== this.baselineRequest) return;
      this.baseline = baseline;
    } catch (error) {
      if (request !== this.baselineRequest) return;
      this.problem(`baseline ${runId}: ${String(error)}`);
    }
    this.render();
  }

  private async loadComparisons(runId: string): Promise<void> {
    const request = ++this.comparisonRequest;
    const baselineRequest = this.baselineRequest;
    try {
      const value = await this.deps.fetchJson(`/api/runs/${encodeURIComponent(runId)}/comparisons`);
      const record = value as { candidates?: unknown; baseline?: unknown; best?: unknown };
      if (!Array.isArray(record.candidates)) throw new Error("malformed comparisons");
      const candidates = record.candidates.map(baselineOf);
      const baseline = record.baseline === null ? null : baselineOf(record.baseline);
      const best = record.best === null ? null : baselineOf(record.best);
      if (request !== this.comparisonRequest) return;
      this.best = best;
      // Populate only validated references, even when the user disabled the
      // automatic default while loading. Never expose unchecked run choices.
      this.picker("baseline").replaceChildren(option(this.doc, "", "none"), ...candidates.map((c) => option(this.doc, c.run, c.run)));
      if (baselineRequest === this.baselineRequest) this.baseline = baseline;
      this.picker("baseline").value = this.baseline?.run ?? "";
      this.render();
    } catch (error) {
      if (request === this.comparisonRequest) this.problem(`comparisons: ${String(error)}`);
    }
  }

  select(runId: string): void {
    this.stream?.close();
    this.runId = runId;
    this.following = this.runs[0]?.id === runId;
    this.view = new RunView();
    this.shown = this.view;
    this.clock = null;
    this.mode = "loading";
    this.baseline = null;
    this.best = null;
    this.baselineRequest += 1;
    this.problems = [];
    this.ui("problems").hidden = true;
    this.ui("problems").textContent = "";
    this.logged = 0;
    this.followThinking = true;
    this.holdStart = null;
    this.overlayClosed = false;
    this.wasLive = false;
    this.ui("follow-thinking").setAttribute("aria-pressed", "true");
    this.liveFailedAt = null;
    this.ui("log").replaceChildren();
    this.setHtml("inspector", inspector(undefined));
    this.picker("run").value = runId;
    this.markSelectedRun();
    // References are eligible only after the owned server validates their logs.
    this.picker("baseline").replaceChildren(option(this.doc, "", "none"));
    this.doc.location.hash = `run=${encodeURIComponent(runId)}`;
    void this.loadComparisons(runId);
    const stream = this.deps.openStream(`/api/runs/${encodeURIComponent(runId)}/events`);
    this.stream = stream;
    stream.addEventListener("ev", (message) => {
      if (this.stream !== stream) return;
      this.receive(message.data);
    });
    stream.addEventListener("problem", (message) => {
      if (this.stream !== stream) return;
      const detail = JSON.parse(message.data) as { line?: unknown; problem?: unknown };
      this.problem(`line ${String(detail.line)}: ${String(detail.problem)}`);
    });
    stream.addEventListener("caught_up", () => {
      if (this.stream !== stream) return;
      if (this.view.end !== null) this.startReplay(false);
      else {
        this.mode = "live";
        this.shown = this.view;
      }
      this.render();
    });
    stream.addEventListener("done", () => {
      stream.close();
      if (this.stream !== stream) return;
      if (this.mode !== "replay") this.startReplay(true);
      this.render();
    });
    this.render();
  }

  private receive(data: string): void {
    let value: unknown;
    try {
      value = JSON.parse(data);
    } catch {
      this.problem("unreadable stream message");
      return;
    }
    if (!isRunEvent(value)) {
      this.problem("not a run event");
      return;
    }
    if (value.run !== this.runId) {
      this.problem(`event for run ${value.run}`);
      return;
    }
    this.view.apply(value);
  }

  private problem(text: string): void {
    this.problems.push(text);
    if (this.problems.length > 100) this.problems.shift();
    const box = this.ui("problems");
    box.hidden = false;
    box.textContent = this.problems.slice(-100).join("\n");
  }

  private startReplay(atEnd: boolean): void {
    const { startMs, lastMs } = this.view;
    if (startMs === null || lastMs === null) {
      this.mode = "idle";
      return;
    }
    this.clock = new ReplayClock(startMs, lastMs);
    if (atEnd) this.clock.seek(lastMs);
    else this.clock.play();
    this.mode = "replay";
    this.shown = new RunView();
    this.ui("log").replaceChildren();
    this.logged = 0;
  }

  tick(realMs: number): void {
    this.clock?.tick(realMs);
    if (this.holdStart !== null && (this.holdFraction() ?? 0) >= 1) {
      this.holdStart = null;
      void this.control("abort");
    }
    this.sinceScreen += realMs;
    if (this.sinceScreen >= LIVE_SCREEN_MS) {
      this.sinceScreen = 0;
      this.screenTick += 1;
    }
    this.render();
  }

  private advanceShown(positionMs: number): void {
    if (this.shown.lastMs !== null && positionMs < this.shown.lastMs) {
      // Rewinding removes the selected row; discard its now-future raw event.
      this.setHtml("inspector", inspector(undefined));
      this.shown = new RunView();
      this.ui("log").replaceChildren();
      this.logged = 0;
    }
    const events: readonly RunEvent[] = this.view.events;
    for (let i = this.shown.events.length; i < events.length; i += 1) {
      const event = events[i];
      if (event === undefined || eventMs(event) > positionMs) break;
      this.shown.apply(event);
    }
  }

  private renderLog(): void {
    const log = this.ui("log");
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    const rows: string[] = [];
    for (const event of this.shown.events.slice(this.logged)) {
      const row = actionRow(event, this.shown);
      if (row !== null) rows.push(row);
    }
    this.logged = this.shown.events.length;
    if (rows.length === 0) return;
    log.insertAdjacentHTML("beforeend", rows.join(""));
    if (atBottom) log.scrollTop = log.scrollHeight;
  }

  private renderScreen(nowMs: number): void {
    const screen = this.ui("screen");
    const id = encodeURIComponent(this.runId ?? "");
    const recorded = this.shown.frame === null ? "" : `/api/runs/${id}/${this.shown.frame}`;
    let href = recorded;
    let note = recorded === "" ? "no frame yet" : "recorded frame";
    if (this.mode === "live") {
      const failed = this.liveFailedAt !== null && nowMs - this.liveFailedAt < LIVE_RETRY_MS;
      href = failed ? recorded : `/api/runs/${id}/screen?n=${String(this.screenTick)}`;
      note = failed ? "live screen unavailable · last frame" : "live";
    }
    if (screen.getAttribute("href") !== href) screen.setAttribute("href", href);
    this.ui("screen-note").textContent = note;
  }

  render(): void {
    const clock = this.clock;
    const nowMs = this.mode === "replay" && clock !== null ? clock.positionMs : this.deps.now();
    if (this.mode === "replay") this.advanceShown(nowMs);
    const view = this.shown;
    const live = this.live;
    if (live) this.wasLive = true;
    const label = this.unresponsive ? { cls: "ended", text: "NOT RESPONDING" } : live || view.end !== null ? stateLabel(view, live) : { cls: this.mode, text: MODE_TEXT[this.mode] };
    const mode = this.ui("mode");
    mode.textContent = label.text;
    mode.className = `mode ${label.cls}`;
    this.setHtml("run-controls", controlBar(view, live, this.holdFraction()));
    const kind = overlayKind(view, live || (this.wasLive && view.end !== null), this.holdStart !== null, this.overlayClosed);
    const layer = this.doc.querySelector<SVGElement>('[data-ui="screen-overlay"]');
    if (layer !== null) {
      const markup = overlay(kind, view, nowMs, this.holdFraction() ?? 0);
      if (this.html.get(layer as unknown as HTMLElement) !== markup) {
        this.html.set(layer as unknown as HTMLElement, markup);
        layer.innerHTML = markup;
      }
    }
    this.setHtml("stats", sideStats(view, nowMs));
    this.setHtml("split-strip", splitStrip(view, this.best));
    this.next.setLive(live ? view : null);
    this.ui("brand").textContent = brand(view);
    const dialog = thinkingDialog(view, nowMs);
    this.ui("think-head").textContent = dialog.head;
    this.setHtml("think-body", dialog.body);
    if (this.followThinking) {
      const body = this.ui("think-body");
      body.scrollTop = body.scrollHeight;
    }
    this.setHtml("trainer", trainerCard(view, nowMs));
    this.setHtml("field-context", fieldContext(view));
    this.setHtml("party", party(view));
    this.setHtml("objective", objectivePanel(view));
    const objective = view.objective;
    this.setHtml("objective-summary", objective === null ? '<span class="nodata">no objective recorded</span>' : `<span class="objective-status">${esc(objectiveStatus(objective))}</span> ${esc(objective.title)}`);
    this.setHtml("run-details", `<details><summary>RUN METADATA · PROMPT · TOOLS · BUDGETS</summary><pre>${esc(JSON.stringify(view.start, null, 2))}</pre></details><details><summary>LATEST RECORDED STATE</summary><pre>${esc(JSON.stringify(view.state, null, 2))}</pre></details><details><summary>TERMINAL EVENT</summary><pre>${esc(JSON.stringify(view.end, null, 2))}</pre></details>`);
    const barHeight = this.doc.querySelector(".bar")?.getBoundingClientRect().height ?? 0;
    this.doc.documentElement.style.setProperty("--viewer-bar-height", `${String(barHeight || 110)}px`);
    this.setHtml("budgets", budgets(view, nowMs));
    this.setHtml("counters", counters(view));
    const split = splits(view, this.baseline, nowMs, this.best);
    this.setHtml("splits-summary", split.summary);
    this.setHtml("splits", split.table);
    this.setHtml("lanes", lanesSvg(view, nowMs));
    this.renderLog();
    this.renderScreen(nowMs);
    const lit = litButtons(view.presses, nowMs);
    for (const button of this.ui("gba").querySelectorAll<SVGElement>("[data-btn]")) {
      button.classList.toggle("lit", lit.has(button.dataset.btn as never));
    }
    const play = (this.ui("play") as HTMLButtonElement);
    const scrub = (this.ui("scrub") as HTMLInputElement);
    play.disabled = clock === null;
    scrub.disabled = clock === null;
    play.textContent = clock?.playing === true ? "❚❚" : "▶";
    if (clock !== null) {
      scrub.value = String(Math.round(clock.fraction * 1000));
      this.ui("clock").textContent = `${hms((clock.positionMs - clock.startMs) / 1000)} / ${hms((clock.endMs - clock.startMs) / 1000)}`;
    } else {
      const cap = view.start?.budgets.max_wall_ms;
      this.ui("clock").textContent = view.startMs === null ? "" : `T${String(view.turn)} · ${hms(runSeconds(view, nowMs))}${cap === undefined ? "" : ` / ${hms(cap / 1000)}`}`;
    }
  }
}

export async function mountApp(doc: Document, deps: AppDeps): Promise<App> {
  const app = new App(doc, deps);
  await app.init();
  return app;
}

export interface BootWindow {
  readonly document: Document;
  readonly location: { readonly hash: string };
  fetch(url: string, init?: RequestInit): Promise<Response>;
  readonly EventSource: new (url: string) => StreamLike;
  setInterval(handler: () => void, ms: number): unknown;
  readonly performance: { now(): number };
}

export async function boot(win: BootWindow): Promise<App> {
  const app = await mountApp(win.document, {
    fetchJson: async (url) => {
      const response = await win.fetch(url);
      if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`);
      return (await response.json()) as unknown;
    },
    sendJson: async (method, url, body) => {
      const response = await win.fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const reply: unknown = await response.json();
      if (!response.ok) throw new Error(typeof reply === "object" && reply !== null && "error" in reply ? String(reply.error) : `${method} ${url} returned HTTP ${String(response.status)}`);
      return reply;
    },
    openStream: (url) => new win.EventSource(url),
    now: () => Date.now(),
    hash: win.location.hash,
  });
  let last = win.performance.now();
  win.setInterval(() => {
    const now = win.performance.now();
    app.tick(now - last);
    last = now;
  }, 100);
  win.setInterval(() => {
    void app.refreshRuns();
    void app.next.poll();
  }, RUN_LIST_MS);
  return app;
}
