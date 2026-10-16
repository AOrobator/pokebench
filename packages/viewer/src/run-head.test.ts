// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { BASE_MS, Log, START, fullRun, must } from "../test-support/events.js";
import { mountApp, type App, type AppDeps, type StreamLike } from "./app.js";
import { RunView } from "./model.js";
import { headHtml, headTitle, sheetHtml, type HeadInput } from "./run-head.js";

const PAGE = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8");
const CSS = readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8").replace(/\s+/g, " ");
const EXP = "bundle-v-control-dryrun-cook";
const FLAGS = { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true };
const EVALUATION = { preset_id: "bundle-v-control", target: null, failure_limit: 3, flags: FLAGS, experiment: { id: EXP, arm: "bundle", trial: 2, of: 4 } };
const LIVE_ID = "2026-10-16T05-51-58_qwen36-gpu0_7a95";
const OTHER_ID = "2026-10-16T05-51-58_qwen36-gpu1_7f38";
const ENDED_ID = "2026-10-16T04-51-03_qwen36-gpu0_54a7";

function cohortRun(): Log {
  const log = new Log();
  for (const event of fullRun().events.slice(0, 10)) {
    const { v: _v, run: _run, seq: _seq, t: _t, ...body } = event;
    log.add(Date.parse(event.t) - BASE_MS, (body.type === "run_start" ? { ...START, evaluation: EVALUATION } : body) as Parameters<Log["add"]>[1]);
  }
  return log;
}

function view(events: readonly RunEvent[]): RunView {
  const v = new RunView();
  for (const event of events) v.apply(event);
  return v;
}

function input(over: Partial<HeadInput> = {}): HeadInput {
  return { view: view(cohortRun().events), runId: LIVE_ID, label: { cls: "live", text: "RUNNING" }, running: true, time: "0:27:22 / 1:00:00", others: [], ...over };
}

describe("phone header model", () => {
  it("titles the run by its experiment, then preset, then model, then id", () => {
    expect(headTitle(view(cohortRun().events), LIVE_ID)).toBe(EXP);
    const preset = new Log();
    preset.add(0, { ...START, evaluation: { preset_id: "checkpoint-clock-set", target: null, failure_limit: 3, flags: FLAGS } });
    expect(headTitle(view(preset.events), "x")).toBe("preset checkpoint-clock-set");
    const plain = new Log();
    plain.add(0, START);
    expect(headTitle(view(plain.events), "x")).toBe("think-swarm");
    expect(headTitle(new RunView(), "the-run-id")).toBe("the-run-id");
    expect(headTitle(new RunView(), null)).toBe("NO RUN");
  });

  it("leads with a live dot and the experiment, then the arm badge, the trial and one time", () => {
    const html = headHtml(input({ others: [{ id: OTHER_ID, cohort: { id: EXP, arm: "control", trial: 1, of: 4 } }] }));
    const box = document.createElement("div");
    box.innerHTML = html;
    expect(must(box.querySelector(".rh-l1")).textContent).toBe(`${EXP}+1 LIVE`);
    expect(must(box.querySelector(".rh-state")).classList.contains("dot")).toBe(true);
    expect(must(box.querySelector(".rh-state")).getAttribute("aria-label")).toBe("RUNNING");
    expect(must(box.querySelector(".arm")).textContent).toBe("BUNDLE");
    expect(must(box.querySelector(".rh-trial")).textContent).toBe("trial 2/4");
    expect(must(box.querySelector(".rh-time")).textContent).toBe("0:27:22 / 1:00:00");
  });

  it("names any other state in words and drops +N LIVE when nothing else is live", () => {
    const box = document.createElement("div");
    box.innerHTML = headHtml(input({ label: { cls: "paused", text: "PAUSED" }, running: false }));
    expect(must(box.querySelector(".rh-state")).textContent).toBe("PAUSED");
    expect(box.querySelector(".rh-state.dot")).toBeNull();
    expect(box.querySelector(".rh-more")).toBeNull();
  });

  it("escapes run-supplied text", () => {
    const plain = new Log();
    plain.add(0, { ...START, model: { ...START.model, id: "<b>m</b>" } });
    expect(headHtml(input({ view: view(plain.events) }))).toContain("&lt;b&gt;m&lt;/b&gt;");
  });

  it("opens the sheet on what you are watching, then only the other live runs, then run details", () => {
    const box = document.createElement("div");
    box.innerHTML = sheetHtml(input({ others: [{ id: OTHER_ID, model: "qwen", started: "2026-10-16T05:52:27.171-04:00", cohort: { id: EXP, arm: "control", trial: 1, of: 4 } }] }), () => "5:52 AM");
    const now = must(box.querySelector(".rs-now"));
    expect(must(now.querySelector(".rs-tag")).textContent).toBe("YOU'RE WATCHINGRUNNING");
    expect(must(now.querySelector(".rs-title")).textContent).toBe(EXP);
    expect(now.textContent).toContain("BUNDLE");
    expect(now.textContent).toContain("trial 2/4");
    expect(now.textContent).toContain("0:27:22 / 1:00:00");
    const watch = Array.from(box.querySelectorAll<HTMLButtonElement>("[data-watch]"));
    expect(watch.map((b) => b.dataset.watch)).toEqual([OTHER_ID]);
    expect(watch[0]?.textContent).toContain(EXP);
    expect(watch[0]?.textContent).toContain("CONTROL");
    expect(watch[0]?.textContent).toContain("trial 1/4 · started 5:52 AM");
    expect(watch[0]?.textContent).toContain("WATCH ▸");
    expect(box.textContent).toContain("Modelthink-swarm");
    expect(box.textContent).toContain("Thinkingmedium");
    expect(box.textContent).toContain(`Run${LIVE_ID}`);
  });

  it("says so when no other run is live", () => {
    const box = document.createElement("div");
    box.innerHTML = sheetHtml(input(), () => "");
    expect(box.querySelector("[data-watch]")).toBeNull();
    expect(box.textContent).toContain("No other run is live right now.");
  });
});

