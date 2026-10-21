// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {NAME_CONFIRMED} from "../../agent/test-support/events.js";
import { parseEvent, type RunEvent } from "@pokebench/agent/events";
import { BASE_MS, Log, START, assistant, fullRun, m4Run, must, state } from "../test-support/events.js";
import { bagRun } from "../test-support/bag.js";
import { boot, frameSocketUrl, mountApp, type App, type AppDeps, type FrameStreamLike, type StreamLike } from "./app.js";

const PAGE = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8");
// The ★ NEXT RUN page loads these on mount; tests of the watch view answer them.
const NEXT_RUN_DRAFT = { model: "", thinking: "medium", maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3, maxTokens: 4096, target: null, features: {} };
function nextRunReply(url: string): Promise<unknown> | null {
  if (url === "/api/features") return Promise.resolve({ features: [], milestones: [] });
  if (url === "/api/next-run") return Promise.resolve({ draft: NEXT_RUN_DRAFT, queue: { state: "idle" } });
  if (url === "/api/models") return Promise.resolve({ models: [] });
  if (url === "/api/features/history") return Promise.resolve({});
  return null;
}
const noWrites = (): Promise<unknown> => Promise.reject(new Error("unexpected write"));
const M4_ID = "2026-10-11T22-16-26_think-swarm_890b";

class FakeStream implements StreamLike {
  closed = false;
  private readonly listeners = new Map<string, ((message: { data: string }) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (message: { data: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.closed = true;
  }

  send(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
  }

  sendRaw(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

class FakeFrameStream implements FrameStreamLike {
  binaryType = "blob";
  closed = false;
  private readonly listeners = new Map<string, ((event: { data?: unknown }) => void)[]>();

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void { this.closed = true; }
  send(type: string, data?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }
}

interface Harness {
  readonly app: App;
  readonly streams: FakeStream[];
  readonly frames: FakeFrameStream[];
  readonly fetched: string[];
  readonly revoked: string[];
  readonly setNow: (ms: number) => void;
}

const RUNS = [
  { id: "2026-10-11T23-00-00_live", model: "think-swarm", started: "x", ended: false, reason: null, problem: null },
  { id: M4_ID, model: "think-swarm", started: "x", ended: true, reason: "budget", problem: null },
  { id: "2026-10-11T21-00-00_old", model: "think-swarm", started: "x", ended: true, reason: "budget", problem: null },
];

async function harness(hash = "", runs: unknown[] = RUNS, workbench: unknown = null, heads: Readonly<Record<string, unknown>> = {}, stageFrame?: AppDeps["stageFrame"], fallback = true, replies: Readonly<Record<string, unknown>> = {}): Promise<Harness> {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const streams: FakeStream[] = [];
  const frames: FakeFrameStream[] = [];
  const revoked: string[] = [];
  const fetched: string[] = [];
  let now = BASE_MS;
  const deps: AppDeps = {
    fetchJson: (url) => {
      const next = nextRunReply(url);
      if (next !== null) return next;
      fetched.push(url);
      if (url in replies) return Promise.resolve(replies[url]);
      if (url === "/api/runs") return runs.length === 1 && runs[0] === "fail" ? Promise.reject(new Error("offline")) : Promise.resolve([...runs]);
      if (url.startsWith("/api/cards")) return workbench === null ? Promise.reject(new Error("workbench unavailable")) : Promise.resolve(workbench);
      if (url.endsWith("/head")) {
        const id = decodeURIComponent(url.split("/")[3] ?? "");
        return id in heads ? Promise.resolve(heads[id]) : Promise.reject(new Error("recorded head unavailable"));
      }
      if (url.endsWith("/comparisons")) return Promise.resolve({ candidates: [{run: "2026-10-11T21-00-00_old", milestones: []}], baseline: null });
      if (url.endsWith("/milestones")) {
        return Promise.resolve({ run: "2026-10-11T21-00-00_old", milestones: [{ name: "GAME_RUNNING", offsetMs: 5 }, { name: "PLAYER_NAME_SET", offsetMs: 20_000 }] });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    },
    sendJson: noWrites,
    openStream: (url) => {
      const stream = new FakeStream(url);
      streams.push(stream);
      // Exercise the HTTP thinking fallback when the primary connection fails.
      if (fallback) queueMicrotask(() => { stream.send("error", {}); });
      return stream;
    },
    openFrameStream: (url) => {
      const stream = new FakeFrameStream(url);
      frames.push(stream);
      return stream;
    },
    frameUrl: (data) => `blob:frame-${String(data)}`,
    ...(stageFrame === undefined ? {} : { stageFrame }),
    revokeFrameUrl: (url) => { revoked.push(url); },
    now: () => now,
    hash,
  };
  const app = await mountApp(document, deps);
  return {
    app,
    streams,
    frames,
    fetched,
    revoked,
    setNow: (ms) => {
      now = ms;
    },
  };
}

function ui(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-ui="${name}"]`);
  if (element === null) throw new Error(`no [data-ui="${name}"]`);
  return element;
}

async function openSplits(): Promise<void> {
  must(document.querySelector<HTMLButtonElement>('[data-page="splits"]')).click();
  await Promise.resolve();
}

// Events go out as the stream's own run, as the server would send them.
function feed(stream: FakeStream, events: readonly RunEvent[], caughtUp = true): void {
  const run = decodeURIComponent(stream.url.split("/")[3] ?? "");
  for (const event of events) stream.send("ev", { ...event, run });
  if (caughtUp) stream.send("caught_up", {});
}

describe("viewer app", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("changes inspection pages without resetting the stream, replay or baseline", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), fullRun().events);
    app.tick(4000);
    const clock = app.clock;
    const position = clock?.positionMs;
    const button = must(document.querySelector<HTMLButtonElement>('[data-page="stats"]'));
    button.click();
    expect(document.querySelector<HTMLElement>('[data-nav-page="stats"]')?.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-nav-page="trainer"]')?.hidden).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(app.clock).toBe(clock);
    expect(app.clock?.positionMs).toBe(position);
    expect(streams).toHaveLength(1);
    expect(document.querySelector('[data-page="objectives"]')).toBeNull();
    expect(document.querySelector('[data-nav-page="objectives"]')).toBeNull();
  });

  it("drives the phone page picker and the page directory as one control", async () => {
    await harness(`#replay=${M4_ID}`);
    const select = must(document.querySelector<HTMLSelectElement>('[data-ui="page-select"]'));
    const buttons = [...document.querySelectorAll<HTMLButtonElement>("[data-page]")];
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual(buttons.map((button) => [button.dataset.page, button.textContent]));
    expect(select.value).toBe("trace");
    expect([...select.options].map((option) => option.value)).toEqual(["trace", "party", "next", "queue", "config", "trainer", "bag", "stats", "splits", "field", "run"]);
    const shown = (): string[] => [...document.querySelectorAll<HTMLElement>("[data-nav-page]")].filter((panel) => !panel.hidden).map((panel) => panel.dataset.navPage ?? "");
    select.value = "stats";
    select.dispatchEvent(new Event("change"));
    expect(shown()).toEqual(["stats"]);
    expect(must(document.querySelector('[data-page="stats"]')).getAttribute("aria-pressed")).toBe("true");
    must(document.querySelector<HTMLButtonElement>('[data-page="party"]')).click();
    expect(select.value).toBe("party");
    const step = (by: string): void => { must(document.querySelector<HTMLButtonElement>(`[data-page-step="${by}"]`)).click(); };
    step("1");
    expect(shown()).toEqual(["next"]);
    must(document.querySelector<HTMLButtonElement>('[data-page="trace"]')).click();
    step("1");
    expect(shown()).toEqual(["party"]);
    must(document.querySelector<HTMLButtonElement>('[data-page="trace"]')).click();
    step("-1");
    expect(shown()).toEqual(["run"]);
    expect(select.value).toBe("run");
    step("1");
    expect(shown()).toEqual(["trace"]);
  });

  it("lets the reader pause follow while streaming and explicitly resume", async () => {
    const { app, streams } = await harness();
    const stream = must(streams[0]);
    const log = new Log();
    log.add(0, START);
    log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    log.add(1100, { type: "assistant_delta", turn: 1, thinking: "Long trace.", text: "" });
    feed(stream, log.events);
    const body = ui("think-body");
    Object.defineProperty(body, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(body, "clientHeight", { value: 300, configurable: true });
    body.scrollTop = 100;
    body.dispatchEvent(new Event("scroll"));
    app.tick(100);
    expect(body.scrollTop).toBe(100);
    expect(ui("follow-thinking").getAttribute("aria-pressed")).toBe("false");
    ui("follow-thinking").click();
    expect(body.scrollTop).toBe(1000);
    expect(ui("follow-thinking").getAttribute("aria-pressed")).toBe("true");
  });

  it("defaults to a live run instead of restoring an old replay selection", async () => {
    const { streams } = await harness(`#run=${M4_ID}`);
    expect(streams[0]?.url).toBe(`/api/runs/${must(RUNS[0]).id}/events?head=1`);
    expect((ui("run") as HTMLSelectElement).value).toBe(must(RUNS[0]).id);
  });

  it("lists runs and opens a replay deliberately linked separately", async () => {
    const { streams } = await harness(`#replay=${M4_ID}`);
    const options = [...ui("run").querySelectorAll("option")].map((option) => option.value);
    expect(options).toEqual(RUNS.map((run) => run.id));
    expect((ui("run") as HTMLSelectElement).value).toBe(M4_ID);
    expect(streams.map((stream) => stream.url)).toEqual([`/api/runs/${M4_ID}/events?head=1`]);
    expect(ui("gba").querySelector('[data-btn="A"]')).not.toBeNull();
  });

  it("opens the newest run when the hash names none, and shows no data before events arrive", async () => {
    const { streams } = await harness();
    expect(streams[0]?.url).toBe("/api/runs/2026-10-11T23-00-00_live/events?head=1");
    expect(ui("brand").textContent).toBe("POKéNAV · NO RUN");
    expect(ui("party").innerHTML).toContain("no data");
    expect(ui("mode").textContent).toBe("LOADING");
  });

  it("updates Stats history from the live stream and follows replay rewind without changing the picker", async () => {
    const {app,streams}=await harness();
    const stream=must(streams[0]);
    document.querySelector<HTMLButtonElement>('[data-page="stats"]')?.click();
    feed(stream,fullRun().events.slice(0,5));
    expect(ui("metric-history").textContent).toContain("1 responses");
    expect(ui("metric-history").querySelector('[data-metric="output"] strong')?.textContent).toBe("100 tokens");
    expect(document.querySelector('.page-picker select')).not.toBeNull();
    const definitions=must(document.querySelector<HTMLDetailsElement>('#page-stats details'));
    definitions.open=true;
    feed(stream,fullRun().events.slice(5),false);app.render();
    expect(document.querySelector('#page-stats details')).toBe(definitions);
    expect(definitions.open).toBe(true);
    expect(ui("metric-history").querySelector('[data-metric="output"] strong')?.textContent).toBe("300 tokens");
    stream.send("done",{});
    app.clock?.seek(BASE_MS+3500);app.render();
    expect(ui("metric-history").querySelector('[data-metric="output"] strong')?.textContent).toBe("100 tokens");
    app.clock?.seek(BASE_MS);app.render();
    expect(ui("metric-history").textContent).toContain("Waiting for a recorded response");
    expect(document.querySelector('#page-stats input[type="range"]')).toBeNull();
    expect(ui("replay-controls").hidden).toBe(false);
  });

  it("replays the recorded M4 run end to end", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    const stream = must(streams[0]);
    const events = m4Run();
    feed(stream, events);
    stream.send("done", {});
    expect(stream.closed).toBe(true);
    expect(app.mode).toBe("replay");
    expect(ui("mode").textContent).toBe("REPLAY");
    expect(ui("brand").textContent).toBe(`POKéNAV · ${M4_ID}`);
    expect(ui("play").textContent).toBe("❚❚");
    expect(ui("replay-controls").hidden).toBe(false);
    expect(ui("counters").innerHTML).toContain("think-swarm");
    expect(ui("think-head").textContent).toBe("AGENT thought for 7.0s · turn 4");

    app.tick(2_000);
    expect(ui("think-head").textContent).toBe("AGENT thought for 7.0s · turn 4");
    app.tick(10_000);
    expect(ui("screen").getAttribute("href")).toBe(`/api/runs/${M4_ID}/frames/000015_0.png`);
    expect(ui("trace").querySelectorAll("[data-key]").length).toBeGreaterThan(5);
    expect(ui("lanes").innerHTML).toContain("m-milestone");

    app.tick(60_000);
    expect(app.clock?.atEnd).toBe(true);
    expect(ui("play").textContent).toBe("▶");
    expect(ui("think-head").textContent).toBe("AGENT thought for 7.0s · turn 4");
    expect(ui("trainer").innerHTML).toContain("<dt>TURN</dt><dd>4</dd>");
    expect(ui("trainer").innerHTML).toContain("<dt>TIME</dt><dd>0:00:11</dd>");
    expect(ui("party").innerHTML).toContain("no data");
    expect(ui("clock").textContent).toBe("0:00:11 / 0:00:11");
    expect((ui("scrub") as HTMLInputElement).value).toBe("1000");
    expect(ui("trace").querySelector('[data-seqs~="18"]')?.textContent).toContain("run ended: budget");
  });

  it("lights the GBA button while a press is held", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    const press = must(m4Run().find((event) => event.type === "button_press"));
    app.clock?.pause();
    app.clock?.seek(Date.parse(press.t) + 20);
    app.tick(0);
    expect(ui("gba").querySelector('[data-btn="A"]')?.classList.contains("lit")).toBe(true);
    app.clock?.seek(Date.parse(press.t) + 1000);
    app.tick(0);
    expect(ui("gba").querySelector('[data-btn="A"]')?.classList.contains("lit")).toBe(false);
  });

  it("drives the replay from the controls and seeks backwards", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    ui("play").click();
    expect(app.clock?.playing).toBe(false);
    const speed = ui("speed") as HTMLSelectElement;
    speed.value = "16";
    speed.dispatchEvent(new Event("change"));
    expect(app.clock?.speed).toBe(16);
    ui("play").click();
    app.tick(1_000);
    expect(ui("trace").querySelectorAll("[data-key]").length).toBeGreaterThan(5);
    const scrub = ui("scrub") as HTMLInputElement;
    scrub.value = "0";
    scrub.dispatchEvent(new Event("input"));
    expect(app.clock?.fraction).toBe(0);
    expect(ui("trace").querySelectorAll("[data-key]").length).toBe(0);
    expect(ui("screen").getAttribute("href")).toBe("");
  });

