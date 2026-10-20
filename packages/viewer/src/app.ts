import { metricHistory } from "./metric-history.js";
// Browser glue: picks a run, follows its event stream, and renders the Open
// PokéNav layout either live (wall clock) or as a replay (cursor clock).
import type { RunEvent } from "@pokebench/agent/events";
import { esc, eventMs, hms } from "./format.js";
import { gbaSvg, litButtons } from "./gba.js";
import { RunView, isRunEvent } from "./model.js";
import { syncPhoneFlag } from "./phone.js";
import { brand, runIdentity, budgets, counters, fieldContext, harnessConfig, inspector, party, splits, thinkingDialog, trainerCard, type Baseline } from "./panels.js";
import { ReplayClock } from "./replay.js";
import { lanesSvg } from "./timeline.js";
import { TRACE_CHIPS, TraceBuilder, moreButton, sideGroups, traceGroups, type TraceCategory, type TraceGroup } from "./trace.js";
import { ABORT_HOLD_MS, availableActions, controlBar, overlay, overlayKind, runSeconds, sideStats, splitStrip, splitTimes, stateLabel, type BestSplits, type ControlAction } from "./controls.js";
import { NextRunPanel } from "./nextpanel.js";
import { QueuePanel } from "./queue-view.js";
import { headHtml, sheetHtml } from "./run-head.js";
import type { Cohort } from "./runs.js";
import { cardHtml, cardInputFor, type CardInput } from "./trainer-card.js";
import type { GlyphPixels, GlyphSheet } from "./game-font.js";
import { browserGlyphSheet, drawGlyphs, fillCards, loadCardArt, syncCards, type LoadedArt } from "./card-dom.js";
import { WORKBENCH_POLL_MS, parseWorkbench, type WorkbenchData } from "./workbench-data.js";

export interface StreamLike {
  addEventListener(type: string, listener: (message: { data: string }) => void): void;
  close(): void;
}

export interface FrameStreamLike {
  binaryType: string;
  addEventListener(type: string, listener: (event: { data?: unknown; code?: number; reason?: string }) => void): void;
  close(): void;
}

export interface AppDeps {
  fetchJson(url: string): Promise<unknown>;
  sendJson(method: "POST" | "PUT", url: string, body: unknown): Promise<unknown>;
  openStream(url: string): StreamLike;
  openFrameStream?(url: string): FrameStreamLike;
  frameUrl?(data: unknown): string;
  stageFrame?(url: string, ready: () => void, failed: () => void): void;
  revokeFrameUrl?(url: string): void;
  now(): number;
  readonly hash: string;
  // The trainer cards' game font: the glyph sheet's pixels, and putting painted text on a canvas.
  loadGlyphSheet?(url: string): Promise<GlyphSheet | null>;
  drawGlyphs?(canvas: HTMLCanvasElement, pixels: GlyphPixels): void;
}

export function frameSocketUrl(path: string, pageHref: string): string {
  const target = new URL(path, pageHref);
  target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  return target.href;
}

export type Mode = "loading" | "live" | "replay" | "idle";

interface RunChoice {
  readonly id: string;
  readonly ended?: boolean;
  readonly started?: string | null;
  readonly model?: string | null;
  readonly problem?: string | null;
  readonly experiment?: string;
  readonly cohort?: Cohort;
  // The server's answer to "is its game server up?"; absent from older servers.
  readonly live?: boolean;
}

const TRACE_TURNS = 50;
const SIDE_TURNS = 30;

// What the operator opened, folded or selected, by row key. It is reapplied to
// every redrawn or newly drawn turn, so a row stays open when its turn is
// redrawn, hidden by a chip and shown again, or reloaded by SHOW OLDER.
interface RowState {
  readonly open: Set<string>;
  readonly folded: Set<string>;
  selected: string | null;
}

function applyState(group: HTMLElement, state: RowState): void {
  for (const row of group.querySelectorAll<HTMLElement>("[data-key]")) {
    const key = row.dataset.key ?? "";
    if (row instanceof HTMLDetailsElement && state.open.has(key)) row.open = true;
    const result = row.querySelector<HTMLDetailsElement>("details.res-d");
    if (result !== null && state.folded.has(key)) result.open = false;
    row.classList.toggle("sel", key === state.selected);
  }
}

// The row (or turn heading) at the top of the visible list, so it can stay put.
// At the very top the newest turn is shown, unless the pointer is over the list.
function anchorOf(box: HTMLElement, held: boolean): { readonly find: () => HTMLElement | null; readonly offset: number } | null {
  if (box.scrollTop <= 0 && !held) return null;
  const top = box.getBoundingClientRect().top;
  const first = [...box.querySelectorAll<HTMLElement>(".turn-h, [data-key]")].find((el) => el.getBoundingClientRect().bottom > top);
  if (first === undefined) return null;
  const key = first.dataset.key;
  const group = first.closest<HTMLElement>("[data-group]")?.dataset.group ?? "";
  const find = (): HTMLElement | null => key === undefined ? box.querySelector<HTMLElement>(`[data-group="${group}"] .turn-h`) : box.querySelector<HTMLElement>(`[data-key="${key}"]`);
  return { find, offset: first.getBoundingClientRect().top - top };
}

// Updates the list turn by turn: unchanged turns keep their elements, so a click
// or keyboard focus is never lost to a live update, and the reader's row stays put.
// `scrollTo` records a position as the viewer's own before setting it, so the scroll event it causes,
// whenever the browser fires it, is not mistaken for the reader's.
function reconcile(box: HTMLElement, groups: readonly TraceGroup[], tail: string, stamps: WeakMap<HTMLElement, string>, held: boolean, state: RowState, scrollTo: (top: number) => void): void {
  const anchor = anchorOf(box, held);
  const existing = new Map<string, HTMLElement>();
  for (const child of [...box.children] as HTMLElement[]) {
    if (child.dataset.group === undefined) child.remove();
    else existing.set(child.dataset.group, child);
  }
  const wanted: { key: string; stamp: string; html: () => string }[] = [...groups];
  if (tail !== "") wanted.push({ key: "tail", stamp: tail, html: () => tail });
  wanted.forEach((group, at) => {
    let element = existing.get(group.key);
    existing.delete(group.key);
    if (element === undefined) {
      element = box.ownerDocument.createElement("div");
      element.className = "tgroup";
      element.dataset.group = group.key;
      element.innerHTML = group.html();
      applyState(element, state);
    } else if (stamps.get(element) !== group.stamp) {
      element.innerHTML = group.html();
      applyState(element, state);
    }
    stamps.set(element, group.stamp);
    if (box.children[at] !== element) box.insertBefore(element, box.children[at] ?? null);
  });
  for (const stale of existing.values()) stale.remove();
  const moved = anchor?.find();
  if (anchor !== null && moved !== null && moved !== undefined) scrollTo(box.scrollTop + moved.getBoundingClientRect().top - box.getBoundingClientRect().top - anchor.offset);
}

// Unended runs whose game server no longer answers are not live.
const isLive = (run: RunChoice): boolean => run.ended === false && run.problem === null && run.live !== false;

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

