// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { BASE_MS, Log, START, fullRun, m4Run, must } from "../test-support/events.js";
import { boot, mountApp, type App, type AppDeps, type StreamLike } from "./app.js";

const PAGE = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8");
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

interface Harness {
  readonly app: App;
  readonly streams: FakeStream[];
  readonly fetched: string[];
  readonly setNow: (ms: number) => void;
}

const RUNS = [
  { id: "2026-10-11T23-00-00_live", model: "think-swarm", started: "x", ended: false, reason: null, problem: null },
  { id: M4_ID, model: "think-swarm", started: "x", ended: true, reason: "budget", problem: null },
  { id: "2026-10-11T21-00-00_old", model: "think-swarm", started: "x", ended: true, reason: "budget", problem: null },
];

async function harness(hash = "", runs: unknown[] = RUNS): Promise<Harness> {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const streams: FakeStream[] = [];
  const fetched: string[] = [];
  let now = BASE_MS;
  const deps: AppDeps = {
    fetchJson: (url) => {
      fetched.push(url);
      if (url === "/api/runs") return runs.length === 1 && runs[0] === "fail" ? Promise.reject(new Error("offline")) : Promise.resolve([...runs]);
      if (url.endsWith("/milestones")) {
        return Promise.resolve({ run: "2026-10-11T21-00-00_old", milestones: [{ name: "GAME_RUNNING", offsetMs: 5 }, { name: "PLAYER_NAME_SET", offsetMs: 20_000 }] });
      }
      return Promise.reject(new Error(`unexpected ${url}`));
    },
    openStream: (url) => {
      const stream = new FakeStream(url);
      streams.push(stream);
      return stream;
    },
    now: () => now,
    hash,
  };
  const app = await mountApp(document, deps);
  return {
    app,
    streams,
    fetched,
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

  it("lists runs and opens the run named in the hash", async () => {
    const { streams } = await harness(`#run=${M4_ID}`);
    const options = [...ui("run").querySelectorAll("option")].map((option) => option.value);
    expect(options).toEqual(RUNS.map((run) => run.id));
    expect((ui("run") as HTMLSelectElement).value).toBe(M4_ID);
    expect(streams.map((stream) => stream.url)).toEqual([`/api/runs/${M4_ID}/events`]);
    expect(ui("gba").querySelector('[data-btn="A"]')).not.toBeNull();
  });

  it("opens the newest run when the hash names none, and shows no data before events arrive", async () => {
    const { streams } = await harness();
    expect(streams[0]?.url).toBe("/api/runs/2026-10-11T23-00-00_live/events");
    expect(ui("brand").textContent).toBe("POKéNAV · NO RUN");
    expect(ui("party").innerHTML).toContain("no data");
    expect(ui("mode").textContent).toBe("LOADING");
  });

  it("replays the recorded M4 run end to end", async () => {
    const { app, streams } = await harness(`#run=${M4_ID}`);
    const stream = must(streams[0]);
    const events = m4Run();
    feed(stream, events);
    stream.send("done", {});
    expect(stream.closed).toBe(true);
    expect(app.mode).toBe("replay");
    expect(ui("mode").textContent).toBe("REPLAY");
    expect(ui("brand").textContent).toBe(`POKéNAV · ${M4_ID}`);
    expect(ui("play").textContent).toBe("❚❚");
    expect(ui("counters").innerHTML).toContain("think-swarm");
    expect(ui("think-head").textContent).toBe("AGENT is waiting…");

    app.tick(2_000);
    expect(ui("think-head").textContent).toMatch(/^AGENT (is thinking|thought for)/);
    app.tick(10_000);
    expect(ui("screen").getAttribute("href")).toBe(`/api/runs/${M4_ID}/frames/000015_0.png`);
    expect(ui("log").querySelectorAll(".ev").length).toBeGreaterThan(5);
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
    expect(ui("log").querySelector('[data-seq="18"]')?.textContent).toContain("run ended: budget");
  });

  it("lights the GBA button while a press is held", async () => {
    const { app, streams } = await harness(`#run=${M4_ID}`);
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
    const { app, streams } = await harness(`#run=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    ui("play").click();
    expect(app.clock?.playing).toBe(false);
    const speed = ui("speed") as HTMLSelectElement;
    speed.value = "16";
    speed.dispatchEvent(new Event("change"));
    expect(app.clock?.speed).toBe(16);
    ui("play").click();
    app.tick(1_000);
    expect(ui("log").querySelectorAll(".ev").length).toBeGreaterThan(5);
    const scrub = ui("scrub") as HTMLInputElement;
    scrub.value = "0";
    scrub.dispatchEvent(new Event("input"));
    expect(app.clock?.fraction).toBe(0);
    expect(ui("log").querySelectorAll(".ev").length).toBe(0);
    expect(ui("screen").getAttribute("href")).toBe("");
  });

  it("opens a log row's raw event in the inspector", async () => {
    const { app, streams } = await harness(`#run=${M4_ID}`);
    feed(must(streams[0]), m4Run());
    app.tick(60_000);
    const row = must(ui("log").querySelector<HTMLElement>('[data-seq="9"]'));
    row.click();
    expect(ui("inspector").textContent).toContain('"type": "tool_call"');
    expect(row.classList.contains("sel")).toBe(true);
    ui("log").click();
    expect(ui("inspector").textContent).toContain('"type": "tool_call"');
  });

  it("follows a live run with the live screen and the wall clock", async () => {
    const { app, streams, setNow } = await harness();
    const live = fullRun().events.slice(0, 4);
    feed(must(streams[0]), live);
    expect(app.mode).toBe("live");
    expect(ui("mode").textContent).toBe("LIVE");
    expect((ui("play") as HTMLButtonElement).disabled).toBe(true);
    setNow(BASE_MS + 3_500);
    app.tick(500);
    expect(ui("think-head").textContent).toBe("AGENT is thinking… 2.5s");
    expect(ui("screen").getAttribute("href")).toMatch(/^\/api\/runs\/2026-10-11T23-00-00_live\/screen\?n=\d+$/);
    expect(ui("screen-note").textContent).toBe("live");
    const more = fullRun().events.slice(4, 10);
    feed(must(streams[0]), more, false);
    app.tick(500);
    expect(ui("trainer").innerHTML).toContain("LITTLEROOT TOWN");
    expect(ui("clock").textContent).toBe("0:00:03");
  });

  it("falls back to the last recorded frame when the live screen fails", async () => {
    const { app, streams, setNow } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 10));
    setNow(BASE_MS + 4_000);
    app.tick(500);
    ui("screen").dispatchEvent(new Event("error"));
    app.tick(100);
    expect(ui("screen").getAttribute("href")).toBe("/api/runs/2026-10-11T23-00-00_live/frames/000009_0.png");
    expect(ui("screen-note").textContent).toBe("live screen unavailable · last frame");
  });

  it("switches to replay when a live run ends", async () => {
    const { app, streams } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 4));
    feed(must(streams[0]), fullRun().events.slice(4), false);
    must(streams[0]).send("done", {});
    expect(app.mode).toBe("replay");
    expect(app.clock?.atEnd).toBe(true);
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
    const { app, streams, fetched } = await harness(`#run=${M4_ID}`);
    feed(must(streams[0]), fullRun().events);
    const baseline = ui("baseline") as HTMLSelectElement;
    expect([...baseline.querySelectorAll("option")].map((option) => option.value)).toEqual([
      "",
      "2026-10-11T23-00-00_live",
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
    expect(ui("splits-summary").innerHTML).toContain("all 2 baseline splits reached");
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
          : new Promise((resolve) => {
              pending.push(resolve);
            }),
      openStream: (url) => {
        const stream = new FakeStream(url);
        streams.push(stream);
        return stream;
      },
      now: () => BASE_MS,
      hash: `#run=${M4_ID}`,
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
    const { streams } = await harness();
    feed(must(streams[0]), fullRun().events.slice(0, 4));
    const pick = ui("run") as HTMLSelectElement;
    pick.value = M4_ID;
    pick.dispatchEvent(new Event("change"));
    expect(streams[0]?.closed).toBe(true);
    expect(streams[1]?.url).toBe(`/api/runs/${M4_ID}/events`);
    expect(ui("log").querySelectorAll(".ev").length).toBe(0);
    expect(window.location.hash).toBe(`#run=${M4_ID}`);
  });

  it("says so when there are no runs", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const app = await mountApp(document, {
      fetchJson: () => Promise.resolve([]),
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
      mountApp(document, { fetchJson: () => Promise.resolve({ nope: 1 }), openStream: () => new FakeStream("x"), now: () => 0, hash: "" }),
    ).rejects.toThrow("malformed /api/runs");
  });

  it("ignores events for a different run than the one selected", async () => {
    const { app, streams } = await harness(`#run=${M4_ID}`);
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
    expect(streams.map((stream) => stream.url)).toEqual(["/api/runs/2026-10-11T23-30-00_next/events"]);
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
    expect(streams.map((stream) => stream.url)).toEqual([`/api/runs/${M4_ID}/events`, "/api/runs/2026-10-11T23-30-00_next/events"]);
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
    const replaying = await harness(`#run=${M4_ID}`, old);
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
      "/api/runs/2026-10-11T23-00-00_live/events",
      "/api/runs/2026-10-11T23-30-00_next/events",
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
  it("wires the page to fetch, EventSource and a render interval", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const intervals: ((...args: unknown[]) => void)[] = [];
    const streams: FakeStream[] = [];
    const win = {
      document,
      location: { hash: "" },
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify(RUNS))),
      EventSource: class extends FakeStream {
        constructor(url: string) {
          super(url);
          streams.push(this);
        }
      },
      setInterval: (fn: (...args: unknown[]) => void) => {
        intervals.push(fn);
        return 1;
      },
      performance: { now: () => 0 },
    };
    const app = await boot(win);
    expect(win.fetch).toHaveBeenCalledWith("/api/runs");
    expect(streams[0]?.url).toBe("/api/runs/2026-10-11T23-00-00_live/events");
    expect(intervals).toHaveLength(2);
    intervals[0]?.();
    expect(app.mode).toBe("loading");
    intervals[1]?.();
    await vi.waitFor(() => {
      expect(win.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("surfaces an HTTP error from the run list", async () => {
    document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
    const win = {
      document,
      location: { hash: "" },
      fetch: vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
      EventSource: FakeStream,
      setInterval: () => 1,
      performance: { now: () => 0 },
    };
    await expect(boot(win)).rejects.toThrow("GET /api/runs returned HTTP 500");
  });
});

// Live discovery and error containment are operator-visible guarantees.
describe("live discovery and diagnostics", () => {
  it("keeps every live run visible while replaying a finished probe", async () => {
    const runs = [runRow("probe_g4", true), runRow("active_model", false)];
    const { streams } = await harness("#run=probe_g4", runs);
    expect(ui("live-runs").hidden).toBe(false);
    const button = ui("live-runs").querySelector("button");
    expect(button?.dataset.run).toBe("active_model");
    expect(ui("run").querySelector("option")?.textContent).toContain("LIVE");
    button?.click();
    expect(streams.at(-1)?.url).toBe("/api/runs/active_model/events");
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


it("shows streamed objective history live and reconstructs it when replay seeks", async () => {
  const { app, streams } = await harness();const stream = must(streams[0]);const log = new Log();
  log.add(0, START);
  log.add(100, { type: "objective_update", turn: 1, objective: { id: "objective-1", revision: 1, goal: "Reach gym", title: "Set clock", supports_goal: "Observed instruction", evidence: [0], completion: { kind: "visual", description: "Clock confirms" }, obstacle: "Need facing", next_decision: "Face north", status: "active", completion_evidence: [] } });
  log.add(200, { type: "objective_attempt", turn: 1, attempt: { id: "p1", objective_id: "objective-1", buttons: ["A"], before_seq: 0, after_seq: 1, outcome: "no_change", failure_count: 2, warning: "Reassess approach", retry_justification: null } });
  feed(stream, log.events);
  expect(app.mode).toBe("live");expect(ui("objective").textContent).toContain("Set clock");expect(ui("objective").textContent).toContain("Reassess approach");
  const end = log.add(300, { type: "run_end", turn: 1, reason: "budget", furthest_milestone: null, turns: 1, wall_ms: 300, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
  feed(stream, [end]);stream.send("done", {});expect(app.mode).toBe("replay");
  app.clock?.seek(BASE_MS);app.tick(0);expect(ui("objective").textContent).toContain("No objective recorded");
  app.clock?.seek(BASE_MS + 250);app.tick(0);expect(ui("objective").textContent).toContain("Set clock");expect(ui("objective").textContent).toContain("Attempt history (1)");expect(ui("objective").textContent).toContain("Reassess approach");
});