  it("opens a trace row's raw events in the inspector", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    const row = must(ui("trace").querySelector<HTMLElement>('[data-seqs~="9"]'));
    row.click();
    expect(ui("inspector").textContent).toContain('"type": "tool_call"');
    expect(row.classList.contains("sel")).toBe(true);
    ui("trace").click();
    expect(ui("inspector").textContent).toContain('"type": "tool_call"');
  });

  it("follows a live run with the live screen and the wall clock", async () => {
    const { app, streams, frames, setNow } = await harness();
    const live = fullRun().events.slice(0, 4);
    feed(must(streams[0]), live);
    expect(app.mode).toBe("live");
    expect(ui("mode").textContent).toBe("RUNNING");
    expect((ui("play") as HTMLButtonElement).disabled).toBe(true);
    expect(ui("replay-controls").hidden).toBe(true);
    setNow(BASE_MS + 3_500);
    must(frames[0]).send("open");
    must(frames[0]).send("message", "one");
    app.tick(500);
    expect(ui("think-head").textContent).toBe("AGENT is thinking… 2.5s");
    expect(ui("screen").getAttribute("href")).toBe("blob:frame-one");
    expect(ui("screen-note").textContent).toBe("live");
    const more = fullRun().events.slice(4, 10);
    feed(must(streams[0]), more, false);
    app.tick(500);
    expect(ui("trainer").innerHTML).toContain("LITTLEROOT TOWN");
    expect(ui("clock").textContent).toBe("T1 · 0:00:03 / 0:01:00");
  });

  it("falls back to the last recorded frame when the live screen fails", async () => {
    const { app, streams, frames, setNow, revoked } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 10));
    setNow(BASE_MS + 4_000);
    must(frames[0]).send("message", "one");
    must(frames[0]).send("error");
    must(frames[0]).send("close");
    app.tick(100);
    expect(ui("screen").getAttribute("href")).toBe("/api/runs/2026-10-11T23-00-00_live/frames/000009_0.png");
    expect(ui("screen-note").textContent).toBe("live stream unavailable · last frame");
    expect(revoked).toEqual(["blob:frame-one"]);
    expect(frames[0]?.closed).toBe(true);
    expect(ui("problems").textContent).toContain("live frame stream error");
    expect(ui("problems").textContent).not.toContain("live frame stream closed");
    setNow(BASE_MS + 9_100);
    app.tick(5_000);
    expect(frames[1]?.url).toBe("/api/runs/2026-10-11T23-00-00_live/frames");
  });

  it("presents pushed frames without polling and retains a short decode grace window", async () => {
    const { app, streams, frames, fetched, revoked } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 4));
    const socket = must(frames[0]);
    expect(socket.url).toBe("/api/runs/2026-10-11T23-00-00_live/frames");
    expect(socket.binaryType).toBe("arraybuffer");
    socket.send("message", "one");
    expect(ui("screen").dataset.liveFramesReceived).toBe("1");
    expect(ui("screen").dataset.liveFramesPresented).toBe("0");
    ui("screen").dispatchEvent(new Event("load"));
    expect(ui("screen").dataset.liveFramesPresented).toBe("1");
    for (let i = 0; i < 10; i += 1) app.tick(1_000);
    expect(ui("screen").getAttribute("href")).toBe("blob:frame-one");
    expect(ui("screen").getAttribute("href")).not.toContain("/screen?");
    expect(fetched.every((url) => !url.includes("/screen"))).toBe(true);
    socket.send("message", "two");
    expect(ui("screen").getAttribute("href")).toBe("blob:frame-two");
    expect(ui("screen").dataset.liveFramesReceived).toBe("2");
    ui("screen").dispatchEvent(new Event("load"));
    expect(ui("screen").dataset.liveFramesPresented).toBe("2");
    expect(revoked).toEqual([]);
    for (const name of ["three", "four", "five", "six", "seven", "eight", "nine", "ten"]) socket.send("message", name);
    expect(revoked).toEqual(["blob:frame-one"]);
    expect(frames).toHaveLength(1);
  });

  it("keeps the last good frame when decoding fails and bounds queued work", async () => {
    const staged: { url: string; ready: () => void; failed: () => void }[] = [];
    const { streams, frames, revoked } = await harness("", RUNS, null, {}, (url, ready, failed) => { staged.push({ url, ready, failed }); });
    feed(must(streams[0]), fullRun().events.slice(0, 4));
    const socket = must(frames[0]);
    socket.send("message", "one");
    expect(ui("screen").getAttribute("href")).not.toBe("blob:frame-one");
    must(staged[0]).ready();
    expect(ui("screen").getAttribute("href")).toBe("blob:frame-one");
    socket.send("message", "bad"); socket.send("message", "stale"); socket.send("message", "latest");
    expect(revoked).toContain("blob:frame-stale");
    must(staged[1]).failed();
    expect(ui("screen").getAttribute("href")).toBe("blob:frame-one");
    expect(staged[2]?.url).toBe("blob:frame-latest");
    must(staged[2]).ready();
    expect(ui("screen").getAttribute("href")).toBe("blob:frame-latest");
    expect(revoked).toContain("blob:frame-bad");
  });

  it("switches to replay when a live run ends", async () => {
    const { app, streams } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 4));
    feed(must(streams[0]), fullRun().events.slice(4), false);
    expect(ui("replay-controls").hidden).toBe(true);
    must(streams[0]).send("done", {});
    expect(app.mode).toBe("replay");
    expect(app.clock?.atEnd).toBe(true);
    expect(ui("replay-controls").hidden).toBe(false);
  });

  it("shows invalid events and server problems instead of dropping them", async () => {
    const { streams } = await harness();
    const stream = must(streams[0]);
    stream.send("ev", { type: "nonsense" });
    stream.sendRaw("ev", "{not json");
    stream.send("problem", { line: 7, problem: "invalid event at /seq" });
    const problems = ui("problems");
    expect(problems.hidden).toBe(false);
    expect(problems.textContent).toContain("line 7: invalid event at /seq");
    expect(problems.textContent).toContain("not a run event");
    expect(problems.textContent).toContain("unreadable stream message");
  });

  it("compares splits against a picked baseline run", async () => {
    const { app, streams, fetched } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), fullRun().events);
  await openSplits();
    const baseline = ui("baseline") as HTMLSelectElement;
    expect([...baseline.querySelectorAll("option")].map((option) => option.value)).toEqual([
      "",
      "2026-10-11T21-00-00_old",
    ]);
    baseline.value = "2026-10-11T21-00-00_old";
    baseline.dispatchEvent(new Event("change"));
    await vi.waitFor(() => {
      expect(fetched).toContain("/api/runs/2026-10-11T21-00-00_old/milestones");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.tick(60_000);
    expect(ui("splits").innerHTML).toContain("d-ahead");
    expect(ui("splits-summary").innerHTML).toContain("vs baseline");
    baseline.value = "";
    baseline.dispatchEvent(new Event("change"));
    app.tick(0);
    expect(ui("splits-summary").innerHTML).toContain("no baseline");
  });

  it("ignores a baseline response that arrives after the picker moved on", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const pending: ((value: unknown) => void)[] = [];
    const streams: FakeStream[] = [];
    const app = await mountApp(document, {
      fetchJson: (url) =>
        url === "/api/runs"
          ? Promise.resolve(RUNS)
          : url.endsWith("/head") ? Promise.reject(new Error("recorded head unavailable"))
          : url.endsWith("/comparisons") ? Promise.resolve({ candidates:[{run:"2026-10-11T21-00-00_old",milestones:[]}],baseline:null }) : new Promise((resolve) => {
              pending.push(resolve);
            }),
      sendJson: noWrites,
      openStream: (url) => {
        const stream = new FakeStream(url);
        streams.push(stream);
        return stream;
      },
      now: () => BASE_MS,
      hash: `#replay=${M4_ID}`,
    });
    feed(must(streams[0]), fullRun().events);
    const baseline = ui("baseline") as HTMLSelectElement;
    baseline.value = "2026-10-11T21-00-00_old";
    baseline.dispatchEvent(new Event("change"));
    baseline.value = "";
    baseline.dispatchEvent(new Event("change"));
    must(pending[0])({ run: "2026-10-11T21-00-00_old", milestones: [{ name: "GAME_RUNNING", offsetMs: 5 }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    app.tick(0);
    expect(ui("splits-summary").innerHTML).toContain("no baseline");
  });

  it("switches runs from the picker and closes the old stream", async () => {
    const { streams, frames } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 4));
    const pick = ui("run") as HTMLSelectElement;
    pick.value = M4_ID;
    pick.dispatchEvent(new Event("change"));
    must(frames[0]).send("close");
    expect(streams[0]?.closed).toBe(true);
    expect(frames[0]?.closed).toBe(true);
    expect(streams[1]?.url).toBe(`/api/runs/${M4_ID}/events?head=1`);
    expect(ui("trace").querySelectorAll("[data-key]").length).toBe(0);
    expect(ui("problems").hidden).toBe(true);
    expect(ui("screen").dataset.liveFramesReceived).toBe("0");
    expect(ui("screen").dataset.liveFramesPresented).toBe("0");
    expect(window.location.hash).toBe(`#replay=${M4_ID}`);
  });

  it("shows a known-live run from its screen endpoint while its event history catches up", async () => {
    const second = "2026-10-11T23-05-00_second-live";
    const runs = [RUNS[0], { id: second, model: "think-swarm", started: "x", ended: false, reason: null, problem: null }];
    const { app, streams, frames } = await harness("", runs);
    feed(must(streams[0]), fullRun().events.slice(0, 4));

    const pick = ui("run") as HTMLSelectElement;
    pick.value = second;
    pick.dispatchEvent(new Event("change"));

    expect(app.mode).toBe("loading");
    expect(frames[1]?.url).toBe(`/api/runs/${second}/frames`);
    expect(ui("screen-note").textContent).toBe("live stream connecting · last frame");
    feed(must(streams[1]), fullRun().events.slice(0, 10), false);
    must(frames[1]).send("message", "second");
    expect(ui("screen").getAttribute("href")).toBe("blob:frame-second");
    expect(ui("replay-controls").hidden).toBe(true);
    must(frames[1]).send("error");
    app.tick(100);
    expect(ui("screen").getAttribute("href")).toBe(`/api/runs/${second}/frames/000009_0.png`);
    expect(ui("screen-note").textContent).toBe("live stream unavailable · last frame");
  });

  it("keeps the selected run's cached splits atomic until its event stream is caught up", async () => {
    const second = "2026-10-11T23-05-00_second-live";
    const runs = [RUNS[0], { id: second, model: "think-swarm", started: "x", ended: true, reason: "budget", problem: null }];
    const split = (name: string, elapsedMs: number, seq: number) => ({ name, elapsedMs, segmentMs: elapsedMs, seq, turn: 1, inputTokens: 0, outputTokens: 0 });
    const run = (id: string, splits: ReturnType<typeof split>[]) => ({ id, cohort: null, arm: null, model: "think-swarm", started: "2026-10-11T23:00:00.000Z", status: "live", reason: null, problem: null, excluded: null, elapsedMs: 5_000, turn: 1, config: null, splits });
    const workbench = { version: 1, at: BASE_MS, milestones: [], problems: [], runs: [
      run(RUNS[0]?.id ?? "", [split("NEW_GAME_CREATED", 1_000, 1), split("PLAYER_NAME_CONFIRMED", 2_000, 2)]),
      { ...run(second, [split("FIRST_TRUCK_EXIT", 3_000, 3)]), status: "ended", reason: "budget" },
    ] };
    const { app, streams } = await harness("", runs, workbench);
    await app.pollCards();
    expect(ui("split-strip").textContent).toContain("NEW GAME ✔NAME ✔");
    const disclosure = document.querySelector<HTMLDetailsElement>("details.run-splits");
    expect(disclosure).not.toBeNull();
    expect(disclosure?.open).toBe(false);
    expect(ui("split-preview").textContent).toContain("NAME ✔");
    expect(ui("split-preview").textContent).not.toContain("NEW GAME ✔");
    if (disclosure) disclosure.open = true;


    const first = must(streams[0]);
    const partial = new Log();
    partial.add(0, START);
    partial.add(1_000, { type: "milestone", turn: 1, name: "NEW_GAME_CREATED", server_timestamp: 1, kind: "story", origin: "observed" });
    feed(first, partial.events, false);
    app.tick(100);
    expect(ui("split-strip").textContent).toContain("NEW GAME ✔NAME ✔");

    expect(disclosure?.open).toBe(true);
    app.select(second);
    app.render();
    expect(disclosure?.open).toBe(true);
    expect(ui("split-preview").textContent).toContain("TRUCK EXIT ✔");
    expect(ui("split-preview").textContent).not.toContain("NAME ✔");
    expect(ui("split-strip").textContent).toContain("TRUCK EXIT ✔");
    expect(ui("split-strip").textContent).not.toContain("NAME ✔");

    const secondLog = new Log();
    secondLog.add(0, START);
    secondLog.add(3_000, { type: "milestone", turn: 1, name: "FIRST_TRUCK_EXIT", server_timestamp: 3, kind: "story", origin: "observed" });
    secondLog.add(4_000, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: "FIRST_TRUCK_EXIT", turns: 1, wall_ms: 4_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    feed(must(streams[1]), secondLog.events);
    app.tick(100);
    expect(ui("split-strip").textContent).toContain("TRUCK EXIT ✔");
    app.clock?.seek(BASE_MS);
    app.render();
    expect(ui("split-strip").textContent).toContain("TRUCK EXIT ✔");
  });

  it("requests the selected replay without waiting for an older in-flight card request", async () => {
    const second = "2026-10-11T23-05-00_second-live", runs = [RUNS[0], { id: second, model: "think-swarm", started: "x", ended: true, reason: "budget", problem: null }];
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const streams: FakeStream[] = [], requested: string[] = [], pending: ((value: unknown) => void)[] = [];
    const minimal = (id: string) => ({ version: 1, at: BASE_MS, milestones: [], problems: [], runs: [{ id, cohort: null, arm: null, model: "think-swarm", started: "2026-10-11T23:00:00.000Z", status: "ended", reason: "budget", problem: null, excluded: null, elapsedMs: 1000, turn: 1, config: null, splits: [] }] });
    const app = await mountApp(document, {
      fetchJson: (url) => {
        if (url === "/api/runs") return Promise.resolve(runs);
        if (url.startsWith("/api/cards")) { requested.push(url); return new Promise(resolve => pending.push(resolve)); }
        if (url.endsWith("/head")) return Promise.reject(new Error("no head"));
        const next = nextRunReply(url); return next ?? Promise.reject(new Error(`unexpected ${url}`));
      },
      sendJson: noWrites, openStream: (url) => { const stream = new FakeStream(url); streams.push(stream); return stream; }, now: () => BASE_MS, hash: "",
    });
    expect(requested).toEqual([`/api/cards?run=${encodeURIComponent(RUNS[0]?.id ?? "")}`]);
    app.select(second);
    expect(requested).toEqual([`/api/cards?run=${encodeURIComponent(RUNS[0]?.id ?? "")}`, `/api/cards?run=${encodeURIComponent(second)}`]);
    const refresh = app.pollCards();
    pending[1]?.(minimal(second));
    await refresh;
    expect(ui("split-strip").textContent).not.toContain("LOADING RECORDED SPLITS");
    const first = RUNS[0]?.id ?? "";
    app.select(first);
    const newest = app.pollCards();
    expect(requested).toEqual([`/api/cards?run=${encodeURIComponent(first)}`, `/api/cards?run=${encodeURIComponent(second)}`, `/api/cards?run=${encodeURIComponent(first)}`]);
    const fresh = minimal(first);
    pending[2]?.({ ...fresh, runs: fresh.runs.map(run => ({ ...run, splits: [{ name: "FIRST_TRUCK_EXIT", elapsedMs: 1, segmentMs: 1, seq: 1, turn: 1, inputTokens: 0, outputTokens: 0 }] })) });
    await newest;
    expect(ui("split-strip").textContent).toContain("TRUCK EXIT ✔");
    pending[0]?.(minimal(first));
    await new Promise(resolve => { setImmediate(resolve); });
    expect(ui("split-strip").textContent).toContain("TRUCK EXIT ✔");
  });

  it("holds a stable split-loading state when the cache is unavailable, then trusts the caught-up stream", async () => {
    const { app, streams } = await harness();
    await app.pollCards();
    const log = new Log();
    log.add(0, START);
    log.add(1_000, { type: "milestone", turn: 1, name: "NEW_GAME_CREATED", server_timestamp: 1, kind: "story", origin: "observed" });
    feed(must(streams[0]), log.events, false);
    app.tick(100);
    expect(ui("split-strip").textContent).toContain("LOADING RECORDED SPLITS");
    expect(ui("split-strip").textContent).not.toContain("NEW GAME ✔");
    must(streams[0]).send("caught_up", {});
    app.tick(100);
    expect(ui("split-strip").textContent).toContain("NEW GAME ✔");
  });

  it("keeps the selected run's recorded thinking atomic until its event stream is caught up", async () => {
    const id = RUNS[0]?.id ?? "missing";
    const recorded = new Log();
    recorded.add(0, START);
    recorded.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    recorded.add(2_000, assistant({ turn: 1, thinking: "Older recorded thought." }));
    recorded.add(3_000, { type: "turn_start", turn: 2, context: { messages: 2, images: 0, est_tokens: 20 } });
    recorded.add(4_000, assistant({ turn: 2, thinking: "Latest recorded thought." }));
    const { app, streams } = await harness("", RUNS, null, { [id]: recorded.events.map((event) => ({ ...event, run: id })) });
    await Promise.resolve();
    app.render();
    expect(ui("think-body").textContent).toContain("Latest recorded thought.");
    expect(ui("side-trace").textContent).toContain("Older recorded thought.");
    const cachedRow = [...ui("side-trace").querySelectorAll<HTMLElement>("[data-key]")].find((row) => row.textContent.includes("Older recorded thought."));
    must(cachedRow?.querySelector<HTMLElement>("summary")).click();
    expect(ui("inspector").textContent).toContain('"thinking": "Older recorded thought."');

    const partial = new Log();
    partial.add(0, START);
    partial.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    partial.add(2_000, assistant({ turn: 1, thinking: "Partial stream thought." }));
    feed(must(streams[0]), partial.events, false);
    app.tick(100);
    expect(ui("think-body").textContent).toContain("Latest recorded thought.");
    expect(ui("think-body").textContent).not.toContain("Partial stream thought.");

    feed(must(streams[0]), recorded.events.slice(partial.events.length), false);
    must(streams[0]).send("caught_up", {});
    app.tick(100);
    expect(ui("think-body").textContent).toContain("Latest recorded thought.");
  });

  it("keeps the run-splits thinking pane at the recorded present while a finished run replays", async () => {
    const id = M4_ID;
    const recorded = fullRun();
    const head = recorded.events.map((event) => ({ ...event, run: id }));
    const { app, streams } = await harness(`#run=${id}`, RUNS, null, { [id]: head });
    await Promise.resolve();
    feed(must(streams[0]), head);
    app.clock?.seek(BASE_MS);
    app.tick(0);
    expect(ui("mode").textContent).toBe("REPLAY");
    expect(ui("think-title").textContent).toBe("FINAL · TURN 2");
    expect(ui("think-body").textContent).toContain("Again.");
    expect(ui("trace").textContent).not.toContain("Again.");
    const cachedRow = [...ui("side-trace").querySelectorAll<HTMLElement>("[data-key]")].find((row) => row.textContent.includes("Press A to start."));
    must(cachedRow?.querySelector<HTMLElement>("summary")).click();
    expect(ui("inspector").textContent).toContain('"thinking": "Press A to start."');
  });

  it("does not let a late recorded-thinking snapshot replace the caught-up stream", async () => {
    const id = RUNS[0]?.id ?? "missing";
    let resolveHead: (value: unknown) => void = () => undefined;
    const head = new Promise<unknown>((resolve) => { resolveHead = resolve; });
    const { app, streams } = await harness("", RUNS, null, { [id]: head });
    const live = new Log();
    live.add(0, START);
    live.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    live.add(2_000, assistant({ turn: 1, thinking: "Authoritative at catch-up." }));
    feed(must(streams[0]), live.events);
    expect(ui("think-body").textContent).toContain("Authoritative at catch-up.");

    const stale = new Log();
    stale.add(0, START);
    stale.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    stale.add(2_000, assistant({ turn: 1, thinking: "Late stale snapshot." }));
    resolveHead(stale.events.map((event) => ({ ...event, run: id })));
    await Promise.resolve();
    await Promise.resolve();
    expect(ui("think-body").textContent).toContain("Authoritative at catch-up.");
    expect(ui("think-body").textContent).not.toContain("Late stale snapshot.");

    const next = [
      live.add(3_000, { type: "turn_start", turn: 2, context: { messages: 2, images: 0, est_tokens: 20 } }),
      live.add(4_000, assistant({ turn: 2, thinking: "Newest live stream thought." })),
    ];
    feed(must(streams[0]), next, false);
    app.render();
    expect(ui("think-body").textContent).toContain("Newest live stream thought.");
  });

  it("does not let a late recorded-thinking failure clear the caught-up stream", async () => {
    const id = RUNS[0]?.id ?? "missing";
    let rejectHead: (reason?: unknown) => void = () => undefined;
    const head = new Promise<unknown>((_resolve, reject) => { rejectHead = reject; });
    const { app, streams } = await harness("", RUNS, null, { [id]: head });
    feed(must(streams[0]), fullRun().events);
    app.clock?.seek(BASE_MS);
    app.render();
    expect(ui("think-body").textContent).toContain("Again.");
    expect(ui("side-trace").textContent).toContain("Press A to start.");

    rejectHead(new Error("late head failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(ui("think-body").textContent).toContain("Again.");
    expect(ui("side-trace").textContent).toContain("Press A to start.");
  });

  it("does not duplicate recorded-thinking rows when reconnect backfill repeats accepted events", async () => {
    const { app, streams } = await harness();
    const log = fullRun();
    const throughTurnTwo = log.events.slice(0, 12);
    feed(must(streams[0]), throughTurnTwo);
    const earlierThought = (): number => ui("side-trace").querySelectorAll('[data-seqs~="4"]').length;
    expect(earlierThought()).toBe(1);

    feed(must(streams[0]), throughTurnTwo.slice(0, 5), false);
    app.render();
    expect(earlierThought()).toBe(1);

    const fresh = log.add(8_100, { type: "tool_call", turn: 2, id: "fresh", name: "state", args: {} });
    feed(must(streams[0]), [fresh], false);
    app.render();
    expect(ui("side-trace").querySelectorAll(`[data-seqs~="${String(fresh.seq)}"]`)).toHaveLength(1);
  });

  it("ignores a recorded-thinking response from a run that is no longer selected", async () => {
    const firstId = RUNS[0]?.id ?? "missing";
    let resolveFirst: (value: unknown) => void = () => undefined;
    const firstHead = new Promise<unknown>((resolve) => { resolveFirst = resolve; });
    const fresh = new Log();
    fresh.add(0, START);
    fresh.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    fresh.add(2_000, assistant({ turn: 1, thinking: "Selected run thought." }));
    const { app } = await harness("", RUNS, null, {
      [firstId]: firstHead,
      [M4_ID]: fresh.events.map((event) => ({ ...event, run: M4_ID })),
    });
    app.select(M4_ID);
    await Promise.resolve();
    await Promise.resolve();
    expect(ui("think-body").textContent).toContain("Selected run thought.");

    const stale = fresh.events.map((event) => event.type === "assistant" ? { ...event, run: firstId, thinking: "Stale run thought." } : { ...event, run: firstId });
    resolveFirst(stale);
    await Promise.resolve();
    await Promise.resolve();
    expect(ui("think-body").textContent).toContain("Selected run thought.");
    expect(ui("think-body").textContent).not.toContain("Stale run thought.");
  });

  it("ignores an older recorded-thinking request when the same run is reselected", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const id = RUNS[0]?.id ?? "missing";
    let resolveFirst: (value: unknown) => void = () => undefined;
    const firstHead = new Promise<unknown>((resolve) => { resolveFirst = resolve; });
    const fresh = new Log();
    fresh.add(0, START);
    fresh.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    fresh.add(2_000, assistant({ turn: 1, thinking: "Fresh same-run thought." }));
    const streams: FakeStream[] = [];
    let headCalls = 0;
    const app = await mountApp(document, {
      fetchJson: (url) => nextRunReply(url) ?? (url === "/api/runs" ? Promise.resolve(RUNS) : url.startsWith("/api/cards") ? Promise.reject(new Error("workbench unavailable")) : url.endsWith("/head") ? (++headCalls === 1 ? firstHead : Promise.resolve(fresh.events.map((event) => ({ ...event, run: id })))) : Promise.reject(new Error(`unexpected ${url}`))),
      sendJson: noWrites,
      openStream: (url) => { const stream = new FakeStream(url); streams.push(stream); queueMicrotask(() => { stream.send("error", {}); }); return stream; },
      now: () => BASE_MS,
      hash: "",
    });
    app.select(id);
    await Promise.resolve();
    await Promise.resolve();
    expect(ui("think-body").textContent).toContain("Fresh same-run thought.");

    const stale = fresh.events.map((event) => event.type === "assistant" ? { ...event, run: id, thinking: "Stale same-run thought." } : { ...event, run: id });
    resolveFirst(stale);
    await Promise.resolve();
    await Promise.resolve();
    expect(ui("think-body").textContent).toContain("Fresh same-run thought.");
    expect(ui("think-body").textContent).not.toContain("Stale same-run thought.");
    expect(streams).toHaveLength(2);
  });

  it("rejects recorded thinking whose events belong to another run", async () => {
    const id = RUNS[0]?.id ?? "missing";
    const foreign = new Log();
    foreign.add(0, START);
    foreign.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    foreign.add(2_000, assistant({ turn: 1, thinking: "Foreign run thought." }));
    const { app } = await harness("", RUNS, null, { [id]: foreign.events.map((event) => ({ ...event, run: "someone-else" })) });
    await Promise.resolve();
    await Promise.resolve();
    app.render();
    expect(ui("think-head").textContent).toContain("LOADING RECORDED THINKING");
    expect(ui("think-body").textContent).not.toContain("Foreign run thought.");
  });

  it("holds a stable thinking-loading state when the head snapshot fails, then trusts the caught-up stream", async () => {
    const { app, streams } = await harness();
    await Promise.resolve();
    const log = new Log();
    log.add(0, START);
    log.add(1_000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    log.add(2_000, assistant({ turn: 1, thinking: "Recorded after catch-up." }));
    feed(must(streams[0]), log.events, false);
    app.tick(100);
    expect(ui("think-head").textContent).toContain("LOADING RECORDED THINKING");
    expect(ui("think-body").textContent).not.toContain("Recorded after catch-up.");
    expect(ui("side-trace").textContent).toContain("loading recorded thinking");
    must(streams[0]).send("caught_up", {});
    app.tick(100);
    expect(ui("think-body").textContent).toContain("Recorded after catch-up.");
  });

  it("says so when there are no runs", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const app = await mountApp(document, {
      fetchJson: () => Promise.resolve([]),
      sendJson: noWrites,
      openStream: () => {
        throw new Error("no stream expected");
      },
      now: () => BASE_MS,
      hash: "",
    });
    expect(app.mode).toBe("idle");
    expect(ui("mode").textContent).toBe("NO RUNS");
  });

  it("rejects a malformed run list", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    await expect(
      mountApp(document, { fetchJson: (url) => nextRunReply(url) ?? Promise.resolve({ nope: 1 }), sendJson: noWrites, openStream: () => new FakeStream("x"), now: () => 0, hash: "" }),
    ).rejects.toThrow("malformed /api/runs");
  });

  it("ignores events for a different run than the one selected", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    const log = new Log();
    log.add(0, START);
    must(streams[0]).send("ev", { ...log.events[0], run: "someone-else" });
    expect(app.view.events).toHaveLength(0);
    expect(ui("problems").textContent).toContain("event for run someone-else");
  });
});

