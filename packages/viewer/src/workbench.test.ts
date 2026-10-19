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
  it("loads the frontier, actual configuration options and no execution queue", async () => {
    const { wb } = mount(); await wb.refresh(); expect(ui("frontier-full").querySelector('[data-run="run_01"][data-split="PLAYER_NAME_CONFIRMED"]')).not.toBeNull(); expect(document.querySelector('[data-wb="queue"]')).toBeNull(); expect(ui("current").textContent).not.toContain("QUEUED"); expect(ui("cohort").textContent).toContain("cohort"); wb.destroy();
  });
  it("preserves filters on a refresh and ignores unrelated changes", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); change("model", run().model ?? ""); change("preset", "objectives-on"); fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh(); expect((ui("model") as HTMLSelectElement).value).toBe(run().model); expect((ui("preset") as HTMLSelectElement).value).toBe("objectives-on"); expect(ui("frontier-full").querySelector('[data-run="run_01"]')).not.toBeNull();
    const unrelated = document.createElement("select"); unrelated.dataset.wb = "elsewhere"; document.body.append(unrelated); unrelated.dispatchEvent(new Event("change", { bubbles: true })); expect((ui("preset") as HTMLSelectElement).value).toBe("objectives-on"); change("cohort", "all"); wb.resize(); wb.destroy();
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
    fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh(); expect(mark?.isConnected).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(document.activeElement?.getAttribute("data-split")).toBe("PLAYER_NAME_CONFIRMED"); expect(document.activeElement?.getAttribute("data-run")).toBe("run_01");
    open(); fetch.mockResolvedValue({ ...data(), at: 3000, runs: [] }); await wb.refresh(); ui("detail").dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
  it("renders a ticking live-run meta card, then a normal back link when the run ends", async () => {
    const { wb, fetch } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh(); wb.clock(); expect(ui("current").textContent).toContain("2:05/ 10:00"); expect(ui("current").textContent).not.toContain("OBJECTIVE"); expect(ui("current").querySelector("a")?.getAttribute("href")).toBe("/#replay=run_01"); fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh(); expect(ui("current").textContent).toContain("BACK TO VIEWER"); wb.destroy();
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
  it("labels EXPERIMENT options from the snapshot's cohort list while values stay machine-readable", async () => {
    const tagged = "experiment:bundle-v-control@ca37a3922222";
    const { wb } = mount({ ...data(), runs: [run({ id: "a", cohort: tagged }), run({ id: "b", cohort: "legacy-cohort" }), run({ id: "c", cohort: null })], cohorts: [{ id: tagged, label: "Bundle vs control (dry run, cook)", experiment: "bundle-v-control-dryrun-cook", build: "ca37a392".padEnd(40, "2"), dryRun: true }] });
    await wb.refresh();
    const options = [...(ui("cohort") as HTMLSelectElement).options].map(o => [o.value, o.textContent]);
    expect(options).toEqual([["all", "All recorded runs"], [tagged, "Bundle vs control (dry run, cook)"], ["legacy-cohort", "legacy-cohort"]]);
    change("cohort", tagged); expect([...(ui("overlay") as HTMLSelectElement).options].map(o => o.value)).toEqual(["all", "none", "a"]); wb.destroy();
  });
  it("orders EXPERIMENT options by each entry's first trial, newest first", async () => {
    const { wb } = mount({ ...data(), runs: [
      run({ id: "a", cohort: "old", started: "2026-10-16T12:00:00.000-04:00" }), run({ id: "b", cohort: "new", started: "2026-10-16T11:00:00.000-04:00" }),
      run({ id: "c", cohort: "old", started: "2026-10-14T09:00:00.000-04:00" }), run({ id: "d", cohort: "undated", started: null }), run({ id: "e", cohort: "also-new", started: "2026-10-16T11:00:00.000-04:00" }),
    ] }); await wb.refresh();
    expect([...(ui("cohort") as HTMLSelectElement).options].map(o => o.value)).toEqual(["all", "also-new", "new", "old", "undated"]); wb.destroy();
  });
  it("drops a live run of another experiment from the story frontier when an experiment is picked", async () => {
    const { wb } = mount({ ...data(), runs: [run({ id: "live_aaaa", status: "live", cohort: "exp-a" }), run({ id: "live_bbbb", status: "live", cohort: "exp-b" })] }); await wb.refresh();
    expect(ui("frontier-full").querySelector('[data-run="live_bbbb"]')).not.toBeNull();
    expect(ui("frontier-full").textContent).toContain("bbbb");
    change("cohort", "exp-a");
    expect(ui("frontier-full").querySelector('[data-run="live_aaaa"]')).not.toBeNull();
    expect(ui("frontier-full").querySelector('[data-run="live_bbbb"]')).toBeNull();
    expect(ui("frontier-full").textContent).not.toContain("bbbb");
    expect(ui("current").textContent).toContain("2 CURRENT RUNS");
    wb.destroy();
  });
  it("rejects a malformed cohort list at the browser boundary", async () => {
    const { wb } = mount({ ...data(), cohorts: [{ id: "x", label: 3 }] }); await wb.refresh(); expect(ui("problem").hidden).toBe(false); wb.destroy();
  });
  it("handles empty records, no current run and missing selected run on refresh", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); open(); fetch.mockResolvedValue({ ...data(), at: 2000, runs: [], problems: ["Unreadable receipt"] }); await wb.refresh(); expect(ui("detail-body").textContent).toContain("no longer available"); expect(ui("data-problems").textContent).toContain("Unreadable"); ui("detail").dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
});

