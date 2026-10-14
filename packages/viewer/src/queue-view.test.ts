// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExperimentView, QueueSnapshot, TrialView } from "./experiment-store.js";
import { QueuePanel, countsOf, queueSnapshotOf, renderQueue } from "./queue-view.js";

const arm = (finished: number, reached: number, ms: number | null, turns: number | null) => ({ finished, reached, medianPrimaryMs: ms, medianTurns: turns, reachedPer1kTurns: turns === null ? null : (reached * 1000) / (turns * finished) });
const trial = (index: number, state: TrialView["state"], reachedPrimary: boolean | null = null): TrialView => ({ index, arm: index % 4 === 0 || index % 4 === 3 ? "incumbent" : "candidate", state, run: state === "waiting" ? null : `r${String(index)}`, runs: [], reachedPrimary, primaryMs: reachedPrimary === true ? 2_460_000 : null, turns: state === "done" ? 600 : null });
function view(id: string, over: Partial<ExperimentView> = {}): ExperimentView {
  return {
    id, title: `Experiment ${id}`, changedFeature: "full-map-navigation-v1", incumbentOn: false, hypothesis: "It <helps>.", activationMilestone: "PLAYER_NAME_CONFIRMED", primaryMilestone: "RIVAL_HOUSE_ENTERED",
    queuePosition: 1, source: { checkout: "main", commit: "a3c343bdbe245dbe4d22dd2fe413a1bed66fa36d" }, trialsPerArm: 8, modelLane: "think-fast", budgetMs: 17 * 1_800_000, usedMs: 3_600_000,
    state: "running", reason: "trial 3 of 16 running", approved: true,
    readiness: { ready: true, basis: "recent", milestone: "PLAYER_NAME_CONFIRMED", window: 4, minReached: 3, reached: 3, considered: ["a", "b", "c", "d"] },
    recorded: { verdict: "READY", evidence: "3 of 4" },
    trials: [trial(0, "done", true), trial(1, "done", false), trial(2, "running"), trial(3, "waiting"), trial(4, "failed"), trial(5, "interrupted")],
    arms: { incumbent: arm(1, 1, 2_460_000, 600), candidate: arm(1, 0, null, 600) }, notes: null, ...over,
  };
}
const SNAPSHOT: QueueSnapshot = {
  queue: [view("full"), view("elev", { queuePosition: 2, state: "draft", reason: "queued; needs the operator's approval", approved: false, trials: [trial(0, "waiting")], arms: { incumbent: arm(0, 0, null, null), candidate: arm(0, 0, null, null) } })],
  pending: [view("ledge", { queuePosition: null, activationMilestone: "ROUTE_101", state: "pending", reason: "not ready: 0 of 4", recorded: null, readiness: { ready: false, basis: "recent", milestone: "ROUTE_101", window: 4, minReached: 3, reached: 0, considered: [] } })],
  closed: [view("old", { queuePosition: 9, state: "done", reason: "all 16 trials finished" })],
  runner: { experiment: "full", trial: 2 },
  problems: ["bad.json: Invalid experiment"],
};