function runRow(id: string, ended: boolean): Record<string, unknown> {
  return { id, model: "think-swarm", started: "x", ended, reason: ended ? "budget" : null, problem: null };
}

describe("run list refresh", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the first run that appears on an idle page", async () => {
    const runs: unknown[] = [];
    const { app, streams } = await harness("#run=2026-10-11T23-30-00_next", runs);
    expect(app.mode).toBe("idle");
    await app.refreshRuns();
    expect(streams).toEqual([]);
    runs.push(runRow("2026-10-11T23-30-00_next", false));
    await app.refreshRuns();
    expect(streams.map((stream) => stream.url)).toEqual(["/api/runs/2026-10-11T23-30-00_next/events?head=1"]);
    expect([...ui("run").querySelectorAll("option")].map((option) => option.value)).toEqual(["2026-10-11T23-30-00_next"]);
  });

  it("follows the next run once the newest run it was showing has ended", async () => {
    const runs: unknown[] = [runRow(M4_ID, true)];
    const { app, streams } = await harness("", runs);
    const first = must(streams[0]);
    feed(first, m4Run());
    first.send("done", {});
    runs.unshift(runRow("2026-10-11T23-30-00_next", false));
    await app.refreshRuns();
    expect(streams.map((stream) => stream.url)).toEqual([`/api/runs/${M4_ID}/events?head=1`, "/api/runs/2026-10-11T23-30-00_next/events?head=1"]);
    expect((ui("run") as HTMLSelectElement).value).toBe("2026-10-11T23-30-00_next");
  });

  it("stays on a run that is still live, or on an older run being replayed", async () => {
    const live: unknown[] = [runRow("2026-10-11T23-00-00_live", false)];
    const watchingLive = await harness("", live);
    live.unshift(runRow("2026-10-11T23-30-00_next", false));
    await watchingLive.app.refreshRuns();
    expect(watchingLive.streams).toHaveLength(1);
    expect((ui("run") as HTMLSelectElement).value).toBe("2026-10-11T23-00-00_live");
    expect([...ui("run").querySelectorAll("option")].map((option) => option.value)).toEqual([
      "2026-10-11T23-30-00_next",
      "2026-10-11T23-00-00_live",
    ]);

    const old: unknown[] = [runRow("2026-10-11T23-00-00_live", false), runRow(M4_ID, true)];
    const replaying = await harness(`#replay=${M4_ID}`, old);
    const stream = must(replaying.streams[0]);
    feed(stream, m4Run());
    stream.send("done", {});
    old.unshift(runRow("2026-10-11T23-30-00_next", false));
    await replaying.app.refreshRuns();
    expect(replaying.streams).toHaveLength(1);
    expect((ui("run") as HTMLSelectElement).value).toBe(M4_ID);
  });

  it("keeps following when the next run is listed before the watched run ends", async () => {
    const runs: unknown[] = [runRow("2026-10-11T23-00-00_live", false)];
    const { app, streams } = await harness("", runs);
    runs.unshift(runRow("2026-10-11T23-30-00_next", false));
    await app.refreshRuns();
    expect(streams).toHaveLength(1);
    const first = must(streams[0]);
    feed(first, m4Run());
    first.send("done", {});
    await app.refreshRuns();
    expect(streams.map((stream) => stream.url)).toEqual([
      "/api/runs/2026-10-11T23-00-00_live/events?head=1",
      "/api/runs/2026-10-11T23-30-00_next/events?head=1",
    ]);
  });

  it("reports a failed refresh without dropping the current run", async () => {
    const runs: unknown[] = [runRow(M4_ID, true)];
    const { app, streams } = await harness("", runs);
    runs.splice(0, 1, "fail");
    await app.refreshRuns();
    expect(streams).toHaveLength(1);
    expect(ui("problems").textContent).toContain("run list: Error: offline");
  });
});

