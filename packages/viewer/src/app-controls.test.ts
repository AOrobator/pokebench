// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ALL_ON, FEATURES } from "@pokebench/agent/features";
import { BASE_MS, Log, START } from "../test-support/events.js";
import { mountApp, type App, type StreamLike } from "./app.js";

const PAGE = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8");
const RUN = "2026-10-13T12-00-00_live";
const DRAFT = { model: "Qwen", thinking: "medium", maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3, maxTokens: 4096, target: null, features: { ...ALL_ON, "state-only-decisions-v1": false } };

class Stream implements StreamLike {
  private readonly listeners = new Map<string, ((m: { data: string }) => void)[]>();
  addEventListener(type: string, listener: (m: { data: string }) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  close(): void { /* nothing */ }
  send(type: string, data: unknown): void { for (const l of this.listeners.get(type) ?? []) l({ data: JSON.stringify(data) }); }
}

async function mount(history: unknown = {}, refuse = false, gameUp = true) {
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const writes: [string, string, unknown][] = [];
  const streams: Stream[] = [];
  let now = BASE_MS + 5_000;
  let draft: unknown = DRAFT;
  const app: App = await mountApp(document, {
    fetchJson: (url) => {
      if (url === "/api/runs") return Promise.resolve([{ id: RUN, model: "Qwen", started: "x", ended: false, reason: null, problem: null, live: gameUp }]);
      if (url === "/api/features") return Promise.resolve({ features: FEATURES, milestones: [] });
      if (url === "/api/next-run") return Promise.resolve({ draft, queue: { state: "idle" } });
      if (url === "/api/models") return Promise.resolve({ models: [{ id: "Qwen", status: "loaded", vision: true, contextWindow: 262144 }] });
      if (url === "/api/features/history") return Promise.resolve(history);
      if (url.endsWith("/comparisons")) return Promise.resolve({ candidates: [], baseline: null, best: null });
      return Promise.reject(new Error(`unexpected ${url}`));
    },
    sendJson: (method, url, body) => {
      writes.push([method, url, body]);
      if (url === "/api/next-run") { draft = body; return Promise.resolve({ draft: body, queue: { state: "idle" } }); }
      if (url === "/api/next-run/queue") return Promise.resolve({ queue: { state: "queued", runId: "next", waitingFor: `live run ${RUN}` } });
      if (url === "/api/next-run/cancel") return Promise.resolve({ queue: { state: "idle" } });
      return refuse ? Promise.reject(new Error("run is not live")) : Promise.resolve({ request: writes.length });
    },
    openStream: () => { const s = new Stream(); streams.push(s); return s; },
    now: () => now,
    hash: "",
  });
  const stream = streams[0];
  if (stream === undefined) throw new Error("no stream");
  const log = new Log();
  const send = (offset: number, body: Parameters<Log["add"]>[1]): void => { stream.send("ev", { ...log.add(offset, body), run: RUN }); };
  send(0, { ...START, harness_features: FEATURES.filter((f) => f.id !== "story-state-v1" && f.id !== "state-only-decisions-v1").map((f) => f.id) });
  stream.send("caught_up", {});
  await vi.waitFor(() => { expect(app.next.draft).not.toBeNull(); });
  app.tick(0);
  return { app, writes, send, setNow: (ms: number) => { now = ms; } };
}
const ui = (name: string): HTMLElement => { const e = document.querySelector<HTMLElement>(`[data-ui="${name}"]`); if (e === null) throw new Error(name); return e; };
const clickControl = (action: string): void => { const button = ui("run-controls").querySelector<HTMLButtonElement>(`[data-control="${action}"]`); if (button === null) throw new Error(action); button.click(); };
const abortPointer = (type: string): void => { ui("run-controls").querySelector('[data-control="abort"]')?.dispatchEvent(new Event(type, { bubbles: true })); };
const closeOverlay = (): void => { ui("run-controls").querySelector<HTMLButtonElement>('[data-dismiss-overlay]')?.click(); };
const key = (type: "keydown" | "keyup", k: string, target: EventTarget = document.body): void => { target.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true })); };

