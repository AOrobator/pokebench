// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RunEvent } from "@pokebench/agent/events";
import { BASE_MS, fullRun, must } from "../test-support/events.js";
import { mountApp, type App, type AppDeps, type StreamLike } from "./app.js";
import { FRONTIER_MILESTONES } from "./frontier.js";
import type { GlyphSheet } from "./game-font.js";
import type { WorkbenchRun } from "./workbench-data.js";

const PAGE = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8");
const CSS = readFileSync(join(import.meta.dirname, "../static/style.css"), "utf8").replace(/\s+/g, " ");
const EXP = "bundle-v-control-dryrun-cook";
const FLAGS = { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true };
const LIVE_ID = "2026-10-16T05-51-58_qwen36-gpu0_7a95";
const OTHER_ID = "2026-10-16T05-51-58_qwen36-gpu1_7f38";
const REPLAY_ID = "2026-10-16T04-51-03_qwen36-gpu0_54a7";
const TRAINERS = ["brendan", "may", "birch", "wally", "roxanne", "brawly", "wattson", "flannery", "norman", "winona", "sidney", "phoebe", "glacia", "drake"];
const MANIFEST = { version: 1, tiers: ["green", "bronze", "copper", "silver", "gold"], trainers: TRAINERS, icons: [280, 412], egg: 412, proof: {}, source: {} };
const FONT = { widths: Array.from({ length: 512 }, () => 4), cmap: { A: 1 } };
const RUNS = [
  { id: LIVE_ID, model: "qwen", started: "2026-10-16T05:52:27.171-04:00", ended: false, reason: null, problem: null, live: true, experiment: `${EXP} · bundle · 2/4`, cohort: { id: EXP, arm: "bundle", trial: 2, of: 4 } },
  { id: OTHER_ID, model: "qwen", started: "2026-10-16T05:52:27.171-04:00", ended: false, reason: null, problem: null, live: true, experiment: `${EXP} · control · 1/4`, cohort: { id: EXP, arm: "control", trial: 1, of: 4 } },
  { id: REPLAY_ID, model: "qwen", started: "2026-10-16T04:51:31.543-04:00", ended: true, reason: "budget", problem: null, live: false, experiment: `${EXP} · bundle · 2/4`, cohort: { id: EXP, arm: "bundle", trial: 2, of: 4 } },
];
const milestone = must(FRONTIER_MILESTONES[3]);
function wbRun(id: string, arm: string, splitMs: number, elapsedMs: number): WorkbenchRun {
  return { id, cohort: EXP, arm, model: "qwen", experiment: { id: EXP, arm, trial: arm === "bundle" ? 2 : 1, of: 4 }, started: null, status: "live", reason: null, problem: null, excluded: null, elapsedMs, turn: 5, config: { source: "a".repeat(40), dirty: false, vendor: "v", pi: "p", preset: "bundle-v-control", target: null, thinking: "medium", maxTokens: 4096, maxTurns: null, maxWallMs: 3_600_000, failureLimit: 3, context: 65536, vision: true, start: "save_state", resume: null, tools: [], features: [] },
    splits: [{ name: milestone.id, elapsedMs: splitMs, segmentMs: splitMs, seq: 4, turn: 3, inputTokens: 1, outputTokens: 1 }],
    card: { name: arm === "bundle" ? "RED" : "MAY", location: "OLDALE TOWN", party: [{ speciesId: 280, level: 7, egg: false }] } };
}

class FakeStream implements StreamLike {
  private readonly listeners = new Map<string, ((message: { data: string }) => void)[]>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (message: { data: string }) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  close(): void {}
  send(type: string, data: unknown): void { for (const listener of this.listeners.get(type) ?? []) listener({ data: JSON.stringify(data) }); }
}

let nowMs = BASE_MS;
const fetched: string[] = [];
const setWidth = (width: number): void => { (window as unknown as { happyDOM: { setInnerWidth(width: number): void } }).happyDOM.setInnerWidth(width); };
const ui = (name: string): HTMLElement => must(document.querySelector<HTMLElement>(`[data-ui="${name}"]`));
const card = (root: ParentNode, id: string): HTMLElement => must(root.querySelector<HTMLElement>(`.tc[data-watch="${id}"]`));

