// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { liveOrPaused, clockText, backToViewer, currentRunLinks, plateNotes, plateWhere, furthestMilestone, plateFacts, runDetails, viewerUrl } from "./workbench-view.js";
import { run } from "../test-support/workbench.js";
const parse = (html: string): Document => new DOMParser().parseFromString(html, "text/html");
describe("workbench visual contract", () => {
  it("picks the furthest frontier milestone by story order, not record order, and formats compact clocks", () => {
    const split = (name: string, elapsedMs: number, turn: number) => ({ name, elapsedMs, segmentMs: 1, seq: turn, turn, inputTokens: 1, outputTokens: 1 });
    const r = run({ splits: [split("RIVAL_MET", 331000, 109), split("PLAYER_HOUSE_EXITED_AFTER_CLOCK", 400000, 143), split("NOT_A_FRONTIER_MILESTONE", 500000, 150)] });
    expect(furthestMilestone(r)).toMatchObject({ index: 13, label: "Rival met", split: { turn: 109 } }); expect(furthestMilestone(run({ splits: [] }))).toBeNull();
    expect(clockText(331_999)).toBe("5:31"); expect(clockText(3_723_000)).toBe("1:02:03"); expect(clockText(-5)).toBe("0:00");
  });
  it("renders truthful recorded configuration and feature tri-states, checkpoint evidence, and a replay link", () => {
    const html = runDetails(run(), "PLAYER_NAME_CONFIRMED"); expect(html).toContain("OFF"); expect(html).toContain("UNKNOWN"); expect(html).toContain("ON"); expect(html).toContain("#19"); expect(html).toContain("65,536"); expect(html).toContain("objectives-on"); expect(html).toContain("&lt;img"); expect(runDetails(run({ config: null }), null)).toContain("not recorded");
  });
  it("renders unknown legacy configuration without inventing targets or budgets", () => {
    const c = run().config; if (c === null) throw new Error("fixture");
    const legacy = run({ id: "old", model: null, reason: null, status: "live", config: { ...c, target: null, maxWallMs: null, maxTurns: null, failureLimit: null, preset: null, dirty: true, vision: false }, splits: [] });
    expect(plateFacts(legacy, 1000, 6000)).toMatchObject({ elapsed: 125000, cap: null, level: 0 });
    expect(plateFacts(run({ status: "live", config: null, elapsedMs: null }), 0, 0).cap).toBeNull();
    const detail = runDetails(legacy, null); expect(detail).toContain("(dirty)"); expect(detail).toContain("not supported"); expect(detail).toContain("not recorded / play to budget"); expect(detail).toContain("no terminal outcome");
    expect(viewerUrl(null)).toBe("/");
  });
});


describe("operator extension timing", () => {
  it.each(["live", "paused", "ended"] as const)("uses the applied continuation cap for %s run facts", status => {
    const original = run({ status, elapsedMs: 900_000 });
    if (original.config === null) throw new Error("fixture");
    const extended = { ...original, config: { ...original.config, extendedWallMs: 2_400_000 } };
    expect(plateFacts(extended, 1000, 6000)).toMatchObject({ cap: 2_400_000, elapsed: status === "live" ? 905_000 : 900_000 });
    expect(original.config.maxWallMs).toBe(600_000);
    expect(plateFacts(original, 1000, 6000).cap).toBe(600_000);
  });
  it("labels the effective cap separately from the original evaluation horizon in details", () => {
    const original = run();
    if (original.config === null) throw new Error("fixture");
    const extended = { ...original, config: { ...original.config, extendedWallMs: 2_400_000 } };
    const detail = parse(runDetails(extended, null));
    const rows = new Map([...detail.querySelectorAll("dt")].map(term => [term.textContent, term.nextElementSibling?.textContent]));
    expect(rows.get("Time cap")).toBe("0:40:00");
    expect(rows.get("Original evaluation cap")).toBe("0:10:00");
    expect(rows.get("Operator-extended continuation")).toContain("original evaluation horizon unchanged");
    expect(runDetails(original, null)).not.toContain("Original evaluation cap");
  });
});

it("uses ordinary Watch links when artwork is missing, preserving lane truth and provenance", () => {
  const saved = run({ status: "paused", problem: "<bad>" });
  if (saved.config === null) throw Error("fixture"); saved.config = { ...saved.config, resume: "CLOCK_SET" };
  const html = currentRunLinks([saved, run({ id: "ended" })], "unavailable").join("");
  const doc = parse(html); expect(doc.querySelectorAll("a")).toHaveLength(1);
  expect(doc.querySelector("a")?.getAttribute("href")).toBe("/#replay=run_01");
  expect(html).not.toContain("wb-plate"); expect(html).not.toContain("TYPE/");
  expect(doc.body.textContent).toContain("NOT FROM ZERO"); expect(doc.body.textContent).toContain("PAUSED");
  expect(doc.body.textContent).toContain("Lane data unavailable"); expect(html).toContain("&lt;bad&gt;");
  expect(plateWhere(saved, "loading")).toContain("loading"); expect(plateWhere(saved, new Map())).toContain("HAND RUN");
  expect(plateWhere(saved, new Map([[saved.id, { lane: "<b>", gpu: "<script>", arm: null }]]))).toContain("&lt;b&gt;");
  expect(plateNotes(run())).toBe(""); expect(backToViewer(null)).toContain('href="/"');
});
it("retains live, paused, recovered and fresh milestone facts for the improved cards", () => {
  expect(plateFacts(run({ status: "paused" }), 1000, 6000)).toMatchObject({ elapsed: 120000, fresh: false });
  expect(plateFacts(run({ status: "live" }), 1000, 30999).fresh).toBe(true);
  expect(plateFacts(run({ status: "live" }), 1000, 31000).fresh).toBe(false);
  expect(plateFacts(run({ status: "live", elapsedMs: 0 }), 1000, 1000).fresh).toBe(false);
  const base = run({ status: "live" });
  expect(plateFacts({ ...base, splits: base.splits.map(s => ({ ...s, derived: true })) }, 1000, 2000)).toMatchObject({ recovered: true, fresh: false });
});

it("validates the hardware-only run lane response", async () => {
  const { parseRunLanes } = await import("./workbench-view.js");
  expect([...parseRunLanes([{ run: "r", lane: "A", gpu: "GPU1" }])]).toEqual([["r", { lane: "A", gpu: "GPU1", arm: null }]]);
  for (const bad of [null, {}, [null], [{}], [{run: 1, lane: "A", gpu: "GPU1"}], [{run: "r", lane: 1, gpu: "GPU1"}], [{run: "r", lane: "A", gpu: 1}]]) expect(() => parseRunLanes(bad)).toThrow();
});


it("offers only viewable live games on the comparison page, excluding probes without hiding excluded benchmark runs", () => {
  const live = run({ id: "live", status: "live" });
  const paused = run({ id: "paused", status: "paused", excluded: "Operator excluded result" });
  const sessions = [live, paused, run({ id: "probe", status: "live", excluded: "Excluded probe session" }), run({ id: "paused-probe", status: "paused", excluded: "Excluded probe session" }), run({ id: "unresponsive", status: "unresponsive" }), run({ id: "ended", status: "ended" })];
  expect(liveOrPaused(sessions).map(row => row.id)).toEqual(["live", "paused"]);
  expect(currentRunLinks(sessions, "unavailable").join("")).not.toContain('data-watch="probe"');
});