describe("run controls on the page", () => {
  it("sends pause, resume, stop and cancel-stop from the buttons and shows the matching overlay", async () => {
    const { app, writes, send } = await mount();
    expect(ui("mode").textContent).toBe("RUNNING");
    clickControl("pause");
    await vi.waitFor(() => { expect(writes.at(-1)).toEqual(["POST", `/api/runs/${RUN}/control`, { action: "pause" }]); });
    send(1_000, { type: "operator_control", turn: 1, action: "pause", status: "pending", request: 1 });
    send(2_000, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: 1, emulator_frozen: true });
    app.tick(0);
    expect(ui("mode").textContent).toBe("PAUSED");
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toContain("⏸ PAUSED");
    expect(ui("run-controls").textContent).toContain("RESUME");
    clickControl("resume");
    await vi.waitFor(() => { expect(writes.at(-1)?.[2]).toEqual({ action: "resume" }); });
    send(3_000, { type: "operator_control", turn: 1, action: "resume", status: "applied", request: 2, paused_ms: 1_000 });
    clickControl("stop");
    await vi.waitFor(() => { expect(writes.at(-1)?.[2]).toEqual({ action: "stop" }); });
    send(3_500, { type: "operator_control", turn: 1, action: "stop", status: "pending", request: 3 });
    app.tick(0);
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toContain("■ STOPPING");
    (ui("run-controls").querySelector('[data-control="cancel_stop"]') as HTMLButtonElement).click();
    await vi.waitFor(() => { expect(writes.at(-1)?.[2]).toEqual({ action: "cancel_stop" }); });
    const before = writes.length;
    key("keydown", "p", ui("next-max-turns"));
    key("keydown", "q");
    await Promise.resolve();
    expect(writes).toHaveLength(before);
  });

  it("aborts only after the button is held, and releasing cancels", async () => {
    const { app, writes, setNow } = await mount();
    abortPointer("pointerdown");
    app.tick(0);
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toContain("✖ ABORT RUN?");
    setNow(BASE_MS + 5_000 + 1_000);
    app.tick(0);
    abortPointer("pointerup");
    app.tick(0);
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toBe("");
    expect(writes.filter(([, url]) => url.endsWith("/control"))).toEqual([]);
    abortPointer("pointerdown");
    setNow(BASE_MS + 5_000 + 1_000 + 1_600);
    app.tick(0);
    await vi.waitFor(() => { expect(writes.at(-1)).toEqual(["POST", `/api/runs/${RUN}/control`, { action: "abort" }]); });
  });

  it("shows the run ended overlay once, closable with its button", async () => {
    const { app, send } = await mount();
    send(9_000, { type: "run_end", turn: 1, reason: "operator_stop", furthest_milestone: null, turns: 1, wall_ms: 9_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    app.tick(0);
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toContain("■ RUN ENDED");
    closeOverlay();
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toBe("");
  });
});

describe("★ NEXT RUN on the page", () => {
  it("edits the draft with dependency cascades, flags live differences and queues", async () => {
    const { writes } = await mount();
    expect(ui("next-note").textContent).toContain("1 switch differs from it");
    expect((ui("next-model") as HTMLSelectElement).value).toBe("Qwen");
    expect(ui("next-model-info").textContent).toContain("262,144");
    expect(ui("switchboard").textContent).toContain("DIFFERS FROM LIVE RUN");
    const map = ui("switchboard").querySelector<HTMLInputElement>('[data-feature="live-map-v1"]');
    if (map === null) throw new Error("no switch");
    map.checked = false;
    map.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => { expect(writes.at(-1)?.[1]).toBe("/api/next-run"); });
    const saved = writes.at(-1)?.[2] as typeof DRAFT;
    expect([saved.features["live-map-v1"], saved.features["world-coordinate-grid-v1"], saved.features["warp-activation-guidance-v1"]]).toEqual([false, false, false]);
    const grid = ui("switchboard").querySelector<HTMLInputElement>('[data-feature="world-coordinate-grid-v1"]');
    expect(grid?.disabled).toBe(true);
    (ui("next-thinking").querySelector('[data-level="high"]') as HTMLButtonElement).click();
    await vi.waitFor(() => { expect((writes.at(-1)?.[2] as typeof DRAFT).thinking).toBe("high"); });
    const turns = ui("next-max-turns") as HTMLInputElement;
    turns.value = "120"; turns.dispatchEvent(new Event("change"));
    await vi.waitFor(() => { expect((writes.at(-1)?.[2] as typeof DRAFT).maxTurns).toBe(120); });
    turns.value = "-1"; turns.dispatchEvent(new Event("change"));
    (ui("next-copy") as HTMLButtonElement).click();
    await vi.waitFor(() => { expect((writes.at(-1)?.[2] as typeof DRAFT).features["story-state-v1"]).toBe(false); });
    (ui("next-reset") as HTMLButtonElement).click();
    await vi.waitFor(() => { expect((writes.at(-1)?.[2] as typeof DRAFT).features["story-state-v1"]).toBe(true); });
    (ui("next-queue") as HTMLButtonElement).click();
    await vi.waitFor(() => { expect(ui("next-queue-status").textContent).toBe(`Queued next · waiting for live run ${RUN}.`); });
    expect(ui("next-cancel").hidden).toBe(false);
    (ui("next-cancel") as HTMLButtonElement).click();
    await vi.waitFor(() => { expect(ui("next-cancel").hidden).toBe(true); });
    expect((ui("next-model") as HTMLSelectElement).value).toBe("think-swarm");
    expect(ui("next-model-info").textContent).toContain("not served now");
  });

  it("expands a feature's history into the reach and split table", async () => {
    const { app } = await mount({ "story-state-v1": { on: { runs: 2, reached: { NEW_GAME_CREATED: 2 }, medianMs: { NEW_GAME_CREATED: 30_000 } }, off: { runs: 2, reached: { NEW_GAME_CREATED: 1 }, medianMs: { NEW_GAME_CREATED: 60_000 } } } });
    const toggle = ui("switchboard").querySelector<HTMLButtonElement>('[data-expand="story-state-v1"]');
    toggle?.click();
    await Promise.resolve();await Promise.resolve();
    expect(ui("switchboard").textContent).toContain("MEDIAN SPLIT · ON");
    ui("switchboard").querySelector<HTMLButtonElement>('[data-expand="story-state-v1"]')?.click();
    expect(ui("switchboard").textContent).not.toContain("MEDIAN SPLIT · ON");
    expect(app.next.expanded.size).toBe(0);
  });
});