function cohortRun(): RunEvent[] {
  return fullRun().events.slice(0, 10).map((event) => (event.type === "run_start" ? { ...event, budgets: { ...event.budgets, max_wall_ms: 3_600_000 }, evaluation: { preset_id: "bundle-v-control", target: null, failure_limit: 3, flags: FLAGS, experiment: { id: EXP, arm: "bundle", trial: 2, of: 4 } } } : event));
}

let workbenchDown = false;
async function mount(width: number, options: { art?: boolean; fresh?: boolean; glyphs?: boolean; pendingGlyphs?: Promise<GlyphSheet | null>; runs?: typeof RUNS; replayStatus?: "ended" | "live"; missingLiveCards?: boolean; snapshotExtension?: number; cardsDown?: boolean; font?: Promise<unknown> } = {}): Promise<{ app: App; streams: FakeStream[]; drawn: number[] }> {
  nowMs = BASE_MS + 3_500; setWidth(width); fetched.length = 0; workbenchDown = options.cardsDown === true;
  document.body.innerHTML = PAGE.slice(PAGE.indexOf("<body>") + 6, PAGE.indexOf("</body>"));
  const streams: FakeStream[] = [], drawn: number[] = [];
  const replayStatus = options.replayStatus ?? "ended";
  const replay = { ...wbRun(REPLAY_ID, "bundle", options.fresh === true ? 3_590_000 : 1_000_000, 3_600_000), status: replayStatus, reason: replayStatus === "ended" ? "budget" : null };
  const workbench = { version: 1, at: nowMs, milestones: [], problems: [], runs: [wbRun(LIVE_ID, "bundle", options.fresh === true ? 2_790_000 : 1_000_000, 2_800_000), wbRun(OTHER_ID, "control", 500_000, 2_700_000), replay] };
  if (options.snapshotExtension !== undefined) for (const run of workbench.runs) if (run.id === LIVE_ID && run.config !== null) run.config.extendedWallMs = options.snapshotExtension;
  if (options.missingLiveCards === true) workbench.runs = [replay];
  const deps: AppDeps = {
    fetchJson: (url) => {
      fetched.push(url);
      if (url === "/api/runs") return Promise.resolve(options.runs ?? RUNS);
      if (url === "/sprites/manifest.json") return options.art === false ? Promise.reject(new Error("GET /sprites/manifest.json returned HTTP 404")) : Promise.resolve(MANIFEST);
      if (url === "/sprites/font/glyphs.json") return options.font ?? Promise.resolve(FONT);
      if (url.startsWith("/api/cards")) return workbenchDown ? Promise.reject(new Error("GET /api/cards returned HTTP 500")) : Promise.resolve(workbench);
      if (url === "/api/features") return Promise.resolve({ features: [], milestones: [] });
      if (url === "/api/next-run") return Promise.resolve({ draft: { model: "", thinking: "medium", maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3, maxTokens: 4096, target: null, features: {} }, queue: { state: "idle" } });
      if (url === "/api/models") return Promise.resolve({ models: [] });
      if (url === "/api/features/history") return Promise.resolve({});
      if (url.endsWith("/comparisons")) return Promise.resolve({ candidates: [], baseline: null, best: null });
      return Promise.reject(new Error(`unexpected ${url}`));
    },
    sendJson: () => Promise.reject(new Error("unexpected write")),
    openStream: (url) => { const stream = new FakeStream(url); streams.push(stream); return stream; },
    now: () => nowMs,
    hash: `#run=${LIVE_ID}`,
    ...(options.pendingGlyphs !== undefined ? { loadGlyphSheet: () => options.pendingGlyphs ?? Promise.resolve(null) } : {}),
    ...(options.glyphs === true ? { loadGlyphSheet: (): Promise<GlyphSheet> => Promise.resolve({ width: 256, height: 512, data: new Uint8ClampedArray(256 * 512 * 4) }), drawGlyphs: (_canvas: HTMLCanvasElement, pixels: { width: number }): void => { drawn.push(pixels.width); } } : {}),
  };
  const app = await mountApp(document, deps);
  const stream = must(streams[0]);
  for (const event of cohortRun()) stream.send("ev", { ...event, run: LIVE_ID });
  stream.send("caught_up", {});
  if (options.pendingGlyphs === undefined && options.font === undefined) await app.pollCards();
  else { await Promise.resolve(); await Promise.resolve(); }
  app.tick(0);
  return { app, streams, drawn };
}