describe("boot", () => {
  it("resolves the frame socket against the viewer origin with the matching WebSocket scheme", () => {
    expect(frameSocketUrl("/api/runs/live/frames", "http://127.0.0.1:8790/watch")).toBe("ws://127.0.0.1:8790/api/runs/live/frames");
    expect(frameSocketUrl("/api/runs/live/frames", "https://viewer.example/watch")).toBe("wss://viewer.example/api/runs/live/frames");
  });
  it("wires the page to fetch, EventSource and a render interval", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const intervals: ((...args: unknown[]) => void)[] = [];
    const streams: FakeStream[] = [];
    const frames: FakeFrameStream[] = [];
    const win = {
      document,
      location: { hash: "", href: "http://127.0.0.1:8790/" },
      fetch: vi.fn((url: string) => (nextRunReply(url) ?? Promise.resolve(RUNS)).then((body) => new Response(JSON.stringify(body)))),
      EventSource: class extends FakeStream {
        constructor(url: string) {
          super(url);
          streams.push(this);
        }
      },
      WebSocket: class extends FakeFrameStream {
        constructor(url: string) { super(url); frames.push(this); }
      },
      Blob,
      URL: { createObjectURL: () => "blob:frame", revokeObjectURL: () => undefined },
      setInterval: (fn: (...args: unknown[]) => void) => {
        intervals.push(fn);
        return 1;
      },
      performance: { now: () => 0 },
    };
    const app = await boot(win);
    expect(win.fetch).toHaveBeenCalledWith("/api/runs");
    expect(streams[0]?.url).toBe("/api/runs/2026-10-11T23-00-00_live/events?head=1");
    expect(frames[0]?.url).toBe("ws://127.0.0.1:8790/api/runs/2026-10-11T23-00-00_live/frames");
    expect(intervals).toHaveLength(3);
    intervals[0]?.();
    expect(app.mode).toBe("loading");
    await vi.waitFor(() => { expect(app.next.draft).not.toBeNull(); });
    intervals[1]?.();
    await vi.waitFor(() => {
      expect(win.fetch.mock.calls.filter(([url]) => url === "/api/runs")).toHaveLength(2);
      expect(win.fetch.mock.calls.filter(([url]) => url === "/api/next-run")).toHaveLength(2);
    });
  });

  it("surfaces an HTTP error from the run list", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const win = {
      document,
      location: { hash: "", href: "http://127.0.0.1:8790/" },
      fetch: vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
      EventSource: FakeStream,
      WebSocket: FakeFrameStream,
      Blob,
      URL: { createObjectURL: () => "blob:frame", revokeObjectURL: () => undefined },
      setInterval: () => 1,
      performance: { now: () => 0 },
    };
    await expect(boot(win)).rejects.toThrow("GET /api/runs returned HTTP 500");
  });
});

// Live discovery and error containment are operator-visible guarantees.
describe("live discovery and diagnostics", () => {
  it("keeps live runs selectable in the dropdown while replaying, without legacy bars", async () => {
    const runs = [runRow("probe_g4", true), runRow("active_model", false)];
    const { streams } = await harness("#run=probe_g4", runs);
    expect(document.querySelector('[data-ui="live-runs"]')).toBeNull();
    const picker = ui("run") as HTMLSelectElement;
    expect(picker.querySelector("option")?.textContent).toContain("LIVE");
    picker.value = "active_model";
    picker.dispatchEvent(new Event("change"));
    expect(streams.at(-1)?.url).toBe("/api/runs/active_model/events?head=1");
  });

  it("bounds diagnostics and clears them on a run switch", async () => {
    const { app, streams } = await harness();
    const stream = must(streams[0]);
    for (let line = 0; line < 250; line++) stream.send("problem", { line, problem: "bad state" });
    expect(ui("problems").textContent.split("\n")).toHaveLength(100);
    expect(ui("problems").textContent).toContain("line 249:");
    expect(ui("problems").textContent).not.toContain("line 0:");
    app.select(M4_ID);
    expect(ui("problems").hidden).toBe(true);
    expect(ui("problems").textContent).toBe("");
  });
});

it("ignores queued callbacks from a stream closed by a run switch", async () => {
  const { app, streams } = await harness();
  const first = must(streams[0]);
  app.select(M4_ID);
  first.send("problem", { line: 20, problem: "stale error" });
  first.send("caught_up", {});
  first.send("done", {});
  first.send("ev", fullRun().events[0]);
  expect(ui("problems").hidden).toBe(true);
  expect(app.mode).toBe("loading");
  expect(app.view.start).toBeNull();
});

it("retains the selected run in the dropdown after discovery refresh without legacy bars", async () => {
  const runs = [runRow("first_live", false), runRow("second_live", false), runRow(M4_ID, true)];
  const { app, streams } = await harness("#run=first_live", runs);
  const picker = ui("run") as HTMLSelectElement;
  expect(picker.value).toBe("first_live");
  picker.value = "second_live";
  picker.dispatchEvent(new Event("change"));
  expect(streams.at(-1)?.url).toBe("/api/runs/second_live/events?head=1");
  await app.refreshRuns();
  expect(picker.value).toBe("second_live");
  expect(document.querySelector('[data-ui="live-runs"]')).toBeNull();
  app.select(M4_ID);
  expect(picker.value).toBe(M4_ID);
  expect(document.querySelector('[data-ui="live-runs"]')).toBeNull();
});


it("renders field observations through the event stream and app", async () => {
  const { streams } = await harness();
  const log = new Log();
  log.add(0, START);
  log.add(1, state({world_context: {
    objects: [{local_id: 1, map_id: [0, 9], graphics_id: 6, sprite_kind: "TWIN", x: 7, y: 2}],
    triggers: [{x: 10, y: 1, elevation: 0, variable: 0x4050, required_value: 0, current_value: 0, condition_met: true, script_pointer: 0x08011000}],
    dialogue: "<wild warning>",
  }}));
  feed(must(streams[0]), log.events);
  const panel = ui("field-context");
  expect(panel.textContent).toContain("TWIN · map 0/9 object 1 at (7,2)");
  expect(panel.textContent).toContain("script tile (10,1): condition matches");
  expect(panel.textContent).toContain("<wild warning>");
  expect(panel.innerHTML).toContain("&lt;wild warning&gt;");
  expect(panel.querySelector("wild")).toBeNull();
});


it("keeps recorded objective events out of the watch view and PokéNav pages", async () => {
  const { app, streams } = await harness();const stream = must(streams[0]);const log = new Log();
  log.add(0, START);
  log.add(100, { type: "objective_update", turn: 1, objective: { id: "objective-1", revision: 1, goal: "Reach gym", title: "Set clock", supports_goal: "Observed instruction", evidence: [0], completion: { kind: "visual", description: "Clock confirms" }, obstacle: "Need facing", next_decision: "Face north", status: "active", completion_evidence: [] } });
  log.add(200, { type: "objective_attempt", turn: 1, attempt: { id: "p1", objective_id: "objective-1", buttons: ["A"], before_seq: 0, after_seq: 1, outcome: "no_change", failure_count: 2, warning: "Reassess approach", retry_justification: null } });
  feed(stream, log.events);
  expect(app.mode).toBe("live");
  for (const selector of ['[data-ui="objective"]', '[data-ui="objective-summary"]', '[data-ui="objective-link"]', ".objective-strip"]) expect(document.querySelector(selector)).toBeNull();
  expect(must(document.querySelector(".watch-deck")).textContent).not.toContain("OBJECTIVE");
  expect(must(document.querySelector(".page-directory")).textContent).not.toContain("OBJECTIVE");
});

it("races the frontier on the split card as soon as a run is picked, without the splits page or a comparisons scan", async () => {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const streams: FakeStream[] = [];
  const requested: string[] = [];
  const frontier = { run: "frontier", milestones: [{name:"PLAYER_NAME_SET", offsetMs:2000}] };
  const app = await mountApp(document, {
    fetchJson: (url) => { requested.push(url); return nextRunReply(url) ?? Promise.resolve(url === "/api/runs" ? RUNS : url.endsWith("/frontier") ? { frontier } : { candidates: [], baseline: null }); },
    sendJson: noWrites,
    openStream: (url) => { const s = new FakeStream(url); streams.push(s); return s; },
    now: () => BASE_MS + 6000,
    hash:"",
  });
  feed(must(streams[0]), fullRun().events);
  await Promise.resolve(); await Promise.resolve();
  app.clock?.seek(BASE_MS + 6000);
  app.tick(0);
  expect(requested.filter((url) => url.endsWith("/frontier"))).toHaveLength(1);
  expect(requested.filter((url) => url.endsWith("/comparisons"))).toEqual([]);
  expect(ui("split-times").innerHTML).toContain('<span class="d r">+0:00:01</span>');
  expect(ui("split-times").textContent).not.toContain("no frontier run");
});

it("keeps a superseded run's frontier off the newly picked run", async () => {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const pending = new Map<string, (value: unknown) => void>();
  const streams: FakeStream[] = [];
  const app = await mountApp(document, {
    fetchJson: (url) => nextRunReply(url) ?? (url === "/api/runs" ? Promise.resolve(RUNS) : url.endsWith("/frontier") ? new Promise((resolve) => pending.set(url, resolve)) : Promise.reject(new Error("unavailable"))),
    sendJson: noWrites,
    openStream: (url) => { const stream = new FakeStream(url); streams.push(stream); return stream; }, now:()=>BASE_MS, hash:"",
  });
  const first = [...pending.keys()][0] ?? "";
  app.select(M4_ID);
  feed(must(streams[1]), fullRun().events);
  must(pending.get(first))({ frontier: { run: "stale", milestones: [{ name: "PLAYER_NAME_SET", offsetMs: 1000 }] } });
  must(pending.get(`/api/runs/${encodeURIComponent(M4_ID)}/frontier`))({ frontier: null });
  await Promise.resolve(); await Promise.resolve();
  app.clock?.seek(BASE_MS + 6000);
  app.tick(0);
  expect(ui("split-times").textContent).toContain("no frontier run to compare yet");
  expect(ui("split-times").textContent).not.toContain("0:00:02");
});

