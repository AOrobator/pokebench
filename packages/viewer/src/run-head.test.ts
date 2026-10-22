// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

function cohortRun(): RunEvent[] {
  return fullRun().events.slice(0, 10).map((event) => (event.type === "run_start" ? { ...event, evaluation: EVALUATION } : event));
}

function view(events: readonly RunEvent[]): RunView {
  const v = new RunView();
  for (const event of events) v.apply(event);
  return v;
}

function input(over: Partial<HeadInput> = {}): HeadInput {
  return { view: view(cohortRun()), runId: LIVE_ID, label: { cls: "live", text: "RUNNING" }, running: true, time: "0:27:22 / 1:00:00", others: [], ...over };
}

describe("phone header model", () => {
  it("titles the run by its experiment, then preset, then model, then id", () => {
    expect(headTitle(view(cohortRun()), LIVE_ID)).toBe(EXP);
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

  it("provides a stable mount for existing trainer cards without bespoke run blocks", () => {
    const box = document.createElement("div");
    box.innerHTML = sheetHtml();
    expect(box.querySelector(".rs-cards")).not.toBeNull();
    expect(box.querySelector(".rs-now, .rs-other")).toBeNull();
    expect(box.textContent).toContain("Loading trainer cards");
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

let nowMs = BASE_MS + 3_500;

async function mount(width: number): Promise<{ app: App; streams: FakeStream[] }> {
  nowMs = BASE_MS + 3_500;
  setWidth(width);
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
    now: () => nowMs,
    hash: `#run=${LIVE_ID}`,
  };
  const app = await mountApp(document, deps);
  const stream = must(streams[0]);
  for (const event of cohortRun()) stream.send("ev", { ...event, run: LIVE_ID });
  stream.send("caught_up", {});
  app.tick(0);
  return { app, streams };
}

const setWidth = (width: number): void => { (window as unknown as { happyDOM: { setInnerWidth(width: number): void } }).happyDOM.setInnerWidth(width); };
// happy-dom's setViewport moves innerWidth but its matchMedia keeps reading the
// initial height; the documented innerHeight setter is what media queries see.
const setViewport = (width: number, height: number): void => {
  setWidth(width);
  window.innerHeight = height;
};
const ui = (name: string): HTMLElement => must(document.querySelector<HTMLElement>(`[data-ui="${name}"]`));

describe("phone header in the viewer", () => {
  afterEach(() => {
    setViewport(1024, 900);
    document.body.innerHTML = "";
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
    const all = Array.from(must(document.querySelector('[data-slot="phone-picker"]')).children, (el) => el.getAttribute("data-ui") ?? (el.className || el.tagName));
    expect(all).toEqual(["H4", "run-choice", "comparisons-link", "reports-link"]);
    expect(ui("reports-link").getAttribute("href")).toBe("/reports");
  });

  it("opens the sheet from anywhere on the header and switches runs from it", async () => {
    const { streams } = await mount(375);
    const head = ui("run-head");
    expect(ui("run-sheet").hidden).toBe(true);
    must(head.querySelector<HTMLElement>(".rh-trial")).click();
    expect(ui("run-sheet").hidden).toBe(false);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    const watch = Array.from(ui("run-sheet").querySelectorAll<HTMLButtonElement>("[data-watch]"));
    expect(watch).toHaveLength(0);
    const picker = ui("run") as HTMLSelectElement;
    picker.value = OTHER_ID;
    picker.dispatchEvent(new Event("change", { bubbles: true }));
    expect(ui("run-sheet").hidden).toBe(true);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(streams.at(-1)?.url).toBe(`/api/runs/${encodeURIComponent(OTHER_ID)}/events?head=1`);
  });

  it("closes the sheet when a run is picked from the full list in it", async () => {
    const { streams } = await mount(375);
    ui("run-head").click();
    const picker = ui("run") as HTMLSelectElement;
    picker.value = ENDED_ID;
    picker.dispatchEvent(new Event("change"));
    expect(ui("run-sheet").hidden).toBe(true);
    expect(streams.at(-1)?.url).toBe(`/api/runs/${encodeURIComponent(ENDED_ID)}/events?head=1`);
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
    setWidth(1280);
    window.dispatchEvent(new Event("resize"));
    const bar = must(document.querySelector(".bar"));
    expect(bar.contains(ui("run-controls"))).toBe(true);
    expect(bar.contains(ui("replay-controls"))).toBe(true);
    expect(bar.contains(ui("run"))).toBe(true);
    expect(bar.contains(ui("comparisons-link"))).toBe(true);
    const order = Array.from(bar.children, (el) => el.getAttribute("data-ui") ?? el.className);
    expect(order.indexOf("comparisons-link")).toBeLessThan(order.indexOf("run-choice"));
    expect(order.indexOf("replay-controls")).toBeLessThan(order.indexOf("run-controls"));
    expect(ui("run-sheet").contains(ui("reports-link"))).toBe(true);
  });
});

describe("phone header sheet behavior", () => {
  it("animates dismissal before hiding and allows reopening during dismissal", async () => {
    await mount(375);
    const sheet = ui("run-sheet"), shade = ui("run-sheet-shade");
    // The DOM harness does not load linked stylesheets; expose the exit animation.
    sheet.style.animationName = "rs-slide-out";
    ui("run-head").click();
    ui("run-sheet-close").click();
    expect(sheet.hidden).toBe(false);
    expect(shade.hidden).toBe(false);
    expect(sheet.hasAttribute("data-closing")).toBe(true);
    expect(sheet.inert).toBe(true);
    expect(ui("run-head").getAttribute("aria-expanded")).toBe("false");
    ui("run-head").click();
    sheet.dispatchEvent(new AnimationEvent("animationend", { animationName: "rs-slide-out" }));
    expect(sheet.hidden).toBe(false);
    expect(sheet.inert).toBe(false);
    ui("run-sheet-shade").click();
    ui("run-sheet-close").dispatchEvent(new AnimationEvent("animationend", { animationName: "rs-slide-out", bubbles: true }));
    sheet.dispatchEvent(new AnimationEvent("animationend", { animationName: "rs-slide-in" }));
    expect(sheet.hidden).toBe(false);
    sheet.dispatchEvent(new AnimationEvent("animationend", { animationName: "rs-slide-out" }));
    expect(sheet.hidden).toBe(true);
    expect(shade.hidden).toBe(true);
  });

  it("uses half-duration entrance and exit animations with reduced-motion opt-out", () => {
    expect(CSS).toContain("rs-slide-in 130ms");
    expect(CSS).toContain("rs-fade-in 90ms");
    expect(CSS).toContain("rs-slide-out 130ms");
    expect(CSS).toContain("rs-fade-out 90ms");
    expect(CSS).toContain("prefers-reduced-motion: reduce");
    expect(CSS).toContain("animation: none !important");
  });

  it("finishes a canceled exit and immediately cleans up when widened during dismissal", async () => {
    await mount(375);
    const sheet = ui("run-sheet");
    sheet.style.animationName = "rs-slide-out";
    ui("run-head").click();
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sheet.hidden).toBe(false);
    sheet.dispatchEvent(new AnimationEvent("animationcancel", { animationName: "rs-slide-out" }));
    expect(sheet.hidden).toBe(true);
    ui("run-head").click();
    ui("run-sheet-close").click();
    expect(sheet.hidden).toBe(false);
    setViewport(1280, 900);
    window.dispatchEvent(new Event("resize"));
    expect(sheet.hidden).toBe(true);
    expect(ui("run-sheet-shade").hidden).toBe(true);
  });

  it("dismisses immediately when reduced motion removes the exit animation", async () => {
    await mount(375);
    ui("run-sheet").style.animationName = "none";
    ui("run-head").click();
    ui("run-sheet-close").click();
    expect(ui("run-sheet").hidden).toBe(true);
    expect(ui("run-sheet-shade").hidden).toBe(true);
    expect(document.activeElement).toBe(ui("run-head"));
  });
  afterEach(() => {
    setViewport(1024, 900);
    document.body.innerHTML = "";
  });

  it("closes an open sheet when the window widens past the phone breakpoint", async () => {
    await mount(375);
    ui("run-head").click();
    setWidth(1280);
    window.dispatchEvent(new Event("resize"));
    expect(ui("run-sheet").hidden).toBe(true);
    expect(ui("run-sheet-shade").hidden).toBe(true);
    expect(ui("run-head").getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the card mount in place while the header clock ticks", async () => {
    const { app } = await mount(375);
    ui("run-head").click();
    const cards = must(ui("run-sheet").querySelector(".rs-cards"));
    const time = must(ui("run-head").querySelector(".rh-time"));
    expect(time.textContent).toBe("0:00:03 / 0:01:00");
    nowMs += 2_000;
    app.tick(500);
    expect(ui("run-sheet").querySelector(".rs-cards")).toBe(cards);
    expect(must(ui("run-head").querySelector(".rh-time")).textContent).toBe("0:00:05 / 0:01:00");
  });

  it("moves focus into the sheet, closes on Escape and returns focus to the header", async () => {
    await mount(375);
    ui("run-head").click();
    expect(document.activeElement).toBe(ui("run-sheet-close"));
    ui("run-sheet").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(ui("run-sheet").hidden).toBe(true);
    expect(document.activeElement).toBe(ui("run-head"));
    ui("run-head").click();
    ui("run-sheet").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(ui("run-sheet").hidden).toBe(false);
  });

  it("mirrors phone mode onto <html>[data-phone] so style.css keys off the flag", async () => {
    await mount(375);
    expect(document.documentElement.hasAttribute("data-phone")).toBe(true);
    setViewport(750, 1000);
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.hasAttribute("data-phone")).toBe(false);
  });

  it("keeps phone mode on a foldable's short landscape viewport and drops it on a tall desktop window", async () => {
    await mount(375);
    setViewport(832, 750);
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.hasAttribute("data-phone"), "Fold 7 unfolded landscape").toBe(true);
    setViewport(750, 832);
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.hasAttribute("data-phone"), "Fold 7 unfolded portrait").toBe(false);
    setViewport(1440, 900);
    window.dispatchEvent(new Event("resize"));
    expect(document.documentElement.hasAttribute("data-phone"), "laptop window").toBe(false);
  });

  it("ignores clicks in the sheet body that are not on a WATCH button", async () => {
    const { streams } = await mount(375);
    ui("run-head").click();
    must(ui("run-sheet").querySelector<HTMLElement>("h4")).click();
    expect(ui("run-sheet").hidden).toBe(false);
    expect(streams).toHaveLength(1);
  });
});

describe("phone header CSS", () => {
  it("hides the header button on wide screens and the old header pieces on phones", () => {
    expect(CSS).toMatch(/\.run-head \{[^}]*display: none;/);
    const phone = (CSS.match(/:root\[data-phone\][^{]*\{[^}]*\}/g) ?? []).join(" ");
    expect(phone).toContain(":root[data-phone] .bar > .logo, :root[data-phone] .bar > .mode, :root[data-phone] .bar > .clock, :root[data-phone] .bar > .ident { display: none; }");
    expect(phone).toMatch(/\.run-head \{[^}]*display: flex;/);
  });
  it("drops the picker's 'Watching' label in the sheet, where it would repeat the run you are on", () => {
    expect(CSS).toContain(".rs-all .run-choice { font-size: 0; }");
  });
  it("blinks the live dot and holds it still under reduced motion", () => {
    expect(CSS).toMatch(/\.rh-state\.dot \{[^}]*animation: rh-blink/);
    expect(CSS).toContain("@media (prefers-reduced-motion: reduce) { .rh-state.dot, .rs-pill.live::before { animation: none; } }");
  });
});
