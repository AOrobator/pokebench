// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { FRONTIER_MILESTONES, frontierReferences } from "./frontier.js";
import { frontierHeadline, headlineModel } from "./frontier-headline.js";
import type { WorkbenchRun } from "./workbench-data.js";

const reached = (id: string, count: number, lastMs: number, extra: Partial<WorkbenchRun> = {}): WorkbenchRun => {
  const base = run({ id, model: "deepseek/deepseek-v4.1-flash", reason: null, ...extra });
  const config = base.config; if (config === null) throw new Error("fixture config");
  return { ...base, config: { ...config, start: "boot", resume: null, ...(extra.config ?? {}) }, measurement: { controller: "agent", features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] },
    splits: FRONTIER_MILESTONES.slice(0, count).map((m, i) => ({ name: m.id, elapsedMs: i === count - 1 ? lastMs : i, segmentMs: 0, seq: i + 1, turn: 1, inputTokens: 0, outputTokens: 0 })) };
};
const edited = { model: "qwen3.8-27b-edit-e1" };
const tile = (name: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-frontier-tile="${name}"]`);
const render = (runs: readonly WorkbenchRun[]): void => { document.body.innerHTML = frontierHeadline(frontierReferences(runs)); };
const total = FRONTIER_MILESTONES.length;

describe("frontier headline tiles", () => {
  it("shows an assisted leader beside the best unhelped run with the checkpoint gap", () => {
    render([reached("run-274b", 12, 49198000), reached("run-aaaa", 17, 26162000, edited)]);
    const overall = tile("overall"), unhelped = tile("unhelped");
    expect(overall?.className).toContain("wb-fh-help");
    expect(overall?.querySelector(".wb-fh-badge")?.textContent).toBe("HEAVILY ASSISTED");
    expect(overall?.querySelector(".wb-fh-key")?.textContent).toBe("BEST OVERALL");
    expect(overall?.querySelector(".wb-fh-mile")?.textContent).toBe(FRONTIER_MILESTONES[16].label);
    expect(overall?.querySelector(".wb-fh-time")?.textContent).toBe("7:16:02 active");
    expect(overall?.querySelector(".wb-fh-story")?.textContent).toContain(`17/${String(total)}`);
    expect(overall?.querySelector(".wb-fh-bar")?.getAttribute("aria-label")).toBe(`17 of ${String(total)} checkpoints`);
    expect(overall?.querySelector(".wb-fh-who")?.textContent).toContain("qwen3.8-27b-edit-e1 · aaaa");
    expect(overall?.querySelector(".wb-fh-who")?.textContent).toContain("weight-edited model");
    expect(unhelped?.querySelector(".wb-fh-key")?.textContent).toBe("BEST UNHELPED");
    expect(unhelped?.querySelector(".wb-fh-plain")?.textContent).toBe("UNHELPED");
    expect(unhelped?.querySelector(".wb-fh-time")?.textContent).toBe("13:39:58 active");
    expect(document.querySelector(".wb-fh-gap")?.textContent).toBe("+5checkpoints");
    expect(document.querySelector(".wb-fh-rule")?.textContent).toContain("never pooled with experiment cohorts");
  });
  it("shows one tile when best overall is the best unhelped run", () => {
    render([reached("run-274b", 12, 1000, { reason: "operator_abort" }), reached("run-aaaa", 3, 500, edited)]);
    expect(document.querySelectorAll("[data-frontier-tile]")).toHaveLength(1);
    expect(tile("overall")?.className).not.toContain("wb-fh-help");
    expect(tile("overall")?.querySelector(".wb-fh-key")?.textContent).toBe("BEST OVERALL");
    expect(tile("overall")?.querySelector(".wb-fh-plain")?.textContent).toBe("UNHELPED");
    expect(tile("overall")?.querySelector(".wb-fh-who")?.textContent).toContain("ended by operator abort");
    expect(tile("unhelped")).toBeNull();
    expect(document.querySelector(".wb-fh-gap")).toBeNull();
    expect(document.querySelector(".wb-fh-heads")?.className).toContain("wb-fh-one");
    expect(document.body.textContent?.toUpperCase()).not.toContain("SAME RUN");
  });
  it("says one checkpoint in the singular", () => {
    expect(headlineModel(frontierReferences([reached("a", 5, 90), reached("b", 6, 90, edited)])).gap).toBe(1);
    render([reached("a", 5, 90), reached("b", 6, 90, edited)]);
    expect(document.querySelector(".wb-fh-gap")?.textContent).toBe("+1checkpoint");
  });
  it("says the checkpoints are the same and gives the time difference on a tie", () => {
    const refs = frontierReferences([reached("a", 5, 1000000), reached("b", 5, 280000, edited)]);
    expect(headlineModel(refs)).toMatchObject({ gap: 0, fasterMs: 720000 });
    const gapText = (slow: number, fast: number): string | null | undefined => { render([reached("a", 5, slow), reached("b", 5, fast, edited)]); return document.querySelector(".wb-fh-gap")?.textContent; };
    expect(gapText(1000000, 280000)).toBe("Same checkpoint · 12m faster");
    expect(gapText(4000000, 100000)).toBe("Same checkpoint · 1h 5m faster");
    expect(gapText(50000, 5000)).toBe("Same checkpoint · 45s faster");
    expect(gapText(90, 80)).toBe("Same checkpoint · under 1s faster");
    expect(gapText(90, 90)).toBe("Same checkpoint · same time");
    expect(document.querySelectorAll("[data-frontier-tile]")).toHaveLength(2);
  });
  it("has no time gap when the assisted run is ahead by checkpoints", () => {
    expect(headlineModel(frontierReferences([reached("a", 5, 90), reached("b", 6, 900, edited)])).fasterMs).toBeNull();
  });
  it("says so when only assisted runs have reached a checkpoint", () => {
    render([reached("a", 5, 90, edited)]);
    expect(tile("overall")?.querySelector(".wb-fh-badge")).not.toBeNull();
    expect(tile("unhelped")?.textContent).toContain("No unhelped run has reached a checkpoint yet.");
    expect(document.querySelector(".wb-fh-gap")).toBeNull();
  });
  it("shows no tiles with no run to show", () => {
    expect(frontierHeadline({ human: null, best: null, overall: null })).toBe("");
    expect(frontierHeadline({ human: null, best: null })).toBe("");
    expect(headlineModel({ human: null, best: null })).toEqual({ overall: null, unhelped: null, gap: null, fasterMs: null, same: false });
  });
  it("marks a live or paused leader and escapes recorded text", () => {
    render([reached("a", 5, 90, { status: "live", model: "<b>x</b>" })]);
    expect(tile("overall")?.querySelector(".wb-fh-who")?.textContent).toContain("<b>x</b>");
    expect(tile("overall")?.querySelector(".wb-fh-who")?.textContent).toContain("live now");
    render([reached("a", 5, 90, { status: "paused", model: null })]);
    expect(tile("overall")?.querySelector(".wb-fh-who")?.textContent).toContain("paused");
    expect(tile("overall")?.querySelector(".wb-fh-who")?.textContent).toContain("Model not recorded");
  });
  it("never counts a screenshot-only checkpoint, as the ranking does not", () => {
    const shot = reached("a", 5, 90);
    shot.splits = shot.splits.map((s, i) => i === 4 ? { ...s, screenshotEvidence: [] } : s);
    expect(headlineModel(frontierReferences([shot])).overall?.level).toBe(4);
  });
});