describe("trainer cards in the viewer", () => {
  afterEach(() => { setWidth(1024); });

  it("on desktop, shows a wide card per live run in the header in place of the live-run buttons", async () => {
    await mount(1280);
    const row = ui("run-cards");
    expect(row.hidden).toBe(false); expect(document.querySelector('[data-ui="live-runs"]')).toBeNull();
    expect(row.querySelectorAll(".tc.tc-wide")).toHaveLength(2);
    const mine = card(row, LIVE_ID), other = card(row, OTHER_ID);
    expect(mine.getAttribute("aria-pressed")).toBe("true"); expect(mine.innerHTML).toContain('data-gt="WATCHING"'); expect(other.innerHTML).toContain('data-gt="LIVE"');
    expect(mine.innerHTML).toContain("/sprites/trainers/wattson.png"); expect(other.innerHTML).toContain("/sprites/trainers/sidney.png");
    expect(mine.innerHTML).toContain(milestone.label); expect(mine.innerHTML).toContain("Oldale Town"); expect(mine.innerHTML).not.toContain("trial 2/4"); expect(mine.textContent).toContain("RED");
  });

  it("shows header and phone cards before the optional font resolves through App", async () => {
    const font = Promise.withResolvers<unknown>();
    const { app } = await mount(1280, { font: font.promise });
    const headerCards = ui("run-cards").querySelectorAll(".tc").length;
    setWidth(375); app.tick(0);
    const phoneCards = ui("run-sheet-body").querySelectorAll(".tc").length;
    font.resolve(FONT);
    await app.pollCards();
    expect(headerCards).toBe(2);
    expect(phoneCards).toBe(2);
    expect(ui("card-status").hidden).toBe(true);
  });

  it("retries missing artwork on the next card poll and clears the retry notice", async () => {
    const options = { art: false };
    const { app } = await mount(1280, options);
    expect(ui("run-cards").hidden).toBe(true);
    expect(ui("card-status").textContent).toContain("artwork unavailable");
    const attempts = fetched.filter(url => url === "/sprites/manifest.json").length;
    options.art = true;
    await app.pollCards();
    expect(ui("run-cards").querySelectorAll(".tc")).toHaveLength(2);
    expect(ui("card-status").hidden).toBe(true);
    expect(fetched.filter(url => url === "/sprites/manifest.json")).toHaveLength(attempts + 1);
  });

  it("shows an initial card-data failure and recovers on the existing polling cadence", async () => {
    const { app } = await mount(1280, { cardsDown: true });
    expect(ui("card-status").textContent).toContain("Trainer cards unavailable");
    expect(ui("card-status").hidden).toBe(false);
    workbenchDown = false;
    await app.pollCards();
    expect(ui("run-cards").querySelectorAll(".tc")).toHaveLength(2);
    expect(ui("card-status").hidden).toBe(true);
  });

  it("never recreates the legacy live-run bars when the run list refreshes", async () => {
    const { app } = await mount(1280);
    await app.refreshRuns();
    expect(document.querySelector('[data-ui="live-runs"]')).toBeNull(); expect(ui("run-cards").hidden).toBe(false);
  });

  it("keeps the last cards, unchanged, when a workbench poll fails, and carries on with the next one", async () => {
    const { app } = await mount(1280);
    const before = card(ui("run-cards"), LIVE_ID);
    workbenchDown = true; await app.pollCards(); app.tick(0);
    expect(ui("card-status").textContent).toBe("Trainer card updates unavailable. Retrying…");
    expect(card(ui("run-cards"), LIVE_ID)).toBe(before); expect(ui("run-cards").hidden).toBe(false);
    workbenchDown = false; await app.pollCards(); app.tick(0);
    expect(ui("card-status").hidden).toBe(true);
    expect(card(ui("run-cards"), LIVE_ID)).toBe(before);
  });

  it("redraws only the card that changed when a poll brings new data", async () => {
    const { app } = await mount(1280, { fresh: true });
    const mine = card(ui("run-cards"), LIVE_ID), other = card(ui("run-cards"), OTHER_ID);
    expect(mine.classList.contains("tc-new")).toBe(true);
    await app.pollCards(); app.tick(0);
    expect(card(ui("run-cards"), LIVE_ID)).toBe(mine); expect(card(ui("run-cards"), OTHER_ID)).toBe(other);
    nowMs += 40_000; app.tick(0);
    expect(card(ui("run-cards"), LIVE_ID)).not.toBe(mine); expect(card(ui("run-cards"), LIVE_ID).classList.contains("tc-new")).toBe(false);
    expect(card(ui("run-cards"), OTHER_ID)).toBe(other);
    expect(ui("run-cards").querySelectorAll(".tc")).toHaveLength(2);
  });

  it("keeps keyboard focus on a card that is redrawn after Enter watches it", async () => {
    await mount(1280);
    const other = card(ui("run-cards"), OTHER_ID);
    other.focus(); other.click();
    const redrawn = card(ui("run-cards"), OTHER_ID);
    expect(redrawn).not.toBe(other); expect(redrawn.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(redrawn);
  });

  it("clicking a card watches that run", async () => {
    const { streams } = await mount(1280);
    card(ui("run-cards"), OTHER_ID).click();
    expect(streams.at(-1)?.url).toBe(`/api/runs/${encodeURIComponent(OTHER_ID)}/events?head=1`);
    expect((ui("run") as HTMLSelectElement).value).toBe(OTHER_ID);
  });

  it("shows only the explicitly selected replay instead of mixing live cards into it", async () => {
    const { app } = await mount(1280);
    app.select(REPLAY_ID);
    const row = ui("run-cards");
    expect([...row.querySelectorAll<HTMLElement>("[data-watch]")].map(e => e.dataset.watch)).toEqual([REPLAY_ID]);
    expect(card(row, REPLAY_ID).querySelector('[data-gt="REPLAY"]')).not.toBeNull();
  });

  it("shows the selected replay card without marking it live when no live runs exist", async () => {
    await mount(1280, { runs: [must(RUNS[2])] });
    const row = ui("run-cards"), replay = card(row, REPLAY_ID);
    expect(row.querySelectorAll(".tc.tc-wide")).toHaveLength(1);
    expect(replay.getAttribute("aria-pressed")).toBe("true");
    expect(replay.innerHTML).toContain('data-gt="REPLAY"');
    expect(replay.querySelector(".tc-dot")).toBeNull();
  });

  it("shows the replay while discovered live runs have no renderable workbench cards", async () => {
    const { app } = await mount(375, { missingLiveCards: true });
    app.select(REPLAY_ID);
    expect([...ui("run-cards").querySelectorAll<HTMLElement>("[data-watch]")].map(e => e.dataset.watch)).toEqual([REPLAY_ID]);
    const replay = card(ui("run-sheet-body"), REPLAY_ID);
    expect(replay.getAttribute("aria-pressed")).toBe("true");
    expect(replay.querySelector('[data-gt="REPLAY"]')).not.toBeNull();
    expect(replay.querySelector(".tc-dot")).toBeNull();
  });

  it("retains the other mobile card and its artwork when one card changes", async () => {
    const { app } = await mount(375, { fresh: true });
    ui("run-head").click();
    const other = card(ui("run-sheet-body"), OTHER_ID), art = other.querySelector(".tc-art");
    nowMs += 40_000; app.tick(0);
    expect(card(ui("run-sheet-body"), OTHER_ID)).toBe(other);
    expect(other.querySelector(".tc-art")).toBe(art);
    expect(ui("run-sheet").hidden).toBe(false);
  });

  it("keeps replay fallback semantics when the retained workbench snapshot still says live", async () => {
    await mount(1280, { runs: [must(RUNS[2])], replayStatus: "live" });
    const replay = card(ui("run-cards"), REPLAY_ID);
    expect(replay.getAttribute("aria-pressed")).toBe("true");
    expect(replay.innerHTML).toContain('data-gt="REPLAY"');
    expect(replay.querySelector(".tc-dot")).toBeNull();
  });

  it("keeps a fresh stale-workbench replay dotless in the shared header and mobile cards", async () => {
    await mount(375, { runs: [must(RUNS[2])], replayStatus: "live", fresh: true });
    ui("run-head").click();
    for (const host of [ui("run-cards"), ui("run-sheet-body")]) {
      const replay = card(host, REPLAY_ID);
      expect(replay.querySelector('[data-gt="REPLAY"]')).not.toBeNull();
      expect(replay.querySelector(".tc-dot")).toBeNull();
      expect(replay.classList.contains("tc-new")).toBe(false);
    }
  });

  it("does not admit an ended workbench record into a stale live run list", async () => {
    const staleRuns = RUNS.map((run) => run.id === REPLAY_ID ? { ...run, ended: false, live: true } : run);
    const { app } = await mount(1280, { runs: staleRuns });
    app.select(REPLAY_ID);
    const row = ui("run-cards");
    expect(row.querySelectorAll(".tc.tc-wide")).toHaveLength(2);
    expect(row.querySelector(`[data-watch="${REPLAY_ID}"]`)).toBeNull();
  });

  it("ticks the clock in place without redrawing the card, so its animations keep running", async () => {
    const { app } = await mount(1280);
    const before = card(ui("run-cards"), LIVE_ID), clock = must(before.querySelector<HTMLElement>("[data-clock]"));
    expect(clock.textContent).toBe("46:40/1:00:00");
    nowMs += 1_000; app.tick(1_000);
    expect(card(ui("run-cards"), LIVE_ID)).toBe(before); expect(clock.textContent).toBe("46:41/1:00:00");
    expect(must(before.querySelector<HTMLElement>("[data-time-bar]")).style.width).toBe("77.8%");
  });

  it("marks a new milestone with the glow and the corner badge", async () => {
    await mount(1280, { fresh: true });
    const mine = card(ui("run-cards"), LIVE_ID);
    expect(mine.classList.contains("tc-new")).toBe(true); expect(mine.innerHTML).toContain("NEW MILESTONE!"); expect(mine.innerHTML).not.toContain('data-gt="WATCHING"');
  });

  it("on a phone, the sheet reuses the full trainer cards; tapping one watches it and closes the sheet", async () => {
    const { streams } = await mount(375, { fresh: true });
    const body = ui("run-sheet-body"), cards = body.querySelectorAll<HTMLElement>(".tc.tc-wide");
    expect(cards).toHaveLength(2); expect(cards[0]?.dataset.watch).toBe(LIVE_ID);
    expect(cards[0]?.innerHTML).toBe(card(ui("run-cards"), LIVE_ID).innerHTML);
    expect(body.querySelector(".rs-now, .rs-other")).toBeNull();
    ui("run-head").click(); expect(ui("run-sheet").hidden).toBe(false);
    card(body, OTHER_ID).click();
    expect(ui("run-sheet").hidden).toBe(true); expect(streams.at(-1)?.url).toBe(`/api/runs/${encodeURIComponent(OTHER_ID)}/events?head=1`);
  });

  it("without art, keeps the plain sheet and recorded splits without legacy bars", async () => {
    const { app } = await mount(1280, { art: false });
    await app.pollCards();
    expect(ui("run-cards").hidden).toBe(true); expect(document.querySelector('[data-ui="live-runs"]')).toBeNull();
    expect(fetched).toContain(`/api/cards?run=${encodeURIComponent(LIVE_ID)}`);
    setWidth(375); app.tick(0);
    expect(ui("run-sheet-body").querySelector(".rs-now, .rs-other")).toBeNull();
    expect(ui("run-sheet-body").textContent).toContain("Trainer card artwork unavailable. Retrying");
  });

  it("shows bottom-sheet card backgrounds before the optional glyph sheet resolves", async () => {
    let finish: ((value: null) => void) | undefined;
    const pending = new Promise<null>(resolve => { finish = resolve; });
    const { app } = await mount(375, { pendingGlyphs: pending });
    expect(ui("run-sheet-body").querySelectorAll(".tc-art").length).toBeGreaterThan(0);
    expect(ui("run-sheet-body").querySelector<HTMLElement>(".tc-art")?.style.backgroundImage).toContain("/sprites/card/wide-");
    expect(ui("run-sheet-body").querySelector("[data-painted]")).toBeNull();
    finish?.(null); await app.pollCards();
    expect(ui("run-sheet-body").querySelectorAll(".tc-art").length).toBeGreaterThan(0);
  });

  it("paints the game-font text once the glyph sheet loads", async () => {
    const { drawn } = await mount(1280, { glyphs: true });
    expect(drawn.length).toBeGreaterThan(0);
    expect(ui("run-cards").querySelectorAll("[data-gt]:not([data-painted])")).toHaveLength(0);
  });

  it("styles the cards: hidden on phones in the header, pixel art, bobbing icons, gold border and badge", () => {
    expect(CSS).toContain(":root[data-phone] .bar > .run-cards { display: none !important; }");
    expect(CSS).toContain("image-rendering: pixelated");
    expect(CSS).toMatch(/@keyframes tc-bob/); expect(CSS).toMatch(/@keyframes tc-ring/);
    expect(CSS).toContain("linear-gradient(#fff3a0, #f8c828)"); expect(CSS).toContain("#a07800");
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\) \{[^}]*\.tc/);
  });
});


