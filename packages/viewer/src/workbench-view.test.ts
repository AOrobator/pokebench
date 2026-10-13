import { describe, expect, it } from "vitest";
import { color, currentRunHtml, eligible, median, metricText, ribbonPlot, runDetails, timingPlot, viewerUrl } from "./workbench-view.js";
import { run } from "../test-support/workbench.js";
describe("workbench visual contract", () => {
  it.each([280, 360, 800, 1400])("fits SVG geometry to a %i-pixel container and wraps long identifiers", width => {
    for (const html of [timingPlot([run()], "PLAYER_NAME_CONFIRMED", "objective-tracking-v1", "elapsedMs", width), ribbonPlot([run()], width)]) {
      expect(html).toContain(`viewBox="0 0 ${String(width)} `); expect(html).not.toContain("min-width"); expect(html).not.toContain("overflow-x"); expect(html).toContain('data-run="run_01"'); expect(html).not.toContain("<img onerror");
    }
  });
  it("separates unknown feature states and never plots excluded or missing milestone times", () => {
    const html = timingPlot([run(), run({ id: "unknown", config: null }), run({ id: "failed", excluded: "Infrastructure", splits: run().splits }), run({ id: "unreached", splits: [] })], "PLAYER_NAME_CONFIRMED", "objective-tracking-v1", "elapsedMs", 700);
    expect(html).toContain("UNKNOWN"); expect(html).toContain('data-run="unknown"'); expect(html).not.toContain('data-run="failed"'); expect(html).not.toContain('data-run="unreached"'); expect(timingPlot([], "NAME", "x", "turn", 300)).toContain("No verified");
  });
  it.each(["elapsedMs", "segmentMs", "turn", "outputTokens"] as const)("shows a selectable %s metric with raw trial attribution", metric => {
    const html = timingPlot([run()], "PLAYER_NAME_CONFIRMED", "objective-tracking-v1", metric, 800); expect(html).toContain("data-split"); expect(html).toContain('role="button"'); expect(html).toContain('tabindex="0"');
  });
  it("shows live clocks, caps, objective and fixed target separately, linking to that run", () => {
    const html = currentRunHtml([run({ status: "live" })], 1000, 6000, "older"); expect(html).toContain('/#run=run_01'); expect(html).toContain("0:02:05"); expect(html).toContain("0:10:00"); expect(html).toContain("CURRENT OBJECTIVE"); expect(html).toContain("PLAYER NAME CONFIRMED"); expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
  it("does not tick a paused run or mistake unresponsive/ended logs for live, and retains the viewer return selection", () => {
    expect(currentRunHtml([run({ status: "paused" })], 1000, 6000, null)).toContain("0:02:00"); expect(currentRunHtml([run({ status: "unresponsive" })], 1000, 6000, "old/run")).toContain('/#run=old%2Frun'); expect(currentRunHtml([], 0, 0, null)).toContain("BACK TO VIEWER");
  });
  it("renders truthful recorded configuration and feature tri-states, checkpoint evidence, and a replay link", () => {
    const html = runDetails(run(), "PLAYER_NAME_CONFIRMED"); expect(html).toContain("OFF"); expect(html).toContain("UNKNOWN"); expect(html).toContain("ON"); expect(html).toContain("#19"); expect(html).toContain("65,536"); expect(html).toContain("objectives-on"); expect(html).toContain("&lt;img"); expect(runDetails(run({ config: null }), null)).toContain("not recorded");
  });
  it("does not infer controlled benefit or fabricate segment durations for stopped runs", () => {
    const html = ribbonPlot([run({ reason: "stuck", splits: run().splits.slice(0, 1) })], 360); expect(html).toContain("stuck"); expect(html).not.toContain('data-split="PLAYER_NAME_CONFIRMED"'); expect(ribbonPlot([], 360)).toContain("No verified");
  });
  it("formats actual medians, metric units, eligibility and stable colors", () => {
    expect(median([])).toBeNull(); expect(median([9, 1, 5])).toBe(5); expect(median([4, 2])).toBe(3); expect(metricText(4000, "elapsedMs")).toBe("0:00:04"); expect(metricText(31, "turn")).toBe("31"); expect(viewerUrl(null)).toBe("/"); expect(color("model")).toBe(color("model")); expect(eligible(run({ excluded: "probe" }))).toBe(false);
  });
});
