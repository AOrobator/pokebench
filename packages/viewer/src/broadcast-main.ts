// Boots the read-only /broadcast page. ?run= picks a run (default: the newest live one), ?t= holds one moment of it
// (default: follow), ?transparent=1 leaves the game and background out for compositing, ?voice=0 keeps a live page silent.
import { parseBroadcast, type BroadcastResponse, type CommentaryLine } from "./broadcast-feed.js";
import { BroadcastTimeline, clockText, thinkingTail, type BroadcastView } from "./broadcast-timeline.js";
import { actionHtml, badgesHtml, laneHtml, laneMarks, modelTitle, partyHtml, runPill, thinkingHtml } from "./broadcast-view.js";
import { BroadcastVoice, liveCaption } from "./broadcast-voice.js";
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
export interface Speaker { play(url: string): Promise<void>; stop(): void }
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
  readonly speak?: Speaker;
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
  let onScreen: string | null = null, showing = Promise.resolve(), socket: FrameSocket | null = null;

  const lines: CommentaryLine[] = [];
  const fetchFeed = async (): Promise<BroadcastResponse> => {
    const seen = cursor === 0 && lines.length === 0 ? "" : `&lines=${String(lines.length)}`;
    return parseBroadcast(await deps.fetchJson(`${base}/broadcast?after=${String(cursor)}${seen}`));
  };
  const first = await fetchFeed();
  const started = Date.parse(first.header.started);
  const { speak } = deps;
  const voice = new BroadcastVoice(line => speak?.play(`${base}/commentary/${encodeURIComponent(line.wav)}`) ?? Promise.resolve());
  const sound = doc.querySelector<HTMLElement>('[data-b="sound"]');
  // Only a live page a person is watching makes a sound; broadcast-render mixes its own.
  const speaks = speak !== undefined && moment === null && !first.ended && !transparent && params.get("voice") !== "0";
  let { header, rates } = first;
  const take = (feed: BroadcastResponse): void => {
    timeline.add(feed.items);
    lines.push(...feed.commentary);
    voice.add(feed.commentary);
    ({ header, rates } = feed);
    cursor = feed.next;
    ended = feed.ended;
  };
  take(first);
  // One read at a time: two answers from the same cursor would add the same items twice.
  let reading = Promise.resolve();
  const refresh = (): Promise<void> => {
    reading = reading.catch(() => undefined).then(fetchFeed).then(take);
    return reading;
  };

  const paint = (el: HTMLElement, html: string): void => { if (el.dataset.was !== html) { el.dataset.was = html; el.innerHTML = html; } };
  const write = (el: HTMLElement, text: string): void => { if (el.textContent !== text) el.textContent = text; };
  // A held moment waits for its frame, and a frame that fails is reported and can be tried again.
  const showFrame = (view: BroadcastView): Promise<void> => {
    if (transparent || liveFrames) return Promise.resolve();
    if (view.frame === null) {
      if (onScreen !== null) { onScreen = null; game.removeAttribute("src"); }
      return Promise.resolve();
    }
    const src = `${base}/frames/${view.frame}`;
    if (src === onScreen) return showing;
    onScreen = src;
    showing = deps.show(game, src).catch((error: unknown) => {
      if (onScreen === src) onScreen = null;
      throw error;
    });
    return showing;
  };
  // Following tolerates a failed frame: the next tick moves on, and a new src cancels a pending decode.
  const showFollowing = (view: BroadcastView): void => { showFrame(view).catch(() => undefined); };
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
    const live = moment === null && !ended;
    const caption = (live ? liveCaption(lines, voice.current, t) : null) ?? view.caption;
    part("cap").hidden = caption === null;
    write(part("say"), caption === null ? "" : `“${caption}”`);
    if (sound !== null) sound.hidden = !speaks || !live || voice.enabled;
    lane.innerHTML = laneHtml(laneMarks({ now: t, width: deps.laneWidth(lane), presses: view.presses, tools: view.tools, miles: view.miles }));
    return view;
  };
  const followTime = (): number => timeline.end ?? Math.max(0, (deps.now() - started) / 1000 - FOLLOW_DELAY_S);
  const tick = (): void => {
    if (moment !== null) return;
    voice.pump(followTime());
    showFollowing(render(followTime()));
    if (timeline.end === null) deps.after(TICK_MS, tick);
  };
  const poll = (): void => {
    if (moment !== null) return;
    refresh().catch(() => undefined).finally(() => { if (!ended) deps.after(POLL_MS, poll); });
  };
  const streamFrames = (): void => {
    if (moment !== null || ended || transparent || deps.openFrames === undefined || deps.frameUrl === undefined) return;
    const { frameUrl } = deps, stream = deps.openFrames(`${base}/frames`);
    socket = stream;
    stream.on("message", data => {
      if (socket !== stream) return;
      liveFrames = true;
      const previous = onScreen;
      onScreen = frameUrl(data);
      // A newer frame cancels a pending decode, so the old blob is retired either way.
      const retire = (): void => { if (previous?.startsWith("blob:") === true) doc.defaultView?.URL.revokeObjectURL(previous); };
      deps.show(game, onScreen).then(retire, retire);
    });
    stream.on("close", () => {
      if (socket !== stream) return;
      socket = null;
      liveFrames = false;
      deps.after(FRAME_RETRY_MS, streamFrames);
    });
  };

  // The click itself starts the first line, which is what unlocks audio on the stricter browsers.
  sound?.addEventListener("click", () => { voice.enable(followTime()); sound.hidden = true; });
  if (moment !== null) await showFrame(render(moment));
  else {
    showFollowing(render(followTime()));
    if (!first.ended) { deps.after(TICK_MS, tick); deps.after(POLL_MS, poll); streamFrames(); }
  }
  return {
    async setTime(t) {
      moment = t;
      voice.stop();
      speak?.stop();
      liveFrames = false;
      socket?.close();
      socket = null;
      // A run still being written may have reached t since the last read.
      if (!ended) await refresh();
      await showFrame(render(t));
    },
  };
}