it("keeps the plate link and keyboard focus stable through clock ticks, lane joins, a new milestone and the gold window ending", async () => {
  let now = 6000; const fetch = vi.fn(() => Promise.resolve<unknown>({ ...data(), runs: [run({ status: "live" })] }));
  const wb = new Workbench(document, { fetchSnapshot: fetch, now: () => now, width: () => 340 }); await wb.refresh();
  const link = ui("current").querySelector<HTMLAnchorElement>(".wb-plate"); if (link === null) throw Error("missing watch link"); link.focus();
  expect(link.className).toBe("wb-plate new"); const chip = link.querySelector(".wb-new-chip"); expect(chip?.textContent).toBe("NEW MILESTONE!");
  now = 7000; wb.clock(); wb.clock(); expect(ui("current").querySelector(".wb-plate")).toBe(link); expect(document.activeElement).toBe(link);
  // The blinking chip is not re-created on each tick, so its animation keeps its phase.
  expect(link.querySelector(".wb-new-chip")).toBe(chip); expect(link.textContent).toContain("2:06/ 10:00");
  now = 40000; wb.clock(); expect(ui("current").querySelector(".wb-plate")).toBe(link); expect(link.className).toBe("wb-plate"); expect(link.querySelector(".wb-new-chip")).toBeNull(); expect(link.textContent).toContain("2:39/ 10:00");
  wb.lanes(new Map([["run_01", { lane: "A", gpu: "GPU1", arm: "control" }]])); expect(ui("current").querySelector(".wb-plate")).toBe(link); expect(link.querySelector(".wb-plate-l1")?.textContent).toBe("LANE A · GPU1Lv2"); expect(link.querySelector(".wb-ty em")?.getAttribute("style")).toBe("--tyc:#2f6fb0");
  const splits = [...run().splits, { name: "RIVAL_MET", elapsedMs: 160000, segmentMs: 1, seq: 30, turn: 109, inputTokens: 1, outputTokens: 1 }];
  fetch.mockResolvedValue({ ...data(), at: 39000, runs: [run({ status: "live", elapsedMs: 160000, splits })] }); await wb.refresh();
  expect(ui("current").querySelector(".wb-plate")).toBe(link); expect(document.activeElement).toBe(link); expect(link.className).toBe("wb-plate new");
  expect(link.querySelector(".wb-ms b")?.textContent).toBe("Rival met"); expect(link.textContent).toContain("14/ 45"); expect(link.querySelector(".wb-plate-l1")?.textContent).toBe("LANE A · GPU1Lv14"); expect(link.querySelector(".wb-br i")?.getAttribute("style")).toBe("width:31.1%");
  fetch.mockResolvedValue({ ...data(), at: 39001, runs: [run({ status: "live", elapsedMs: 160000, splits }), run({ id: "second", status: "live" })] }); await wb.refresh();
  expect(ui("current").querySelectorAll(".wb-plate")).toHaveLength(2); expect(ui("current").querySelector(".wb-party .wb-kicker")?.textContent).toContain("2 CURRENT RUNS"); wb.destroy();
});