it("loads baseline and frontier when the splits page opens without changing the picker", async () => {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const streams: FakeStream[] = [];
  const reference = { run: "previous", milestones: [{name:"PLAYER_NAME_SET", offsetMs:5000}] };
  const best = { run: "best", milestones: [{name:"PLAYER_NAME_SET", offsetMs:2000}] };
  const app = await mountApp(document, {
    fetchJson: (url) => nextRunReply(url) ?? Promise.resolve(url === "/api/runs" ? RUNS : url.endsWith("/frontier") ? { frontier: best } : { candidates:[reference,best], baseline:reference }),
    sendJson: noWrites,
    openStream: (url) => { const s = new FakeStream(url); streams.push(s); return s; },
    now: () => BASE_MS + 6000,
    hash:"",
  });
  await openSplits();
  feed(must(streams[0]), fullRun().events);
  app.clock?.seek(BASE_MS + 6000);
  app.tick(0);
  expect((ui("baseline") as HTMLSelectElement).value).toBe("previous");
  expect(ui("splits").textContent).toContain("Baseline: previous");
  expect(ui("splits").textContent).toContain("Frontier run: best");
  const row = [...ui("splits").querySelectorAll("tr")].find((r) => r.firstElementChild?.textContent === "player name set (gameplay start)");
  expect([...must(row).querySelectorAll("td")].map((td) => td.textContent)).toEqual(["player name set (gameplay start)", "0:00:03", "0:00:05−0:01", "0:00:02+0:01"]);
});

it("does not apply comparisons from a superseded run selection", async () => {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const pending: ((value: unknown) => void)[] = [];
  const streams: FakeStream[] = [];
  const app = await mountApp(document, {
    fetchJson: (url) => nextRunReply(url) ?? (url === "/api/runs" ? Promise.resolve(RUNS) : url.startsWith("/api/cards") || url.endsWith("/head") ? Promise.reject(new Error("optional snapshot unavailable")) : url.endsWith("/frontier") ? Promise.resolve({ frontier: null }) : new Promise((resolve) => pending.push(resolve))),
    sendJson: noWrites,
    openStream: (url) => { const stream = new FakeStream(url); streams.push(stream); return stream; }, now:()=>BASE_MS, hash:"",
  });
  await openSplits();
  app.select(M4_ID);
  feed(must(streams[1]), fullRun().events);
  must(pending[1])({candidates:[],baseline:null});
  must(pending[0])({candidates:[{run:"stale",milestones:[]}],baseline:{run:"stale",milestones:[]}});
  await Promise.resolve();
  app.clock?.seek(BASE_MS + 6000);
  app.tick(0);
  expect((ui("baseline") as HTMLSelectElement).value).toBe("");
  expect(ui("splits").textContent).toContain("Frontier run: none eligible");
  expect(ui("splits").textContent).not.toContain("stale");
});

it("offers only eligible references and preserves none while comparisons are pending", async () => {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const pending: ((value:unknown)=>void)[] = [];
  const streams: FakeStream[] = [];
  const app = await mountApp(document, {
    fetchJson:(url)=>nextRunReply(url) ?? (url === "/api/runs" ? Promise.resolve(RUNS) : url.startsWith("/api/cards") || url.endsWith("/head") ? Promise.reject(new Error("optional snapshot unavailable")) : url.startsWith("/sprites/") ? Promise.reject(new Error("no card art")) : url.endsWith("/frontier") ? Promise.resolve({frontier:{run:"best",milestones:[{name:"PLAYER_NAME_SET",offsetMs:2000}]}}) : new Promise((resolve)=>pending.push(resolve))),
    sendJson: noWrites,
    openStream:(url)=>{const s=new FakeStream(url);streams.push(s);return s;},now:()=>BASE_MS,hash:"",
  });
  await openSplits();
  feed(must(streams[0]),fullRun().events);
  const picker=ui("baseline") as HTMLSelectElement;
  expect([...picker.options].map((o)=>o.value)).toEqual([""]);
  picker.value="";
  picker.dispatchEvent(new Event("change"));
  must(pending[0])({candidates:[{run:"automatic",milestones:[]}],baseline:{run:"automatic",milestones:[]}});
  await Promise.resolve();
  app.clock?.seek(BASE_MS+6000);
  app.tick(0);
  expect(picker.value).toBe("");
  expect([...picker.options].map((o)=>o.value)).toEqual(["", "automatic"]);
  expect(ui("splits").textContent).toContain("Baseline: none eligible");
  expect(ui("splits").textContent).toContain("Frontier run: best");
});

it.each(["planning","cycle"] as const)("shows parsed %s loop phases with attribution on timeline and the agent trace", async (kind) => {
  const { app, streams, setNow } = await harness();
  const log = new Log(); log.add(0, START);
  log.add(100, {type:"tool_call",turn:1,id:"plan-1",name:"update_objective",args:{}});
  for (const [index,phase] of (["warning","recovered","stop"] as const).entries()) {
    log.add(1000+index*1000,{type:"loop_guard",turn:1,kind,phase,message:"Six plans <without> action",calls:6,evidence:[1]});
  }
  setNow(BASE_MS+3000); feed(must(streams[0]),log.events.map((event) => parseEvent(JSON.stringify(event))));
  for (const label of [`${kind === "planning" ? "Planning stall" : "Short cycle"} warning`,`${kind === "planning" ? "Planning stall" : "Short cycle"} recovered`,`${kind === "planning" ? "Planning stall" : "Short cycle"} stop`]) {
    expect(ui("lanes").innerHTML).toContain(label);
    expect(ui("trace").textContent).toContain(label);
  }
  for (const fragment of ["update_objective", "6 completed calls", "turn 1", "#1", "0:00:03", "Six plans <without> action"]) {
    expect(ui("lanes").textContent).toContain(fragment);
    expect(ui("trace").textContent).toContain(fragment);
  }
  expect(ui("lanes").querySelectorAll(`[role="img"][aria-label^="${kind === 'planning' ? 'Planning stall' : 'Short cycle'}"]`)).toHaveLength(3);
  expect(ui("trace").querySelector('[data-seqs~="3"] .st.error')).toBeNull();
  const stop = ui("trace").querySelector<HTMLElement>('[data-seqs~="4"]');
  if (stop === null) throw new Error("missing stop history row");
  stop.click(); expect(ui("inspector").textContent).toContain('"phase": "stop"');
  expect(app.mode).toBe("live");
});

it("clears a future stop inspection when replay rewinds its history", async () => {
  const { app, streams } = await harness();
  const log=new Log(); log.add(0,START);
  const stop=log.add(1000,{type:"loop_guard",turn:3,kind:"planning",phase:"stop",message:"Bounded recovery ended",calls:14,evidence:[28,43]});
  const end=fullRun().events.findLast((event)=>event.type==="run_end");
  if (end === undefined) throw new Error("missing terminal fixture");
  const events=[log.events[0],{...stop,seq:44},{...end,seq:48,t:stop.t}].map((event)=>parseEvent(JSON.stringify(event)));
  feed(must(streams[0]),events,false); must(streams[0]).send("done",{});
  const row=ui("trace").querySelector<HTMLElement>('[data-seqs~="44"]');
  if(row===null)throw new Error("missing replay stop"); row.click();
  expect(ui("inspector").textContent).toContain('"seq": 44');
  const scrub=ui("scrub") as HTMLInputElement; scrub.value="0";scrub.dispatchEvent(new Event("input"));
  expect(ui("lanes").textContent).not.toContain("Planning stall stop");
  expect(ui("trace").querySelector('[data-seqs~="44"]')).toBeNull();
  expect(ui("inspector").textContent).not.toContain('"seq": 44');
  expect(ui("inspector").textContent).toContain("select a trace row");
  expect(app.clock?.fraction).toBe(0);
});

it("keeps passive would-stop truthful on both the agent trace and timeline",async()=>{
 const {app,streams,setNow}=await harness();const log=new Log();log.add(0,START);log.add(100,{type:"tool_call",turn:1,id:"plan",name:"get_objectives",args:{}});
 for(const [index,phase] of (["would_warn","would_stop","would_recover"] as const).entries())log.add(1000+index*1000,{type:"loop_guard",turn:1,kind:"planning",mode:"diagnostic",phase,message:"Counterfactual <threshold>",calls:12,evidence:[1]});
 setNow(BASE_MS+3000);feed(must(streams[0]),log.events.map(e=>parseEvent(JSON.stringify(e))));
 expect(ui("lanes").textContent).toContain("diagnostic: would stop");expect(ui("trace").textContent).toContain("diagnostic: would stop");expect(ui("trace").querySelectorAll(".st.error")).toHaveLength(0);expect(ui("inspector").textContent).not.toContain("run ended: stuck");expect(app.mode).toBe("live");
});

it("shows explicit evaluation target/cap and native terminal proof in history and timeline", async()=>{
 const {streams}=await harness();const log=new Log();
 const start=log.add(0,START);const observed=log.add(500,state(NAME_CONFIRMED));const milestone=log.add(600,{type:"milestone",turn:1,name:"PLAYER_NAME_CONFIRMED",kind:"story",origin:"observed",server_timestamp:0,evidence:[observed.seq]});const end=fullRun().events.findLast(event=>event.type==="run_end");if(end===undefined)throw new Error("missing terminal fixture");
 const events=[{...start,evaluation:{preset_id:"name-control",target:"PLAYER_NAME_CONFIRMED",failure_limit:3,flags:{loopGuard:false,activeUi:true,interfaceDocs:true,objectives:true}},budgets:{max_turns:300,max_wall_ms:600000}},observed,milestone,{...end,seq:3,t:milestone.t,reason:"milestone",target_proof:{name:"PLAYER_NAME_CONFIRMED",milestone_seq:milestone.seq,state_evidence:[observed.seq]}}].map(event=>parseEvent(JSON.stringify(event)));
 feed(must(streams[0]),events,false);must(streams[0]).send("done",{});
 expect(ui("trace").textContent).toContain("native target PLAYER_NAME_CONFIRMED");expect(ui("lanes").textContent).toContain("native target PLAYER_NAME_CONFIRMED");
 expect(ui("run-details").textContent).toContain('"preset_id": "name-control"');expect(ui("budgets").textContent).toContain("0:10:00");
});

it("mounts state-input and host-wait history, the snapshot timeline mark, selected inspector and frame ingress",async()=>{
 const {app,streams}=await harness(`#replay=${M4_ID}`);const stream=must(streams[0]);const log=new Log();log.add(0,START);const s=log.add(10,state());
 const input=log.add(20,{type:"decision_input",turn:0,decision_turn:1,state_seq:s.seq,text:"CURRENT <clock> at (5,1)",frames:[{path:"frames/000002_0.png",sha1:"a".repeat(40)}]});
 const wait=log.add(30,{type:"wait_input",turn:1,tool_call_id:"wait-one",duration_ms:60});
 log.add(70000,{type:"run_end",turn:1,reason:"budget",furthest_milestone:null,turns:1,wall_ms:70000,tokens:{input:0,output:0},frames:{saved:1,bytes:100}});
 feed(stream,log.events.map(e=>parseEvent(JSON.stringify(e))));stream.send("done",{});app.tick(100);
 expect(ui("screen").getAttribute("href")).toBe(`/api/runs/${M4_ID}/frames/000002_0.png`);
 const inputRow=must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(input.seq)}"]`));expect(inputRow.textContent).toContain("snapshot for decision 1");
 expect(ui("lanes").querySelectorAll('[aria-label*="snapshot for decision 1"]')).toHaveLength(1);
 inputRow.click();expect(ui("inspector").textContent).toContain('"type": "decision_input"');expect(ui("inspector").textContent).toContain("CURRENT <clock> at (5,1)");expect(ui("inspector").querySelector("clock")).toBeNull();
 const waitRow=must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(wait.seq)}"]`));expect(waitRow.textContent).toContain("WAIT 60 ms (host time)");
 expect(ui("lanes").querySelectorAll('[aria-label*="WAIT 60 ms (host time)"]')).toHaveLength(0);
 waitRow.click();expect(ui("inspector").textContent).toContain('"type": "wait_input"');expect(ui("inspector").textContent).toContain('"duration_ms": 60');expect(ui("inspector").textContent).toContain("wait-one");expect(waitRow.classList.contains("sel")).toBe(true);
 app.tick(70000);expect(ui("lanes").querySelectorAll('[aria-label*="WAIT 60 ms (host time)"]')).toHaveLength(0);
 expect(ui("trace").querySelector(`[data-seqs~="${String(wait.seq)}"]`)?.textContent).toContain("WAIT 60 ms (host time)");

});
it("links the push-back and battle observation cards in Harness Config to their explainers",async()=>{
 const ids=["pushback-loop-detection-v1","pushback-press-result-v1","battle-observation-loop-v1","ineffective-loops-v1"] as const;
 const {app,streams}=await harness(`#replay=${M4_ID}`);const log=new Log();log.add(0,{...START,harness_features:[...ids]});feed(must(streams[0]),log.events);
 app.next.registry=ids.map(id=>({id,title:id.toUpperCase(),description:`${id} card.`,group:"guard" as const,switchable:true,needs:null}));app.tick(1000);
 for(const id of ids){
  const link=must(ui("harness-config").querySelector<HTMLAnchorElement>(`[data-feature="${id}"] a`));
  expect(link.getAttribute("href"),id).toBe(`/explainers/${id}.html`);expect(link.textContent).toContain("READ EXPLAINER");
 }
});