describe("experiment queue view", () => {
  it("validates the /api/experiments payload", () => {
    expect(queueSnapshotOf(JSON.parse(JSON.stringify(SNAPSHOT)))).toEqual(SNAPSHOT);
    expect(() => queueSnapshotOf(null)).toThrow("malformed /api/experiments payload");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ id: "x" }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, pending: "no" })).toThrow("malformed /api/experiments pending");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), trials: [{ index: "0" }] }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), arms: { incumbent: {}, candidate: {} } }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, problems: [1] })).toThrow("malformed /api/experiments problems");
  });

  it("counts states and shows chips only for states that exist", () => {
    expect(countsOf(SNAPSHOT)).toMatchObject({ all: 4, running: 1, draft: 1, pending: 1, closed: 1, approved: 0 });
    const { chips } = renderQueue(SNAPSHOT, "all", new Set());
    expect(chips).toContain('data-filter="running"');
    expect(chips).not.toContain('data-filter="approved"');
    expect(chips).toContain('class="eq-chip on" data-filter="all" aria-pressed="true">ALL <b>4</b>');
  });

  it("renders collapsed party slots with pips and HP bars, and opens one into its battle card", () => {
    const closed = renderQueue(SNAPSHOT, "all", new Set());
    expect(closed.queue).toContain("#1 EXPERIMENT FULL");
    expect(closed.queue).toContain('class="tp A ok"');
    expect(closed.queue).toContain('class="tp B miss"');
    expect(closed.queue).toContain('class="tp B running"');
    expect(closed.queue).toContain('class="tp A waiting"');
    expect(closed.queue).toContain('class="tp A failed"');
    expect(closed.queue).toContain('style="width:13%"');
    expect(closed.queue).toContain("600 · 600 median turns (A · B)");
    expect(closed.queue).not.toContain("eq-battle");
    expect(closed.queue).toContain("<h4 class=\"eq-sub\">DONE</h4>");
    expect(closed.queue).toContain("bad.json: Invalid experiment");
    const open = renderQueue(SNAPSHOT, "all", new Set(["full", "ledge"]));
    expect(open.queue).toContain("A · INCUMBENT · SWITCH OFF");
    expect(open.queue).toContain("B · CANDIDATE · SWITCH ON");
    expect(open.queue).toContain("<dd>41m</dd>");
    expect(open.queue).toContain("It &lt;helps&gt;.");
    expect(open.queue).toContain("1.0 of 8.5 h");
    expect(open.queue).toContain("main @ a3c343b");
    expect(open.queue).toContain("<dt>readiness.md</dt><dd>READY</dd>");
    expect(open.pending).toContain("runs checked</dt><dd>none yet");
    expect(open.pending).toContain("Waits for ROUTE_101: 0 of the last 0 recent think-fast runs reached ROUTE_101 (needs 3 of 4)");
    const flipped = renderQueue({ ...SNAPSHOT, queue: [view("on", { incumbentOn: true, readiness: { ...view("x").readiness, basis: "comparable" }, recorded: null, trialsPerArm: 0 })] }, "all", new Set(["on"]));
    expect(flipped.queue).toContain("A · INCUMBENT · SWITCH ON");
    expect(flipped.queue).toContain("comparable think-fast runs");
    expect(flipped.queue).toContain('style="width:0%"');
  });

  it("filters by status, including pending and done", () => {
    const drafts = renderQueue(SNAPSHOT, "draft", new Set());
    expect(drafts.queue).toContain("EXPERIMENT ELEV");
    expect(drafts.queue).not.toContain("EXPERIMENT FULL");
    expect(drafts.pending).toBe("");
    const pending = renderQueue(SNAPSHOT, "pending", new Set());
    expect(pending.queue).not.toContain("eq-slot");
    expect(pending.pending).toContain("EXPERIMENT LEDGE");
    const done = renderQueue(SNAPSHOT, "closed", new Set());
    expect(done.queue).toContain("EXPERIMENT OLD");
    expect(done.queue).not.toContain("EXPERIMENT FULL");
    expect(renderQueue(SNAPSHOT, "held", new Set()).queue).toContain("No experiments in this state.");
    const empty = renderQueue({ queue: [], pending: [], closed: [], runner: null, problems: [] }, "all", new Set());
    expect(empty.queue).toContain("Nothing is queued.");
    expect(empty.pending).toContain("No pending experiments.");
  });

  it("loads, filters on chip clicks and toggles slots in place", async () => {
    document.body.innerHTML = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8").replace(/<script[^>]*><\/script>|<link[^>]*>/g, "");
    const root = document.querySelector<HTMLElement>('[data-ui="experiment-queue"]');
    if (root === null) throw new Error("page is missing the queue");
    const problems: string[] = [];
    let reply: unknown = SNAPSHOT;
    const panel = new QueuePanel(root, { fetchJson: (url) => { expect(url).toBe("/api/experiments"); return Promise.resolve(reply); }, problem: (text) => { problems.push(text); } });
    panel.render();
    expect(root.querySelector('[data-eq="queue"]')?.textContent).toContain("Loading");
    await panel.load();
    expect(root.querySelectorAll(".eq-slot")).toHaveLength(3);
    root.querySelector<HTMLElement>('[data-toggle="full"]')?.click();
    expect(root.querySelector('[data-experiment="full"] .eq-battle')).not.toBeNull();
    expect(root.querySelector('[data-toggle="full"]')?.getAttribute("aria-expanded")).toBe("true");
    root.querySelector<HTMLElement>('[data-toggle="full"] .eq-name')?.click();
    expect(root.querySelector('[data-experiment="full"] .eq-battle')).toBeNull();
    root.querySelector<HTMLElement>('[data-filter="pending"] b')?.click();
    expect(panel.filter).toBe("pending");
    expect(root.querySelectorAll(".eq-slot")).toHaveLength(0);
    expect(root.querySelectorAll(".eq-mon")).toHaveLength(1);
    root.querySelector<HTMLElement>('[data-filter="pending"]')?.setAttribute("data-filter", "bogus");
    root.querySelector<HTMLElement>('[data-filter="bogus"]')?.click();
    expect(panel.filter).toBe("all");
    root.querySelector<HTMLElement>(".eq-root")?.click();
    reply = { nope: true };
    await panel.load();
    expect(problems).toEqual(["experiment queue: malformed /api/experiments queue"]);
    const failing = new QueuePanel(root, { fetchJson: () => Promise.reject(new Error("offline")), problem: (text) => { problems.push(text); } });
    await failing.load();
    expect(problems.at(-1)).toBe("experiment queue: offline");
    await Promise.all([panel.load(), panel.load()]);
  });
});