it("reconciles applied streamed extensions across cards and metadata while their snapshot lags", async () => {
  const { app, streams } = await mount(1280);
  const stream = must(streams[0]), before = card(ui("run-cards"), LIVE_ID);
  const cap = (): string => before.querySelector("[data-clock]")?.textContent ?? "";
  const ack = (seq: number, status: "pending" | "ignored" | "failed" | "applied", max: number): void => {
    stream.send("ev", { v: 1, run: LIVE_ID, seq, t: new Date(nowMs).toISOString(), turn: 4, type: "operator_control", action: "extend_30m", status, request: seq, previous_max_wall_ms: max - 1_800_000, max_wall_ms: max }); app.tick(0);
  };
  expect(cap()).toContain("/1:00:00");
  for (const [index, status] of (["pending", "ignored", "failed"] as const).entries()) { ack(100 + index, status, 5_400_000); expect(cap()).toContain("/1:00:00"); }
  ack(103, "applied", 5_400_000);
  expect(cap()).toContain("/1:30:00");
  expect(ui("run-details").textContent).toContain("ORIGINAL RECORDED CONFIGURATION");
  expect(ui("run-details").textContent).toContain('"max_wall_ms": 3600000');
  expect(ui("run-details").textContent).toContain("CURRENT EFFECTIVE WALL LIMIT");
  expect(ui("run-details").textContent).toContain('"max_wall_ms": 5400000');
  await app.pollCards(); app.tick(0);
  expect(cap()).toContain("/1:30:00");
  ack(104, "applied", 7_200_000);
  expect(cap()).toContain("/2:00:00");
  expect(card(ui("run-cards"), LIVE_ID)).toBe(before);
  expect(card(ui("run-cards"), OTHER_ID).querySelector("[data-clock]")?.textContent).toContain("/1:00:00");
  expect(card(ui("run-sheet-body"), LIVE_ID).querySelector("[data-clock]")?.textContent).toContain("/2:00:00");
});

it("keeps a newer snapshot extension when the selected stream is still catching up", async () => {
  const { app, streams } = await mount(1280, { snapshotExtension: 7_200_000 });
  must(streams[0]).send("ev", { v: 1, run: LIVE_ID, seq: 100, t: new Date(nowMs).toISOString(), turn: 4, type: "operator_control", action: "extend_30m", status: "applied", request: 1, previous_max_wall_ms: 3_600_000, max_wall_ms: 5_400_000 });
  app.tick(0);
  expect(card(ui("run-cards"), LIVE_ID).querySelector("[data-clock]")?.textContent).toContain("/2:00:00");
});