it("mounts the push-back and battle observation guard notices in the timeline, Activity History and inspector, and follows the replay cursor",async()=>{
 const {PUSHBACK_MESSAGE}=await import("../../agent/src/loop-detection.js");
 const {app,streams}=await harness(`#replay=${M4_ID}`);const stream=must(streams[0]);const log=new Log();log.add(0,START);
 log.add(1000,{type:"tool_call",turn:146,id:"c146",name:"press",args:{buttons:["UP"]}});
 // The sh02 receipts (pushback-loop-detection-v1 T146, battle-observation-loop-v1 T452) as the recorder writes them.
 const warning=log.add(2000,{type:"loop_guard",turn:146,kind:"cycle",mode:"enforced",phase:"warning",message:PUSHBACK_MESSAGE,calls:11,evidence:[2973,3062]});
 const supervisor=log.add(2000,{type:"loop_guard",turn:146,kind:"cycle",mode:"enforced",phase:"supervisor",message:"SUPERVISOR: You are currently looping. You keep repeating the same short cycle of actions.",calls:11,evidence:[2973,3062]});
 const battle=log.add(9000,{type:"loop_guard",turn:452,kind:"observation",mode:"enforced",phase:"warning",message:"Repeated observations contain no new reliable game information.",calls:24,evidence:[10079]});
 log.add(70000,{type:"run_end",turn:452,reason:"budget",furthest_milestone:null,turns:452,wall_ms:70000,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
 feed(stream,log.events.map(e=>parseEvent(JSON.stringify(e))));stream.send("done",{});
 app.tick(1999);
 expect(ui("trace").querySelector(`[data-seqs~="${String(warning.seq)}"]`)).toBeNull();
 app.tick(9000);
 const row=must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(warning.seq)}"]`));
 expect(row.textContent).toContain("Loop guard · cycle warning");expect(row.textContent).toContain("A game script keeps returning the player");
 expect(must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(supervisor.seq)}"]`)).textContent).toContain("SUPERVISOR: You are currently looping.");
 expect(must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(battle.seq)}"]`)).textContent).toContain("Repeated observations contain no new reliable game information.");
 expect(ui("lanes").querySelectorAll('[aria-label*="A game script keeps returning the player"]').length).toBeGreaterThan(0);
 row.click();expect(ui("inspector").textContent).toContain('"type": "loop_guard"');expect(ui("inspector").textContent).toContain('"kind": "cycle"');expect(ui("inspector").textContent).toContain("2973");expect(row.classList.contains("sel")).toBe(true);
});

it("mounts the ineffective loops notices in Activity History and the inspector at the replay cursor (ineffective-loops-v1)",async()=>{
 const {REVISIT_MESSAGE,WAITING_MESSAGE}=await import("../../agent/src/loop-detection.js");
 const {app,streams}=await harness(`#replay=${M4_ID}`);const stream=must(streams[0]);const log=new Log();log.add(0,START);
 log.add(1000,{type:"tool_call",turn:212,id:"c212",name:"navigate_to",args:{map_id:[0,18],x:45,y:6}});
 // The 4caa Route 103 receipt (T212, evidence 5057 and 5121) and a waiting-observe warning, as the recorder writes them.
 const warning=log.add(2000,{type:"loop_guard",turn:212,kind:"cycle",mode:"enforced",phase:"warning",message:REVISIT_MESSAGE,calls:20,evidence:[5057,5121]});
 const recovered=log.add(5000,{type:"loop_guard",turn:215,kind:"cycle",mode:"enforced",phase:"recovered",message:REVISIT_MESSAGE,calls:23,evidence:[5057,5224]});
 const waiting=log.add(9000,{type:"loop_guard",turn:16,kind:"observation",mode:"enforced",phase:"warning",message:WAITING_MESSAGE,calls:30,evidence:[145]});
 log.add(70000,{type:"run_end",turn:216,reason:"budget",furthest_milestone:null,turns:216,wall_ms:70000,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});
 feed(stream,log.events.map(e=>parseEvent(JSON.stringify(e))));stream.send("done",{});
 app.tick(1999);
 expect(ui("trace").querySelector(`[data-seqs~="${String(warning.seq)}"]`)).toBeNull();
 app.tick(9000);
 const row=must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(warning.seq)}"]`));
 expect(row.textContent).toContain("Loop guard · cycle warning");expect(row.textContent).toContain("keep ending on the same one or two tiles");
 expect(must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(recovered.seq)}"]`)).textContent).toContain("cycle recovered");
 expect(must(ui("trace").querySelector<HTMLElement>(`[data-seqs~="${String(waiting.seq)}"]`)).textContent).toContain("open menu, prompt or message waiting for your input");
 row.click();expect(ui("inspector").textContent).toContain('"type": "loop_guard"');expect(ui("inspector").textContent).toContain("5057");expect(ui("inspector").textContent).toContain("5121");expect(row.classList.contains("sel")).toBe(true);
});

it('labels human comparison candidates with unverified ROM provenance',async()=>{
 document.body.innerHTML=PAGE.slice(PAGE.indexOf('<body>')+6,PAGE.indexOf('</body>'));
 const app=await mountApp(document,{fetchJson:url=>nextRunReply(url) ?? Promise.resolve(url==='/api/runs'?RUNS:{candidates:[{run:'human-unknown',milestones:[],controller:{kind:'human',name:'Operator'},romIdentity:'unverified'},{run:'human-verified',milestones:[],controller:{kind:'human',name:'Operator'},romIdentity:'verified'}],baseline:null}),sendJson:noWrites,openStream:url=>new FakeStream(url),now:()=>BASE_MS,hash:''});
  await openSplits();
 await Promise.resolve();expect(ui('baseline').textContent).toContain('human-unknown (ROM unverified)');expect(ui('baseline').textContent).toContain('human-verified');expect(ui('baseline').textContent).not.toContain('human-verified (ROM unverified)');app.tick(0);
});

it("opens the requested run stream without scanning historical comparisons or feature history",async()=>{
 document.body.innerHTML=PAGE.slice(PAGE.indexOf("<body>")+6,PAGE.indexOf("</body>"));const requested:string[]=[],streams:FakeStream[]=[];
 await mountApp(document,{fetchJson:url=>{requested.push(url);return nextRunReply(url)??Promise.resolve(url==="/api/runs"?RUNS:{candidates:[],baseline:null});},sendJson:noWrites,openStream:url=>{const stream=new FakeStream(url);streams.push(stream);return stream;},now:()=>BASE_MS,hash:`#replay=${M4_ID}`});
 await Promise.resolve();await Promise.resolve();
 expect(streams.map(s=>s.url)).toEqual([`/api/runs/${M4_ID}/events?head=1`]);expect(requested.filter(url=>url.endsWith("/comparisons")||url.endsWith("/history"))).toEqual([]);
 document.querySelector<HTMLButtonElement>('[data-page="splits"]')?.click();await Promise.resolve();
 expect(requested.filter(url=>url.endsWith("/comparisons"))).toEqual([`/api/runs/${M4_ID}/comparisons`]);
 document.querySelector<HTMLButtonElement>('[data-page="splits"]')?.click();await Promise.resolve();
 expect(requested.filter(url=>url.endsWith("/comparisons"))).toHaveLength(1);
});

it("opens the selected run configuration without changing playback or writing next-run settings",async()=>{
 const {app,streams}=await harness(`#replay=${M4_ID}`);const log=new Log();log.add(0,{...START,model:{...START.model,id:"recorded-current-model"},harness_features:["navigation-evidence-memory-v1"]});feed(must(streams[0]),log.events);app.next.registry=[{id:"navigation-evidence-memory-v1",title:"NAVIGATION MEMORY",description:"Retains observed facts only.",group:"guidance",switchable:true,needs:null}];app.tick(1000);
 expect(ui("harness-config").querySelector('[data-tool="press"]')?.textContent).toContain("buttons: required array of 1–8");
 expect(ui("harness-config").textContent).toContain("Retains observed facts only.");expect(ui("harness-config").querySelector("a")?.getAttribute("href")).toBe("/explainers/navigation-evidence-memory-v1.html");
 const clock=app.clock;must(document.querySelector<HTMLButtonElement>('[data-page="config"]')).click();
 expect(document.querySelector<HTMLElement>('[data-nav-page="config"]')?.hidden).toBe(false);expect(ui("harness-config").textContent).toContain("recorded-current-model");expect(ui("harness-config").textContent).toContain("navigation-evidence-memory-v1");expect(ui("harness-config").querySelector("input,select,textarea,button,form")).toBeNull();expect(app.clock).toBe(clock);expect(streams).toHaveLength(1);
});


it("filters harness features by literal name or ID and retains search through live rendering",async()=>{
 const {app,streams}=await harness();const log=new Log();log.add(0,START);feed(must(streams[0]),log.events);
 app.next.registry=[{id:"navigation-evidence-memory-v1",title:"Navigation Memory",description:"Retains facts.",group:"guidance",switchable:true,needs:null},{id:"deterministic-loop-guard-v1",title:"Loop Guard",description:"Navigation Memory appears in this description only.",group:"guard",switchable:true,needs:null}];app.tick(1000);
 const search=must(document.querySelector<HTMLInputElement>('[data-ui="feature-search"]'));
 expect(search.labels?.[0]?.textContent).toBe("FIND A FEATURE");expect(search.hasAttribute("aria-label")).toBe(false);
 const visible=()=>Array.from(ui("harness-config").querySelectorAll<HTMLElement>(".config-feature")).filter(card=>!card.hidden).map(card=>card.dataset.feature);
 const filter=(value:string)=>{search.value=value;search.dispatchEvent(new Event("input"));};
 search.focus();filter("navigation memory");expect(visible()).toEqual(["navigation-evidence-memory-v1"]);
 expect(ui("feature-search-results").textContent).toBe("1 matching feature");
 const guard=must(ui("harness-config").querySelector<HTMLElement>('[data-feature="deterministic-loop-guard-v1"]'));expect(guard.closest<HTMLElement>(".config-group")?.hidden).toBe(true);
 app.next.registry=[...app.next.registry,{id:"bounded-navigation-v1",title:"Extra",description:"New catalog entry.",group:"guidance",switchable:true,needs:null}];app.tick(2000);
 expect(document.activeElement).toBe(search);expect(search.value).toBe("navigation memory");expect(visible()).toEqual(["navigation-evidence-memory-v1"]);
 filter("DETERMINISTIC-LOOP-GUARD-v1");expect(visible()).toEqual(["deterministic-loop-guard-v1"]);
 filter("nvgtn");expect(visible()).toEqual([]);expect(ui("feature-search-results").textContent).toBe("No matching features");
 filter("[");expect(visible()).toEqual([]);
 filter("");expect(visible()).toContain("bounded-navigation-v1");expect(visible()).toContain("deterministic-loop-guard-v1");
 expect(Array.from(ui("harness-config").querySelectorAll<HTMLElement>(".config-group")).every(group=>!group.hidden)).toBe(true);expect(streams).toHaveLength(1);
});

