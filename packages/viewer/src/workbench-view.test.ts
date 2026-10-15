import { describe, expect, it } from "vitest";
import { currentRunHtml, runDetails, viewerUrl } from "./workbench-view.js";
import { run } from "../test-support/workbench.js";
describe("workbench visual contract", () => {
  it("shows live clocks, caps and fixed target separately without an objective, linking to that run", () => {
    const html = currentRunHtml([run({ status: "live" })], 1000, 6000, "older"); expect(html).toContain('/#run=run_01'); expect(html).toContain("0:02:05"); expect(html).toContain("0:10:00"); expect(html).not.toContain("OBJECTIVE"); expect(html).toContain("PLAYER NAME CONFIRMED"); expect(html).toContain("&lt;img"); expect(html).not.toContain("<img"); expect(html).not.toContain("NOT FROM ZERO");
    const saved = run({ status: "live" }); if (saved.config === null) throw new Error("config"); saved.config = { ...saved.config, resume: "CLOCK_SET" };
    expect(currentRunHtml([saved], 1000, 6000, null)).toContain("NOT FROM ZERO · Clock set save"); expect(runDetails(saved, null)).toContain("did not start from New game");
  });
  it("does not tick a paused run or mistake unresponsive/ended logs for live, and retains the viewer return selection", () => {
    expect(currentRunHtml([run({ status: "paused" })], 1000, 6000, null)).toContain("0:02:00"); expect(currentRunHtml([run({ status: "unresponsive" })], 1000, 6000, "old/run")).toContain('/#run=old%2Frun'); expect(currentRunHtml([], 0, 0, null)).toContain("BACK TO VIEWER");
  });
  it("renders truthful recorded configuration and feature tri-states, checkpoint evidence, and a replay link", () => {
    const html = runDetails(run(), "PLAYER_NAME_CONFIRMED"); expect(html).toContain("OFF"); expect(html).toContain("UNKNOWN"); expect(html).toContain("ON"); expect(html).toContain("#19"); expect(html).toContain("65,536"); expect(html).toContain("objectives-on"); expect(html).toContain("&lt;img"); expect(runDetails(run({ config: null }), null)).toContain("not recorded");
  });
  it("renders unknown legacy configuration without inventing targets or budgets", () => {
    const c = run().config; if (c === null) throw new Error("fixture");
    const legacy = run({ id: "old", model: null, reason: null, status: "live", config: { ...c, target: null, maxWallMs: null, maxTurns: null, failureLimit: null, preset: null, dirty: true, vision: false }, splits: [] });
    const card = currentRunHtml([legacy], 1000, 6000, null); expect(card).toContain("no recorded time cap"); expect(card).not.toContain("objective"); expect(card).toContain("play to budget");
    const detail = runDetails(legacy, null); expect(detail).toContain("(dirty)"); expect(detail).toContain("not supported"); expect(detail).toContain("not recorded / play to budget"); expect(detail).toContain("no terminal outcome");
    expect(viewerUrl(null)).toBe("/");
  });

});