class FakeStream implements StreamLike {
  private readonly listeners = new Map<string, ((message: { data: string }) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (message: { data: string }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close(): void {}
  send(type: string, data: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) });
  }
}

const RUNS = [
  { id: LIVE_ID, model: "qwen", started: "2026-10-16T05:52:27.171-04:00", ended: false, reason: null, problem: null, live: true, experiment: `${EXP} · bundle · 2/4`, cohort: { id: EXP, arm: "bundle", trial: 2, of: 4 } },
  { id: OTHER_ID, model: "qwen", started: "2026-10-16T05:52:27.171-04:00", ended: false, reason: null, problem: null, live: true, experiment: `${EXP} · control · 1/4`, cohort: { id: EXP, arm: "control", trial: 1, of: 4 } },
  { id: ENDED_ID, model: "qwen", started: "2026-10-16T04:51:31.543-04:00", ended: true, reason: "budget", problem: null, live: false, experiment: `${EXP} · bundle · 2/4`, cohort: { id: EXP, arm: "bundle", trial: 2, of: 4 } },
];

async function mount(width: number): Promise<{ app: App; streams: FakeStream[] }> {
  window.happyDOM.setInnerWidth(width);
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const streams: FakeStream[] = [];
  const deps: AppDeps = {
    fetchJson: (url) => {
      if (url === "/api/runs") return Promise.resolve(RUNS);
      if (url === "/api/features") return Promise.resolve({ features: [], milestones: [] });
      if (url === "/api/next-run") return Promise.resolve({ draft: { model: "", thinking: "medium", maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3, maxTokens: 4096, target: null, features: {} }, queue: { state: "idle" } });
      if (url === "/api/models") return Promise.resolve({ models: [] });
      if (url === "/api/features/history") return Promise.resolve({});
      if (url.endsWith("/comparisons")) return Promise.resolve({ candidates: [], baseline: null, best: null });
      return Promise.reject(new Error(`unexpected ${url}`));
    },
    sendJson: () => Promise.reject(new Error("unexpected write")),
    openStream: (url) => {
      const stream = new FakeStream(url);
      streams.push(stream);
      return stream;
    },
    now: () => BASE_MS + 3_500,
    hash: `#run=${LIVE_ID}`,
  };
  const app = await mountApp(document, deps);
  const stream = must(streams[0]);
  for (const event of cohortRun().events) stream.send("ev", { ...event, run: LIVE_ID });
  stream.send("caught_up", {});
  app.tick(0);
  return { app, streams };
}