describe("agent trace page", () => {
  const traceRows = (): HTMLElement[] => [...ui("trace").querySelectorAll<HTMLElement>("[data-key]")];
  const chipButton = (id: string): HTMLButtonElement => must(ui("trace-chips").querySelector<HTMLButtonElement>(`[data-chip="${id}"]`));

  it("replaces ACTIVITY HISTORY with the agent trace, newest turn first, with chip counts", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    expect(document.querySelector('[data-page="activity"]')).toBeNull();
    const nav = must(document.querySelector<HTMLButtonElement>('[data-page="trace"]'));
    expect(nav.textContent).toBe("AGENT TRACE");
    nav.click();
    expect(document.querySelector<HTMLElement>('[data-nav-page="trace"]')?.hidden).toBe(false);
    const heads = [...ui("trace").querySelectorAll(".turn-h")].map((h) => h.firstChild?.textContent?.trim());
    expect(heads[0]).toBe("TURN 4");
    expect(heads.at(-1)).toBe("RUN START");
    const think = chipButton("think");
    expect(think.textContent).toMatch(/^THINKING \d+$/);
    expect(think.getAttribute("aria-pressed")).toBe("true");
    expect(chipButton("eng").getAttribute("aria-pressed")).toBe("false");
  });

  it("filters rows by chip and puts them back", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    expect(ui("trace").querySelector('[data-c="think"]')).not.toBeNull();
    chipButton("think").click();
    expect(chipButton("think").getAttribute("aria-pressed")).toBe("false");
    expect(ui("trace").querySelector('[data-c="think"]')).toBeNull();
    chipButton("think").click();
    expect(ui("trace").querySelector('[data-c="think"]')).not.toBeNull();
  });

  it("keeps opened rows, folded results and the selection across live updates (INV-5)", async () => {
    const { app, streams, setNow } = await harness();
    const events = fullRun().events;
    feed(must(streams[0]), events.slice(0, 10));
    setNow(BASE_MS + 3_300);
    app.tick(100);
    const tool = must(ui("trace").querySelector<HTMLDetailsElement>('details[data-key="5"]'));
    tool.open = true;
    must(tool.querySelector<HTMLDetailsElement>("details.res-d")).open = false;
    must(tool.querySelector("summary")).click();
    tool.open = true;
    expect(ui("inspector").textContent).toContain('"type": "tool_result"');
    const chip = must(ui("trace-chips").querySelector('[data-chip="think"]'));
    feed(must(streams[0]), events.slice(10, 12), false);
    setNow(BASE_MS + 8_100);
    app.tick(100);
    // A newer turn arriving leaves turn 1's elements and the chip buttons untouched.
    expect(ui("trace").querySelector('details[data-key="5"]')).toBe(tool);
    expect(ui("trace-chips").querySelector('[data-chip="think"]')).toBe(chip);
    expect(chip.textContent).toBe("THINKING 2");
    // A new event in turn 1 redraws that turn and keeps what was opened, folded and selected.
    const late = new Log();
    late.events.push(...events.slice(0, 12));
    feed(must(streams[0]), [late.add(8_050, { type: "retry", turn: 1, reason: "late", attempt: 1, limit: 3 })], false);
    app.tick(100);
    const again = must(ui("trace").querySelector<HTMLDetailsElement>('details[data-key="5"]'));
    expect(again).not.toBe(tool);
    expect(again.open).toBe(true);
    expect(must(again.querySelector<HTMLDetailsElement>("details.res-d")).open).toBe(false);
    expect(again.classList.contains("sel")).toBe(true);
  });

  it("keeps the row being read in place when turns change above or below it", async () => {
    const { app, streams, setNow } = await harness();
    const log = new Log();
    log.add(0, START);
    for (let turn = 1; turn <= 70; turn += 1) log.add(turn * 10, assistantAt(turn));
    feed(must(streams[0]), log.events);
    setNow(BASE_MS + 1_000);
    app.tick(10);
    const box = ui("trace");
    const items = (): HTMLElement[] => [...box.querySelectorAll<HTMLElement>(".turn-h, [data-key]")];
    const rect = (top: number): DOMRect => ({ top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: top, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === box ? rect(0) : rect(items().indexOf(this) * 20 - box.scrollTop);
    });
    try {
      box.scrollTop = 400;
      const reading = must(items().find((el) => el.getBoundingClientRect().bottom > 0));
      const offset = reading.getBoundingClientRect().top;
      must(box.querySelector<HTMLButtonElement>("[data-trace-more]")).click();
      expect(box.querySelectorAll(".turn-h")).toHaveLength(70);
      expect(reading.getBoundingClientRect().top).toBe(offset);
      feed(must(streams[0]), [log.add(800, assistantAt(71))], false);
      app.tick(10);
      expect(reading.isConnected).toBe(true);
      expect(reading.getBoundingClientRect().top).toBe(offset);
      // At the top the newest turn shows, unless the pointer is over the list.
      box.scrollTop = 0;
      const top = must(items()[0]);
      feed(must(streams[0]), [log.add(810, assistantAt(72))], false);
      app.tick(10);
      expect(top.getBoundingClientRect().top).toBeGreaterThan(0);
      box.scrollTop = 0;
      const held = must(items()[0]);
      box.dispatchEvent(new Event("mouseenter"));
      feed(must(streams[0]), [log.add(820, assistantAt(73))], false);
      app.tick(10);
      expect(held.getBoundingClientRect().top).toBe(0);
      box.dispatchEvent(new Event("mouseleave"));
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps a row open when a chip hides its turn and shows it again", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    const row = must(ui("trace").querySelector<HTMLDetailsElement>('details[data-c="think"]'));
    const key = must(row.dataset.key);
    row.open = true;
    await new Promise((resolve) => setTimeout(resolve, 0));
    const on = [...ui("trace-chips").querySelectorAll<HTMLButtonElement>('[data-chip][aria-pressed="true"]')];
    for (const chip of on) chip.click();
    expect(ui("trace").querySelector("[data-key]")).toBeNull();
    must(on.find((chip) => chip.dataset.chip === "think")).click();
    const again = must(ui("trace").querySelector<HTMLDetailsElement>(`details[data-key="${key}"]`));
    expect(again).not.toBe(row);
    expect(again.open).toBe(true);
  });

  it("ignores the scroll its own redraw makes while holding a list at the top", async () => {
    const { app, streams, setNow } = await harness();
    const log = new Log();
    log.add(0, START);
    for (let turn = 1; turn <= 5; turn += 1) log.add(turn * 10, assistantAt(turn));
    feed(must(streams[0]), log.events);
    setNow(BASE_MS + 1_000);
    app.tick(10);
    const box = ui("trace");
    const items = (): HTMLElement[] => [...box.querySelectorAll<HTMLElement>(".turn-h, [data-key]")];
    const rect = (top: number): DOMRect => ({ top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: top, toJSON: () => ({}) });
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === box ? rect(0) : rect(items().indexOf(this) * 20 - box.scrollTop);
    });
    // A browser may fire scroll as soon as scrollTop is set; this list does exactly that.
    let top = 0;
    Object.defineProperty(box, "scrollTop", { configurable: true, get: () => top, set: (value: number) => { top = value; box.dispatchEvent(new Event("scroll")); } });
    try {
      box.dispatchEvent(new Event("mouseenter"));
      feed(must(streams[0]), [log.add(800, assistantAt(6))], false);
      app.tick(10);
      expect(box.scrollTop).toBe(40);
      box.dispatchEvent(new Event("scroll"));
      box.dispatchEvent(new Event("mouseleave"));
      expect(box.scrollTop).toBe(0);
      // The snap back is the viewer's own scroll too: a new hold at the top survives its late scroll event.
      box.dispatchEvent(new Event("mouseenter"));
      box.dispatchEvent(new Event("scroll"));
      feed(must(streams[0]), [log.add(810, assistantAt(7))], false);
      app.tick(10);
      box.dispatchEvent(new Event("mouseleave"));
      expect(box.scrollTop).toBe(0);
      // The reader's own wheel cancels the return.
      box.dispatchEvent(new Event("mouseenter"));
      box.dispatchEvent(new Event("wheel"));
      feed(must(streams[0]), [log.add(820, assistantAt(8))], false);
      app.tick(10);
      box.dispatchEvent(new Event("mouseleave"));
      expect(box.scrollTop).toBe(40);
    } finally {
      spy.mockRestore();
    }
  });

  it("keeps COLLAPSE ALL and EXPAND ALL through a redraw", async () => {
    const { app, streams, setNow } = await harness();
    const events = fullRun().events;
    feed(must(streams[0]), events.slice(0, 10));
    setNow(BASE_MS + 3_300);
    app.tick(100);
    // Stand-in for the browser's queued toggle events: none reach the lists before the redraw.
    const hold = (event: Event): void => { event.stopImmediatePropagation(); };
    window.addEventListener("toggle", hold, true);
    must(ui("trace-chips").querySelector<HTMLButtonElement>("[data-trace-expand]")).click();
    window.removeEventListener("toggle", hold, true);
    const late = new Log();
    late.events.push(...events.slice(0, 10));
    feed(must(streams[0]), [late.add(3_400, { type: "retry", turn: 1, reason: "late", attempt: 1, limit: 3 })], false);
    app.tick(100);
    expect(must(ui("trace").querySelector<HTMLDetailsElement>('details[data-key="5"]')).open).toBe(true);
    window.addEventListener("toggle", hold, true);
    must(ui("trace-chips").querySelector<HTMLButtonElement>("[data-trace-collapse]")).click();
    window.removeEventListener("toggle", hold, true);
    feed(must(streams[0]), [late.add(3_500, { type: "retry", turn: 1, reason: "later", attempt: 2, limit: 3 })], false);
    app.tick(100);
    expect(must(ui("trace").querySelector<HTMLDetailsElement>('details[data-key="5"]')).open).toBe(false);
  });

  it("opens the side panel's copy of a row opened on the trace page", async () => {
    const { app, streams, setNow } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 10));
    setNow(BASE_MS + 3_300);
    app.tick(100);
    must(ui("trace").querySelector<HTMLElement>('details[data-key="5"] > summary')).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(must(ui("side-trace").querySelector<HTMLDetailsElement>('details[data-key="5"]')).open).toBe(true);
    must(ui("trace").querySelector<HTMLElement>('details[data-key="5"] details.res-d > summary')).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(must(ui("side-trace").querySelector<HTMLDetailsElement>('details[data-key="5"] details.res-d')).open).toBe(false);
  });

  it("goes back to the newest turn when the pointer leaves a list it held at the top", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    const box = ui("trace");
    box.dispatchEvent(new Event("mouseenter"));
    box.scrollTop = 120;
    box.dispatchEvent(new Event("mouseleave"));
    expect(box.scrollTop).toBe(0);
    box.scrollTop = 120;
    box.dispatchEvent(new Event("mouseenter"));
    box.dispatchEvent(new Event("mouseleave"));
    expect(box.scrollTop).toBe(120);
    box.scrollTop = 0;
    box.dispatchEvent(new Event("mouseenter"));
    box.scrollTop = 300;
    box.dispatchEvent(new Event("scroll"));
    box.dispatchEvent(new Event("mouseleave"));
    expect(box.scrollTop).toBe(300);
  });

  it("remembers a row opened by a click even if a redraw lands before its toggle event", async () => {
    const { app, streams, setNow } = await harness();
    const events = fullRun().events;
    feed(must(streams[0]), events.slice(0, 10));
    setNow(BASE_MS + 3_300);
    app.tick(100);
    const tool = must(ui("trace").querySelector<HTMLDetailsElement>('details[data-key="5"]'));
    const summary = must(tool.querySelector("summary"));
    // Stand-in for the browser's queued toggle: the click lands, the toggle event has not fired yet.
    summary.addEventListener("click", (event) => { event.preventDefault(); });
    summary.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(tool.open).toBe(false);
    const late = new Log();
    late.events.push(...events.slice(0, 10));
    feed(must(streams[0]), [late.add(3_400, { type: "retry", turn: 1, reason: "late", attempt: 1, limit: 3 })], false);
    app.tick(100);
    const again = must(ui("trace").querySelector<HTMLDetailsElement>('details[data-key="5"]'));
    expect(again).not.toBe(tool);
    expect(again.open).toBe(true);
  });

  it("collapses and expands every row", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    must(ui("trace-chips").querySelector<HTMLButtonElement>("[data-trace-expand]")).click();
    const rows = [...ui("trace").querySelectorAll<HTMLDetailsElement>("details[data-key]")];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.open)).toBe(true);
    must(ui("trace-chips").querySelector<HTMLButtonElement>("[data-trace-collapse]")).click();
    expect(rows.every((row) => !row.open)).toBe(true);
  });

  it("renders the newest 50 turns and shows older turns on demand", async () => {
    const { app, streams, setNow } = await harness();
    const log = new Log();
    log.add(0, START);
    for (let turn = 1; turn <= 60; turn += 1) log.add(turn * 10, assistantAt(turn));
    feed(must(streams[0]), log.events);
    setNow(BASE_MS + 1_000);
    app.tick(10);
    expect(ui("trace").querySelectorAll(".turn-h")).toHaveLength(50);
    must(ui("trace").querySelector<HTMLButtonElement>("[data-trace-more]")).click();
    expect(ui("trace").querySelectorAll(".turn-h")).toHaveLength(60);
    expect(traceRows().length).toBe(60);
  });

  it("streams the live turn's thinking open at the top of the trace", async () => {
    const { app, streams, setNow } = await harness();
    const log = new Log();
    log.add(0, START);
    log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    log.add(1100, { type: "assistant_delta", turn: 1, thinking: "Look <left> first.", text: "" });
    feed(must(streams[0]), log.events);
    setNow(BASE_MS + 2_500);
    app.tick(100);
    const first = must(ui("trace").firstElementChild);
    expect(first.textContent).toContain("TURN 1");
    expect(ui("trace").querySelector("[data-live-text]")?.textContent).toBe("Look <left> first.");
    expect(ui("trace").querySelector("[data-live-secs]")?.textContent).toBe("1.5s");
    feed(must(streams[0]), [log.add(1200, { type: "assistant_delta", turn: 1, thinking: " Then up.", text: "" })], false);
    app.tick(100);
    expect(ui("trace").querySelector("[data-live-text]")?.textContent).toBe("Look <left> first. Then up.");
  });
});

function assistantAt(turn: number): Parameters<Log["add"]>[1] {
  return { type: "assistant", turn, thinking: `Turn ${String(turn)}.`, text: "", tool_calls: [], usage: { input: 1, output: 1, cache_read: 0 }, latency_ms: 5, ttft_ms: null, stop_reason: "stop" };
}

