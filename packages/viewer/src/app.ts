// Browser glue: picks a run, follows its event stream, and renders the Open
// PokéNav layout either live (wall clock) or as a replay (cursor clock).
import type { RunEvent } from "@pokebench/agent/events";
import { eventMs, hms } from "./format.js";
import { gbaSvg, litButtons } from "./gba.js";
import { RunView, isRunEvent } from "./model.js";
import { actionRow, brand, budgets, counters, inspector, party, splits, thinkingDialog, trainerCard, type Baseline } from "./panels.js";
import { ReplayClock } from "./replay.js";
import { lanesSvg } from "./timeline.js";

export interface StreamLike {
  addEventListener(type: string, listener: (message: { data: string }) => void): void;
  close(): void;
}

export interface AppDeps {
  fetchJson(url: string): Promise<unknown>;
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
    const liveA = a.ended === false && a.problem === null;
    const liveB = b.ended === false && b.problem === null;
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
  private runId: string | null = null;
  private stream: StreamLike | null = null;
  private baseline: Baseline | null = null;
  private baselineRequest = 0;
  private problems: string[] = [];
  private logged = 0;
  private screenTick = 0;
  private sinceScreen = 0;
  private liveFailedAt: number | null = null;
  private readonly html = new Map<HTMLElement, string>();

  constructor(
    private readonly doc: Document,
    private readonly deps: AppDeps,
  ) {}

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
    picker.replaceChildren(...runs.map((run) => option(this.doc, run.id, `${run.ended === false && run.problem === null ? "LIVE · " : ""}${run.id}`)));
    if (this.runId !== null) picker.value = this.runId;
    const live = runs.filter((run) => run.ended === false && run.problem === null);
    const box = this.ui("live-runs");
    box.hidden = live.length === 0;
    box.replaceChildren();
    for (const run of live) {
      const button = this.doc.createElement("button");
      button.textContent = `LIVE · ${run.model ?? run.id}`;
      button.title = run.id;
      button.dataset.run = run.id;
      button.addEventListener("click", () => { this.select(run.id); });
      box.append(button);
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
    const wasNewest = this.runId !== null && this.runs[0]?.id === this.runId;
    this.listRuns(runs);
    const newest = this.runs[0];
    if (newest === undefined || newest.id === this.runId) return;
    if (this.runId === null) {
      const wanted = /^#run=(.+)$/.exec(this.deps.hash)?.[1];
      this.select(runs.find((run) => wanted !== undefined && run.id === decodeURIComponent(wanted))?.id ?? newest.id);
    } else if (wasNewest && this.view.end !== null) {
      this.select(newest.id);
    }
  }

  private wire(): void {
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

  select(runId: string): void {
    this.stream?.close();
    this.runId = runId;
    this.view = new RunView();
    this.shown = this.view;
    this.clock = null;
    this.mode = "loading";
    this.baseline = null;
    this.baselineRequest += 1;
    this.problems = [];
    this.ui("problems").hidden = true;
    this.ui("problems").textContent = "";
    this.logged = 0;
    this.liveFailedAt = null;
    this.ui("log").replaceChildren();
    this.setHtml("inspector", inspector(undefined));
    this.picker("run").value = runId;
    this.picker("baseline").replaceChildren(
      option(this.doc, "", "none"),
      ...this.runs.filter((run) => run.id !== runId).map((run) => option(this.doc, run.id, run.id)),
    );
    this.doc.location.hash = `run=${encodeURIComponent(runId)}`;
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
    this.sinceScreen += realMs;
    if (this.sinceScreen >= LIVE_SCREEN_MS) {
      this.sinceScreen = 0;
      this.screenTick += 1;
    }
    this.render();
  }

  private advanceShown(positionMs: number): void {
    if (this.shown.lastMs !== null && positionMs < this.shown.lastMs) {
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
      const row = actionRow(event);
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
    this.ui("mode").textContent = MODE_TEXT[this.mode];
    this.ui("brand").textContent = brand(view);
    const dialog = thinkingDialog(view, nowMs);
    this.ui("think-head").textContent = dialog.head;
    this.setHtml("think-body", dialog.body);
    if (view.isThinking) {
      const body = this.ui("think-body");
      body.scrollTop = body.scrollHeight;
    }
    this.setHtml("trainer", trainerCard(view, nowMs));
    this.setHtml("party", party(view));
    this.setHtml("budgets", budgets(view, nowMs));
    this.setHtml("counters", counters(view));
    const split = splits(view, this.baseline, nowMs);
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
      this.ui("clock").textContent = view.startMs === null ? "" : hms((nowMs - view.startMs) / 1000);
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
  fetch(url: string): Promise<Response>;
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
  }, RUN_LIST_MS);
  return app;
}
