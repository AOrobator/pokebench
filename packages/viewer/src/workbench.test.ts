// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { run } from "../test-support/workbench.js";
import type { WorkbenchData } from "./workbench-data.js";
import { Workbench } from "./workbench.js";
const html = readFileSync(join(process.cwd(), "static/workbench.html"), "utf8");
function data(): WorkbenchData { return { version: 1, at: 1000, milestones: [{ id: "NEW_GAME_CREATED", label: "New game" }, { id: "PLAYER_NAME_CONFIRMED", label: "Accepted name" }], runs: [run()], queue: [{ id: "queued", cohort: "cohort", model: "Next", arm: "enforced", status: "queued", reason: "waiting" }, { id: "held", cohort: "cohort", model: "Held", arm: "diagnostic", status: "withheld", reason: "cohort stopped" }], problems: [] }; }
function ui(name: string): HTMLElement { const element = document.querySelector<HTMLElement>(`[data-wb="${name}"]`); if (element === null) throw new Error(name); return element; }
function change(name: string, value: string): void { (ui(name) as HTMLSelectElement).value = value; ui(name).dispatchEvent(new Event("change", { bubbles: true })); }
function mount(value: unknown = data()): { wb: Workbench; fetch: ReturnType<typeof vi.fn> } { const fetch = vi.fn(() => Promise.resolve(value)); return { wb: new Workbench(document, { fetchSnapshot: fetch, now: () => 6000, width: () => 340 }, "run_01"), fetch }; }
beforeEach(() => { document.documentElement.innerHTML = html.replace(/<!doctype html>/i, "").replace(/<link[^>]+>/g, "").replace(/<script[^>]*>[\s\S]*?<\/script>/g, ""); });
describe("mounted split ribbon workbench", () => {
  it("loads native timings, actual configuration options and bottom queue without a top execution strip", async () => {
    const { wb } = mount(); await wb.refresh(); expect(ui("summary").textContent).toContain("1 / 1"); expect(ui("ribbons").querySelector('[data-run="run_01"][data-split="PLAYER_NAME_CONFIRMED"]')).not.toBeNull(); expect(ui("timing").querySelector("svg")?.getAttribute("viewBox")).toContain("0 0 340"); expect(ui("queue").textContent).toContain("WITHHELD"); expect(ui("queue").textContent).toContain("QUEUED"); expect(ui("current").textContent).not.toContain("QUEUED"); expect(ui("cohort").textContent).toContain("cohort"); wb.destroy();
  });
  it("switches metrics/milestones/feature encoding and preserves filters on a refresh", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); change("metric", "turn"); change("milestone", "NEW_GAME_CREATED"); change("feature", "naming-cursor-v1"); change("model", run().model ?? ""); change("preset", "objectives-on"); expect(ui("summary").textContent).toContain("3"); expect(ui("encoding").textContent).toContain("NAMING CURSOR"); fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh(); expect((ui("model") as HTMLSelectElement).value).toBe(run().model); expect((ui("metric") as HTMLSelectElement).value).toBe("turn"); change("cohort", "all"); wb.resize(); wb.destroy();
  });
  it("opens the selected checkpoint/configuration and closes with Escape, restoring focus", async () => {
    const { wb } = mount(); await wb.refresh(); const mark = ui("timing").querySelector<HTMLElement>("[data-run]"); mark?.focus(); mark?.dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(ui("detail").hidden).toBe(false); expect(ui("detail-body").textContent).toContain("#19"); expect(ui("detail-body").textContent).toContain("OFF"); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
  it("supports keyboard chart inspection and traps focus in the details drawer", async () => {
    const { wb } = mount(); await wb.refresh(); const mark = ui("timing").querySelector("[data-run]"); mark?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); expect(ui("detail").hidden).toBe(false);
    const close = ui("detail-body").querySelector<HTMLElement>("button"); close?.focus(); close?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })); expect(document.activeElement?.tagName).toBe("A"); document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); expect(document.activeElement?.tagName).toBe("BUTTON"); close?.click(); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
  it("leaves the reader's focus and scroll alone across unchanged detail refreshes", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); ui("outcomes").querySelector<HTMLButtonElement>("button")?.click();
    const body = ui("detail-body"), link = body.querySelector<HTMLAnchorElement>("a"); link?.focus(); body.scrollTop = 480;
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh();
    expect(focus).not.toHaveBeenCalled(); expect(document.activeElement).toBe(link); expect(body.scrollTop).toBe(480);
    focus.mockRestore(); wb.destroy();
  });
  it("preserves the focused control and reading position when selected run details change", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); ui("outcomes").querySelector<HTMLButtonElement>("button")?.click();
    const body = ui("detail-body"); body.querySelector<HTMLAnchorElement>("a")?.focus(); body.scrollTop = 480;
    fetch.mockResolvedValue({ ...data(), at: 2000, runs: [run({ reason: "model_error" })] }); await wb.refresh();
    expect(body.textContent).toContain("model_error"); expect(document.activeElement).toBe(body.querySelector("a")); expect(body.scrollTop).toBe(480);
    wb.destroy();
  });
  it("renders a ticking live-run meta card, then a normal back link when the run ends", async () => {
    const { wb, fetch } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh(); wb.clock(); expect(ui("current").textContent).toContain("0:02:05"); expect(ui("current").textContent).toContain("CURRENT OBJECTIVE"); expect(ui("current").querySelector("a")?.getAttribute("href")).toBe("/#run=run_01"); fetch.mockResolvedValue({ ...data(), at: 2000 }); await wb.refresh(); expect(ui("current").textContent).toContain("BACK TO VIEWER"); wb.destroy();
  });
  it("never hides model failures from completion counts, while infrastructure failures remain explicitly excluded", async () => {
    const failed = run({ id: "failed", reason: "model_error", splits: [] }); const infra = run({ id: "infra", excluded: "Infrastructure", splits: run().splits }); const { wb } = mount({ ...data(), runs: [run(), failed, infra] }); await wb.refresh(); expect(ui("summary").textContent).toContain("1 / 2"); expect(ui("outcomes").textContent).toContain("excluded from timing"); expect(ui("outcomes").textContent).toContain("model_error"); wb.destroy();
  });
  it("keeps an excluded abort visible but gives it no plot or denominator credit", async () => {
    const aborted = run({ id: "aborted", reason: "operator_abort", excluded: "Excluded operator-aborted run" });
    const { wb } = mount({ ...data(), runs: [run(), aborted] }); await wb.refresh();
    expect(ui("summary").textContent).toContain("1 / 1"); expect(ui("outcomes").textContent).toContain("operator_abort"); expect(ui("outcomes").textContent).toContain("excluded from timing");
    expect(ui("timing").querySelector('[data-run="aborted"]')).toBeNull(); expect(ui("ribbons").querySelector('[data-run="aborted"]')).toBeNull(); wb.destroy();
  });
  it("retains verified data after bad JSON/network/stale snapshots and bounds visible errors", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); fetch.mockResolvedValue({ nonsense: true }); await wb.refresh(); expect(ui("problem").hidden).toBe(false); expect(ui("summary").textContent).toContain("1 / 1"); fetch.mockResolvedValue({ ...data(), at: 1 }); await wb.refresh(); expect(ui("problem").textContent).toContain("Outdated"); fetch.mockRejectedValue(new Error("offline")); await wb.refresh(); expect(ui("problem").textContent).toBe("offline"); wb.destroy();
  });
  it("withdraws the live claim when polling fails, retaining clearly stale recorded charts", async () => {
    const { wb, fetch } = mount({ ...data(), runs: [run({ status: "live" })] }); await wb.refresh();
    expect(ui("current").textContent).toContain("CURRENT RUN"); fetch.mockRejectedValue(new Error("offline")); await wb.refresh(); wb.clock();
    expect(ui("current").textContent).not.toContain("CURRENT RUN"); expect(ui("current").textContent).toContain("Live status unavailable"); expect(ui("current").textContent).toContain("BACK TO VIEWER"); wb.destroy();
  });
  it("coalesces polling and ignores late responses after disposal", async () => {
    let resolve: (value: unknown) => void = () => { throw new Error("not captured"); }; const fetch = vi.fn(() => new Promise<unknown>(r => { resolve = r; })); const wb = new Workbench(document, { fetchSnapshot: fetch, now: () => 6000, width: () => 340 }); const first = wb.refresh(); await wb.refresh(); expect(fetch).toHaveBeenCalledTimes(1); wb.destroy(); resolve(data()); await first; expect(ui("summary").textContent).toBe(""); await wb.refresh(); wb.clock(); wb.resize(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("handles empty records, missing current objective, no queue and missing selected run on refresh", async () => {
    const { wb, fetch } = mount(); await wb.refresh(); ui("outcomes").querySelector<HTMLButtonElement>("button")?.click(); fetch.mockResolvedValue({ ...data(), at: 2000, runs: [], queue: [], problems: ["Unreadable receipt"] }); await wb.refresh(); expect(ui("detail-body").textContent).toContain("no longer available"); expect(ui("queue").textContent).toContain("No runs are queued"); expect(ui("data-problems").textContent).toContain("Unreadable"); expect(ui("timing").textContent).toContain("No verified"); ui("detail").dispatchEvent(new MouseEvent("click", { bubbles: true })); expect(ui("detail").hidden).toBe(true); wb.destroy();
  });
});