describe("control input edge cases", () => {
  it("ignores key repeats, unrelated keys and controls that do not apply, and holds abort from the button", async () => {
    const { app, writes, send, setNow } = await mount();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "p", repeat: true, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keyup", { key: "p", bubbles: true }));
    await Promise.resolve();
    expect(writes).toEqual([]);
    await app.control("resume");
    expect(writes).toEqual([]);
    const abort = ui("run-controls").querySelector('[data-control="abort"]');
    abort?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    app.tick(0);
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toContain("ABORT RUN?");
    ui("run-controls").dispatchEvent(new Event("pointerleave"));
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toBe("");
    abort?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(writes).toEqual([]);
    send(9_000, { type: "run_end", turn: 1, reason: "operator_abort", furthest_milestone: null, turns: 1, wall_ms: 9_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    app.tick(0);
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toContain("✖ ABORTED");
    expect(ui("mode").textContent).toBe("ABORTED");
    abortPointer("pointerdown");
    setNow(BASE_MS + 60_000);
    app.tick(0);
    closeOverlay();
    expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toBe("");
    expect(writes).toEqual([]);
  });

  it("reports a refused control request", async () => {
    const { app } = await mount({}, true);
    clickControl("stop");
    await vi.waitFor(() => { expect(ui("problems").textContent).toContain("stop: Error: run is not live"); });
    expect(app.view.control.state).toBe("running");
  });
});

it("does not bind viewer controls to keyboard shortcuts", async () => {
  const { app, writes, setNow } = await mount();
  key("keydown", "p", ui("next-max-turns"));
  key("keydown", "s", ui("next-model"));
  await Promise.resolve();
  expect(writes).toEqual([]);
  for (const k of ["p", "s", "x", "b", "Escape"]) key("keydown", k);
  setNow(BASE_MS + 60_000);
  app.tick(0);
  for (const k of ["p", "s", "x", "b", "Escape"]) key("keyup", k);
  await Promise.resolve();
  expect(writes).toEqual([]);
  expect(ui("screen-overlay").textContent).toBe("");
});

it("drops a held abort when the window loses focus", async () => {
  const { app, writes, setNow } = await mount();
  abortPointer("pointerdown");
  window.dispatchEvent(new Event("blur"));
  setNow(BASE_MS + 60_000);
  app.tick(0);
  abortPointer("pointerdown");
  document.dispatchEvent(new Event("visibilitychange"));
  app.tick(0);
  await Promise.resolve();
  expect(writes).toEqual([]);
  expect(document.querySelector('[data-ui="screen-overlay"]')?.textContent).toBe("");
});

it("sends STOP while a pause is still pending", async () => {
  const { app, writes, send } = await mount();
  send(1_000, { type: "operator_control", turn: 1, action: "pause", status: "pending", request: 1 });
  app.tick(0);
  clickControl("stop");
  await vi.waitFor(() => { expect(writes.at(-1)?.[2]).toEqual({ action: "stop" }); });
  send(1_500, { type: "operator_control", turn: 1, action: "stop", status: "pending", request: 2 });
  app.tick(0);
  expect(ui("mode").textContent).toBe("STOPPING");
});


it("shows an unended run whose game server is gone as not responding, with controls off", async () => {
  const { writes } = await mount({}, false, false);
  expect(ui("mode").textContent).toBe("NOT RESPONDING");
  expect((ui("run") as HTMLSelectElement).options[0]?.textContent).toBe(`NOT RESPONDING · ${RUN}`);
  expect(document.querySelector('[data-ui="live-runs"]')).toBeNull();
  expect(ui("run-controls").querySelectorAll("button:not([disabled])")).toHaveLength(0);
  key("keydown", "p");
  await Promise.resolve();
  expect(writes).toEqual([]);
});