function preferredRun(runs: readonly RunChoice[], hash: string): RunChoice | undefined {
  const wanted = /^#(?:run|replay)=(.+)$/.exec(hash)?.[1];
  const requested = wanted === undefined ? undefined : runs.find((run) => run.id === decodeURIComponent(wanted));
  if (requested !== undefined && (hash.startsWith("#replay=") || isLive(requested))) return requested;
  return runs.find(isLive) ?? requested ?? runs[0];
}

function recordedHead(value: unknown, runId: string): readonly RunEvent[] {
  if (!Array.isArray(value)) throw new Error("malformed recorded thinking payload");
  const events: RunEvent[] = [];
  for (const event of value as unknown[]) {
    if (!isRunEvent(event) || event.run !== runId) throw new Error("malformed recorded thinking payload");
    events.push(event);
  }
  if (events[0]?.type !== "run_start") throw new Error("malformed recorded thinking payload");
  return events;
}

function comparisonLabel(run: string, value: unknown): string {
  const record = value as { controller?: { kind?: unknown }; romIdentity?: unknown };
  return record.controller?.kind === "human" && record.romIdentity === "unverified" ? `${run} (ROM unverified)` : run;
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
  // Trainer cards: the ROM art (null until `just trainer-card-art` has built it) and the latest workbench snapshot.
  private art: LoadedArt | null = null;
  private artLoad: Promise<void> | null = null;
  private artProblem = false;
  private cardsProblem = false;
  private workbench: WorkbenchData | null = null;
  private workbenchLoad: Promise<void> | null = null;
  private workbenchSelection: string | null = null;
  // The cards replace the live-run buttons; the run list refreshes every few seconds and must not bring them back.
  private readonly cardHtml = new WeakMap<Element, string>();
  // Set when the newest run is opened; a later refresh may list a newer one first.
  private following = false;
  private followThinking = true;
  private runId: string | null = null;
  private stream: StreamLike | null = null;
  private baseline: Baseline | null = null;
  private baselineRequest = 0;
  private frontier: Baseline | null = null;
  private comparisonRequest = 0;
  private frontierRequest = 0;
  private comparisonsRun: string | null = null;
  private problems: string[] = [];
  private trace = this.newTrace();
  private traced = 0;
  private traceKey = "";
  private sideKey = "";
  private recordedThinking: RunView | null = null;
  private recordedThinkingTrace: TraceBuilder | null = null;
  private recordedThinkingRequest = 0;
  private traceOn = new Set<TraceCategory>(TRACE_CHIPS.filter((chip) => chip.on).map((chip) => chip.id));
  private traceLimit = TRACE_TURNS;
  private readonly stamps = new WeakMap<HTMLElement, string>();
  // Lists under the pointer hold still while newer turns arrive, so a click lands where aimed.
  private readonly held = new Set<HTMLElement>();
  private readonly heldAtTop = new Set<HTMLElement>();
  private readonly autoScroll = new WeakMap<HTMLElement, number>();
  private rows: RowState = { open: new Set(), folded: new Set(), selected: null };
  private frameStream: FrameStreamLike | null = null;
  private frameUrl: string | null = null;
  private stagedFrameUrl: string | null = null;
  private queuedFrameUrl: string | null = null;
  private readonly retiredFrameUrls: string[] = [];
  private frameConnecting = false;
  private liveFailedAt: number | null = null;
  private frameReceived = 0;
  private framePresented = 0;
  private frameLoadBound = false;
  private readonly html = new Map<HTMLElement, string>();
  // Hold-to-confirm abort: when X (or the button) went down; null when released.
  private extensionPending: { run: string; action: "extend_30m" | "extend_60m"; afterSeq: number; request: number | null } | null = null;
  private extensionMessage = "";
  private holdStart: number | null = null;
  private overlayClosed = false;
  private wasLive = false;
  readonly next: NextRunPanel;
  readonly experiments: QueuePanel | null;

  private readonly homes = new Map<HTMLElement, HTMLElement>();

  constructor(
    private readonly doc: Document,
    private readonly deps: AppDeps,
  ) {
    this.next = new NextRunPanel(doc, { fetchJson: (url) => deps.fetchJson(url), sendJson: (method, url, body) => deps.sendJson(method, url, body), problem: (text) => { this.problem(text); } });
    const queueRoot = doc.querySelector<HTMLElement>('[data-ui="experiment-queue"]');
    this.experiments = queueRoot === null ? null : new QueuePanel(queueRoot, { fetchJson: (url) => deps.fetchJson(url), problem: (text) => { this.problem(text); }, sendJson: (method, url, body) => deps.sendJson(method, url, body), confirm: (text) => doc.defaultView?.confirm(text) ?? false });
  }

  private get live(): boolean {
    return this.mode === "live" && this.view.end === null && this.runs.find((run) => run.id === this.runId)?.live !== false;
  }

  // An unended run whose game server no longer answers: not controllable.
  private get unresponsive(): boolean {
    return this.mode === "live" && this.view.end === null && this.runs.find((run) => run.id === this.runId)?.live === false;
  }

  // `/api/runs` has already established that this run owns a reachable game
  // server. Use that server while the event stream backfills; otherwise each
  // recorded frame in the backlog briefly appears as if the live run replayed.
  private get liveScreen(): boolean {
    return this.mode === "live" || (this.mode === "loading" && this.runs.some((run) => run.id === this.runId && isLive(run)));
  }

  private closeFrameStream(): void {
    const stream = this.frameStream;
    this.frameStream = null;
    this.frameConnecting = false;
    stream?.close();
    if (this.frameUrl !== null) {
      this.deps.revokeFrameUrl?.(this.frameUrl);
      this.frameUrl = null;
    }
    if (this.stagedFrameUrl !== null) this.deps.revokeFrameUrl?.(this.stagedFrameUrl);
    if (this.queuedFrameUrl !== null) this.deps.revokeFrameUrl?.(this.queuedFrameUrl);
    this.stagedFrameUrl = null;
    this.queuedFrameUrl = null;
    for (const url of this.retiredFrameUrls.splice(0)) this.deps.revokeFrameUrl?.(url);
  }

  private promoteFrame(url: string): void {
    const previous = this.frameUrl;
    this.frameUrl = url;
    this.liveFailedAt = null;
    this.renderScreen(this.deps.now());
    // SVG image loading is asynchronous. Keep a short grace window so a
    // 60 FPS replacement cannot revoke the URL the browser is still decoding.
    if (previous !== null) this.retiredFrameUrls.push(previous);
    if (this.retiredFrameUrls.length > 8) this.deps.revokeFrameUrl?.(this.retiredFrameUrls.shift() as string);
  }

  private stageFrame(url: string): void {
    if (this.deps.stageFrame === undefined) { this.promoteFrame(url); return; }
    if (this.stagedFrameUrl !== null) {
      if (this.queuedFrameUrl !== null) this.deps.revokeFrameUrl?.(this.queuedFrameUrl);
      this.queuedFrameUrl = url;
      return;
    }
    this.stagedFrameUrl = url;
    const complete = (valid: boolean): void => {
      if (this.stagedFrameUrl !== url) return;
      this.stagedFrameUrl = null;
      if (valid && this.frameStream !== null) this.promoteFrame(url);
      else this.deps.revokeFrameUrl?.(url);
      const queued = this.queuedFrameUrl;
      this.queuedFrameUrl = null;
      if (queued !== null && this.frameStream !== null) this.stageFrame(queued);
      else if (queued !== null) this.deps.revokeFrameUrl?.(queued);
    };
    this.deps.stageFrame(url, () => { complete(true); }, () => { complete(false); });
  }

  private failFrameStream(stream: FrameStreamLike): void {
    if (this.frameStream !== stream) return;
    this.liveFailedAt = this.deps.now();
    this.closeFrameStream();
    this.renderScreen(this.deps.now());
  }

  private ensureFrameStream(nowMs: number): void {
    if (!this.liveScreen || this.runId === null || this.deps.openFrameStream === undefined) {
      if (!this.liveScreen) this.closeFrameStream();
      return;
    }
    if (this.frameStream !== null || (this.liveFailedAt !== null && nowMs - this.liveFailedAt < LIVE_RETRY_MS)) return;
    const stream = this.deps.openFrameStream(`/api/runs/${encodeURIComponent(this.runId)}/frames`);
    stream.binaryType = "arraybuffer";
    this.frameStream = stream;
    this.frameConnecting = true;
    this.frameReceived = 0;
    this.framePresented = 0;
    const screen = this.ui("screen");
    if (!this.frameLoadBound) {
      screen.addEventListener("load", () => {
        if (this.frameUrl === null || screen.getAttribute("href") !== this.frameUrl) return;
        this.framePresented += 1;
        screen.dataset.liveFramesPresented = String(this.framePresented);
      });
      this.frameLoadBound = true;
    }
    screen.dataset.liveFramesReceived = "0";
    screen.dataset.liveFramesPresented = "0";
    screen.dataset.liveFramesStartedAt = String(nowMs);
    stream.addEventListener("open", () => {
      if (this.frameStream !== stream) return;
      this.frameConnecting = false;
      this.liveFailedAt = null;
      this.renderScreen(this.deps.now());
    });
    stream.addEventListener("message", (event) => {
      if (this.frameStream !== stream || this.deps.frameUrl === undefined) return;
      let next: string;
      try { next = this.deps.frameUrl(event.data); }
      catch { this.failFrameStream(stream); return; }
      this.frameReceived += 1;
      screen.dataset.liveFramesReceived = String(this.frameReceived);
      this.stageFrame(next);
    });
    stream.addEventListener("error", () => {
      if (this.frameStream !== stream) return;
      this.problem("live frame stream error");
      this.failFrameStream(stream);
    });
    stream.addEventListener("close", (event) => {
      if (this.frameStream !== stream) return;
      const detail = event.code === undefined ? "" : ` (${String(event.code)}${event.reason === undefined || event.reason === "" ? "" : `: ${event.reason}`})`;
      this.problem(`live frame stream closed${detail}`);
      this.failFrameStream(stream);
    });
  }

  async control(action: ControlAction): Promise<void> {
    if (this.runId === null || !availableActions(this.view, this.live).has(action)) return;
    try {
      await this.deps.sendJson("POST", `/api/runs/${encodeURIComponent(this.runId)}/control`, { action });
    } catch (error) {
      this.problem(`${action.replace("_", " ")}: ${String(error)}`);
    }
  }

  private extensionDialog(): HTMLDialogElement { return this.ui("extend-dialog") as HTMLDialogElement; }

  private openExtension(): void {
    if (!availableActions(this.view, this.live).has("extend_30m")) return;
    this.extensionMessage = "";
    this.updateExtension();
    this.extensionDialog().showModal();
    this.ui("extend-duration").focus();
  }

  private closeExtension(): void {
    this.extensionDialog().close();
    this.doc.querySelector<HTMLElement>("[data-extend-open]")?.focus({ preventScroll: true });
  }

  private updateExtension(): void {
    const pending = this.extensionPending;
    if (pending !== null && pending.run === this.runId) {
      const ack = this.view.events.find(e => e.type === "operator_control" && e.seq > pending.afterSeq && e.action === pending.action && pending.request !== null && e.request === pending.request);
      if (ack?.type === "operator_control") {
        this.extensionPending = null;
        this.extensionMessage = ack.status === "applied" ? "Extension applied." : "Extension was not applied. The run may have reached its limit or be stopping.";
      } else if (this.view.end !== null) {
        this.extensionPending = null;
        this.extensionMessage = "The run ended before an extension was confirmed.";
      }
    }
    const wall = this.view.control.maxWallMs ?? this.view.start?.budgets.max_wall_ms ?? 0;
    const addition = (this.ui("extend-duration") as HTMLSelectElement).value === "extend_60m" ? 3_600_000 : 1_800_000;
    this.ui("extend-run").textContent = this.runId;
    this.ui("extend-preview").textContent = `Time limit: ${hms(wall / 1000)} → ${hms((wall + addition) / 1000)} · remaining after extension: ${hms(Math.max(0, (wall + addition) / 1000 - runSeconds(this.view, this.deps.now())))}`;
    const waiting = this.extensionPending !== null;
    const applied = this.extensionMessage === "Extension applied.";
    this.ui("extend-confirm").hidden = applied;
    (this.ui("extend-confirm") as HTMLButtonElement).disabled = waiting || !availableActions(this.view, this.live).has("extend_30m");
    (this.ui("extend-duration") as HTMLSelectElement).disabled = waiting || applied;
    this.ui("extend-status").textContent = this.extensionMessage || (waiting ? "Waiting for the running agent to confirm…" : "");
    if (applied) this.ui("extend-preview").textContent = `Time limit: ${hms(wall / 1000)} · remaining: ${hms(Math.max(0, wall / 1000 - runSeconds(this.view, this.deps.now())))}`;
    this.ui("extend-cancel").textContent = waiting || this.extensionMessage !== "" ? "Close" : "Cancel";
  }

  private async extendRun(): Promise<void> {
    if (this.runId === null || this.extensionPending !== null || !availableActions(this.view, this.live).has("extend_30m")) return;
    const value = (this.ui("extend-duration") as HTMLSelectElement).value;
    const pending = { run: this.runId, action: value === "extend_60m" ? "extend_60m" as const : "extend_30m" as const, afterSeq: this.view.events.at(-1)?.seq ?? -1, request: null as number | null };
    this.extensionPending = pending;
    this.extensionMessage = "";
    this.updateExtension();
    try {
      const reply = await this.deps.sendJson("POST", `/api/runs/${encodeURIComponent(pending.run)}/control`, { action: pending.action });
      if (this.extensionPending !== pending || this.runId !== pending.run) return;
      if (typeof reply === "object" && reply !== null && "request" in reply && typeof reply.request === "number") pending.request = reply.request;
    } catch (error) {
      if (this.extensionPending !== pending || this.runId !== pending.run) return;
      // A lost HTTP response may have enqueued the request. Never retry it automatically.
      this.extensionMessage = `Request could not be confirmed: ${String(error)}. Check Activity History and reload before trying another extension.`;
    }
    this.updateExtension();
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

  // On a phone the controls sit under the screen and the run picker in the
  // sheet; each element keeps a marker at its header position to return to.
  private placeForWidth(): void {
    const phone = syncPhoneFlag(this.doc);
    if (!phone) this.showSheet(false, false);
    for (const [element, home] of this.homes) {
      const slot = this.doc.querySelector(`[data-slot="${element.matches(".tb-ctl, .replay-controls") ? "phone-controls" : "phone-picker"}"]`);
      if (!phone || slot === null) home.after(element);
      else if (element.matches(".run-choice")) (slot.querySelector("h4") ?? slot).after(element);
      else {
        // The sheet's own REPORTS link stays last, after RUNS & COMPARISONS.
        const reports = slot.querySelector('[data-ui="reports-link"]');
        if (reports === null) slot.append(element); else reports.before(element);
      }
    }
  }

  private showSheet(open: boolean, moveFocus = true): void {
    const sheet = this.ui("run-sheet"), shade = this.ui("run-sheet-shade");
    if (sheet.hidden && !open) return;
    if (open) {
      sheet.removeAttribute("data-closing");
      shade.removeAttribute("data-closing");
      sheet.hidden = shade.hidden = false;
      sheet.inert = false;
    } else {
      sheet.dataset.closing = shade.dataset.closing = "";
      sheet.inert = true;
      // Reduced motion and non-phone layouts have no exit animation to await.
      if (!this.doc.documentElement.hasAttribute("data-phone") || this.doc.defaultView?.getComputedStyle(sheet).animationName !== "rs-slide-out") this.hideSheet();
    }
    const head = this.ui("run-head");
    head.setAttribute("aria-expanded", String(open));
    if (moveFocus) (open ? this.ui("run-sheet-close") : head).focus();
  }

  private hideSheet(): void {
    for (const name of ["run-sheet", "run-sheet-shade"]) {
      const element = this.ui(name);
      element.hidden = true;
      element.removeAttribute("data-closing");
    }
  }

  private setupPhoneHeader(): void {
    const movable = [".bar > .replay-controls", ".bar > .tb-ctl", ".bar > [data-ui=\"comparisons-link\"]", ".bar > .run-choice"];
    const elements = movable.map((selector) => this.doc.querySelector<HTMLElement>(selector)).filter((element): element is HTMLElement => element !== null);
    elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) === 0 ? 1 : -1);
    for (const element of elements) {
      const home = this.doc.createElement("span");
      home.hidden = true;
      home.dataset.home = "";
      element.before(home);
      this.homes.set(element, home);
    }
    this.placeForWidth();
    this.doc.defaultView?.addEventListener("resize", () => { this.placeForWidth(); });
    this.ui("run-head").addEventListener("click", () => { this.showSheet(true); });
    this.ui("run-sheet-shade").addEventListener("click", () => { this.showSheet(false); });
    this.ui("run-sheet-close").addEventListener("click", () => { this.showSheet(false); });
    const finishSheetAnimation = (event: AnimationEvent): void => {
      if (event.target === event.currentTarget && event.animationName === "rs-slide-out" && this.ui("run-sheet").hasAttribute("data-closing")) this.hideSheet();
    };
    this.ui("run-sheet").addEventListener("animationend", finishSheetAnimation);
    this.ui("run-sheet").addEventListener("animationcancel", finishSheetAnimation);
    this.ui("run-sheet").addEventListener("keydown", (event) => { if (event.key === "Escape") this.showSheet(false); });
    this.picker("run").addEventListener("change", () => { this.showSheet(false, false); });
    this.ui("run-cards").addEventListener("click", (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-watch]")?.dataset.watch;
      if (id !== undefined) this.select(id);
    });
    this.ui("run-sheet-body").addEventListener("click", (event) => {
      const id = (event.target as HTMLElement).closest<HTMLElement>("[data-watch]")?.dataset.watch;
      if (id === undefined) return;
      this.showSheet(false);
      this.select(id);
    });
  }

  async init(): Promise<void> {
    this.setupPhoneHeader();
    this.ui("gba").innerHTML = gbaSvg();
    this.wire();
    void this.next.load();
    this.listRuns(runChoices(await this.deps.fetchJson("/api/runs")));
    const first = preferredRun(this.runs, this.deps.hash);
    if (first === undefined) {
      this.mode = "idle";
      this.render();
      return;
    }
    this.select(first.id, !this.deps.hash.startsWith("#replay="));
    void this.pollCards();
  }

  private loadArt(): Promise<void> {
    if (this.artLoad !== null) return this.artLoad;
    if (this.art !== null) return Promise.resolve();
    const publish = (loaded: LoadedArt): void => { this.art = loaded; this.artProblem = false; this.render(); };
    this.artLoad = loadCardArt((url) => this.deps.fetchJson(url), (url) => this.deps.loadGlyphSheet?.(url) ?? Promise.resolve(null), publish)
      .then(loaded => {
        if (loaded === null) { this.artProblem = true; this.artLoad = null; this.render(); }
        else publish(loaded);
      });
    return this.artLoad;
  }

  private loadWorkbench(): Promise<void> {
    const selected = this.runId;
    if (this.workbenchLoad !== null && this.workbenchSelection === selected) return this.workbenchLoad;
    this.workbenchSelection = selected;
    const load = this.deps.fetchJson(`/api/cards${selected === null ? "" : `?run=${encodeURIComponent(selected)}`}`)
      .then((value) => { if (this.runId === selected && this.workbenchLoad === load) { this.workbench = parseWorkbench(value); this.cardsProblem = false; this.render(); } })
      .catch(() => { if (this.runId === selected && this.workbenchLoad === load) { this.cardsProblem = true; this.render(); } })
      .finally(() => { if (this.workbenchLoad === load) this.workbenchLoad = null; });
    this.workbenchLoad = load;
    return load;
  }

  // The workbench projection is useful even when optional trainer-card art is unavailable: it lets
  // a selected run paint all recorded splits atomically while the full event stream catches up.
  async pollCards(): Promise<void> {
    await Promise.all([this.loadArt(), this.loadWorkbench()]);
    this.render();
  }

  private recordedSplits(): BestSplits | null {
    const run = this.workbench?.runs.find((candidate) => candidate.id === this.runId);
    return run === undefined || this.runId === null ? null : { run: this.runId, milestones: run.splits.map((split) => ({ name: split.name, offsetMs: split.elapsedMs })) };
  }

  private cardInputs(): CardInput[] {
    const { art, workbench } = this;
    if (art === null || workbench === null) return [];
    const now = this.deps.now();
    const replay = this.runs.find((run) => run.id === this.runId && run.ended === true);
    const recordedReplay = replay === undefined ? undefined : workbench.runs.find((run) => run.id === replay.id);
    if (recordedReplay !== undefined) return [cardInputFor(recordedReplay, workbench.at, now, "replay", workbench.runs, art.art)];
    // An explicitly opened replay is separate from the default live-run row.
    const live = this.runs.filter(isLive);
    const liveCards = live.flatMap((run): CardInput[] => {
      const recorded = workbench.runs.find((r) => r.id === run.id);
      if (recorded === undefined || (recorded.status !== "live" && recorded.status !== "paused")) return [];
      const status: CardInput["status"] = run.id === this.runId ? "watching" : recorded.status === "paused" ? "paused" : "live";
      return [cardInputFor(recorded, workbench.at, now, status, workbench.runs, art.art)];
    });
    return liveCards;
  }

  private listRuns(runs: RunChoice[]): void {
    this.runs = runs;
    const picker = this.picker("run");
    picker.replaceChildren(...runs.map((run) => option(this.doc, run.id, `${isLive(run) ? "LIVE · " : run.ended === false && run.problem === null ? "NOT RESPONDING · " : ""}${run.id}`)));
    if (this.runId !== null) picker.value = this.runId;
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
      this.select((preferredRun(runs, this.deps.hash) ?? newest).id, !this.deps.hash.startsWith("#replay="));
    } else if (this.following && this.view.end !== null) {
      this.select(newest.id, true);
    }
  }

  private wire(): void {
    const controls = this.ui("run-controls");
    this.ui("extend-duration").addEventListener("change", () => { this.updateExtension(); });
    this.ui("extend-confirm").addEventListener("click", () => { void this.extendRun(); });
    this.ui("extend-cancel").addEventListener("click", () => { this.closeExtension(); });
    this.extensionDialog().addEventListener("cancel", (event) => { event.preventDefault(); this.closeExtension(); });
    controls.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-extend-open]") !== null) { this.openExtension(); return; }
      if ((event.target as HTMLElement).closest("[data-dismiss-overlay]") !== null) {
        this.overlayClosed = true;
        this.render();
        return;
      }
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-control]")?.dataset.control;
      if (action !== undefined && action !== "abort") void this.control(action as ControlAction);
    });
    controls.addEventListener("pointerdown", (event) => {
      if ((event.target as HTMLElement).closest("[data-control=abort]") !== null) this.pressAbort();
    });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) controls.addEventListener(type, () => { if (this.holdStart !== null) this.releaseAbort(); });
    // Losing focus cancels a pointer hold before it can complete an abort.
    this.doc.addEventListener("visibilitychange", () => { if (this.holdStart !== null) this.releaseAbort(); });
    this.doc.defaultView?.addEventListener("blur", () => { if (this.holdStart !== null) this.releaseAbort(); });
    for (const button of this.doc.querySelectorAll<HTMLButtonElement>("[data-page]")) {
      button.addEventListener("click", () => { this.showPage(button.dataset.page ?? "trainer"); });
    }
    const pages = [...this.doc.querySelectorAll<HTMLButtonElement>("[data-page]")];
    const picker = this.ui("page-select") as HTMLSelectElement;
    for (const button of pages) {
      const option = this.doc.createElement("option");
      option.value = button.dataset.page ?? "";
      option.textContent = button.textContent;
      option.selected = button.getAttribute("aria-pressed") === "true";
      picker.append(option);
    }
    picker.addEventListener("change", () => { this.showPage(picker.value); });
    for (const step of this.doc.querySelectorAll<HTMLButtonElement>("[data-page-step]")) {
      step.addEventListener("click", () => {
        const at = pages.findIndex((button) => button.dataset.page === picker.value);
        this.showPage(pages[(at + Number(step.dataset.pageStep) + pages.length) % pages.length]?.dataset.page ?? "trace");
      });
    }
    this.ui("feature-search").addEventListener("input", () => { this.filterFeatures(); });
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
    this.ui("trace").addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-trace-more]") !== null) {
        this.traceLimit += TRACE_TURNS;
        this.render();
        return;
      }
      this.inspectRow(target);
    });
    this.ui("side-trace").addEventListener("click", (event) => { this.inspectRow(event.target as HTMLElement); });
    for (const name of ["trace", "side-trace"]) {
      const list = this.ui(name);
      list.addEventListener("mouseenter", () => {
        this.held.add(list);
        if (list.scrollTop <= 0) this.heldAtTop.add(list);
      });
      // A list held at the top goes back to following the newest turn, unless the reader scrolled away.
      list.addEventListener("mouseleave", () => {
        this.held.delete(list);
        if (this.heldAtTop.delete(list)) this.scrollTo(list, 0);
      });
      // Any scroll the reader makes (not one reconcile made) cancels the return to the top.
      list.addEventListener("scroll", () => { if (Math.abs(list.scrollTop - (this.autoScroll.get(list) ?? 0)) > 1) this.heldAtTop.delete(list); });
      for (const type of ["wheel", "touchmove"]) list.addEventListener(type, () => { this.heldAtTop.delete(list); }, { passive: true });
      // Recorded on click, before the toggle event, so a redraw in between cannot lose it.
      list.addEventListener("click", (event) => {
        const summary = (event.target as HTMLElement).closest("summary");
        const details = summary?.parentElement;
        if (!(details instanceof HTMLDetailsElement)) return;
        this.remember(details, !details.open);
      }, true);
      list.addEventListener("toggle", (event) => {
        const details = event.target as HTMLDetailsElement;
        this.remember(details, details.open, true);
      }, true);
    }
    this.ui("trace-link").addEventListener("click", () => {
      this.showPage("trace");
      this.doc.querySelector(".inspection-nav")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    this.ui("trace-chips").addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const all = target.closest("[data-trace-expand],[data-trace-collapse]");
      if (all !== null) {
        const open = all.hasAttribute("data-trace-expand");
        for (const row of this.doc.querySelectorAll<HTMLDetailsElement>('[data-ui="trace"] details[data-key], [data-ui="side-trace"] details[data-key]')) {
          this.remember(row, open);
          row.open = open;
        }
        return;
      }
      const raw = target.closest<HTMLElement>("[data-chip]")?.dataset.chip;
      const chip = TRACE_CHIPS.find((c) => c.id === raw)?.id;
      if (chip === undefined) return;
      if (!this.traceOn.delete(chip)) this.traceOn.add(chip);
      this.render();
    });
    this.picker("baseline").addEventListener("change", (event) => {
      void this.pickBaseline((event.target as HTMLSelectElement).value);
    });
  }

  private filterFeatures(): void {
    const query = (this.ui("feature-search") as HTMLInputElement).value.trim().toLowerCase();
    const config = this.ui("harness-config");
    const cards = config.querySelectorAll<HTMLElement>(".config-feature");
    let matches = 0;
    for (const card of cards) {
      const title = card.querySelector("h5")?.textContent ?? "";
      card.hidden = !title.toLowerCase().includes(query) && !(card.dataset.feature ?? "").toLowerCase().includes(query);
      if (!card.hidden) matches++;
    }
    for (const group of config.querySelectorAll<HTMLElement>(".config-group")) {
      group.hidden = Array.from(group.querySelectorAll<HTMLElement>(".config-feature")).every(card => card.hidden);
    }
    this.ui("feature-search-results").textContent = matches === 0 ? "No matching features" : `${String(matches)} matching feature${matches === 1 ? "" : "s"}`;
  }

  // Refreshes the queue page only while it is open.
  async pollExperiments(): Promise<void> {
    if (this.doc.querySelector('[data-page="queue"][aria-pressed="true"]') !== null) await this.experiments?.load();
  }

  private showPage(name: string): void {
    if (name === "splits" && this.runId !== null && this.comparisonsRun !== this.runId) void this.loadComparisons(this.runId);
    if (name === "queue") void this.experiments?.load();
    for (const panel of this.doc.querySelectorAll<HTMLElement>("[data-nav-page]")) panel.hidden = panel.dataset.navPage !== name;
    for (const button of this.doc.querySelectorAll<HTMLButtonElement>("[data-page]")) button.setAttribute("aria-pressed", String(button.dataset.page === name));
    (this.ui("page-select") as HTMLSelectElement).value = name;
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

  // The split card and the splits page race the frontier, so it loads with every pick, unlike the comparisons scan.
  private async loadFrontier(runId: string): Promise<void> {
    const request = ++this.frontierRequest;
    try {
      const record = await this.deps.fetchJson(`/api/runs/${encodeURIComponent(runId)}/frontier`) as { frontier?: unknown };
      const frontier = record.frontier === null ? null : baselineOf(record.frontier);
      if (request !== this.frontierRequest) return;
      this.frontier = frontier;
      this.render();
    } catch (error) {
      if (request === this.frontierRequest) this.problem(`frontier: ${String(error)}`);
    }
  }

  private async loadComparisons(runId: string): Promise<void> {
    this.comparisonsRun = runId;
    const request = ++this.comparisonRequest;
    const baselineRequest = this.baselineRequest;
    try {
      const value = await this.deps.fetchJson(`/api/runs/${encodeURIComponent(runId)}/comparisons`);
      const record = value as { candidates?: unknown; baseline?: unknown };
      if (!Array.isArray(record.candidates)) throw new Error("malformed comparisons");
      const rawCandidates: unknown[] = record.candidates;
      const candidates = rawCandidates.map(baselineOf);
      const baseline = record.baseline === null ? null : baselineOf(record.baseline);
      if (request !== this.comparisonRequest) return;
      // Populate only validated references, even when the user disabled the
      // automatic default while loading. Never expose unchecked run choices.
      this.picker("baseline").replaceChildren(option(this.doc, "", "none"), ...candidates.map((c, i) => option(this.doc, c.run, comparisonLabel(c.run, rawCandidates[i]))));
      if (baselineRequest === this.baselineRequest) this.baseline = baseline;
      this.picker("baseline").value = this.baseline?.run ?? "";
      this.render();
    } catch (error) {
      if (request === this.comparisonRequest) { this.comparisonsRun = null; this.problem(`comparisons: ${String(error)}`); }
    }
  }

  private async loadRecordedThinking(runId: string): Promise<void> {
    const request = ++this.recordedThinkingRequest;
    try {
      const events = recordedHead(await this.deps.fetchJson(`/api/runs/${encodeURIComponent(runId)}/head`), runId);
      if (request !== this.recordedThinkingRequest || this.runId !== runId) return;
      const view = new RunView();
      for (const event of events) view.apply(event);
      this.setRecordedThinking(view, events);
      this.render();
    } catch {
      if (request !== this.recordedThinkingRequest || this.runId !== runId) return;
      this.recordedThinking = null;
      this.recordedThinkingTrace = null;
      this.render();
    }
  }

  private setRecordedThinking(view: RunView, events: readonly RunEvent[]): void {
    const trace = new TraceBuilder((event) => view.loopLabel(event).replace(`: ${event.message}`, ""));
    for (const event of events) trace.add(event);
    this.recordedThinking = view;
    this.recordedThinkingTrace = trace;
  }

  select(runId: string, automatic = false): void {
    this.extensionDialog().close();
    this.extensionPending = null;
    this.extensionMessage = "";
    this.stream?.close();
    this.closeFrameStream();
    this.runId = runId;
    this.comparisonRequest += 1; this.comparisonsRun = null;
    this.following = automatic || (this.runs[0]?.id === runId && this.runs[0].ended !== true);
    this.view = new RunView();
    this.shown = this.view;
    this.clock = null;
    this.mode = "loading";
    this.baseline = null;
    this.frontier = null;
    this.baselineRequest += 1;
    this.recordedThinkingRequest += 1;
    this.recordedThinking = null;
    this.recordedThinkingTrace = null;
    this.problems = [];
    this.ui("problems").hidden = true;
    this.ui("problems").textContent = "";
    this.resetTrace();
    this.followThinking = true;
    this.holdStart = null;
    this.overlayClosed = false;
    this.wasLive = false;
    this.ui("follow-thinking").setAttribute("aria-pressed", "true");
    this.liveFailedAt = null;
    this.setHtml("inspector", inspector(undefined));
    this.picker("run").value = runId;
    // References are eligible only after the owned server validates their logs.
    this.picker("baseline").replaceChildren(option(this.doc, "", "none"));
    this.doc.location.hash = `${!automatic && this.runs.find((run) => run.id === runId)?.ended === true ? "replay" : "run"}=${encodeURIComponent(runId)}`;
    const comparisons = this.doc.querySelector<HTMLAnchorElement>('[data-ui="comparisons-link"]');
    if (comparisons !== null) comparisons.href = `/comparisons?from=${encodeURIComponent(runId)}`;
    const stream = this.deps.openStream(`/api/runs/${encodeURIComponent(runId)}/events`);
    this.stream = stream;
    this.ensureFrameStream(this.deps.now());
    void this.pollCards();
    void this.loadRecordedThinking(runId);
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
      // The fully folded stream is authoritative now. A slower optional head
      // request must not replace or clear it after this handoff.
      this.recordedThinkingRequest += 1;
      this.setRecordedThinking(this.view, this.view.events);
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
      this.closeFrameStream();
      if (this.mode !== "replay") this.startReplay(true);
      this.render();
    });
    void this.loadFrontier(runId);
    if (this.doc.querySelector('[data-page="splits"][aria-pressed="true"]') !== null) void this.loadComparisons(runId);
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
    const eventCount = this.view.events.length;
    this.view.apply(value);
    if (this.mode !== "loading" && this.recordedThinking === this.view && this.view.events.length > eventCount) this.recordedThinkingTrace?.add(value);
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
    this.resetTrace();
  }

  tick(realMs: number): void {
    this.clock?.tick(realMs);
    if (this.holdStart !== null && (this.holdFraction() ?? 0) >= 1) {
      this.holdStart = null;
      void this.control("abort");
    }
    this.ensureFrameStream(this.deps.now());
    this.render();
  }

  private advanceShown(positionMs: number): void {
    if (this.shown.lastMs !== null && positionMs < this.shown.lastMs) {
      // Rewinding removes the selected row; discard its now-future raw event.
      this.setHtml("inspector", inspector(undefined));
      this.shown = new RunView();
      this.resetTrace();
    }
    const events: readonly RunEvent[] = this.view.events;
    for (let i = this.shown.events.length; i < events.length; i += 1) {
      const event = events[i];
      if (event === undefined || eventMs(event) > positionMs) break;
      this.shown.apply(event);
    }
  }

  // The attribution without the message itself, which the row body already shows.
  private newTrace(): TraceBuilder {
    return new TraceBuilder((event) => this.shown.loopLabel(event).replace(`: ${event.message}`, ""));
  }

  private resetTrace(): void {
    this.trace = this.newTrace();
    this.traced = 0;
    this.traceKey = "";
    this.sideKey = "";
    this.traceLimit = TRACE_TURNS;
    this.rows = { open: new Set(), folded: new Set(), selected: null };
    for (const name of ["trace", "side-trace"]) this.doc.querySelector<HTMLElement>(`[data-ui="${name}"]`)?.replaceChildren();
  }

  private scrollTo(list: HTMLElement, top: number): void {
    this.autoScroll.set(list, top);
    list.scrollTop = top;
    // The browser may clamp the value; record where the list really is.
    this.autoScroll.set(list, list.scrollTop);
  }

  // `mirror` only once the state has changed (a toggle event); a click arrives before its own toggle.
  private remember(details: HTMLDetailsElement, open: boolean, mirror = false): void {
    const key = details.closest<HTMLElement>("[data-key]")?.dataset.key;
    if (key === undefined) return;
    const result = details.classList.contains("res-d");
    const set = result ? this.rows.folded : this.rows.open;
    if (result ? !open : open) set.add(key);
    else set.delete(key);
    if (!mirror) return;
    // Keep the side panel's and the trace page's copies of this row in step.
    const other = details.closest("[data-ui]")?.getAttribute("data-ui") === "trace" ? "side-trace" : "trace";
    for (const row of this.doc.querySelectorAll<HTMLDetailsElement>(`[data-ui="${other}"] details[data-key="${key}"]`)) {
      const target = result ? row.querySelector<HTMLDetailsElement>("details.res-d") : row;
      if (target !== null && target !== details && target.open !== open) target.open = open;
    }
  }

  // The chip buttons are built once and updated in place, so focus and clicks survive live updates.
  private renderChips(): void {
    const bar = this.ui("trace-chips");
    if (bar.childElementCount === 0) {
      bar.innerHTML = TRACE_CHIPS.map((chip) => `<button type="button" data-chip="${chip.id}" aria-pressed="false">${chip.label} <small>0</small></button>`).join("") + '<span class="spacer"></span><button type="button" class="act" data-trace-collapse>▸ COLLAPSE ALL</button><button type="button" class="act" data-trace-expand>▾ EXPAND ALL</button>';
    }
    for (const chip of TRACE_CHIPS) {
      const button = bar.querySelector<HTMLElement>(`[data-chip="${chip.id}"]`);
      button?.setAttribute("aria-pressed", String(this.traceOn.has(chip.id)));
      const count = button?.querySelector("small");
      if (count !== null && count !== undefined && count.textContent !== String(this.trace.counts[chip.id])) count.textContent = String(this.trace.counts[chip.id]);
    }
  }

  // Selecting a row (but not text inside its expanded body) shows every event it groups.
  private inspectRow(target: HTMLElement): void {
    if (target.closest(".tl-body") !== null) return;
    const row = target.closest<HTMLElement>("[data-key]");
    if (row === null) return;
    for (const selected of this.doc.querySelectorAll(".tl.sel")) selected.classList.remove("sel");
    this.rows.selected = row.dataset.key ?? null;
    for (const same of this.doc.querySelectorAll<HTMLElement>(`[data-key="${row.dataset.key ?? ""}"]`)) same.classList.add("sel");
    const owner = row.closest('[data-ui="side-trace"]') === null ? this.shown : this.recordedThinking;
    const seqs = (row.dataset.seqs ?? "").split(" ").map(Number);
    this.setHtml("inspector", seqs.map((seq) => inspector(owner?.bySeq(seq))).join(""));
  }

  private renderTrace(nowMs: number): void {
    const events = this.shown.events;
    for (; this.traced < events.length; this.traced += 1) this.trace.add(events[this.traced] as RunEvent);
    const live = this.shown.isThinking ? { turn: this.shown.turn } : null;
    const key = `${String(this.trace.version)}|${[...this.traceOn].sort().join(",")}|${String(this.traceLimit)}|${String(live?.turn ?? "")}`;
    const box = this.ui("trace");
    if (key !== this.traceKey) {
      this.traceKey = key;
      this.renderChips();
      const startMs = this.shown.startMs;
      const elapsed = startMs === null ? null : (ms: number): number => (ms - startMs - this.shown.control.pausedBefore(ms)) / 1000;
      const { groups, more } = traceGroups(this.trace.turns, this.traceOn, { elapsed, live, limit: this.traceLimit, page: TRACE_TURNS });
      reconcile(box, groups, groups.length === 0 ? '<p class="nodata">no recorded events</p>' : moreButton(more, TRACE_TURNS), this.stamps, this.held.has(box), this.rows, (top) => { this.scrollTo(box, top); });
    }
    const sideView = this.recordedThinking;
    const sideTrace = this.recordedThinkingTrace;
    const boxTurn = sideView === null || sideView.isThinking ? null : sideView.lastThought?.turn ?? null;
    const sideKey = `${this.mode}|${String(sideTrace?.version ?? -1)}|${String(boxTurn ?? "")}`;
    if (sideKey !== this.sideKey) {
      this.sideKey = sideKey;
      const side = this.ui("side-trace");
      const groups = sideTrace === null ? [] : sideGroups(sideTrace.turns, SIDE_TURNS, boxTurn);
      const empty = this.mode === "loading" && sideTrace === null ? '<p class="nodata">loading recorded thinking…</p>' : '<p class="nodata">no steps yet</p>';
      reconcile(side, groups, groups.length === 0 ? empty : "", this.stamps, this.held.has(side), this.rows, (top) => { this.scrollTo(side, top); });
    }
    if (live !== null) {
      const { thinking, text } = this.shown.streaming;
      const liveText = box.querySelector<HTMLElement>("[data-live-text]");
      if (liveText !== null && liveText.textContent !== thinking + text) {
        // The live box has a fixed height so rows below never move; it follows the newest text unless scrolled back.
        const following = liveText.scrollHeight - liveText.scrollTop - liveText.clientHeight < 24;
        liveText.textContent = thinking + text;
        if (following) liveText.scrollTop = liveText.scrollHeight;
      }
      const secs = box.querySelector<HTMLElement>("[data-live-secs]");
      if (secs !== null && this.shown.turnStartMs !== null) secs.textContent = `${((nowMs - this.shown.turnStartMs) / 1000).toFixed(1)}s`;
    }
  }

  private renderScreen(nowMs: number): void {
    const screen = this.ui("screen");
    const id = encodeURIComponent(this.runId ?? "");
    const recorded = this.shown.frame === null ? "" : `/api/runs/${id}/${this.shown.frame}`;
    let href = recorded;
    let note = recorded === "" ? "no frame yet" : "recorded frame";
    if (this.liveScreen) {
      const failed = this.liveFailedAt !== null && nowMs - this.liveFailedAt < LIVE_RETRY_MS;
      href = this.frameUrl ?? recorded;
      note = this.frameUrl !== null ? "live" : failed ? "live stream unavailable · last frame" : this.frameConnecting ? "live stream connecting · last frame" : "live stream unavailable · last frame";
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
    if (this.extensionDialog().open || this.extensionPending !== null) this.updateExtension();
    const recordedSplits = this.mode === "loading" ? this.recordedSplits() : undefined;
    const splitView = this.mode === "loading" ? view : this.view;
    this.setHtml("split-strip", splitStrip(splitView, recordedSplits));
    this.setHtml("split-times", splitTimes(splitView, this.frontier, recordedSplits));
    this.next.setLive(live ? view : null);
    this.ui("brand").textContent = brand(view);
    const thinkingView = this.recordedThinking ?? (this.mode === "loading" ? null : view);
    const dialog = thinkingView === null
      ? { head: "LOADING RECORDED THINKING…", body: '<span class="nodata">waiting for the selected run snapshot</span>' }
      : thinkingDialog(thinkingView, nowMs);
    this.ui("think-head").textContent = dialog.head;
    this.ui("think-title").textContent = thinkingView === null || thinkingView.start === null ? "NO RUN" : `${thinkingView.end === null ? "RIGHT NOW" : "FINAL"} · TURN ${String(thinkingView.turn)}`;
    const ident = runIdentity(view);
    this.setHtml("ident", ident);
    this.ui("ident").hidden = ident === "";
    this.setHtml("think-body", dialog.body);
    if (this.followThinking) {
      const body = this.ui("think-body");
      body.scrollTop = body.scrollHeight;
    }
    this.setHtml("trainer", trainerCard(view, nowMs));
    this.setHtml("field-context", fieldContext(view));
    this.setHtml("harness-config", harnessConfig(view, this.next.registry));
    this.filterFeatures();
    this.setHtml("party", party(view));
    this.setHtml("run-details", `<details><summary>RUN METADATA · PROMPT · TOOLS · BUDGETS</summary><pre>${esc(JSON.stringify(view.start, null, 2))}</pre></details><details><summary>LATEST RECORDED STATE</summary><pre>${esc(JSON.stringify(view.state, null, 2))}</pre></details><details><summary>TERMINAL EVENT</summary><pre>${esc(JSON.stringify(view.end, null, 2))}</pre></details>`);
    const barHeight = this.doc.querySelector(".bar")?.getBoundingClientRect().height ?? 0;
    this.doc.documentElement.style.setProperty("--viewer-bar-height", `${String(barHeight || 110)}px`);
    this.setHtml("budgets", budgets(view, nowMs));
    this.setHtml("counters", counters(view));
    this.setHtml("metric-history", metricHistory(view));
    const split = splits(view, this.baseline, nowMs, this.frontier);
    this.setHtml("splits-summary", split.summary);
    this.setHtml("splits", split.table);
    this.setHtml("lanes", lanesSvg(view, nowMs));
    this.renderTrace(nowMs);
    this.renderScreen(nowMs);
    const lit = litButtons(view.presses, nowMs);
    for (const button of this.ui("gba").querySelectorAll<SVGElement>("[data-btn]")) {
      button.classList.toggle("lit", lit.has(button.dataset.btn as never));
    }
    const play = (this.ui("play") as HTMLButtonElement);
    const scrub = (this.ui("scrub") as HTMLInputElement);
    this.ui("replay-controls").hidden = clock === null;
    play.disabled = clock === null;
    scrub.disabled = clock === null;
    play.textContent = clock?.playing === true ? "❚❚" : "▶";
    const cap = view.control.maxWallMs ?? view.start?.budgets.max_wall_ms;
    const time = clock !== null ? `${hms((clock.positionMs - clock.startMs) / 1000)} / ${hms((clock.endMs - clock.startMs) / 1000)}` : view.startMs === null ? "" : `${hms(runSeconds(view, nowMs))}${cap === undefined ? "" : ` / ${hms(cap / 1000)}`}`;
    const head = { view, runId: this.runId, label, running: live && view.control.state === "running", time, others: this.runs.filter((run) => isLive(run) && run.id !== this.runId) };
    this.setHtml("run-head", headHtml(head));
    // The time ticks every render; rebuilding the sheet for it would remount the WATCH buttons under the pointer.
    const cards = this.cardInputs(), art = this.art?.art ?? null;
    const watched = cards.filter((c) => c.status === "watching" || c.status === "replay");
    const sheetCardHtml = art === null || cards.length === 0 ? [] : [...watched, ...cards.filter((c) => c.status !== "watching" && c.status !== "replay")].map((c) => cardHtml(c, art, "wide"));
    this.setHtml("run-sheet-body", sheetHtml());
    const sheetBody = this.ui("run-sheet-body");
    const sheetCards = sheetBody.querySelector(".rs-cards");
    if (sheetCards !== null) syncCards(sheetCards, sheetCardHtml, this.cardHtml);
    const cardStatus = this.artProblem ? "Trainer card artwork unavailable. Retrying…" : this.cardsProblem ? (cards.length > 0 ? "Trainer card updates unavailable. Retrying…" : "Trainer cards unavailable. Retrying…") : cards.length === 0 && this.runId !== null ? "Loading trainer cards…" : "";
    for (const status of [this.doc.querySelector<HTMLElement>('[data-ui="card-status"]'), sheetBody.querySelector<HTMLElement>("[data-card-loading]")]) {
      if (status === null) continue;
      status.textContent = cardStatus;
      status.hidden = cardStatus === "";
    }
    syncCards(this.ui("run-cards"), art === null ? [] : cards.map((c) => cardHtml(c, art, "wide")), this.cardHtml);
    this.ui("run-cards").hidden = cards.length === 0;
    fillCards([this.ui("run-cards"), this.ui("run-sheet-body")], cards, this.art, (canvas, pixels) => { this.deps.drawGlyphs?.(canvas, pixels); });
    if (clock !== null) {
      scrub.value = String(Math.round(clock.fraction * 1000));
      this.ui("clock").textContent = `${hms((clock.positionMs - clock.startMs) / 1000)} / ${hms((clock.endMs - clock.startMs) / 1000)}`;
    } else {
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
  readonly location: { readonly hash: string; readonly href: string };
  fetch(url: string, init?: RequestInit): Promise<Response>;
  readonly EventSource: new (url: string) => StreamLike;
  readonly WebSocket: new (url: string) => FrameStreamLike;
  readonly Blob: new (parts?: BlobPart[], options?: BlobPropertyBag) => Blob;
  readonly URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
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
    openFrameStream: (url) => new win.WebSocket(frameSocketUrl(url, win.location.href)),
    frameUrl: (data) => {
      if (!(data instanceof ArrayBuffer)) throw new Error("live frame was not binary");
      return win.URL.createObjectURL(new win.Blob([data], { type: "image/png" }));
    },
    stageFrame: (url, ready, failed) => {
      const image = win.document.createElement("img");
      const finish = (done: () => void): void => { image.onload = null; image.onerror = null; done(); };
      image.onload = () => { finish(ready); }; image.onerror = () => { finish(failed); }; image.src = url;
    },
    revokeFrameUrl: (url) => { win.URL.revokeObjectURL(url); },
    now: () => Date.now(),
    hash: win.location.hash,
    loadGlyphSheet: browserGlyphSheet(win.document),
    drawGlyphs,
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
    void app.pollExperiments();
  }, RUN_LIST_MS);
  win.setInterval(() => { void app.pollCards(); }, WORKBENCH_POLL_MS);
  return app;
}