it("keeps the focused plate when other runs join or leave the party, reconciling plates by run id", async () => {
  const { wb, fetch } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh();
  const link = ui("current").querySelector<HTMLAnchorElement>('.wb-plate[href="/#replay=run_01"]'); if (link === null) throw Error("missing plate"); link.focus();
  fetch.mockResolvedValue({ ...data(), at: 2000, runs: [run({ id: "first", status: "live" }), run({ status: "live" }), run({ id: "third", status: "live" })] }); await wb.refresh();
  expect([...ui("current").querySelectorAll(".wb-plate")].map(p => p.getAttribute("href"))).toEqual(["/#replay=first", "/#replay=run_01", "/#replay=third"]);
  expect(ui("current").querySelector('.wb-plate[href="/#replay=run_01"]')).toBe(link); expect(document.activeElement).toBe(link); expect(ui("current").querySelector(".wb-party .wb-kicker")?.textContent).toContain("3 CURRENT RUNS");
  fetch.mockResolvedValue({ ...data(), at: 3000, runs: [run({ id: "third", status: "live" }), run({ status: "paused" })] }); await wb.refresh();
  expect([...ui("current").querySelectorAll(".wb-plate")].map(p => p.getAttribute("href"))).toEqual(["/#replay=third", "/#replay=run_01"]);
  expect(ui("current").querySelector('.wb-plate[href="/#replay=run_01"]')).toBe(link); expect(document.activeElement).toBe(link); expect(link.querySelector(".wb-plate-l1")?.textContent).toContain("PAUSED");
  const saved = run({ status: "paused" }); if (saved.config === null) throw new Error("config"); saved.config = { ...saved.config, resume: "CLOCK_SET" };
  fetch.mockResolvedValue({ ...data(), at: 4000, runs: [saved] }); await wb.refresh();
  expect(ui("current").querySelectorAll(".wb-plate")).toHaveLength(1); expect(ui("current").querySelector(".wb-plate")).toBe(link); expect(document.activeElement).toBe(link); expect(link.textContent).toContain("NOT FROM ZERO");
  fetch.mockResolvedValue({ ...data(), at: 5000, runs: [] }); await wb.refresh(); expect(ui("current").textContent).toContain("BACK TO VIEWER"); wb.destroy();
});

it("shows lanes as unknown until the experiment poll verifies them, unavailable after it fails, and recovers", async () => {
  const { wb } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh();
  const link = ui("current").querySelector<HTMLAnchorElement>(".wb-plate"); if (link === null) throw Error("missing plate"); link.focus();
  expect(link.querySelector(".wb-plate-l1")?.textContent).toBe("LANE …Lv2"); expect(link.textContent).not.toContain("HAND RUN"); expect(link.querySelector(".wb-ty em")).toBeNull();
  wb.lanes(new Map([["run_01", { lane: "B", gpu: "GPU0", arm: "control" }]])); expect(link.querySelector(".wb-plate-l1")?.textContent).toBe("LANE B · GPU0Lv2"); expect(link.querySelector(".wb-ty em")?.getAttribute("style")).toBe("--tyc:#2f6fb0");
  wb.lanes("unavailable"); expect(link.querySelector(".wb-plate-l1")?.textContent).toBe("LANE ?Lv2"); expect(link.querySelector(".wb-ty")?.textContent).toBe("TYPE/lane data unavailable"); expect(link.querySelector(".wb-ty em")).toBeNull(); expect(link.textContent).not.toContain("HAND RUN");
  wb.lanes(new Map()); expect(link.querySelector(".wb-plate-l1")?.textContent).toBe("HAND RUNLv2"); expect(link.querySelector(".wb-ty em")?.getAttribute("style")).toBe("--tyc:#a08020");
  expect(ui("current").querySelector(".wb-plate")).toBe(link); expect(document.activeElement).toBe(link); wb.destroy();
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
  it("keeps the name plates when the card art was never built", async () => {
    const { wb } = mountCards(false); await wb.refresh(); wb.clock();
    expect(ui("current").querySelectorAll(".wb-plate")).toHaveLength(2); expect(ui("current").querySelector(".tc")).toBeNull();
    wb.destroy();
  });
});
