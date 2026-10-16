// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { FixedLaneStatus, FixedStatusView } from "./fixed-status.js";
import { armColor, clockText, currentRunHtml, furthestMilestone, runDetails, runLanes, viewerUrl } from "./workbench-view.js";
import { run } from "../test-support/workbench.js";
const parse = (html: string): Document => new DOMParser().parseFromString(html, "text/html");
describe("workbench visual contract", () => {
  it("renders each live run as a name plate: lane · GPU, Lv, TYPE/, MILESTONE bar, milestone reached, TIME bar, watch link", () => {
    const lanes = new Map([["run_01", { lane: "A", gpu: "GPU1", arm: "bundle" }]]);
    const html = currentRunHtml([run({ status: "live" })], 1000, 66000, "older", lanes);
    const doc = parse(html), plate = doc.querySelector<HTMLAnchorElement>("a.wb-plate");
    expect(plate?.getAttribute("href")).toBe("/#run=run_01");
    expect(doc.querySelector(".wb-party .wb-kicker")?.textContent).toBe("● 1 CURRENT RUN · Model <img onerror=x>"); expect(html).not.toContain("<img"); expect(html).toContain("CHOOSE A RUN");
    expect(plate?.querySelector(".wb-plate-l1")?.textContent).toBe("LANE A · GPU1Lv2");
    expect(plate?.querySelector(".wb-ty")?.textContent).toBe("TYPE/bundle"); expect(plate?.querySelector(".wb-ty em")?.getAttribute("style")).toBe("--tyc:#7a3fb8");
    const [ms, time] = Array.from(plate?.querySelectorAll(".wb-br") ?? []);
    expect(ms?.textContent).toBe("MILESTONEMI2/ 45"); expect(ms?.querySelector("i")?.getAttribute("style")).toBe("width:4.4%");
    expect(plate?.querySelector(".wb-ms b")?.textContent).toBe("Name"); expect(plate?.querySelector(".wb-ms small")?.textContent).toBe("2:00 · turn 20");
    expect(time?.textContent).toBe("TIME3:05/ 10:00"); expect(time?.querySelector("i")?.getAttribute("style")).toBe("width:30.8%");
    expect(plate?.classList.contains("new")).toBe(false); expect(html).not.toContain("NEW MILESTONE!"); expect(html).not.toContain("NOT FROM ZERO"); expect(html).not.toContain("PAUSED");
    const saved = run({ status: "live" }); if (saved.config === null) throw new Error("config"); saved.config = { ...saved.config, resume: "CLOCK_SET" };
    expect(currentRunHtml([saved], 1000, 6000, null)).toContain("NOT FROM ZERO · Clock set save"); expect(runDetails(saved, null)).toContain("did not start from New game");
  });
  it("turns the plate gold with a NEW MILESTONE! chip while the latest milestone is under 30 s old on the live clock", () => {
    const at = 1000, fresh = currentRunHtml([run({ status: "live" })], at, at + 29_999, null);
    expect(fresh).toContain('class="wb-plate new"'); expect(fresh).toContain('<span class="wb-new-chip">NEW MILESTONE!</span>');
    const stale = currentRunHtml([run({ status: "live" })], at, at + 30_000, null);
    expect(stale).toContain('class="wb-plate"'); expect(stale).not.toContain("NEW MILESTONE!");
    // A paused run's clock is frozen, so it never claims a fresh milestone.
    expect(currentRunHtml([run({ status: "paused" })], at, at + 1000, null)).not.toContain("NEW MILESTONE!");
  });
  it("shows a hand run with no lane and no milestone as HAND RUN, TYPE/ none, Lv0 and 0/ 45", () => {
    const doc = parse(currentRunHtml([run({ id: "hand", status: "live", elapsedMs: 7000, splits: [] })], 0, 0, null));
    expect(doc.querySelector(".wb-plate-l1")?.textContent).toBe("HAND RUNLv0"); expect(doc.querySelector(".wb-ty")?.textContent).toBe("TYPE/none");
    expect(doc.querySelector(".wb-ty em")?.getAttribute("style")).toBe("--tyc:#a08020");
    expect(doc.querySelector(".wb-br")?.textContent).toBe("MILESTONEMI0/ 45"); expect(doc.querySelector(".wb-ms b.none")?.textContent).toBe("No milestone yet"); expect(doc.querySelector(".wb-ms small")?.textContent).toBe("waiting for New game");
    expect(doc.querySelectorAll(".wb-br")[1]?.textContent).toBe("TIME0:07/ 10:00");
  });
  it("names several runs and models in one party card, keeps unknown and long arms as wrapping text with a stable colour", () => {
    const long = "bundle+dialogue-context-kept-and-adjacent-tiles-v2";
    const lanes = new Map([["a", { lane: "A", gpu: "GPU1", arm: "control" }], ["b", { lane: "B", gpu: "GPU0", arm: long }], ["c", { lane: "C", gpu: "GPU2", arm: null }]]);
    const doc = parse(currentRunHtml([run({ id: "a", status: "live" }), run({ id: "b", status: "paused", model: "Other" }), run({ id: "c", status: "live" }), run({ id: "ended" })], 0, 0, null, lanes));
    expect(doc.querySelectorAll(".wb-plate")).toHaveLength(3); expect(doc.querySelector(".wb-party .wb-kicker")?.textContent).toBe("● 3 CURRENT RUNS · Model <img onerror=x> · Other");
    expect(doc.querySelector('[href="/#run=b"] .wb-ty em')?.textContent).toBe(long); expect(doc.querySelector('[href="/#run=b"] .wb-plate-l1')?.textContent).toBe("LANE B · GPU0 · PAUSEDLv2");
    expect(doc.querySelector('[href="/#run=a"] .wb-ty em')?.getAttribute("style")).toBe("--tyc:#2f6fb0"); expect(doc.querySelector('[href="/#run=c"] .wb-ty em')?.textContent).toBe("none");
    expect(armColor(long)).toBe(armColor(long)); expect(armColor(long)).toMatch(/^hsl\(\d{1,3} 45% 36%\)$/); expect(armColor("x")).not.toBe(armColor("y")); expect(armColor(null)).toBe("#a08020"); expect(armColor("bundle")).toBe("#7a3fb8");
  });
  it("picks the furthest frontier milestone by story order, not record order, and formats compact clocks", () => {
    const split = (name: string, elapsedMs: number, turn: number) => ({ name, elapsedMs, segmentMs: 1, seq: turn, turn, inputTokens: 1, outputTokens: 1 });
    const r = run({ splits: [split("RIVAL_MET", 331000, 109), split("PLAYER_HOUSE_EXITED_AFTER_CLOCK", 400000, 143), split("NOT_A_FRONTIER_MILESTONE", 500000, 150)] });
    expect(furthestMilestone(r)).toMatchObject({ index: 13, label: "Rival met", split: { turn: 109 } }); expect(furthestMilestone(run({ splits: [] }))).toBeNull();
    expect(clockText(331_999)).toBe("5:31"); expect(clockText(3_723_000)).toBe("1:02:03"); expect(clockText(-5)).toBe("0:00");
  });
  it("does not tick a paused run or mistake unresponsive/ended logs for live, and retains the viewer return selection", () => {
    expect(currentRunHtml([run({ status: "paused" })], 1000, 6000, null)).toContain("2:00/ 10:00"); expect(currentRunHtml([run({ status: "unresponsive" })], 1000, 6000, "old/run")).toContain('/#run=old%2Frun'); expect(currentRunHtml([], 0, 0, null)).toContain("BACK TO VIEWER");
  });
  it("joins lanes from fixed-run status on run id, skipping idle lanes", () => {
    const lane = (id: string, runId: string | null, arm: string | null): FixedLaneStatus => ({ id, gpu: `GPU${id}`, port: 1, state: "running", reason: "", slot: 1, arm, phase: "trial", run: runId, since: "", retryAt: null, lastError: null, valid: 0, total: 1 });
    const status = (lanes: FixedLaneStatus[]): FixedStatusView => ({ kind: "fixed-run", version: 1, experiment: "x", title: "X", definitionSha256: "", pid: 1, updatedAt: "", state: "running", total: 1, valid: 0, invalid: 0, invalidTrials: [], reserve: { usedMs: 0, totalMs: 0 }, lanes, lastError: null, runnerAlive: true });
    const map = runLanes([status([lane("A", "r1", "bundle"), lane("B", null, null)]), status([lane("C", "r2", null)])]);
    expect([...map.entries()]).toEqual([["r1", { lane: "A", gpu: "GPUA", arm: "bundle" }], ["r2", { lane: "C", gpu: "GPUC", arm: null }]]);
  });
  it("qualifies a recovered (derived) furthest milestone as an upper bound and never turns it gold", () => {
    const base = run({ status: "live" }), splits = base.splits.map(s => s.name === "PLAYER_NAME_CONFIRMED" ? { ...s, derived: true as const } : s);
    const doc = parse(currentRunHtml([{ ...base, splits }], 1000, 2000, null));
    expect(doc.querySelector(".wb-ms small")?.textContent).toBe("≤ 2:00 · ≤ turn 20 · recovered");
    expect(doc.querySelector(".wb-plate")?.className).toBe("wb-plate"); expect(doc.body.innerHTML).not.toContain("NEW MILESTONE!");
  });
  it("only counts a milestone as new for an age from 0 up to 30 s, never one ahead of the live clock", () => {
    const ahead = run({ status: "live", elapsedMs: 100000 });
    expect(currentRunHtml([ahead], 1000, 1000, null)).not.toContain("NEW MILESTONE!");
    expect(currentRunHtml([run({ status: "live" })], 1000, 1000, null)).toContain("NEW MILESTONE!");
  });
  it("tells unknown lane data apart from a verified hand run", () => {
    const loading = parse(currentRunHtml([run({ status: "live" })], 0, 0, null, "loading"));
    expect(loading.querySelector(".wb-plate-l1")?.textContent).toBe("LANE …Lv2"); expect(loading.querySelector(".wb-ty")?.textContent).toBe("TYPE/…"); expect(loading.querySelector(".wb-ty em")).toBeNull();
    expect(loading.body.textContent).not.toContain("HAND RUN"); expect(loading.body.textContent).not.toContain("none");
    const failed = parse(currentRunHtml([run({ status: "live" })], 0, 0, null, "unavailable"));
    expect(failed.querySelector(".wb-plate-l1")?.textContent).toBe("LANE ?Lv2"); expect(failed.querySelector(".wb-ty")?.textContent).toBe("TYPE/lane data unavailable"); expect(failed.body.textContent).not.toContain("HAND RUN");
    expect(parse(currentRunHtml([run({ status: "live" })], 0, 0, null, new Map())).querySelector(".wb-plate-l1")?.textContent).toBe("HAND RUNLv2");
  });
  it("escapes hostile lane, GPU and arm text", () => {
    const lanes = new Map([["run_01", { lane: '<b id="l">', gpu: '"><script>x</script>', arm: "<img src=x onerror=alert(1)>" }]]);
    const html = currentRunHtml([run({ status: "live" })], 0, 0, null, lanes), doc = parse(html);
    expect(html).not.toContain("<img"); expect(html).not.toContain("<script"); expect(html).not.toContain('<b id="l">'); expect(doc.querySelector("#l")).toBeNull();
    expect(doc.querySelector(".wb-plate-l1")?.textContent).toBe('LANE <b id="l"> · "><script>x</script>Lv2'); expect(doc.querySelector(".wb-ty em")?.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(doc.querySelector(".wb-ty em")?.getAttribute("style")).toMatch(/^--tyc:hsl\(\d+ 45% 36%\)$/);
  });
  it("renders truthful recorded configuration and feature tri-states, checkpoint evidence, and a replay link", () => {
    const html = runDetails(run(), "PLAYER_NAME_CONFIRMED"); expect(html).toContain("OFF"); expect(html).toContain("UNKNOWN"); expect(html).toContain("ON"); expect(html).toContain("#19"); expect(html).toContain("65,536"); expect(html).toContain("objectives-on"); expect(html).toContain("&lt;img"); expect(runDetails(run({ config: null }), null)).toContain("not recorded");
  });
  it("renders unknown legacy configuration without inventing targets or budgets", () => {
    const c = run().config; if (c === null) throw new Error("fixture");
    const legacy = run({ id: "old", model: null, reason: null, status: "live", config: { ...c, target: null, maxWallMs: null, maxTurns: null, failureLimit: null, preset: null, dirty: true, vision: false }, splits: [] });
    const card = currentRunHtml([legacy], 1000, 6000, null); expect(card).toContain("2:05/ no cap"); expect(card).toContain('style="width:0.0%"'); expect(card.toUpperCase()).not.toContain("OBJECTIVE"); expect(card).toContain("Model not recorded");
    expect(currentRunHtml([run({ status: "live", config: null, elapsedMs: null })], 0, 0, null)).toContain("0:00/ no cap");
    const detail = runDetails(legacy, null); expect(detail).toContain("(dirty)"); expect(detail).toContain("not supported"); expect(detail).toContain("not recorded / play to budget"); expect(detail).toContain("no terminal outcome");
    expect(viewerUrl(null)).toBe("/");
  });
});