const ui = (name: string): HTMLElement => must(document.querySelector<HTMLElement>(`[data-ui="${name}"]`));

describe("phone header in the viewer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    window.happyDOM.setInnerWidth(1024);
  });

  it("shows the experiment-first header and moves the controls under the screen and the run picker into the sheet", async () => {
    await mount(375);
    const head = ui("run-head");
    expect(must(head.querySelector(".rh-l1")).textContent).toBe(`${EXP}+1 LIVE`);
    expect(must(head.querySelector(".arm")).textContent).toBe("BUNDLE");
    expect(must(head.querySelector(".rh-time")).textContent).toBe("0:00:03 / 0:01:00");
    const stage = must(document.querySelector(".gbaStage"));
    expect(stage.contains(ui("run-controls"))).toBe(true);
    expect(stage.contains(ui("replay-controls"))).toBe(true);
    expect(ui("run-sheet").contains(ui("run"))).toBe(true);
    expect(ui("run-sheet").contains(ui("comparisons-link"))).toBe(true);
  });

  it("opens the sheet from anywhere on the header and switches runs from it", async () => {
    const { streams } = await mount(375);
    const head = ui("run-head");
    expect(ui("run-sheet").hidden).toBe(true);
    must(head.querySelector<HTMLElement>(".rh-trial")).click();
    expect(ui("run-sheet").hidden).toBe(false);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    const watch = Array.from(ui("run-sheet").querySelectorAll<HTMLButtonElement>("[data-watch]"));
    expect(watch.map((b) => b.dataset.watch)).toEqual([OTHER_ID]);
    must(watch[0]).click();
    expect(ui("run-sheet").hidden).toBe(true);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(streams.at(-1)?.url).toBe(`/api/runs/${encodeURIComponent(OTHER_ID)}/events`);
  });

  it("closes the sheet from the shade and the grab handle", async () => {
    await mount(375);
    ui("run-head").click();
    ui("run-sheet-shade").click();
    expect(ui("run-sheet").hidden).toBe(true);
    expect(ui("run-sheet-shade").hidden).toBe(true);
    ui("run-head").click();
    ui("run-sheet-close").click();
    expect(ui("run-sheet").hidden).toBe(true);
  });

  it("keeps the desktop header as it is and moves the controls back when the screen widens", async () => {
    await mount(375);
    window.happyDOM.setInnerWidth(1280);
    window.dispatchEvent(new Event("resize"));
    const bar = must(document.querySelector(".bar"));
    expect(bar.contains(ui("run-controls"))).toBe(true);
    expect(bar.contains(ui("replay-controls"))).toBe(true);
    expect(bar.contains(ui("run"))).toBe(true);
    expect(bar.contains(ui("comparisons-link"))).toBe(true);
    const order = Array.from(bar.children, (el) => el.getAttribute("data-ui") ?? el.className);
    expect(order.indexOf("comparisons-link")).toBeLessThan(order.indexOf("run-choice"));
    expect(order.indexOf("replay-controls")).toBeLessThan(order.indexOf("run-controls"));
  });
});

describe("phone header CSS", () => {
  it("hides the header button on wide screens and the old header pieces on phones", () => {
    expect(CSS).toMatch(/\.run-head \{[^}]*display: none;/);
    const phone = CSS.slice(CSS.lastIndexOf("@media (max-width: 700px)"));
    expect(phone).toContain(".bar > .logo, .bar > .mode, .bar > .clock, .bar > .live-runs, .bar > .ident { display: none; }");
    expect(phone).toMatch(/\.run-head \{[^}]*display: flex;/);
  });
  it("blinks the live dot and holds it still under reduced motion", () => {
    expect(CSS).toMatch(/\.rh-state\.dot \{[^}]*animation: rh-blink/);
    expect(CSS).toContain("@media (prefers-reduced-motion: reduce) { .rh-state.dot, .rs-pill.live::before { animation: none; } }");
  });
});
