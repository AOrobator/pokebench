import type {CurrentBrowser,CurrentBrowserOptions,CurrentBrowserState} from "./current-browser.js";
import {isExtensionAction,isTimeExtension,TIME_EXTENSIONS,TURN_EXTENSIONS,type ExtensionAction} from "./budget-extensions.js";
import { visualSplitView } from "./visual-split-view.js";
import { metricHistory } from "./metric-history.js";
// Browser glue: picks a run, follows its event stream, and renders the Open
// PokéNav layout either live (wall clock) or as a replay (cursor clock).
import type { RunEvent } from "@pokebench/agent/events";
import { esc, eventMs, hms } from "./format.js";
import { gbaSvg, litButtons } from "./gba.js";
import { RunView, isRunEvent } from "./model.js";
import { syncPhoneFlag } from "./phone.js";
import { brand, runIdentity, budgets, counters, fieldContext, harnessConfig, inspector, partyNotice, splits, thinkingDialog, trainerCard, type Baseline } from "./panels.js";
import { ReplayClock } from "./replay.js";
import { lanesSvg } from "./timeline.js";
import { TRACE_CHIPS, TraceBuilder, moreButton, sideGroups, traceGroups, type TraceCategory, type TraceGroup, type TraceTurn } from "./trace.js";
import { ABORT_HOLD_MS, availableActions, controlBar, overlay, overlayKind, runSeconds, sideStats, splitStrip, splitTimes, stateLabel, type BestSplits, type ControlAction } from "./controls.js";
import { NextRunPanel } from "./nextpanel.js";
import { headHtml, sheetHtml } from "./run-head.js";
import type { Cohort } from "./runs.js";
import { cardHtml, cardInputFor, type CardInput } from "./trainer-card.js";
import { paintGameText, parseGameFont, type GameFont, type GlyphPixels, type GlyphSheet } from "./game-font.js";
import { parsePartyData, partyPage, type PartyData, type PartyTab, type PartyUi } from "./party-view.js";
import { browserGlyphSheet, drawGlyphs, fillCards, loadCardArt, syncCards, type LoadedArt } from "./card-dom.js";
import { WORKBENCH_POLL_MS, parseWorkbench, type WorkbenchRun, type WorkbenchData } from "./workbench-data.js";
import { plateFacts } from "./workbench-view.js";

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
  snapshotFirst?:boolean;
  currentFactory?:(options:CurrentBrowserOptions)=>CurrentBrowser;
  fetchJson(url:string,signal?:AbortSignal):Promise<unknown>;
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
// At the very top the newest turn is shown, unless reading has been held.
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
  const following = box.scrollTop <= 0 && !held;
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
  else if (following) scrollTo(0);
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
  private current:CurrentBrowser|null=null;
  private currentApplied:CurrentBrowserState["snapshot"]=null;
  private currentHistory=new RunView();
  private currentHistoryEvents:readonly RunEvent[]=[];
  private currentCatalog:RunChoice[]=[];
  private currentCatalogTask:Promise<void>|null=null;
  private currentRunStamp="";
  private currentRecordedWorkbench:WorkbenchData|null=null;
  private currentSavedCardOwners=new Map<string,{epoch:string|null;generation:string}>();
  private recording:RunView|null=null;
  private recordingCurrent:CurrentBrowserState["snapshot"]=null;
  private runs: RunChoice[] = [];
  // Trainer cards: the ROM art (null until `just trainer-card-art` has built it) and the latest workbench snapshot.
  private art: LoadedArt | null = null;
  private artLoad: Promise<void> | null = null;
  private artProblem = false;
  private cardsProblem = false;
  private workbench: WorkbenchData | null = null;
  private knownLiveCards = new Set<string>();
  private workbenchLoad: Promise<void> | null = null;
  private workbenchSelection: string | null = null;
  // The cards replace the live-run buttons; the run list refreshes every few seconds and must not bring them back.
  private readonly cardHtml = new WeakMap<Element, string>();
  // Set when the newest run is opened; a later refresh may list a newer one first.
  private following = false;
  private followThinking = true;
  private runId: string | null = null;
  private stream: StreamLike | null = null;
  private historyBefore: number | null = null;
  private historyLoading = false;
  private historyRequest = 0;
  private headReady = false;
  private baseline: Baseline | null = null;
  private baselineRequest = 0;
  private frontier: Baseline | null = null;
  // Until the server has ranked every run, "no frontier" is unknown, not an answer; the card poll asks again.
  private frontierSettled = false;
  private frontierRetry = false;
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
  // Reading stays held until the reader returns to the top or asks for the latest.
  private readonly held = new Set<HTMLElement>();
  private readonly tracePending = new Set<HTMLElement>();
  private readonly traceVersions = new WeakMap<HTMLElement, number>();
  // The server owns complete BAG history independently of the recent trace/replay cursor.
  private bagSummary: { run: string; throughSeq: number; range: string; html: string } | null = null;
  private bagRequest = 0;
  private bagLoading = false;
  private bagNextPoll = 0;
  private bagProblem = "";
  // The POKéMON PARTY page: the cursor, open tab and move survive redraws; art from `just party-art`.
  private partyUi: PartyUi = { slot: 0, tab: 0, move: null };
  private partyData: PartyData | null = null;
  private partyArtReady = false;
  private partyFonts: { readonly key: "s" | "n"; readonly font: GameFont; readonly sheet: GlyphSheet }[] = [];
  private partyArtLoad: Promise<void> | null = null;
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
  private extensionPending: { run: string; action: ExtensionAction; afterSeq: number; request: number | null } | null = null;
  private extensionMessage = "";
  private holdStart: number | null = null;
  private overlayClosed = false;
  private wasLive = false;
  readonly next: NextRunPanel;

  private readonly homes = new Map<HTMLElement, HTMLElement>();

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
  private get controlLive():boolean{return this.live&&(this.current?.state.selected!==this.runId||(!this.current.state.stale&&this.current.state.snapshot?.control!=null));}

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
    if (this.runId === null || !availableActions(this.view, this.controlLive).has(action)) return;
    try {
      await this.deps.sendJson("POST", `/api/runs/${encodeURIComponent(this.runId)}/control`, { action });
    } catch (error) {
      this.problem(`${action.replace("_", " ")}: ${String(error)}`);
    }
  }

  private selectedExtension():ExtensionAction { const value=this.picker(this.picker("extend-kind").value==="turns"?"extend-turns":"extend-duration").value; return isExtensionAction(value)?value:"extend_30m"; }

  private extensionDialog(): HTMLDialogElement { return this.ui("extend-dialog") as HTMLDialogElement; }

  private openExtension(): void {
    if (!availableActions(this.view, this.controlLive).has("extend_30m")) return;
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
      const ack = (this.current?.state.selected===this.runId?this.currentHistory:this.view).events.find(e => e.type === "operator_control" && e.seq > pending.afterSeq && e.action === pending.action && pending.request !== null && e.request === pending.request);
      const snapshot=this.current?.state.selected===this.runId?this.current.state.snapshot:null;
      if(pending.request!==null&&snapshot?.control?.lastExtensionRequest===pending.request&&snapshot.seq>pending.afterSeq){this.extensionPending=null;this.extensionMessage="Extension applied.";}
      else if (ack?.type === "operator_control") {
        this.extensionPending = null;
        this.extensionMessage = ack.status === "applied" ? "Extension applied." : "Extension was not applied. The run may have reached its limit or be stopping.";
      } else if (this.view.end !== null) {
        this.extensionPending = null;
        this.extensionMessage = "The run ended before an extension was confirmed.";
      }
    }
    const wall = this.view.control.maxWallMs ?? this.view.start?.budgets.max_wall_ms ?? 0;
    const action=this.selectedExtension();
    const time=isTimeExtension(action);
    const addition=isTimeExtension(action)?TIME_EXTENSIONS[action]:TURN_EXTENSIONS[action];
    const turnLimit=this.view.effectiveTurnLimit ?? 0;
    this.ui("extend-time-label").hidden=!time;
    this.ui("extend-turn-label").hidden=time;
    const supported=availableActions(this.view,this.controlLive).has(action);
    this.ui("extend-capability").textContent=supported?"":"This running build does not support this extension. Its current limits are shown below.";
    this.ui("extend-run").textContent = this.runId;
    this.ui("extend-preview").textContent = !time ? `Turn limit: ${turnLimit.toLocaleString("en-US")} → ${(turnLimit+addition).toLocaleString("en-US")} · remaining after extension: ${Math.max(0,turnLimit+addition-this.view.turn).toLocaleString("en-US")}` : `Time limit: ${hms(wall / 1000)} → ${hms((wall + addition) / 1000)} · remaining after extension: ${hms(Math.max(0, (wall + addition) / 1000 - runSeconds(this.view, this.deps.now())))}`;
    const waiting = this.extensionPending !== null;
    const applied = this.extensionMessage === "Extension applied.";
    this.ui("extend-confirm").hidden = applied;
    (this.ui("extend-confirm") as HTMLButtonElement).disabled = waiting || !supported;
    for(const name of ["extend-duration","extend-turns","extend-kind"])this.picker(name).disabled=waiting||applied;
    this.ui("extend-status").textContent = this.extensionMessage || (waiting ? "Waiting for the running agent to confirm…" : "");
    if (applied || !supported) this.ui("extend-preview").textContent = !time ? `Turn limit: ${turnLimit.toLocaleString("en-US")} · remaining: ${Math.max(0,turnLimit-this.view.turn).toLocaleString("en-US")}` : `Time limit: ${hms(wall / 1000)} · remaining: ${hms(Math.max(0, wall / 1000 - runSeconds(this.view, this.deps.now())))}`;
    this.ui("extend-cancel").textContent = waiting || this.extensionMessage !== "" ? "Close" : "Cancel";
  }

  private async extendRun(): Promise<void> {
    if (this.runId === null || this.extensionPending !== null || !availableActions(this.view, this.controlLive).has("extend_30m")) return;
    const value = this.selectedExtension();
    if(!availableActions(this.view,this.controlLive).has(value))return;
    const pending = { run: this.runId, action: value, afterSeq: this.current?.state.selected===this.runId?this.current.state.snapshot?.seq??-1:this.view.events.at(-1)?.seq??-1, request: null as number | null };
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
    if (this.holdStart === null && availableActions(this.view, this.controlLive).has("abort")) this.holdStart = this.deps.now();
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
    const keepDetails = name === "run-details" || name === "harness-config" || name === "bag";
    const details = keepDetails ? [...element.querySelectorAll("details")].map(row => ({ open: row.open, focused: row.querySelector("summary") === this.doc.activeElement })) : [];
    const pane = keepDetails ? element.closest<HTMLElement>(".page-content") : null, top = pane?.scrollTop ?? 0;
    element.innerHTML = html;
    if (details.length > 0) element.querySelectorAll("details").forEach((row, i) => {
      const before = details[i];
      if (before === undefined) return;
      row.open = before.open;
      if (before.focused) row.querySelector("summary")?.focus({ preventScroll: true });
    });
    if (pane !== null) pane.scrollTop = top;
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
    if(this.deps.snapshotFirst===true){
      const create=this.deps.currentFactory??(await import("./current-browser.js")).createCurrentBrowser;
      this.current=create({now:this.deps.now,fetchJson:(url,signal)=>this.deps.fetchJson(url,signal),changed:state=>{this.currentChanged(state);}});
      const wanted=/^#(?:run|replay)=(.+)$/.exec(this.deps.hash)?.[1],pending=this.current.start(wanted===undefined?null:decodeURIComponent(wanted));
      void this.loadArt();await pending;void this.refreshRuns();this.render();return;
    }
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

  private currentChanged(state:Readonly<CurrentBrowserState>|null):void {
    if(state===null||this.current===null)return;const now=this.deps.now();
    for(const row of state.runs)this.knownLiveCards.add(row.id);
    const recorded=new Map((this.currentRecordedWorkbench?.runs??[]).map(run=>[run.id,run]));for(const s of state.runs){
      const saved=this.savedCurrentCard(s.id,s.generation),fallback=!s.complete&&s.run.card==null?saved:null;
      recorded.set(s.id,{...s.run,splits:saved?.splits??[],...(fallback===null?{}:{card:fallback.card}),elapsedMs:s.run.elapsedMs===null?fallback?.elapsedMs??null:s.run.elapsedMs+(s.run.status==="live"?Math.max(0,now-s.clockAt):0)});
    }
    this.workbench={version:1,at:now,milestones:[],problems:state.problem===null?[]:[state.problem],runs:[...recorded.values()]};
    const merged=new Map(this.currentCatalog.map(run=>[run.id,run]));for(const s of state.runs)merged.set(s.id,{id:s.id,model:s.run.model,started:s.header.t,ended:s.run.status==="ended",problem:s.problem,live:s.run.status==="live"||s.run.status==="paused"});this.listRuns(runChoices([...merged.values()]));this.cardsProblem=state.stale;
    if(state.selected!==null){
      if(this.runId!==state.selected)this.resetSelection(state.selected,true);
      const snapshot=state.snapshot;
      if(snapshot!==null&&snapshot!==this.currentApplied){
        if(this.currentApplied!==null&&this.currentApplied.generation!==snapshot.generation)this.resetSelection(snapshot.id,this.following);
        const first=this.currentApplied===null,limit=this.view.operatorTurnLimit,display=this.current.display();if(display!==null){display.operatorTurnLimit=limit;this.view=this.shown=display;this.currentApplied=snapshot;this.mode="live";this.headReady=true;}
        if(first){void this.loadWorkbench();if(this.doc.querySelector('[data-page="splits"][aria-pressed="true"]')!==null)void this.loadFrontier(snapshot.id);void this.deps.fetchJson(`/api/runs/${encodeURIComponent(snapshot.id)}/budget`).then(value=>{if(this.runId!==snapshot.id||this.current?.state.snapshot?.generation!==snapshot.generation||typeof value!=="object"||value===null||!("max_turns" in value)||typeof value.max_turns!=="number"||!Number.isSafeInteger(value.max_turns)||value.max_turns<=0)return;this.view.operatorTurnLimit=value.max_turns;this.render();}).catch(()=>{});}
      }else if(snapshot===null&&this.currentApplied!==null){this.resetSelection(state.selected,this.following);this.mode=state.indexing?"loading":"idle";}
      if(state.history!==this.currentHistoryEvents){
        const previous=this.currentHistoryEvents;this.currentHistoryEvents=state.history;const history=new RunView();if(snapshot!==null){history.start=snapshot.header;history.startMs=Date.parse(snapshot.header.t);}for(const event of state.history)history.apply(event);this.currentHistory=history;
        const appended=previous.every((event,index)=>state.history[index]===event);if(!appended){this.trace=this.newTrace();this.traced=0;this.traceKey=this.sideKey="";}
        if(state.history.length>0)this.setRecordedThinking(history,state.history);
      }
      this.historyLoading=state.historyLoading;this.historyBefore=state.before===null?null:state.history[0]?.seq??null;this.ensureFrameStream(now);
      if(snapshot?.end!==null&&snapshot!==null){this.select(snapshot.id,this.following);return;}
    }
    this.render();
  }

  async pollCurrent():Promise<void>{await this.current?.poll();}
  dispose():void{this.current?.close();this.stream?.close();this.closeFrameStream();}

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

  private savedCurrentCard(run:string,generation:string):WorkbenchRun|null {
    const owner=this.currentSavedCardOwners.get(run);if(owner===undefined||owner.epoch!==this.current?.state.epoch||owner.generation!==generation)return null;
    return this.currentRecordedWorkbench?.runs.find(row=>row.id===run&&row.card!=null)??null;
  }

  private loadWorkbench(): Promise<void> {
    const selected = this.runId,epoch=this.current?.state.epoch??null,generation=this.current?.state.snapshot?.generation??null,owners=new Map(this.current?.state.runs.map(row=>[row.id,row.generation])??[]);
    if (this.workbenchLoad !== null && this.workbenchSelection === selected) return this.workbenchLoad;
    this.workbenchSelection = selected;
    const load = this.deps.fetchJson(`/api/cards${selected === null ? "" : `?run=${encodeURIComponent(selected)}`}`)
      .then((value) => {
        if (this.runId !== selected || this.workbenchLoad !== load) return;
        const next = parseWorkbench(value), present = new Set(next.runs.map(run => run.id));
        if(this.current!==null){if(this.current.state.epoch!==epoch||(this.current.state.snapshot?.generation??null)!==generation)return;
          this.currentSavedCardOwners=new Map([...owners].map(([run,source])=>[run,{epoch,generation:source}]));
          this.currentRecordedWorkbench={...next,milestones:[],runs:next.runs.map(run=>{const display={...run,excluded:null};delete display.measurement;return display;})};this.currentChanged(this.current.state);return;}
        const previousAt = this.workbench?.at ?? next.at;
        const retained = this.workbench?.runs.filter(run => run.card != null && !present.has(run.id)
          && (run.id === selected || this.knownLiveCards.has(run.id)))
          .map(run => ({ ...run, elapsedMs: run.elapsedMs === null ? null : plateFacts(run, previousAt, next.at).elapsed })) ?? [];
        this.workbench = { ...next, runs: [...next.runs, ...retained] };
        this.cardsProblem = false;
        this.render();
      })
      .catch(() => { if (this.runId === selected && this.workbenchLoad === load) { this.cardsProblem = true; this.render(); } })
      .finally(() => { if (this.workbenchLoad === load) this.workbenchLoad = null; });
    this.workbenchLoad = load;
    return load;
  }

  // The workbench projection is useful even when optional trainer-card art is unavailable: it lets
  // a selected run paint all recorded splits atomically while the full event stream catches up.
  async pollCards(): Promise<void> {
    if(this.current!==null){await Promise.all([this.loadArt(),...(this.runId!==null?[this.loadWorkbench()]:[])]);this.render();return;}
    await Promise.all([this.loadArt(), this.loadWorkbench(), ...(this.runId === null || !this.frontierRetry ? [] : [this.loadFrontier(this.runId, true)])]);
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
    if(recordedReplay!==undefined){
      if(this.current!==null&&this.mode==="replay"){const shown=this.shown,seq=shown.events.at(-1)?.seq??-1,card=shown.cardState;const at=this.clock?.positionMs??now;return [cardInputFor({...recordedReplay,turn:shown.turn,elapsedMs:Math.max(0,runSeconds(shown,at)*1000),splits:recordedReplay.splits.filter(split=>split.seq<=seq),card:card===null?null:{name:card.name,location:card.location,party:shown.partyMembers.flatMap(m=>m.level===null?[]:[{speciesId:m.species_id??null,level:m.level,egg:m.is_egg===true}])}},at,at,"replay",workbench.runs,art.art)];}
      return [cardInputFor(recordedReplay,workbench.at,now,"replay",workbench.runs,art.art)];
    }
    // An explicitly opened replay is separate from the default live-run row.
    const live = this.runs.filter(run => run.ended === false && run.problem === null
      && (isLive(run) || this.knownLiveCards.has(run.id) || run.id === this.runId));
    const liveCards = live.flatMap((run): CardInput[] => {
      const recorded = workbench.runs.find((r) => r.id === run.id);
      if (recorded === undefined || !["live", "paused", "unresponsive"].includes(recorded.status)) return [];
      const status: CardInput["status"] = !isLive(run) || recorded.status === "unresponsive" ? "replay"
        : run.id === this.runId ? "watching" : recorded.status === "paused" ? "paused" : "live";
      const input = cardInputFor(recorded, workbench.at, now, status, workbench.runs, art.art);
      // Applied controls arrive on the selected stream before the next card snapshot.
      // A snapshot may also be ahead of that stream, so never reduce its cap.
      const streamedCap = run.id === this.runId ? this.view.control.maxWallMs : null;
      return [streamedCap === null ? input : { ...input, facts: { ...input.facts, cap: Math.max(input.facts.cap ?? 0, streamedCap) } }];
    });
    return liveCards;
  }

  private listRuns(runs: RunChoice[]): void {
    this.knownLiveCards = new Set(runs.filter(run => isLive(run) || (run.ended === false && this.knownLiveCards.has(run.id))).map(run => run.id));
    this.runs = runs;
    const picker = this.picker("run");
    if(this.current!==null){const stamp=JSON.stringify(runs.map(run=>[run.id,run.ended,run.live,run.problem]));if(stamp===this.currentRunStamp)return;this.currentRunStamp=stamp;}
    picker.replaceChildren(...runs.map((run) => option(this.doc, run.id, `${isLive(run) ? "LIVE · " : run.ended === false && run.problem === null ? "NOT RESPONDING · " : ""}${run.id}`)));
    if (this.runId !== null) picker.value = this.runId;
  }

  // Runs start after the page loads (a batch of measured runs); pick them up
  // without ever switching away from a run that is live or deliberately chosen.
  async refreshRuns(): Promise<void> {
    if(this.current!==null){
      if(this.currentCatalogTask!==null)return this.currentCatalogTask;
      const task=this.deps.fetchJson("/api/runs").then(value=>{
        this.currentCatalog=runChoices(value);this.currentChanged(this.current?.state??null);
        const current=this.current;if(current===null)return;
        const first=current.state.selected??(this.runId===null?preferredRun(this.currentCatalog,this.deps.hash)?.id??null:null);
        if(first===null){if(this.runId===null){this.mode="idle";this.render();}return;}
        if(current.state.snapshot===null&&(current.state.selected===null||this.currentCatalog.find(run=>run.id===first)?.ended===true))void current.select(first).then(()=>{if(current.state.selected===first&&current.state.snapshot===null&&this.currentCatalog.find(run=>run.id===first)?.ended===true)this.select(first,this.following);});
      }).catch(()=>{}).finally(()=>{this.currentCatalogTask=null;});this.currentCatalogTask=task;return task;
    }

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
    } else if (this.following && this.view.end !== null && this.ui("run-sheet").hidden && this.held.size === 0) {
      this.select(newest.id, true);
    }
  }

  private wire(): void {
    const controls = this.ui("run-controls");
    for(const name of ["extend-duration","extend-turns","extend-kind"])this.ui(name).addEventListener("change",()=>{this.updateExtension();});
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
    const partyRoot = this.ui("party");
    partyRoot.addEventListener("click", (event) => { this.partyClick(event.target as HTMLElement); });
    // Left and right walk the summary tabs, as the game's summary screen pages do.
    partyRoot.addEventListener("keydown", (event) => {
      const tab = (event.target as HTMLElement).closest<HTMLElement>("[data-pv-tab]");
      if (tab === null || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
      event.preventDefault();
      this.partyUi = { ...this.partyUi, tab: ((this.partyUi.tab + (event.key === "ArrowRight" ? 1 : 2)) % 3) as PartyTab, move: null };
      this.renderParty(this.shown);
    });
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
      if(target.closest("[data-history-retry]")!==null){void this.current?.history();return;}
      if (target.closest("[data-trace-more]") !== null) {
        this.holdTrace(this.ui("trace"));
        this.traceLimit += TRACE_TURNS;
        if (target.closest("[data-history-more]") !== null) void this.loadOlderHistory();
        this.render();
        return;
      }
      this.inspectRow(target);
    });
    this.ui("side-trace").addEventListener("click", (event) => { this.inspectRow(event.target as HTMLElement); });
    for (const name of ["trace", "side-trace"]) {
      const list = this.ui(name);
      list.addEventListener("scroll", () => {
        if (Math.abs(list.scrollTop - (this.autoScroll.get(list) ?? 0)) <= 1) return;
        this.autoScroll.set(list, list.scrollTop);
        if (list.scrollTop <= 1) this.resumeTrace(list);
        else this.holdTrace(list);
      });
      list.addEventListener("click", () => { this.holdTrace(list); });
      this.ui(`${name}-latest`).addEventListener("click", () => { this.resumeTrace(list); });
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
        if (open) for (const name of ["trace", "side-trace"]) this.holdTrace(this.ui(name));
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

  private showPage(name: string): void {
    if (name === "splits" && this.runId !== null) { if(this.current!==null)void this.loadFrontier(this.runId);if(this.comparisonsRun!==this.runId)void this.loadComparisons(this.runId); }
    if (name === "bag") { this.bagNextPoll = 0; }
    if (name === "party") void this.loadPartyArt();
    for (const panel of this.doc.querySelectorAll<HTMLElement>("[data-nav-page]")) panel.hidden = panel.dataset.navPage !== name;
    for (const button of this.doc.querySelectorAll<HTMLButtonElement>("[data-page]")) button.setAttribute("aria-pressed", String(button.dataset.page === name));
    (this.ui("page-select") as HTMLSelectElement).value = name;
    if (name === "bag") this.renderBag();
  }

  // The current party screen remains visible while tables and fonts load.
  loadPartyArt(): Promise<void> {
    this.partyArtLoad ??= (async () => {
      try { this.partyData = parsePartyData(await this.deps.fetchJson("/sprites/party/data.json")); } catch { this.partyData = null; }
      if (this.partyData === null) return;
      const fonts = await Promise.all((["s", "n"] as const).map(async (key) => {
        const name = key === "s" ? "small" : "normal";
        try {
          const [font, sheet] = await Promise.all([this.deps.fetchJson(`/sprites/party/font/${name}.json`).then(parseGameFont), this.deps.loadGlyphSheet?.(`/sprites/party/font/${name}.png`) ?? Promise.resolve(null)]);
          return font === null || sheet === null ? [] : [{ key, font, sheet }];
        } catch { return []; }
      }));
      this.partyFonts = fonts.flat();
    })().then(() => { this.partyArtReady = true; this.html.delete(this.ui("party")); this.render(); });
    return this.partyArtLoad;
  }

  private renderParty(view: RunView): void {
    const root = this.ui("party"), state = view.partyState;
    root.setAttribute("aria-busy", String(!this.partyArtReady || state === null));
    const html = partyNotice(view) + partyPage(this.partyArtReady ? view.partyMembers : [], this.partyData, this.partyUi, state?.name ?? null);
    if (this.html.get(root) === html) return;
    const active = this.doc.activeElement instanceof HTMLElement && root.contains(this.doc.activeElement) ? this.doc.activeElement : null;
    const refocus = active === null ? null : active.dataset.pvSlot !== undefined ? `[data-pv-slot="${String(this.partyUi.slot)}"]` : active.dataset.pvTab !== undefined ? `[data-pv-tab="${String(this.partyUi.tab)}"]` : active.dataset.pvMove !== undefined ? `[data-pv-move="${active.dataset.pvMove}"]` : null;
    this.setHtml("party", html);
    for (const { key, font, sheet } of this.partyFonts) paintGameText(root, font, sheet, (canvas, pixels) => { this.deps.drawGlyphs?.(canvas, pixels); }, `[data-gt][data-f="${key}"]`);
    if (refocus !== null) root.querySelector<HTMLElement>(refocus)?.focus({ preventScroll: true });
  }

  private partyClick(target: HTMLElement): void {
    const slot = target.closest<HTMLElement>("[data-pv-slot]"), tab = target.closest<HTMLElement>("[data-pv-tab]"), move = target.closest<HTMLElement>("[data-pv-move]");
    if (slot !== null) this.partyUi = { slot: Number(slot.dataset.pvSlot), tab: this.partyUi.tab, move: null };
    else if (tab !== null) this.partyUi = { ...this.partyUi, tab: Number(tab.dataset.pvTab) as PartyTab, move: null };
    else if (move !== null) { const i = Number(move.dataset.pvMove); this.partyUi = { ...this.partyUi, move: this.partyUi.move === i ? null : i }; }
    else return;
    this.renderParty(this.shown);
  }

  async pollBag(): Promise<void> {
    const run = this.runId;
    if (run === null || this.bagLoading || this.deps.now() < this.bagNextPoll || this.ui("bag").closest<HTMLElement>("[data-nav-page]")?.hidden !== false) return;
    const request = ++this.bagRequest;
    this.bagLoading = true; this.bagNextPoll = this.deps.now() + 5000;
    try {
      const value = await this.deps.fetchJson(`/api/runs/${encodeURIComponent(run)}/bag`);
      if (request !== this.bagRequest || run !== this.runId) return;
      if (typeof value !== "object" || value === null) throw new Error("Invalid bag summary");
      const summary = value as { run?: unknown; throughSeq?: unknown; range?: unknown; html?: unknown };
      if (summary.run !== run || typeof summary.throughSeq !== "number" || !Number.isSafeInteger(summary.throughSeq) || summary.throughSeq < -1 || typeof summary.range !== "string" || typeof summary.html !== "string") throw new Error("Invalid bag summary");
      this.bagSummary = { run, throughSeq: summary.throughSeq, range: summary.range, html: summary.html };
      this.bagProblem = "";
    } catch (error) {
      if (request === this.bagRequest && run === this.runId) this.bagProblem = `Bag history unavailable: ${String(error)}. Retrying automatically.`;
    } finally {
      if (request === this.bagRequest) { this.bagLoading = false; this.renderBag(); }
    }
  }

  private renderBag(): void {
    if (this.ui("bag").closest<HTMLElement>("[data-nav-page]")?.hidden !== false) return;
    void this.pollBag();
    this.setHtml("bag-range", this.bagSummary?.range ?? "");
    const status = this.bagProblem === "" ? "" : `<p class="nodata" role="status">${esc(this.bagProblem)}</p>`;
    this.setHtml("bag", status + (this.bagSummary?.html ?? (this.bagProblem === "" ? '<p class="nodata" role="status">Loading complete bag history…</p>' : "")));
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
  private async loadFrontier(runId: string, retry = false): Promise<void> {
    const request = ++this.frontierRequest;
    try {
      const record = await this.deps.fetchJson(`/api/runs/${encodeURIComponent(runId)}/frontier`) as { frontier?: unknown; state?: unknown };
      const frontier = record.frontier === null ? null : baselineOf(record.frontier);
      if (request !== this.frontierRequest) return;
      if (record.state !== "loading") this.frontier = frontier;
      this.frontierSettled = record.state !== "loading" && record.state !== "stale";
      this.frontierRetry = !this.frontierSettled;
      this.render();
    } catch (error) {
      if (request !== this.frontierRequest) return;
      this.frontierRetry = true;
      if (!retry) this.problem(`frontier: ${String(error)}`);
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
      if (request !== this.recordedThinkingRequest || this.runId !== runId || this.headReady) return;
      const view = new RunView();
      for (const event of events) view.apply(event);
      this.setRecordedThinking(view, events);
      this.render();
    } catch {
      if (request !== this.recordedThinkingRequest || this.runId !== runId || this.headReady) return;
      this.recordedThinking = null;
      this.recordedThinkingTrace = null;
      this.render();
    }
  }

  private setRecordedThinking(view: RunView, events: readonly RunEvent[], prepared?: TraceBuilder): void {
    const trace = prepared ?? new TraceBuilder((event) => view.loopLabel(event).replace(`: ${event.message}`, ""));
    if (prepared === undefined) for (const event of events) trace.add(event);
    this.recordedThinking = view;
    this.recordedThinkingTrace = trace;
  }

  private resetSelection(runId:string,automatic:boolean):void {
    this.extensionDialog().close();
    this.extensionPending = null;
    this.extensionMessage = "";
    this.stream?.close();this.stream=null;
    this.historyRequest += 1;
    this.historyLoading = false;
    this.historyBefore = null;
    this.headReady = false;
    this.closeFrameStream();
    this.runId = runId;
    this.comparisonRequest += 1; this.comparisonsRun = null;
    this.following = automatic || (this.runs[0]?.id === runId && this.runs[0].ended !== true);
    this.view = new RunView();
    this.shown = this.view;
    this.partyUi = { slot: 0, tab: 0, move: null };
    this.clock = null;
    this.mode = "loading";
    this.baseline = null;
    this.frontier = null;
    this.frontierSettled = false;
    this.frontierRetry = false;
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
    this.bagRequest += 1; this.bagLoading = false; this.bagNextPoll = 0;
    this.bagSummary = null; this.bagProblem = "";
    this.setHtml("run-details", "");
    this.setHtml("harness-config", "");
    this.setHtml("inspector", inspector(undefined));
    this.picker("run").value = runId;
    // References are eligible only after the owned server validates their logs.
    this.picker("baseline").replaceChildren(option(this.doc, "", "none"));
    this.doc.location.hash = `${!automatic && this.runs.find((run) => run.id === runId)?.ended === true ? "replay" : "run"}=${encodeURIComponent(runId)}`;
    const comparisons = this.doc.querySelector<HTMLAnchorElement>('[data-ui="comparisons-link"]');
    if (comparisons !== null) comparisons.href = `/comparisons?from=${encodeURIComponent(runId)}`;
    this.recording=null;this.recordingCurrent=null;this.currentApplied=null;this.currentHistory=new RunView();this.currentHistoryEvents=[];
  }

  select(runId:string,automatic=false):void {
    if(this.current!==null&&this.runs.find(run=>run.id===runId)?.ended!==true){this.resetSelection(runId,automatic);void this.current.select(runId);void this.pollCards();this.render();return;}
    const preserve=this.current!==null&&this.runId===runId&&this.view.start!==null,retainedCurrent=this.currentApplied;
    if(this.current!==null)void this.current.select(null);
    this.selectRecorded(runId,automatic,preserve,retainedCurrent);
  }

  private selectRecorded(runId:string,automatic=false,preserve=false,retainedCurrent:CurrentBrowserState["snapshot"]=null):void {
    const retained=preserve?this.view:null;this.resetSelection(runId,automatic);
    if(retained!==null){this.view=this.shown=retained;this.recordingCurrent=retainedCurrent;}
    if(this.current!==null)this.recording=new RunView();
    const stream = this.deps.openStream(`/api/runs/${encodeURIComponent(runId)}/events?head=1`);
    this.stream = stream;
    this.ensureFrameStream(this.deps.now());
    void this.pollCards();
    void this.deps.fetchJson(`/api/runs/${encodeURIComponent(runId)}/budget`).then(value=>{
      if(this.runId!==runId||typeof value!=="object"||value===null||!("max_turns" in value)||typeof value.max_turns!=="number"||!Number.isSafeInteger(value.max_turns)||value.max_turns<=0)return;
      this.view.operatorTurnLimit=value.max_turns;this.render();
    }).catch(()=>{ /* Original recorded limits remain when no verified override exists. */ });
    stream.addEventListener("head", (message) => {
      if (this.stream !== stream) return;
      try {
        const events = recordedHead(JSON.parse(message.data), runId);
        if (this.headReady && (events.at(-1)?.seq ?? -1) <= (this.view.events.at(-1)?.seq ?? -1)) return;
        this.historyRequest += 1;
        this.historyLoading = false;
        this.clock = null;
        this.trace = this.newTrace();
        this.traced = 0;
        this.traceKey = this.sideKey = "";
        this.recordedThinkingRequest += 1;
        const view = new RunView();
        view.operatorTurnLimit=this.view.operatorTurnLimit;
        const merged = new Map([...(this.recording??this.view).events, ...events].map(event => [event.seq, event]));
        for (const event of [...merged.values()].sort((a, b) => a.seq - b.seq)) view.apply(event);
        this.historyBefore = this.historyCursor(view.events);
        this.view = this.shown = view;this.recording=null;this.recordingCurrent=null;
        this.headReady = true;
        this.mode = view.end === null ? "live" : "loading";
        this.setRecordedThinking(view, view.events);
        if (view.end !== null) this.startReplay(true);
        this.render();
      } catch (error) { this.problem(`head: ${String(error)}`); }
    });
    let fallbackRequested = false;
    stream.addEventListener("error", () => {
      if (this.stream !== stream || this.headReady || fallbackRequested) return;
      fallbackRequested = true;
      void this.loadRecordedThinking(runId);
    });
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
      if (this.headReady) return;
      // The fully folded stream is authoritative now. A slower optional head
      // request must not replace or clear it after this handoff.
      this.recordedThinkingRequest += 1;
      if(this.recording!==null){this.view=this.recording;this.shown=this.view;this.recording=null;this.recordingCurrent=null;}
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

      if(this.recording!==null){this.view=this.recording;this.shown=this.view;this.recording=null;this.recordingCurrent=null;}
      if (this.mode !== "replay") this.startReplay(true);
      this.render();
    });
    if(this.current===null||this.doc.querySelector('[data-page="splits"][aria-pressed="true"]')!==null)void this.loadFrontier(runId);
    if (this.doc.querySelector('[data-page="splits"][aria-pressed="true"]') !== null) void this.loadComparisons(runId);
    this.render();
  }

  private historyCursor(events: readonly RunEvent[]): number | null {
    let before = events.at(-1)?.seq ?? 0;
    for (let i = events.length - 2; i >= 0; i -= 1) {
      const seq = events[i]?.seq;
      if (seq === undefined || seq !== before - 1) break;
      before = seq;
    }
    return before === 0 ? null : before;
  }

  private async loadOlderHistory(): Promise<void> {
    if(this.current?.state.selected===this.runId){this.holdTrace(this.ui("trace"));await this.current.history(true);return;}
    const run = this.runId, before = this.historyBefore;
    if (run === null || before === null || this.historyLoading) return;
    const request = ++this.historyRequest;
    this.historyLoading = true;
    this.render();
    try {
      const raw = await this.deps.fetchJson(`/api/runs/${encodeURIComponent(run)}/trace-history?before=${String(before)}`);
      if (request !== this.historyRequest || this.runId !== run) return;
      if (typeof raw !== "object" || raw === null) throw new Error("invalid history page");
      const page = raw as { run?: unknown; events?: unknown; before?: unknown };
      if (page.run !== run || !Array.isArray(page.events) || (page.before !== null && (typeof page.before !== "number" || !Number.isSafeInteger(page.before) || page.before < 0 || page.before >= before))) throw new Error("invalid history page");
      const events: RunEvent[] = [];
      for (const value of page.events as unknown[]) {
        if (!isRunEvent(value) || value.run !== run || value.seq >= before || value.seq <= (events.at(-1)?.seq ?? -1)) throw new Error("invalid history event");
        events.push(value);
      }
      if (events.length === 0 || (page.before === null ? events[0]?.seq !== 0 : events[0]?.seq !== page.before)) throw new Error("history page did not advance");
      const position = this.clock?.positionMs, playing = this.clock?.playing;
      const view = new RunView();
      const merged = new Map([...events, ...this.view.events].map(event => [event.seq, event]));
      for (const event of [...merged.values()].sort((a, b) => a.seq - b.seq)) view.apply(event);
      this.view = view;
      this.historyBefore = page.before;
      this.setRecordedThinking(view, view.events);
      this.shown = this.mode === "replay" ? new RunView() : view;
      this.trace = this.newTrace();
      this.traced = 0;
      this.traceKey = this.sideKey = "";
      if (this.mode === "replay") {
        this.makeReplayClock();
        if (position !== undefined) this.clock?.seek(position);
        if (playing === true) this.clock?.play();
      }
    } catch (error) {
      if (request === this.historyRequest && this.runId === run) this.problem(`older history: ${String(error)}`);
    } finally {
      if (request === this.historyRequest && this.runId === run) {
        this.historyLoading = false;
        this.render();
      }
    }
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
    const intake=this.recording??this.view;
    const eventCount = intake.events.length;
    intake.apply(value);
    if (this.mode !== "loading" && this.recordedThinking === this.view && this.view.events.length > eventCount) this.recordedThinkingTrace?.add(value);
  }

  private problem(text: string): void {
    this.problems.push(text);
    if (this.problems.length > 100) this.problems.shift();
    const box = this.ui("problems");
    box.hidden = false;
    box.textContent = this.problems.slice(-100).join("\n");
  }

  private makeReplayClock(): void {
    const first = this.historyBefore === null ? this.view.startMs : this.view.events.find(event => event.seq >= (this.historyBefore ?? 0));
    const startMs = first !== null && typeof first === "object" ? eventMs(first) : first;
    const lastMs = this.view.lastMs;
    this.clock = startMs === null || lastMs === null || startMs === undefined ? null : new ReplayClock(startMs, lastMs);
  }

  private startReplay(atEnd: boolean): void {
    this.makeReplayClock();
    if (this.clock === null) { this.mode = "idle"; return; }
    if (atEnd) this.clock.seek(this.clock.endMs);
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
  private traceOwner():RunView{return this.current?.state.selected===this.runId?this.currentHistory:this.shown;}

  private newTrace(): TraceBuilder {
    return new TraceBuilder((event) => this.traceOwner().loopLabel(event).replace(`: ${event.message}`, ""));
  }

  private resetTrace(): void {
    this.trace = this.newTrace();
    this.traced = 0;
    this.traceKey = "";
    this.sideKey = "";
    this.traceLimit = TRACE_TURNS;
    this.rows = { open: new Set(), folded: new Set(), selected: null };
    this.held.clear();
    this.tracePending.clear();
    for (const name of ["trace", "side-trace"]) {
      const list = this.ui(name);
      this.traceVersions.delete(list);
      list.replaceChildren();
      this.scrollTo(list, 0);
      this.traceFollowButton(list);
    }
  }

  private holdTrace(list: HTMLElement): void {
    this.held.add(list);
    if(list===this.ui("trace"))this.current?.holdHistory(true);
    this.traceFollowButton(list);
  }

  private resumeTrace(list: HTMLElement): void {
    this.held.delete(list);
    if(list===this.ui("trace")&&this.current?.state.selected===this.runId){this.current.holdHistory(false);void this.current.history();}
    this.tracePending.delete(list);
    this.scrollTo(list, 0);
    this.traceFollowButton(list);
    this.traceKey = this.sideKey = "";
    this.render();
    this.scrollTo(list, 0);
  }

  private traceFollowButton(list: HTMLElement): void {
    const button = this.ui(`${list.dataset.ui ?? "trace"}-latest`);
    button.hidden = !this.held.has(list);
    button.textContent = this.tracePending.has(list) ? "New activity · Jump to latest" : "Jump to latest";
  }

  private traceUpdated(list: HTMLElement, version: number): void {
    const previous = this.traceVersions.get(list);
    if (previous !== undefined && previous !== version && this.held.has(list)) this.tracePending.add(list);
    this.traceVersions.set(list, version);
    this.traceFollowButton(list);
  }

  private readingLimit(list: HTMLElement, turns: readonly TraceTurn[], limit: number, extra = 0): number {
    if (!this.held.has(list)) return limit;
    const oldest = [...list.querySelectorAll<HTMLElement>("[data-group]")].filter((el) => el.dataset.group !== "tail").at(-1)?.dataset.group;
    const index = turns.findIndex((turn) => `t${String(turn.turn)}` === oldest);
    return index < 0 ? limit : Math.max(limit, turns.length - index + extra);
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
    const owner = row.closest('[data-ui="side-trace"]') === null ? this.traceOwner() : this.recordedThinking;
    const seqs = (row.dataset.seqs ?? "").split(" ").map(Number);
    this.setHtml("inspector", seqs.map((seq) => inspector(owner?.bySeq(seq))).join(""));
  }

  private renderTrace(nowMs: number): void {
    const activity=this.traceOwner(),events=activity.events;
    for (; this.traced < events.length; this.traced += 1) this.trace.add(events[this.traced] as RunEvent);
    const live = this.current?.state.selected===this.runId?(this.current.state.snapshot?.phase.kind==="thinking"?{turn:this.view.turn}:null):activity.isThinking?{turn:activity.turn}:null;
    const historyProblem=this.current?.state.selected===this.runId?this.current.state.historyProblem:null;
    const key = `${historyProblem??""}|${String(this.trace.version)}|${[...this.traceOn].sort().join(",")}|${String(this.traceLimit)}|${String(live?.turn ?? "")}|${String(this.historyBefore)}|${String(this.historyLoading)}`;
    const box = this.ui("trace");
    if (key !== this.traceKey) {
      this.traceKey = key;
      this.traceUpdated(box, this.trace.version);
      this.renderChips();
      const startMs=activity.startMs;
      const elapsed=startMs===null||(this.current?.state.selected===this.runId&&this.current.state.before!==null)?null:(ms:number):number=>(ms-startMs-activity.control.pausedBefore(ms))/1000;
      const { groups, more } = traceGroups(this.trace.turns, this.traceOn, { elapsed, live, limit: this.readingLimit(box, this.trace.turns, this.traceLimit, live !== null && !this.trace.turns.some(turn => turn.turn === live.turn) ? 1 : 0), page: TRACE_TURNS });
      const older = more > 0 ? moreButton(more, TRACE_TURNS) : this.historyBefore === null ? "" : `<button type="button" class="pbtn trace-more" data-trace-more data-history-more${this.historyLoading ? " disabled" : ""}>${this.historyLoading ? "LOADING OLDER TURNS…" : "LOAD OLDER TURNS"}</button>`;
      const recovery=historyProblem===null?"":`<p class="nodata">${esc(historyProblem)}</p><button type="button" class="pbtn" data-history-retry${this.historyLoading?" disabled":""}>RETRY HISTORY</button>`;
      reconcile(box, groups, recovery+(groups.length === 0 ? '<p class="nodata">no recorded events</p>' : "") + older, this.stamps, this.held.has(box), this.rows, (top) => { this.scrollTo(box, top); });
    }
    const sideView = this.recordedThinking;
    const sideTrace = this.recordedThinkingTrace;
    const boxTurn = sideView === null || sideView.isThinking ? null : sideView.lastThought?.turn ?? null;
    const sideKey = `${this.mode}|${String(sideTrace?.version ?? -1)}|${String(boxTurn ?? "")}`;
    if (sideKey !== this.sideKey) {
      const side = this.ui("side-trace");
      this.sideKey = sideKey;
      this.traceUpdated(side, sideTrace?.version ?? -1);
      const groups = sideTrace === null ? [] : sideGroups(sideTrace.turns, this.readingLimit(side, sideTrace.turns, SIDE_TURNS), boxTurn);
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
    const nowMs = this.mode === "replay" && clock !== null ? clock.positionMs : this.headReady && this.view.end !== null ? (this.view.lastMs ?? this.deps.now()) : this.deps.now();
    if (this.mode === "replay") this.advanceShown(nowMs);
    const visualRun = this.workbench?.runs.find(run => run.id === this.runId);
    const view = visualSplitView(this.shown, visualRun, nowMs);
    const live = this.live;
    if (live) this.wasLive = true;
    const currentStatus=this.current?.state.selected===this.runId?this.current.state:null;
    const label=currentStatus?.stale===true?{cls:"loading",text:"LAST KNOWN"}:currentStatus?.snapshot?.control===null?{cls:"loading",text:"UPDATING"}:this.unresponsive ? { cls: "ended", text: "NOT RESPONDING" } : live || view.end !== null ? stateLabel(view, live) : { cls: this.mode, text: MODE_TEXT[this.mode] };
    const mode = this.ui("mode");
    mode.textContent = label.text;
    mode.className = `mode ${label.cls}`;
    this.setHtml("run-controls", controlBar(view, this.controlLive, this.holdFraction()));
    const historyStatus = this.ui("history-status");
    historyStatus.hidden=this.current?.state.selected===this.runId?this.current.state.before===null&&!this.current.state.stale&&!this.historyLoading&&this.current.state.historyProblem===null:this.historyBefore===null;
    historyStatus.textContent=this.current?.state.selected===this.runId?this.current.state.stale?"Updates unavailable · showing last-known state":this.current.state.historyProblem!==null?this.current.state.historyProblem:this.historyLoading?"Loading recorded turns…":"Recorded history is separate from the current stats above.":this.historyLoading?"Loading older history…":"Recent history shown · load older turns in Agent Trace. Stats and replay cover loaded history.";
    const kind = overlayKind(view, live || (this.wasLive && view.end !== null), this.holdStart !== null, this.overlayClosed);
    const layer = this.doc.querySelector<SVGElement>('[data-ui="screen-overlay"]');
    if (layer !== null) {
      const markup = overlay(kind, view, nowMs, this.holdFraction() ?? 0);
      if (this.html.get(layer as unknown as HTMLElement) !== markup) {
        this.html.set(layer as unknown as HTMLElement, markup);
        layer.innerHTML = markup;
      }
    }
    const current=this.current?.state.selected===this.runId?this.current.state:null;
    const currentSnapshot=current?.snapshot??this.recordingCurrent;
    this.setHtml("stats", sideStats(view,nowMs,current===null&&currentSnapshot===null?undefined:currentSnapshot===null?{complete:false,contextKnown:false,timeKnown:false}:{complete:currentSnapshot.complete,contextKnown:currentSnapshot.context.estimated!==null||currentSnapshot.context.measured!==null,timeKnown:currentSnapshot.run.elapsedMs!==null}));
    if (this.extensionDialog().open || this.extensionPending !== null) this.updateExtension();
    const recordedSplits = this.mode === "loading" || this.headReady ? this.recordedSplits() : undefined;
    const splitView = this.mode === "loading" ? view : visualSplitView(this.view, visualRun, this.view.lastMs ?? nowMs);
    this.setHtml("split-preview", splitStrip(splitView, recordedSplits, true));
    this.setHtml("split-strip", splitStrip(splitView, recordedSplits));
    this.setHtml("split-times", splitTimes(splitView, this.frontier, recordedSplits, !this.frontierSettled && this.frontier === null));
    this.next.setLive(live ? view : null);
    this.ui("brand").textContent = brand(view);
    const thinkingView = this.recordedThinking ?? (this.mode === "loading" ? null : view);
    let dialog = thinkingView === null
      ? { head: "LOADING RECORDED THINKING…", body: '<span class="nodata">waiting for the selected run snapshot</span>' }
      : thinkingDialog(thinkingView, nowMs);
    const liveSnapshot=current?.snapshot??null;
    if(liveSnapshot!==null){const phase=liveSnapshot.phase;if(thinkingView?.turn!==liveSnapshot.run.turn||(phase.kind==="thinking"&&!thinkingView.isThinking))dialog={head:"CURRENT TURN",body:'<span class="nodata">Recorded thinking for this turn is loading.</span>'};if(phase.kind==="thinking")dialog.head="MODEL IS THINKING…";else if(phase.kind==="tool")dialog.head=`RUNNING ${phase.tools.join(", ")||"TOOL"}`;else if(phase.kind==="paused")dialog.head="PAUSED";else if(phase.kind==="indexing")dialog.head="CURRENT DATA LOADING";}
    this.ui("think-head").textContent = dialog.head;
    this.ui("think-title").textContent=liveSnapshot!==null?`CURRENT · TURN ${String(liveSnapshot.run.turn)}`:thinkingView===null||thinkingView.start===null?"NO RUN":`${thinkingView.end===null?"RIGHT NOW":"FINAL"} · TURN ${String(thinkingView.turn)}`;
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
    {
      const root = this.ui("harness-config"), html = harnessConfig(view, this.next.registry), pane = root.closest<HTMLElement>(".page-content");
      const bounds = pane?.getBoundingClientRect();
      const anchor = this.html.get(root) === html || bounds === undefined ? undefined : [...root.querySelectorAll<HTMLElement>(".config-feature, .config-tool, .config-raw")].find(row => {
        const rect = row.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom;
      });
      const feature = anchor?.dataset.feature, tool = anchor?.dataset.tool;
      const selector = feature !== undefined ? `[data-feature="${CSS.escape(feature)}"]` : tool !== undefined ? `[data-tool="${CSS.escape(tool)}"]` : null;
      const raw = anchor === undefined ? -1 : [...root.querySelectorAll(".config-raw")].indexOf(anchor);
      const offset = anchor === undefined ? 0 : anchor.getBoundingClientRect().top - (bounds?.top ?? 0);
      this.setHtml("harness-config", html);
      this.filterFeatures();
      const next = selector === null ? root.querySelectorAll<HTMLElement>(".config-raw")[raw] : root.querySelector<HTMLElement>(selector);
      if (pane !== null && anchor !== undefined && next != null && next.getBoundingClientRect().height > 0) pane.scrollTop += next.getBoundingClientRect().top - pane.getBoundingClientRect().top - offset;
    }
    this.renderParty(view);
    this.setHtml("run-details", `<details><summary>ORIGINAL RECORDED CONFIGURATION · PROMPT · TOOLS · BUDGETS</summary><pre>${esc(JSON.stringify(view.start, null, 2))}</pre></details><details><summary>CURRENT EFFECTIVE WALL LIMIT</summary><pre>${esc(JSON.stringify({ max_turns:view.effectiveTurnLimit, max_wall_ms: view.control.maxWallMs ?? view.start?.budgets.max_wall_ms ?? null }, null, 2))}</pre></details><details><summary>LATEST RECORDED STATE</summary><pre>${esc(JSON.stringify(view.state, null, 2))}</pre></details><details><summary>TERMINAL EVENT</summary><pre>${esc(JSON.stringify(view.end, null, 2))}</pre></details>`);
    const barHeight = this.doc.querySelector(".bar")?.getBoundingClientRect().height ?? 0;
    this.doc.documentElement.style.setProperty("--viewer-bar-height", `${String(barHeight || 110)}px`);
    const totalsKnown=current===null&&currentSnapshot===null||currentSnapshot?.complete===true;
    this.setHtml("budgets",totalsKnown?budgets(view,nowMs):'<p class="nodata">Lifetime totals are still loading. Current turn and context are shown above.</p>');
    this.setHtml("counters",totalsKnown?counters(view):'<p class="nodata">Lifetime totals are still loading.</p>');
    this.setHtml("metric-history", metricHistory(this.traceOwner()));
    const split = splits(view, this.baseline, nowMs, this.frontier);
    this.setHtml("splits-summary", split.summary);
    this.setHtml("splits", split.table);
    this.setHtml("lanes",lanesSvg(this.traceOwner(),nowMs));
    this.renderTrace(nowMs);
    this.renderBag();
    this.renderScreen(nowMs);
    // Native receipts arrive after execution; replay needs the complete recording
    // to resolve the keys held at its current execution timestamp.
    const inputView = this.mode === "replay" ? this.view : view;
    const lit = litButtons(inputView.presses, nowMs, inputView.nativeActions);
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
    const time=current!==null&&current.snapshot?.run.elapsedMs===null?(current.snapshot.warning===null?"Time loading":"Time unavailable"):clock !== null ? `${hms((clock.positionMs - clock.startMs) / 1000)} / ${hms((clock.endMs - clock.startMs) / 1000)}` : view.startMs === null ? "" : `${hms(runSeconds(view, nowMs))}${cap === undefined ? "" : ` / ${hms(cap / 1000)}`}`;
    const head = { view, runId: this.runId, label, running: live && view.control.state === "running", time, others: this.runs.filter((run) => isLive(run) && run.id !== this.runId) };
    this.setHtml("run-head", headHtml(head));
    // The time ticks every render; rebuilding the sheet for it would remount the WATCH buttons under the pointer.
    const cards = this.cardInputs(), art = this.art?.art ?? null;
    const watched = cards.filter((c) => c.status === "watching" || c.status === "replay");
    const sheetCardHtml = art === null || cards.length === 0 ? [] : [...watched, ...cards.filter((c) => c.status !== "watching" && c.status !== "replay")].map((c) => cardHtml(c, art, "wide", null, c.runId === this.runId));
    this.setHtml("run-sheet-body", sheetHtml());
    const sheetBody = this.ui("run-sheet-body");
    const sheetCards = sheetBody.querySelector(".rs-cards");
    if (sheetCards !== null) syncCards(sheetCards, sheetCardHtml, this.cardHtml);
    const savedCard=this.current?.state.snapshot;const showingSaved=savedCard!==null&&savedCard!==undefined&&!savedCard.complete&&savedCard.run.card==null&&this.savedCurrentCard(savedCard.id,savedCard.generation)!==null;
    const cardStatus = showingSaved?"Showing last-known trainer card while current data loads.":this.artProblem ? "Trainer card artwork unavailable. Retrying…" : this.cardsProblem ? (cards.length > 0 ? "Trainer card updates unavailable. Retrying…" : "Trainer cards unavailable. Retrying…") : cards.length === 0 && this.runId !== null ? "Loading trainer cards…" : "";
    for (const status of [this.doc.querySelector<HTMLElement>('[data-ui="card-status"]'), sheetBody.querySelector<HTMLElement>("[data-card-loading]")]) {
      if (status === null) continue;
      status.textContent = cardStatus;
      status.hidden = cardStatus === "";
    }
    syncCards(this.ui("run-cards"), art === null ? [] : cards.map((c) => cardHtml(c, art, "wide", null, c.runId === this.runId)), this.cardHtml);
    this.ui("run-cards").hidden = cards.length === 0;
    fillCards([this.ui("run-cards"), this.ui("run-sheet-body")], cards, this.art, (canvas, pixels) => { this.deps.drawGlyphs?.(canvas, pixels); });
    if (clock !== null) {
      scrub.value = String(Math.round(clock.fraction * 1000));
      this.ui("clock").textContent = `${hms((clock.positionMs - clock.startMs) / 1000)} / ${hms((clock.endMs - clock.startMs) / 1000)}`;
    } else {
      this.ui("clock").textContent=current!==null&&current.snapshot?.run.elapsedMs===null?`T${String(view.turn)} · ${current.snapshot.warning===null?"time loading":"time unavailable"}`:view.startMs === null ? "" : `T${String(view.turn)} · ${hms(runSeconds(view, nowMs))}${cap === undefined ? "" : ` / ${hms(cap / 1000)}`}`;
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
    snapshotFirst:true,
    fetchJson: async (url,signal) => {
      const response=signal===undefined?await win.fetch(url):await win.fetch(url,{signal});
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
  }, RUN_LIST_MS);
  win.setInterval(() => { void app.pollCards(); }, WORKBENCH_POLL_MS);
  win.setInterval(()=>{void app.pollCurrent();},500);
  return app;
}
