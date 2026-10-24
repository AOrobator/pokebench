// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { run as recorded } from "../test-support/workbench.js";
import type { WorkbenchData, WorkbenchRun } from "./workbench-data.js";
import { Workbench } from "./workbench.js";
function run(overrides: Partial<WorkbenchRun> = {}): WorkbenchRun { return { measurement: { controller: "agent", features: [], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] }, ...recorded(overrides) }; }
const html = readFileSync(join(process.cwd(), "static/workbench.html"), "utf8");
function data(): WorkbenchData { return { version: 1, at: 1000, milestones: [{ id: "NEW_GAME_CREATED", label: "New game" }, { id: "PLAYER_NAME_CONFIRMED", label: "Accepted name" }], runs: [run()], problems: [] }; }
function must<T>(v: T | null | undefined): T { if (v == null) throw new Error("fixture"); return v; }
function ui(name: string): HTMLElement { const element = document.querySelector<HTMLElement>(`[data-wb="${name}"]`); if (element === null) throw new Error(name); return element; }
function change(name: string, value: string): void { (ui(name) as HTMLSelectElement).value = value; ui(name).dispatchEvent(new Event("change", { bubbles: true })); }
function open(): void { ui("frontier-full").querySelector('[data-run="run_01"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })); }
function mount(value: unknown = data()): { wb: Workbench; fetch: ReturnType<typeof vi.fn> } { const fetch = vi.fn(() => Promise.resolve(value)); return { wb: new Workbench(document, { fetchSnapshot: fetch, now: () => 6000, width: () => 340 }, "run_01"), fetch }; }
beforeEach(() => { document.documentElement.innerHTML = html.replace(/<!doctype html>/i, "").replace(/<link[^>]+>/g, "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""); });
describe("mounted runs and comparisons workbench", () => {
  it("keeps the graph nodes across polls and live clock-only changes, but redraws changed checkpoints", async () => {
    const initial = { ...data(), runs: [run({ status: "live" })] };
    const { wb, fetch } = mount(initial); await wb.refresh();
    const graph = ui("frontier-full").firstElementChild;
    const next = structuredClone(initial); next.at += 5000; const live = must(next.runs[0]);
    live.elapsedMs = (live.elapsedMs ?? 0) + 5000; live.turn++; if (live.measurement !== undefined) live.measurement.logSha256 = "b".repeat(64);
    fetch.mockResolvedValue(next); await wb.refresh();
    expect(ui("frontier-full").firstElementChild).toBe(graph);
    wb.resize(); expect(ui("frontier-full").firstElementChild).toBe(graph);
    const changed = structuredClone(next); changed.at += 5000; must(must(changed.runs[0]).splits[0]).elapsedMs += 1000;
    fetch.mockResolvedValue(changed); await wb.refresh();
    expect(ui("frontier-full").firstElementChild).not.toBe(graph); wb.destroy();
  });
  it("loads the frontier, actual configuration options and no execution queue", async () => {
    const { wb } = mount(); await wb.refresh(); expect(ui("frontier-full").querySelector('[data-run="run_01"][data-split="PLAYER_NAME_CONFIRMED"]')).not.toBeNull(); expect(document.querySelector('[data-wb="queue"]')).toBeNull(); expect(ui("current").textContent).not.toContain("QUEUED"); expect(document.querySelector('[data-wb="cohort"]')).toBeNull(); wb.destroy();
  });
  it("preserves filters on a refresh and ignores unrelated changes", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); change("model", run().model ?? ""); change("preset", "objectives-on"); fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh(); expect((ui("model") as HTMLSelectElement).value).toBe(run().model); expect((ui("preset") as HTMLSelectElement).value).toBe("objectives-on"); expect(ui("frontier-full").querySelector('[data-run="run_01"]')).not.toBeNull();
    const unrelated = document.createElement("select"); unrelated.dataset.wb = "elsewhere"; document.body.append(unrelated); unrelated.dispatchEvent(new Event("change", { bubbles: true })); expect((ui("preset") as HTMLSelectElement).value).toBe("objectives-on");  wb.resize(); wb.destroy();
  });
  it("filters inclusive Eastern run-start dates across cohorts, combines filters and clears dates", async () => {
    const runs = [
      run({ id: "before", started: "2026-10-19T03:59:59Z" }),
      run({ id: "bundle", cohort: "bundle", started: "2026-10-19T04:00:00Z" }),
      run({ id: "control", cohort: "control", started: "2026-10-21T03:59:59Z", status: "live" }),
      run({ id: "after", started: "2026-10-21T04:00:00Z" }),
      run({ id: "unknown", started: null }), run({ id: "bad", started: "invalid" }),
    ];
    const { wb } = mount({ ...data(), runs }); await wb.refresh();
    const plotted = () => new Set([...ui("frontier-full").querySelectorAll<SVGElement>("[data-run]")].map(e => e.dataset.run));
    change("date-from", "2026-10-19"); change("date-through", "2026-10-20");
    // The global frontier reference remains visible even outside the range.
    expect(plotted()).toEqual(new Set(["after", "bundle", "control"]));
    expect(ui("overlay").textContent).toContain("bundle"); expect(ui("overlay").textContent).not.toContain("unknown");
     change("date-from", "2026-10-21");
    expect(ui("date-problem").textContent).toContain("on or before"); expect(plotted()).toEqual(new Set(["after"]));
    document.querySelector<HTMLButtonElement>("[data-clear-dates]")?.click();
    expect((ui("date-from") as HTMLInputElement).value).toBe(""); expect((ui("date-through") as HTMLInputElement).value).toBe("");
    expect(ui("date-problem").hidden).toBe(true); expect(plotted().has("unknown")).toBe(true); expect(plotted().has("bad")).toBe(true);
    wb.destroy();
  });
  it("supports either date bound and retains values, focus and filtering across failed polls and recovery", async () => {
    const { wb, fetch } = mount({ ...data(), runs: [run(), run({ id: "later", started: "2026-10-15T12:00:00Z" })] }); await wb.refresh();
    change("date-through", "2026-10-13"); expect(ui("overlay").textContent).not.toContain("later");
    change("date-through", ""); change("date-from", "2026-10-15"); expect(ui("overlay").textContent).toContain("later"); expect(ui("overlay").textContent).not.toContain("run_01");
    ui("date-from").focus(); fetch.mockRejectedValueOnce(new Error("offline")); await wb.refresh();
    expect((ui("date-from") as HTMLInputElement).value).toBe("2026-10-15"); expect(document.activeElement).toBe(ui("date-from"));
    await wb.refresh(); expect(document.activeElement).toBe(ui("date-from")); expect(ui("overlay").textContent).not.toContain("run_01"); wb.destroy();
  });
  it("opens the selected checkpoint/configuration and closes with Escape, restoring focus", async () => {
    const { wb } = mount(); await wb.refresh(); const mark = ui("frontier-full").querySelector<HTMLElement>('[data-run="run_01"][data-split="PLAYER_NAME_CONFIRMED"]'); mark?.focus(); mark?.dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(ui("detail").hidden).toBe(false); expect(ui("detail-body").textContent).toContain("#19"); expect(ui("detail-body").textContent).toContain("OFF"); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
  it("supports keyboard chart inspection and traps focus in the details drawer", async () => {
    const { wb } = mount(); await wb.refresh(); const mark = ui("frontier-full").querySelector('[data-run="run_01"]'); mark?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); expect(ui("detail").hidden).toBe(false);
    const close = ui("detail-body").querySelector<HTMLElement>("button"); close?.focus(); close?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })); expect(document.activeElement?.tagName).toBe("A"); document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); expect(document.activeElement?.tagName).toBe("BUTTON"); close?.click(); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
  it("leaves the reader's focus and scroll alone across unchanged detail refreshes", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); open();
    const body = ui("detail-body"), link = body.querySelector<HTMLAnchorElement>("a"); link?.focus(); body.scrollTop = 480;
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh();
    expect(focus).not.toHaveBeenCalled(); expect(document.activeElement).toBe(link); expect(body.scrollTop).toBe(480);
    focus.mockRestore(); wb.destroy();
  });
  it("preserves the focused control and reading position when selected run details change", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); open();
    const body = ui("detail-body"); body.querySelector<HTMLAnchorElement>("a")?.focus(); body.scrollTop = 480;
    fetch.mockResolvedValue({ ...data(), at: 2000, runs: [run({ reason: "model_error" })] }); await wb.refresh();
    expect(body.textContent).toContain("model_error"); expect(document.activeElement).toBe(body.querySelector("a")); expect(body.scrollTop).toBe(480);
    wb.destroy();
  });
  it("keeps outside focus on updated details and resets scroll only for an explicit opening", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); open();
    const body = ui("detail-body"); body.scrollTop = 480; ui("model").focus();
    fetch.mockResolvedValue({ ...data(), at: 2000, runs: [run({ reason: "model_error" })] }); await wb.refresh();
    expect(document.activeElement).toBe(ui("model")); expect(body.scrollTop).toBe(480);
    open();
    expect(body.scrollTop).toBe(0); expect(document.activeElement).toBe(body.querySelector("[data-close-detail]")); wb.destroy();
  });
  it("retains keyboard focus inside the drawer if its selected run disappears", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); open();
    ui("detail-body").querySelector<HTMLAnchorElement>("a")?.focus(); fetch.mockResolvedValue({ ...data(), at: 2000, runs: [] }); await wb.refresh();
    expect(document.activeElement).toBe(ui("detail-body").querySelector("[data-close-detail]")); wb.destroy();
  });
  it("returns focus to the same frontier point after a refresh replaced the one that opened the drawer", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); const mark = ui("frontier-full").querySelector<HTMLElement>('[data-run="run_01"][data-split="PLAYER_NAME_CONFIRMED"]'); mark?.focus(); mark?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    fetch.mockResolvedValue({ ...data(), at: 2000, runs: [run({ splits: run().splits.map(s => ({ ...s, elapsedMs: s.elapsedMs + 1000 })) })] }); await wb.refresh(); expect(mark?.isConnected).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(document.activeElement?.getAttribute("data-split")).toBe("PLAYER_NAME_CONFIRMED"); expect(document.activeElement?.getAttribute("data-run")).toBe("run_01");
    open(); fetch.mockResolvedValue({ ...data(), at: 3000, runs: [] }); await wb.refresh(); ui("detail").dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
  it("renders Watch links without artwork, then a back link when the run ends", async () => {
    const { wb, fetch } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh(); wb.clock(); expect(ui("current").textContent).toContain("Trainer artwork unavailable"); expect(ui("current").textContent).not.toContain("OBJECTIVE"); expect(ui("current").querySelector("a")?.getAttribute("href")).toBe("/#replay=run_01"); fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh(); expect(ui("current").textContent).toContain("BACK TO VIEWER"); wb.destroy();
  });
  it("retains verified data after bad JSON/network/stale snapshots and bounds visible errors", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); fetch.mockResolvedValue({ nonsense: true }); await wb.refresh(); expect(ui("problem").hidden).toBe(false); expect(ui("frontier-full").querySelector('[data-run="run_01"]')).not.toBeNull(); fetch.mockResolvedValue({ ...data(), at: 1 }); await wb.refresh(); expect(ui("problem").textContent).toContain("Outdated"); fetch.mockRejectedValue(new Error("offline")); await wb.refresh(); expect(ui("problem").textContent).toBe("offline"); wb.destroy();
  });
  it("withdraws the live claim when polling fails, retaining clearly stale recorded charts", async () => {
    const { wb, fetch } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh();
    expect(ui("current").textContent).toContain("CURRENT RUN"); fetch.mockRejectedValue(new Error("offline")); await wb.refresh(); wb.clock();
    expect(ui("current").textContent).not.toContain("CURRENT RUN"); expect(ui("current").textContent).toContain("Live status unavailable"); expect(ui("current").textContent).toContain("BACK TO VIEWER"); wb.destroy();
  });
  it("coalesces polling and ignores late responses after disposal", async () => {
    let resolve: (value: unknown) => void = () => { throw new Error("not captured"); }; const fetch = vi.fn(() => new Promise<unknown>(r => { resolve = r; })); const wb = new Workbench(document, { fetchSnapshot: fetch, now: () => 6000, width: () => 340 }); const first = wb.refresh(); await wb.refresh(); expect(fetch).toHaveBeenCalledTimes(1); wb.destroy(); resolve(data()); await first; expect(ui("frontier-full").textContent).toBe("Loading recorded runs…"); await wb.refresh(); wb.clock(); wb.resize(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("rejects a malformed cohort list at the browser boundary", async () => {
    const { wb } = mount({ ...data(), cohorts: [{ id: "x", label: 3 }] }); await wb.refresh(); expect(ui("problem").hidden).toBe(false); wb.destroy();
  });
  it("handles empty records, no current run and missing selected run on refresh", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); open(); fetch.mockResolvedValue({ ...data(), at: 2000, runs: [], problems: ["Unreadable receipt"] }); await wb.refresh(); expect(ui("detail-body").textContent).toContain("no longer available"); expect(ui("data-problems").textContent).toContain("Unreadable"); ui("detail").dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
});

it("keeps artwork-free Watch links usable through clock ticks and status polls", async () => {
  const { wb, fetch } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh();
  const link = ui("current").querySelector<HTMLAnchorElement>('[data-watch="run_01"]'); if (link === null) throw Error("missing Watch link"); link.focus();
  wb.clock(); wb.clock(); expect(document.activeElement).toBe(link); expect(ui("current").querySelector('[data-watch="run_01"]')).toBe(link);
  expect(ui("current").textContent).toContain("Lane loading");
  wb.lanes("unavailable"); expect(ui("current").textContent).toContain("Lane data unavailable");
  wb.lanes(new Map([["run_01", { lane: "B", gpu: "GPU0", arm: "control" }]])); expect(ui("current").textContent).toContain("LANE B · GPU0");
  expect(document.activeElement?.getAttribute("data-watch")).toBe("run_01");
  fetch.mockResolvedValue({ ...data(), at: 2000, runs: [run({ status: "paused" }), run({ id: "second", status: "live" })] }); await wb.refresh();
  expect(ui("current").textContent).toContain("PAUSED"); expect(ui("current").querySelectorAll("[data-watch]")).toHaveLength(2);
  expect(document.activeElement?.getAttribute("data-watch")).toBe("run_01");
  fetch.mockResolvedValue({ ...data(), at: 2500, runs: [run({ id: "prepended", status: "live" }), run({ status: "paused" }), run({ id: "second", status: "live" })] }); await wb.refresh();
  expect(document.activeElement?.getAttribute("data-watch")).toBe("run_01");
  fetch.mockResolvedValue({ ...data(), at: 2600, runs: [run({ status: "paused" }), run({ id: "second", status: "live" })] }); await wb.refresh();
  expect(document.activeElement?.getAttribute("data-watch")).toBe("run_01");
  fetch.mockResolvedValue({ ...data(), at: 3000, runs: [] }); await wb.refresh(); expect(ui("current").textContent).toContain("BACK TO VIEWER"); wb.destroy();
});
describe("switch catalog for the frontier legend", () => {
  it("validates /api/features into id → description and rejects anything else", async () => {
    const { parseFeatureDescriptions } = await import("./workbench-data.js");
    expect([...parseFeatureDescriptions({ features: [{ id: "a-v1", title: "A", description: "Does a." }, { id: "b-v1", title: "B", description: "" }], milestones: [] })]).toEqual([["a-v1", "Does a."]]);
    for (const bad of [null, [], { features: "x" }, { features: [null] }, { features: [{ id: 1, description: "x" }] }, { features: [{ id: "a", description: null }] }]) expect(() => parseFeatureDescriptions(bad)).toThrow("Invalid feature catalog");
  });
});
describe("live runs as trainer cards on the comparisons page", () => {
  const MANIFEST = { version: 1, tiers: ["green", "bronze", "copper", "silver", "gold"], trainers: ["brendan", "may", "birch", "wally", "roxanne", "brawly", "wattson", "flannery", "norman", "winona", "sidney", "phoebe", "glacia", "drake"], icons: [280], egg: 412, proof: {}, source: {} };
  const exp = (arm: string, trial: number) => ({ id: "bundle-v-control-dryrun-cook", arm, trial, of: 4 });
  function live(): WorkbenchData {
    return { ...data(), runs: [run({ id: "run_live", status: "live", elapsedMs: 60_000, experiment: exp("bundle", 2), card: { name: "RED", location: "OLDALE TOWN", party: [{ speciesId: 280, level: 7, egg: false }] }, config: { ...must(run().config), resume: "CLOCK_SET" } }), run({ id: "run_other", status: "paused", experiment: exp("control", 1) }), run()] };
  }
  function mountCards(art = true): { wb: Workbench; now: { t: number } } {
    const now = { t: 6000 };
    const wb = new Workbench(document, { fetchSnapshot: () => Promise.resolve(live()), now: () => now.t, width: () => 340, fetchJson: (url: string) => (art ? Promise.resolve(url.endsWith("manifest.json") ? MANIFEST : { widths: Array.from({ length: 512 }, () => 4), cmap: {} }) : Promise.reject(new Error("404"))) }, "run_01");
    return { wb, now };
  }
  it("draws each live or paused run as the viewer's trainer card, linking to the viewer, with its notes under it", async () => {
    const { wb } = mountCards(); await wb.refresh(); wb.clock();
    const cards = [...ui("current").querySelectorAll<HTMLAnchorElement>("a.tc.tc-wide")];
    expect(cards.map(c => c.getAttribute("href"))).toEqual(["/#replay=run_live", "/#replay=run_other"]);
    expect(cards[0]?.innerHTML).toContain("/sprites/trainers/norman.png"); expect(cards[0]?.innerHTML).toContain('data-gt="LIVE"'); expect(cards[1]?.innerHTML).toContain('data-gt="PAUSED"');
    expect(cards[0]?.querySelector('.tc-tab [data-gt]')?.getAttribute("data-gt")).toBe("bundle-v-control-dryrun-cook");
    expect(cards[0]?.querySelector(".tc-ty")?.textContent).toBe("TYPE/BUNDLE");
    expect(cards[1]?.querySelector(".tc-ty")?.textContent).toBe("TYPE/CONTROL");
    expect(cards[0]?.innerHTML).toContain("trial 2/4"); expect(cards[0]?.textContent).toContain("RED");
    expect(ui("current").textContent).toContain("NOT FROM ZERO"); expect(ui("current").textContent).toContain("2 CURRENT RUNS");
    expect(ui("current").querySelector(".wb-plate")).toBeNull();
    wb.destroy();
  });
  it("ticks the clock in place without redrawing the card", async () => {
    const { wb, now } = mountCards(); await wb.refresh(); wb.clock();
    const card = ui("current").querySelector<HTMLElement>('a.tc[data-watch="run_live"]'), clock = card?.querySelector("[data-clock]");
    expect(clock?.textContent).toBe("1:05/10:00");
    now.t += 1000; wb.clock();
    expect(ui("current").querySelector('a.tc[data-watch="run_live"]')).toBe(card); expect(clock?.textContent).toBe("1:06/10:00");
    wb.destroy();
  });
  it("never revives obsolete cards when artwork is unavailable", async () => {
    const { wb } = mountCards(false); await wb.refresh(); wb.clock();
    expect(ui("current").querySelectorAll(".wb-plate")).toHaveLength(0); expect(ui("current").textContent).toContain("Trainer artwork unavailable"); expect(ui("current").querySelector(".tc")).toBeNull();
    wb.destroy();
  });
});

it("keeps recording coverage expanded and its summary focused across polling", async () => {
  const { wb } = mount(); await wb.refresh();
  const coverage = ui("frontier-full").querySelector<HTMLDetailsElement>("[data-frontier-coverage]");
  if (coverage === null) throw new Error("coverage missing");
  coverage.open = true; coverage.querySelector("summary")?.focus();
  await wb.refresh();
  expect(ui("frontier-full").querySelector<HTMLDetailsElement>("[data-frontier-coverage]")?.open).toBe(true);
  expect(document.activeElement).toBe(ui("frontier-full").querySelector("[data-frontier-coverage] summary"));
  wb.destroy();
});

it("preserves the focused recording replay link across polls and falls back to the summary if it disappears", async () => {
  const { wb, fetch } = mount(); await wb.refresh();
  const coverage = ui("frontier-full").querySelector<HTMLDetailsElement>("[data-frontier-coverage]");
  if (coverage === null) throw new Error("coverage missing");
  coverage.open = true;
  const link = coverage.querySelector("a"); if (link === null) throw new Error("replay link missing");
  const href = link.getAttribute("href"); link.focus();
  await wb.refresh();
  expect(document.activeElement?.getAttribute("href")).toBe(href);
  fetch.mockResolvedValue({ ...data(), at: 2000, runs: [] }); await wb.refresh();
  expect(document.activeElement).toBe(ui("frontier-full").querySelector("[data-frontier-coverage] summary"));
  wb.destroy();
});