describe("side panel", () => {
  it("puts the Emerald thinking box on top and earlier steps below it, newest first", async () => {
    const { app, streams, setNow } = await harness();
    const log = new Log();
    log.events.push(...fullRun().events.slice(0, 11));
    log.add(4_100, { type: "assistant_delta", turn: 2, thinking: "Next I go up.", text: "" });
    feed(must(streams[0]), log.events);
    setNow(BASE_MS + 4_500);
    app.tick(100);
    const side = must(document.querySelector<HTMLElement>(".side .thinking-stream"));
    const emer = must(side.querySelector<HTMLElement>(".emer"));
    expect(emer.contains(ui("think-body"))).toBe(true);
    expect(emer.contains(ui("think-head"))).toBe(true);
    expect(ui("think-title").textContent).toBe("RIGHT NOW · TURN 2");
    expect(ui("think-body").textContent).toBe("Next I go up.");
    expect(ui("think-head").textContent).toBe("AGENT is thinking… 0.5s");
    const order = [...side.children].map((el) => el.className || el.tagName);
    expect(order.indexOf("emer")).toBeLessThan(order.indexOf("side-trace trace"));
    const rows = [...ui("side-trace").querySelectorAll<HTMLElement>("[data-key]")];
    expect(rows.map((row) => row.dataset.c)).toEqual(["think", "act", "ms", "ms"]);
    expect(ui("side-trace").textContent).not.toContain("Disk usage");
    expect(ui("side-trace").querySelector(".tg")?.textContent).toBe("T1");
    must(rows[1]?.querySelector("summary")).click();
    expect(ui("inspector").textContent).toContain('"type": "tool_result"');
    feed(must(streams[0]), [log.add(4_200, assistant({ turn: 2, thinking: "Next I go up." }))], false);
    app.tick(100);
    expect(ui("think-head").textContent).toMatch(/^AGENT thought for/);
    expect(ui("side-trace").textContent).not.toContain("Next I go up.");
    // When the next turn starts, the box streams again and that thought is back under EARLIER.
    feed(must(streams[0]), [log.add(4_300, { type: "turn_start", turn: 3, context: { messages: 5, images: 1, est_tokens: 6000 } })], false);
    app.tick(100);
    expect(ui("think-head").textContent).toMatch(/^AGENT is thinking/);
    expect(ui("side-trace").textContent).toContain("Next I go up.");
  });

  it("jumps from the side panel to the full agent trace", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    expect(ui("think-title").textContent).toBe("FINAL · TURN 4");
    ui("trace-link").click();
    expect(document.querySelector<HTMLElement>('[data-nav-page="trace"]')?.hidden).toBe(false);
    expect(document.querySelector('[data-page="trace"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps split chips in the side panel and folds the split times table away", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(100);
    const fold = must(document.querySelector<HTMLDetailsElement>(".side details.split-times"));
    expect(fold.open).toBe(false);
    expect(fold.contains(ui("split-times"))).toBe(true);
    expect(ui("split-times").textContent).toContain("VS FRONTIER");
    expect(ui("split-strip").querySelector(".mspl")).not.toBeNull();
    fold.open = true;
    app.tick(60_000);
    expect(fold.open).toBe(true);
  });

  it("shows the run identity strip in the header", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`);
    expect(ui("ident").hidden).toBe(true);
    feed(must(streams[0]), m4Run());
    app.tick(100);
    expect(ui("ident").hidden).toBe(false);
    expect(ui("ident").textContent).toContain("MODEL · THINKING");
  });
});


describe("head-first startup", () => {
  const run = RUNS[0]?.id ?? "missing";
  const own = (events: readonly RunEvent[]): RunEvent[] => events.map(event => ({ ...event, run }));
  function log(): Log {
    const log = new Log();
    log.add(0, { ...START, extend_run: true });
    log.add(1000, { type: "turn_start", turn: 1, context: { messages: 1, images: 0, est_tokens: 10 } });
    log.add(2000, assistant({ turn: 1, thinking: "Old thought" }));
    log.add(3000, { type: "turn_start", turn: 2, context: { messages: 2, images: 0, est_tokens: 20 } });
    log.add(4000, { type: "assistant_delta", turn: 2, thinking: "Current head", text: "" });
    return log;
  }
  it("enables controls and renders the current timeline before history arrives; tail wins the handoff", async () => {
    const { app, streams, fetched, setNow } = await harness("", RUNS, null, {}, undefined, false);
    const recorded = log();
    setNow(BASE_MS + 4500);
    const primary = must(streams[0]);
    primary.send("head", own([must(recorded.events[0]), ...recorded.events.slice(3)]));
    app.tick(0);
    expect(app.mode).toBe("live");
    expect([...ui("run-controls").querySelectorAll("button")].map(b => [b.textContent, b.disabled])).toEqual([
      ["⏸PAUSE", false], ["＋EXTEND", false], ["■STOP", false], ["✖ABORT hold to abort", false],
    ]);
    expect(ui("think-body").textContent).toContain("Current head");
    expect(ui("lanes").innerHTML).toContain("m-think open");
    expect(fetched.some(url => url.endsWith("/head"))).toBe(false);
    const history = must(streams[1]);
    expect(history.url).toBe(`/api/runs/${run}/events`);
    feed(history, recorded.events.slice(0, 3), false);
    app.tick(0);
    expect(ui("think-body").textContent).toContain("Current head");
    const fresh = recorded.add(5000, { type: "assistant_delta", turn: 2, thinking: " plus live tail", text: "" });
    feed(primary, [fresh], false);
    feed(history, recorded.events.slice(3, -1));
    app.tick(0);
    expect(ui("think-body").textContent).toContain("Current head plus live tail");
    expect(app.view.events.map(e => e.seq)).toEqual(recorded.events.map(e => e.seq));
    expect(history.closed).toBe(true);
    expect(ui("trace").textContent).toContain("Old thought");
    primary.send("head", own(recorded.events.slice(0, 3)));
    expect(streams).toHaveLength(2);
    expect(ui("think-body").textContent).toContain("Current head plus live tail");
  });
  it("keeps cached full splits while the recent head's history is incomplete", async () => {
    const workbench = { version: 1, at: BASE_MS, milestones: [], problems: [], runs: [{
      id: run, cohort: null, arm: null, model: "think-swarm", started: "2026-10-11T23:00:00.000Z", status: "live", reason: null, problem: null, excluded: null, elapsedMs: 5000, turn: 2, config: null,
      splits: [{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: 2000, segmentMs: 2000, seq: 1, turn: 1, inputTokens: 0, outputTokens: 0 }],
    }] };
    const { app, streams } = await harness("", RUNS, workbench, {}, undefined, false);
    await app.pollCards();
    expect(ui("split-strip").textContent).toContain("NAME ✔");
    must(streams[0]).send("head", own(log().events));
    expect(ui("split-strip").textContent).toContain("NAME ✔");
    app.tick(0);
    expect(ui("split-strip").textContent).toContain("NAME ✔");
  });
  it("accepts a newer reconnect head and replaces an unfinished history scan", async () => {
    const { app, streams } = await harness("", RUNS, null, {}, undefined, false);
    const primary = must(streams[0]), recorded = log();
    primary.send("head", own(recorded.events));
    const oldHistory = must(streams[1]);
    recorded.add(5000, assistant({ turn: 2, thinking: "Reconnected present" }));
    primary.send("head", own(recorded.events));
    expect(oldHistory.closed).toBe(true);
    expect(streams).toHaveLength(3);
    feed(oldHistory, recorded.events.slice(0, 3));
    expect(ui("think-body").textContent).toContain("Reconnected present");
    feed(must(streams[2]), recorded.events);
    expect(app.view.events.map(e => e.seq)).toEqual(recorded.events.map(e => e.seq));
  });
  it("closes old history on a run switch and rejects stale primary/head/history messages", async () => {
    const { app, streams } = await harness("", RUNS, null, {}, undefined, false);
    const primary = must(streams[0]);
    primary.send("head", own(log().events));
    const history = must(streams[1]);
    app.select(M4_ID);
    expect(primary.closed).toBe(true);
    expect(history.closed).toBe(true);
    feed(history, log().events);
    primary.send("head", own(log().events));
    feed(primary, log().events, false);
    expect(app.view.start).toBeNull();
    expect(app.mode).toBe("loading");
  });
  it("rejects malformed or foreign heads before enabling controls", async () => {
    const { app, streams } = await harness("", RUNS, null, {}, undefined, false);
    must(streams[0]).send("head", log().events.map(e => ({ ...e, run: "foreign" })));
    expect(app.mode).toBe("loading");
    expect(streams).toHaveLength(1);
    expect(ui("problems").textContent).toContain("head:");
  });
  it("opens completed recordings at the head and retains full rewind after history loads", async () => {
    const { app, streams } = await harness(`#replay=${M4_ID}`, RUNS, null, {}, undefined, false);
    const events = fullRun().events.map(event => ({ ...event, run: M4_ID }));
    must(streams[0]).send("head", events);
    expect(ui("think-body").textContent).toContain("Again.");
    expect(ui("lanes").innerHTML).toContain("m-think");
    must(streams[0]).send("done", {});
    feed(must(streams[1]), events);
    expect(app.clock?.positionMs).toBe(app.view.lastMs);
    app.clock?.seek(BASE_MS);
    app.tick(0);
    expect(ui("trace").textContent).not.toContain("Again.");
    expect(ui("think-body").textContent).toContain("Again.");
  });
});

describe("BAG page", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const flush = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };

  function endedBagRun(): RunEvent[] {
    const log = bagRun();
    log.add(900_000, { type: "run_end", turn: 80, reason: "budget", furthest_milestone: null, turns: 80, wall_ms: 900_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    return log.events;
  }

  it("draws the whole run's bag with the game's item icons once the page is open", async () => {
    const { app, streams, fetched } = await harness(`#replay=${M4_ID}`, RUNS, null, {}, undefined, false, { "/sprites/bag/manifest.json": { items: [4, 13] } });
    const stream = must(streams[0]);
    feed(stream, endedBagRun(), false);
    stream.send("done", {});
    app.tick(0);
    expect(ui("bag").innerHTML).toBe("");
    expect(fetched).not.toContain("/sprites/bag/manifest.json");
    must(document.querySelector<HTMLButtonElement>('[data-page="bag"]')).click();
    await flush();
    expect(fetched).toContain("/sprites/bag/manifest.json");
    expect(ui("bag-range").textContent).toBe("RUN 890b · T0–T80");
    expect([...ui("bag").querySelectorAll(".bg-kpi b")].map((b) => b.textContent)).toEqual(["7", "1", "¥200"]);
    expect([...ui("bag").querySelectorAll(".bg-pk .bg-pn")].map((p) => p.textContent)).toEqual(["ITEMS", "POKé BALLS", "TMs & HMs", "BERRIES", "KEY ITEMS"]);
    expect([...ui("bag").querySelectorAll(".bg-lab img")].map((i) => i.getAttribute("src"))).toEqual(["/sprites/bag/items/13.png", "/sprites/bag/items/4.png"]);
    // A replay moving its cursor leaves the page alone: it shows the whole run.
    const drawn = ui("bag").innerHTML;
    app.clock?.seek(BASE_MS);
    app.tick(0);
    expect(ui("bag").innerHTML).toBe(drawn);
  });

  it("refolds when the recent head is replaced by the full history, and draws names without art", async () => {
    const { app, streams } = await harness("", RUNS, null, {}, undefined, false);
    const run = RUNS[0]?.id ?? "missing";
    const events = bagRun().events.map((event) => ({ ...event, run }));
    const primary = must(streams[0]);
    must(document.querySelector<HTMLButtonElement>('[data-page="bag"]')).click();
    await flush();
    primary.send("head", [must(events[0]), ...events.slice(-3)]);
    app.tick(0);
    expect(ui("bag").querySelectorAll(".bg-lab")).toHaveLength(1);
    feed(must(streams[1]), events);
    app.tick(0);
    expect([...ui("bag").querySelectorAll(".bg-lab")].map((l) => l.textContent)).toEqual(["POTION", "POKé BALL", "GREAT BALL"]);
    expect(ui("bag").querySelector("img")).toBeNull();
    expect(ui("bag").querySelectorAll(".bg-noicon")).toHaveLength(3);
  });
});

describe("POKéMON PARTY page", () => {
  const flush = async (): Promise<void> => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); };
  const RATES = Array.from({ length: 101 }, (_, n) => (n <= 1 ? n : n ** 3));
  const DATA = {
    version: 1,
    types: "normal fight flying poison ground rock bug ghost steel mystery fire water grass electric psychic ice dragon dark".split(" "),
    species: { "280": { types: [10, 10], gender: 31, growth: 0, abilities: [66, 0], dex: 4 }, "288": { types: [0, 0], gender: 127, growth: 0, abilities: [53, 0], dex: 12 } },
    moves: { "10": { type: 0, power: 40, accuracy: 100, pp: 35, description: "Scratches the foe with\nsharp claws." } },
    abilities: { "66": { name: "BLAZE", description: "Ups FIRE moves in a pinch." }, "53": { name: "PICKUP", description: "May pick up items." } },
    natures: "HARDY LONELY BRAVE ADAMANT NAUGHTY BOLD DOCILE RELAXED IMPISH LAX TIMID HASTY SERIOUS JOLLY NAIVE MODEST MILD QUIET BASHFUL RASH CALM GENTLE SASSY CAREFUL QUIRKY".split(" "),
    experience: [RATES, RATES, RATES, RATES, RATES, RATES],
  };
  const MOVES = [{ move_id: 10, name: "SCRATCH", pp: 30, max_pp: 35, pp_bonus: 0 }];
  const TORCHIC = { species: "TORCHIC", nickname: "TORCHIC", level: 5, hp: 18, max_hp: 20, species_id: 280, personality: 11, ot_id: 1, moves: MOVES };
  const ZIGZAGOON = { species: "ZIGZAGOON", nickname: "ZIGZAGOON", level: 3, hp: 12, max_hp: 14, species_id: 288, personality: 200, ot_id: 1, moves: MOVES };
  const ART = { "/sprites/party/data.json": DATA, "/sprites/party/font/small.json": { widths: [], cmap: {} }, "/sprites/party/font/normal.json": { widths: [], cmap: {} } };

  function partyRun(hp = 12): RunEvent[] {
    const log = new Log();
    log.add(0, START);
    log.add(1000, state({ party: [TORCHIC, { ...ZIGZAGOON, hp }] }));
    return log.events;
  }

  it("draws the game's party screen and keeps the chosen slot, tab and move across updates", async () => {
    const { app, streams, fetched } = await harness("", RUNS, null, {}, undefined, false, ART);
    const stream = must(streams[0]);
    feed(stream, partyRun());
    must(document.querySelector<HTMLButtonElement>('[data-page="party"]')).click();
    await flush();
    expect(fetched).toContain("/sprites/party/data.json");
    app.render();
    const party = ui("party");
    expect(party.querySelector(".pv")).not.toBeNull();
    expect(party.querySelector('[data-pv-slot="0"]')?.getAttribute("aria-expanded")).toBe("true");
    must(party.querySelector<HTMLElement>('[data-pv-slot="1"]')).click();
    expect(ui("party").querySelector('[data-pv-slot="1"]')?.getAttribute("aria-expanded")).toBe("true");
    must(ui("party").querySelector<HTMLElement>('[data-pv-tab="2"]')).click();
    must(ui("party").querySelector<HTMLElement>('[data-pv-move="0"]')).click();
    expect(ui("party").querySelector(".pv-mdet")?.textContent).toContain("sharp claws.");
    // A live update redraws the page without losing the cursor, the page or the open move.
    must(ui("party").querySelector<HTMLElement>('[data-pv-move="0"]')).focus();
    stream.send("ev", { ...must(partyRun(3)[1]), run: must(RUNS[0]).id, seq: 9, turn: 2 });
    app.render();
    expect(ui("party").querySelector('[data-pv-slot="1"]')?.getAttribute("aria-expanded")).toBe("true");
    expect(ui("party").querySelector('[data-pv-tab="2"]')?.getAttribute("aria-selected")).toBe("true");
    expect(ui("party").querySelector(".pv-mdet")).not.toBeNull();
    expect(ui("party").querySelector('[data-pv-slot="1"] [aria-label="HP 3 of 14"]')).not.toBeNull();
    expect((document.activeElement as HTMLElement | null)?.dataset.pvMove).toBe("0");
    // A second click closes the move; arrow keys walk the tabs and keep focus on the chosen one.
    must(ui("party").querySelector<HTMLElement>('[data-pv-move="0"]')).click();
    expect(ui("party").querySelector(".pv-mdet")).toBeNull();
    const tab = must(ui("party").querySelector<HTMLElement>('[data-pv-tab="2"]'));
    tab.focus();
    tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(ui("party").querySelector('[data-pv-tab="0"]')?.getAttribute("aria-selected")).toBe("true");
    expect((document.activeElement as HTMLElement | null)?.dataset.pvTab).toBe("0");
    must(ui("party").querySelector<HTMLElement>('[data-pv-tab="0"]')).dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(ui("party").querySelector('[data-pv-tab="2"]')?.getAttribute("aria-selected")).toBe("true");
    must(ui("party").querySelector<HTMLElement>('[data-pv-tab="2"]')).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(ui("party").querySelector('[data-pv-tab="2"]')?.getAttribute("aria-selected")).toBe("true");
    ui("party").querySelector(".pv-list")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(ui("party").querySelector('[data-pv-slot="1"]')?.getAttribute("aria-expanded")).toBe("true");
  });

  it("shows the plain list when the party art was never built", async () => {
    const { app, streams, fetched } = await harness("", RUNS, null, {}, undefined, false);
    feed(must(streams[0]), partyRun());
    must(document.querySelector<HTMLButtonElement>('[data-page="party"]')).click();
    await flush();
    app.render();
    expect(fetched).toContain("/sprites/party/data.json");
    expect(ui("party").querySelector(".pv")).toBeNull();
    expect(ui("party").textContent).toContain("ZIGZAGOON");
  });
});
