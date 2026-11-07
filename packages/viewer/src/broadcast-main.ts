// Boots the read-only /broadcast page. ?run= picks a run (default: the newest live one), ?t= holds one moment of it
// (default: follow), ?transparent=1 leaves the game and background out for compositing.
import { parseBroadcast, type BroadcastResponse } from "./broadcast-feed.js";
import { BroadcastTimeline, clockText, thinkingTail, type BroadcastView } from "./broadcast-timeline.js";
import { actionHtml, badgesHtml, laneHtml, laneMarks, modelTitle, partyHtml, runPill, thinkingHtml } from "./broadcast-view.js";
import { esc } from "./format.js";

const STAGE_WIDTH = 1920, STAGE_HEIGHT = 1080;
const POLL_MS = 500, TICK_MS = 100, FRAME_RETRY_MS = 5000;
// What follow mode trails real time by, so a press lands at the NOW edge rather than after it has passed.
const FOLLOW_DELAY_S = 1.5;

export interface FrameSocket {
  on(name: "message", run: (data: unknown) => void): void;
  on(name: "close", run: () => void): void;
  close(): void;
}
export interface BroadcastDeps {
  readonly search: string;
  fetchJson(url: string): Promise<unknown>;
  now(): number;
  width(): number;
  height(): number;
  after(ms: number, run: () => void): void;
  show(image: HTMLImageElement, src: string): Promise<void>;
  laneWidth(lane: HTMLElement): number;
  readonly openFrames?: (path: string) => FrameSocket;
  readonly frameUrl?: (data: unknown) => string;
}
export interface BroadcastPage { setTime(t: number): Promise<void> }

interface Liveish { readonly id: string; readonly live: boolean }
const isLiveish = (value: unknown): value is Liveish => typeof value === "object" && value !== null && "id" in value && typeof value.id === "string" && "live" in value && typeof value.live === "boolean";

async function newestLiveRun(deps: BroadcastDeps): Promise<string> {
  const runs = await deps.fetchJson("/api/runs");
  const live = (Array.isArray(runs) ? runs : []).filter(isLiveish).filter(run => run.live).map(run => run.id).sort();
  const id = live.at(-1);
  if (id === undefined) throw new Error("no live run to follow");
  return id;
}

function fixedMoment(params: URLSearchParams): number | null {
  const raw = params.get("t");
  if (raw === null) return null;
  const t = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(t) || t < 0) throw new Error("t must be seconds since run_start");
  return t;
}

export async function mountBroadcast(doc: Document, deps: BroadcastDeps): Promise<BroadcastPage> {
  const part = (name: string): HTMLElement => {
    const el = doc.querySelector<HTMLElement>(`[data-b="${name}"]`);
    if (el === null) throw new Error(`broadcast page is missing [data-b="${name}"]`);
    return el;
  };
  const stage = doc.querySelector<HTMLElement>("#stage");
  const fit = (): void => { if (stage !== null) stage.style.transform = `scale(${String(Math.min(deps.width() / STAGE_WIDTH, deps.height() / STAGE_HEIGHT))})`; };
  fit();
  doc.defaultView?.addEventListener("resize", fit);

  const params = new URLSearchParams(deps.search);
  const transparent = params.get("transparent") === "1";
  doc.documentElement.classList.toggle("transparent", transparent);
  let moment = fixedMoment(params);
  const run = params.get("run") ?? await newestLiveRun(deps);
  const base = `/api/runs/${encodeURIComponent(run)}`;
  const timeline = new BroadcastTimeline();
  const game = part("game") as HTMLImageElement, lane = part("lane");
  let cursor = 0, ended = false, liveFrames = false;
  let onScreen: string | null = null;

  const fetchFeed = async (): Promise<BroadcastResponse> => parseBroadcast(await deps.fetchJson(`${base}/broadcast?after=${String(cursor)}`));
  const first = await fetchFeed();
  const lines = first.commentary, started = Date.parse(first.header.started);
  let { header, rates } = first;
  const take = (feed: BroadcastResponse): void => {
    timeline.add(feed.items);
    ({ header, rates } = feed);
    cursor = feed.next;
    ended = feed.ended;
  };
  take(first);

  const paint = (el: HTMLElement, html: string): void => { if (el.dataset.was !== html) { el.dataset.was = html; el.innerHTML = html; } };
  const write = (el: HTMLElement, text: string): void => { if (el.textContent !== text) el.textContent = text; };
  const showFrame = async (view: BroadcastView): Promise<void> => {
    if (transparent || liveFrames || view.frame === null) return;
    const src = `${base}/frames/${view.frame}`;
    if (src === onScreen) return;
    onScreen = src;
    await deps.show(game, src);
  };
  const render = (t: number): BroadcastView => {
    const view = timeline.view(t, lines, rates);
    write(part("who"), modelTitle(header.model));
    write(part("pill"), runPill(header));
    paint(part("where"), `${esc(view.where ?? "")}${view.foe === null ? "" : ` <b>vs ${esc(view.foe)}</b>`}`);
    write(part("clock"), clockText(t));
    write(part("think-label"), view.think === null ? "THINKING" : `THINKING · turn ${String(view.think.turn)}`);
    paint(part("think"), thinkingHtml(thinkingTail(view.think?.text ?? "")));
    paint(part("action"), view.action === null ? "" : actionHtml(view.action));
    paint(part("party"), partyHtml(view.party));
    paint(part("badges"), badgesHtml(view.badges));
    write(part("cost"), view.cost === null ? "—" : `$${view.cost.toFixed(2)}`);
    part("cap").hidden = view.caption === null;
    write(part("say"), view.caption === null ? "" : `“${view.caption}”`);
    lane.innerHTML = laneHtml(laneMarks({ now: t, width: deps.laneWidth(lane), presses: view.presses, tools: view.tools, miles: view.miles }));
    return view;
  };
  const followTime = (): number => timeline.end ?? Math.max(0, (deps.now() - started) / 1000 - FOLLOW_DELAY_S);
  const tick = (): void => {
    if (moment !== null) return;
    void showFrame(render(followTime()));
    if (timeline.end === null) deps.after(TICK_MS, tick);
  };
  const poll = (): void => {
    if (moment !== null) return;
    fetchFeed().then(take).catch(() => undefined).finally(() => { if (!ended) deps.after(POLL_MS, poll); });
  };
  const streamFrames = (): void => {
    if (moment !== null || ended || transparent || deps.openFrames === undefined || deps.frameUrl === undefined) return;
    const { frameUrl } = deps, socket = deps.openFrames(`${base}/frames`);
    socket.on("message", data => {
      liveFrames = true;
      const previous = onScreen;
      onScreen = frameUrl(data);
      void deps.show(game, onScreen).then(() => { if (previous?.startsWith("blob:") === true) doc.defaultView?.URL.revokeObjectURL(previous); });
    });
    socket.on("close", () => { liveFrames = false; deps.after(FRAME_RETRY_MS, streamFrames); });
  };

  if (moment !== null) await showFrame(render(moment));
  else {
    await showFrame(render(followTime()));
    if (!first.ended) { deps.after(TICK_MS, tick); deps.after(POLL_MS, poll); streamFrames(); }
  }
  return {
    async setTime(t) {
      moment = t;
      await showFrame(render(t));
    },
  };
}
