// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { run } from "../test-support/workbench.js";
import { HUMAN_REFERENCE, FRONTIER_MILESTONES, frontierReferences, frontierPlot, frontierCoverage } from "./frontier.js";
import type { WorkbenchRun } from "./workbench-data.js";
function measured(id: string, times: readonly (number | null)[], controller: "agent" | "human" = "agent"): WorkbenchRun {
  return Object.assign(run({ id, cohort: "selected", splits: times.flatMap((elapsedMs, i) => elapsedMs === null ? [] : [{ name: FRONTIER_MILESTONES[i]?.id ?? "", elapsedMs, segmentMs: 0, seq: i + 1, turn: 1, inputTokens: 0, outputTokens: 0 }]) }), {
    measurement: { controller, features: ["story-milestones-v2", "post-clock-navigation-milestones-v1"], logSha256: "a".repeat(64), pausedMs: controller === "human" ? 53869 : 0,
      rawSplits: times.flatMap((elapsedMs, i) => elapsedMs === null ? [] : [{ name: FRONTIER_MILESTONES[i]?.id ?? "", elapsedMs: elapsedMs + (controller === "human" ? 53869 : 0), evidence: [i] }]) },
  });
}
const human = (): WorkbenchRun => measured(HUMAN_REFERENCE, [92246, 132921, 180979, 248863, 317885, 408081, 4194300, 6645600], "human");
const best = (): WorkbenchRun => measured("dea1", [153477, 200600, 496944, 579200, 1477567]);
describe("persistent actual native frontier", () => {
  it("selects progress before speed and keeps one actual run, with stable ties", () => {
    const fast = measured("early", [1000, 2000, 3000]);
    const slow = measured("later-slow", [5000, 6000, 7000, 8000, 1500000]);
    const picked = frontierReferences([slow, best(), human(), fast]);
    expect(picked.human?.id).toBe(HUMAN_REFERENCE); expect(picked.best?.id).toBe("dea1");
    expect(picked.best?.splits[0]?.elapsedMs).toBe(153477);
    expect(frontierReferences([best(), measured("aaa", [153477, 200600, 496944, 579200, 1477567])]).best?.id).toBe("aaa");
  });
  it("excludes probes, human, incomplete, infrastructure, unknown-provenance and resumed sessions from records", () => {
    const advanced = measured("advanced", [1, 2, 3, 4, 5, 6, 7, 8]);
    const config = advanced.config; if (config === null) throw new Error("fixture config");
    const unknown = run({ id: "unknown", splits: advanced.splits });
    const refs = frontierReferences([human(), best(), unknown, { ...advanced, id: "probe", excluded: "Excluded probe session" }, { ...advanced, id: "infra", problem: "invalid" }, { ...advanced, id: "running", status: "live" }, { ...advanced, id: "resumed", config: { ...config, start: "save_state" } }]);
    expect(refs.best?.id).toBe("dea1");
    expect(frontierReferences([])).toMatchObject({ human: null, best: null });
  });
  it("keeps missing splits as gaps and references independent of filtered overlays", () => {
    const refs = frontierReferences([human(), best()]);
    const gap = measured("gap<script>", [1000, null, 3000]);
    document.body.innerHTML = frontierPlot(refs, [gap], 340, false);
    expect(document.querySelector("svg")?.getAttribute("viewBox")).toContain("0 0 340");
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(8);
    expect(document.querySelectorAll('[data-run="dea1"]')).toHaveLength(5);
    expect(document.querySelectorAll('polyline[data-series="gap<script>"]')).toHaveLength(0);
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(document.body.textContent).toContain("Badge");
    document.body.innerHTML = frontierPlot(refs, [], 920, true);
    expect(document.querySelectorAll(`[data-run="${HUMAN_REFERENCE}"]`)).toHaveLength(4);
    expect(document.body.textContent).toContain("Home");
    expect(document.body.textContent).not.toContain("Badge");
  });
  it("retains failed denominators and identifies unsupported and censored outcomes", () => {
    const failed = measured("failed", []), running = measured("running", []), interrupted = measured("interrupted", []); running.status = "live"; interrupted.status = "unresponsive";
    const unknown = run({ id: "old", splits: [] });
    const html = frontierCoverage([best(), failed, running, interrupted, unknown], "RIVAL_MET");
    expect(html).toContain("1 / 5"); expect(html).toContain("1 not reached"); expect(html).toContain("1 pending"); expect(html).toContain("1 censored"); expect(html).toContain("1 unsupported");
    expect(frontierCoverage([], "RIVAL_MET")).toContain("0 / 0");
  });
  it("shows unavailable persistent references explicitly instead of silently substituting another human", () => {
    document.body.innerHTML = frontierPlot(frontierReferences([measured("other-human", [1], "human")]), [], NaN, false);
    expect(document.body.textContent).toContain("Human reference unavailable");
    expect(document.body.textContent).toContain("Agent frontier unavailable");
  });
});
