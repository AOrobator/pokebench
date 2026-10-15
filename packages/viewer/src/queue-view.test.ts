// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GateView } from "./experiment-gate-store.js";
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
    recorded: { verdict: "READY", evidence: "3 of 4" }, result: null, buildCommit: "b7e1f00dbe245dbe4d22dd2fe413a1bed66fa36d",
    trials: [trial(0, "done", true), trial(1, "done", false), trial(2, "running"), trial(3, "waiting"), trial(4, "failed"), trial(5, "interrupted")],
    arms: { incumbent: arm(1, 1, 2_460_000, 600), candidate: arm(1, 0, null, 600) }, notes: null, ...over,
  };
}
const SNAPSHOT: QueueSnapshot = {
  queue: [view("full"), view("elev", { queuePosition: 2, state: "draft", reason: "queued; needs the operator's approval", approved: false, trials: [trial(0, "waiting")], arms: { incumbent: arm(0, 0, null, null), candidate: arm(0, 0, null, null) } })],
  pending: [view("ledge", { queuePosition: null, activationMilestone: "ROUTE_101", state: "pending", reason: "not ready: 0 of 4", recorded: null, readiness: { ready: false, basis: "recent", milestone: "ROUTE_101", window: 4, minReached: 3, reached: 0, considered: [] } })],
  closed: [view("old", { queuePosition: 9, state: "done", reason: "all 16 trials finished", result: { verdict: "improve", recommendation: "confirm", eligible: true, problems: [] } })],
  runner: { experiment: "full", trial: 2 }, gate: [], incumbent: null, gateBlock: null,
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
    const noConsidered: Record<string, unknown> = { ...view("x").readiness };
    delete noConsidered["considered"];
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), readiness: noConsidered }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), readiness: { ...view("x").readiness, basis: "other" } }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), recorded: "READY" }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), notes: 3 }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), result: { verdict: 1 } }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, runner: { experiment: 1 } })).toThrow("malformed /api/experiments runner");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, autorun: { state: "asleep", message: "" } })).toThrow("malformed /api/experiments autorun");
    expect(renderQueue(queueSnapshotOf({ ...SNAPSHOT, autorun: { state: "running", message: "Running full." } }), "all", new Set()).queue).toContain("QUEUE RUNNER · RUNNING · Running full.");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), state: "bogus" }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, queue: [{ ...view("x"), trials: [{ ...trial(0, "done", true), state: "odd" }] }] })).toThrow("malformed /api/experiments queue");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, closed: [{ ...view("x"), result: { verdict: "great", recommendation: "keep", eligible: true, problems: [] } }] })).toThrow("malformed /api/experiments closed");
    expect(() => queueSnapshotOf({ ...SNAPSHOT, closed: [{ ...view("x"), result: { verdict: "improve", recommendation: "ship", eligible: true, problems: [] } }] })).toThrow("malformed /api/experiments closed");
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
    // The build the trials actually ran on, not the commit the definition was written against.
    expect(open.queue).toContain("main @ b7e1f00");
    expect(renderQueue({ ...SNAPSHOT, queue: [view("fresh", { buildCommit: null })] }, "all", new Set(["fresh"])).queue).toContain("main as of its first trial");
    expect(open.queue).toContain("<dt>readiness.md</dt><dd>READY</dd>");
    expect(open.pending).toContain("runs checked</dt><dd>none yet");
    expect(open.pending).toContain("Waits for ROUTE_101: 0 of the last 0 recent think-fast runs reached ROUTE_101 (needs 3 of 4)");
    const flipped = renderQueue({ ...SNAPSHOT, queue: [view("on", { incumbentOn: true, readiness: { ...view("x").readiness, basis: "comparable" }, recorded: null, trialsPerArm: 0 })] }, "all", new Set(["on"]));
    expect(flipped.queue).toContain("A · INCUMBENT · SWITCH ON");
    expect(flipped.queue).toContain("comparable think-fast runs");
    expect(flipped.queue).toContain('style="width:0%"');
  });

  it("shows a finished experiment's verdict and recommendation, and filters blocked entries", () => {
    const done = renderQueue(SNAPSHOT, "closed", new Set(["old"]));
    expect(done.queue).toContain("<dt>verdict</dt><dd>IMPROVE → CONFIRM</dd>");
    const ineligible = renderQueue({ ...SNAPSHOT, closed: [view("bad", { state: "done", result: { verdict: "inconclusive", recommendation: "retain", eligible: false, problems: ["prompt differs"] } })] }, "closed", new Set(["bad"]));
    expect(ineligible.queue).toContain("INCONCLUSIVE → RETAIN (not eligible: prompt differs)");
    const blocked = { ...SNAPSHOT, queue: [...SNAPSHOT.queue, view("stuck", { state: "blocked", reason: "needs a fix" })] };
    expect(renderQueue(blocked, "all", new Set()).chips).toContain('data-filter="blocked"');
    const pendingBlocked = { ...SNAPSHOT, pending: [...SNAPSHOT.pending, view("held-back", { queuePosition: null, state: "blocked", reason: "needs a fix" })] };
    expect(countsOf(pendingBlocked).blocked).toBe(1);
    // A blocked entry says why it is blocked, not a readiness count that never ran.
    const stuckOnly = { ...SNAPSHOT, queue: [view("stuck", { state: "blocked", reason: "needs a fix" })], pending: [view("held-back", { queuePosition: null, state: "blocked", reason: "needs a fix" })], closed: [] };
    const rendered = renderQueue(stuckOnly, "all", new Set(["stuck"])), html = rendered.queue + rendered.pending;
    expect(html).not.toContain("Waits for");
    expect(html).not.toContain("of the last");
    expect(html.match(/needs a fix/g)?.length).toBeGreaterThanOrEqual(2);
    const onlyPending = renderQueue(pendingBlocked, "blocked", new Set());
    expect(onlyPending.pending).toContain("EXPERIMENT HELD-BACK");
    expect(onlyPending.pending).not.toContain("EXPERIMENT LEDGE");
    const only = renderQueue(blocked, "blocked", new Set());
    expect(only.queue).toContain("EXPERIMENT STUCK");
    expect(only.queue).not.toContain("EXPERIMENT FULL");
  });

  it("lists approved, running and held experiments above drafts, keeping queue order within each group", () => {
    const draft = (id: string, queuePosition: number | null): ExperimentView => view(id, { queuePosition, state: "draft", approved: false });
    const queue = [draft("d1", 1), view("a2", { queuePosition: 2, state: "approved" }), view("s3", { queuePosition: 3, state: "stale", approved: false }), view("h4", { queuePosition: 4, state: "held" }), view("r5", { queuePosition: 5 }),
      view("n6", { queuePosition: 6, state: "not-ready" }), view("n7", { queuePosition: 7, state: "not-ready", approved: false }), view("c8", { queuePosition: 8, approved: false }), draft("d9", null)];
    const html = renderQueue({ ...SNAPSHOT, queue }, "all", new Set()).queue;
    const order = [...html.matchAll(/data-experiment="([^"]+)"/g)].map((m) => m[1]);
    expect(order.slice(0, queue.length)).toEqual(["a2", "h4", "r5", "n6", "c8", "d1", "s3", "n7", "d9"]);
  });

  it("keeps pending experiments on the same stats-page card as the queue", () => {
    document.body.innerHTML = readFileSync(join(import.meta.dirname, "../static/workbench.html"), "utf8").replace(/<script[^>]*><\/script>|<link[^>]*>/g, "");
    const boxes = document.querySelectorAll(".eq-stats > .box");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.querySelector('[data-eq="queue"]')).not.toBeNull();
    expect(boxes[0]?.querySelector('[data-eq="pending"]')).not.toBeNull();
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
    const empty = renderQueue({ queue: [], pending: [], closed: [], runner: null, problems: [], gate: [], incumbent: null, gateBlock: null }, "all", new Set());
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
    // Keyboard users keep focus on the control they used after the slot re-renders.
    root.querySelector<HTMLElement>('[data-toggle="elev"]')?.focus();
    root.querySelector<HTMLElement>('[data-toggle="elev"]')?.click();
    expect((document.activeElement as HTMLElement | null)?.dataset["toggle"]).toBe("elev");
    root.querySelector<HTMLElement>('[data-filter="draft"]')?.focus();
    root.querySelector<HTMLElement>('[data-filter="draft"]')?.click();
    expect((document.activeElement as HTMLElement | null)?.dataset["filter"]).toBe("draft");
    root.querySelector<HTMLElement>('[data-filter="all"]')?.click();
    root.querySelector<HTMLElement>('[data-toggle="elev"]')?.click();
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

  it("approves and withdraws from the battle card after a confirmation", async () => {
    document.body.innerHTML = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8").replace(/<script[^>]*><\/script>|<link[^>]*>/g, "");
    const root = document.querySelector<HTMLElement>('[data-ui="experiment-queue"]');
    if (root === null) throw new Error("page is missing the queue");
    const sent: [string, string][] = [], asked: string[] = [];
    let answer = false;
    const approved = { ...SNAPSHOT, queue: [view("elev", { queuePosition: 2, state: "approved", approved: true, trials: [trial(0, "waiting")], arms: { incumbent: arm(0, 0, null, null), candidate: arm(0, 0, null, null) } })] };
    const panel = new QueuePanel(root, {
      fetchJson: () => Promise.resolve(SNAPSHOT), problem: () => undefined,
      sendJson: (method, url) => { sent.push([method, url]); return Promise.resolve(approved); },
      confirm: (text) => { asked.push(text); return answer; },
    });
    await panel.load();
    root.querySelector<HTMLElement>('[data-toggle="elev"]')?.click();
    expect(root.querySelector('[data-approve="elev"]')?.textContent).toBe("APPROVE 16 RUNS");
    expect(root.querySelector('[data-approve="full"]')).toBeNull();
    root.querySelector<HTMLElement>('[data-approve="elev"]')?.click();
    await Promise.resolve();
    expect(asked[0]).toContain("Approve Experiment elev");
    expect(sent).toEqual([]);
    answer = true;
    root.querySelector<HTMLElement>('[data-approve="elev"]')?.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([["POST", "/api/experiments/elev/approve"]]);
    expect(root.querySelector('[data-experiment="elev"] .eq-st')?.textContent).toBe("APPROVED");
    expect(root.querySelector('[data-revoke="elev"]')?.textContent).toBe("WITHDRAW APPROVAL");
    root.querySelector<HTMLElement>('[data-revoke="elev"]')?.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent.at(-1)).toEqual(["POST", "/api/experiments/elev/revoke"]);
    expect(asked.at(-1)).toContain("The trial already running finishes");
  });

  it("explains a failed load inside the queue instead of loading forever", async () => {
    document.body.innerHTML = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8").replace(/<script[^>]*><\/script>|<link[^>]*>/g, "");
    const root = document.querySelector<HTMLElement>('[data-ui="experiment-queue"]');
    if (root === null) throw new Error("page is missing the queue");
    const panel = new QueuePanel(root, { fetchJson: () => Promise.reject(new Error("GET /api/experiments returned HTTP 404")), problem: () => undefined });
    await panel.load();
    expect(root.querySelector('[data-eq="queue"]')?.textContent).toContain("restart the viewer");
    const failing = new QueuePanel(root, { fetchJson: () => Promise.resolve(SNAPSHOT), problem: () => undefined, sendJson: () => Promise.reject(new Error("elev is approved")), confirm: () => true });
    await failing.load();
    root.querySelector<HTMLElement>('[data-toggle="elev"]')?.click();
    root.querySelector<HTMLElement>('[data-approve="elev"]')?.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector('[data-eq="queue"]')?.textContent).toContain("elev is approved");
  });

  it("shows the winner gate: finalists, finals pips, verdicts, the promoted incumbent and why the queue waits", async () => {
    const finals = { runsPerArm: 4, maxWallMs: 2_700_000, target: null };
    const running: GateView = { experiment: "full", title: "Whole <map>", state: "held", reason: "finals stopped after 1 of 12 runs", source: "cohort", finals, finalists: [{ arm: "whole", switches: { "full-map-navigation-v1": true } }, { arm: "both", switches: {} }], ranking: [], trials: [{ index: 0, arm: "incumbent", state: "done", run: "r" }, { index: 1, arm: "whole", state: "running", run: "s" }, { index: 2, arm: "both", state: "waiting", run: null }], decision: null, winner: null };
    const done: GateView = { ...running, experiment: "old", title: "Old", state: "declared", reason: "whole won", finals: { ...finals, target: "RIVAL_MET" }, trials: [], decision: { winner: "whole", incumbent: { medianFurthest: 3, medianMs: null }, verdicts: [{ arm: "whole", pass: true, reasons: [], medianFurthest: 5, medianMs: null }, { arm: "both", pass: false, reasons: ["not <further>"], medianFurthest: 3, medianMs: null }] } };
    const withdrawn: GateView = { ...running, experiment: "w", state: "withdrawn", finalists: [] };
    const gated: QueueSnapshot = { ...SNAPSHOT, gate: [running, done, withdrawn], gateBlock: "full: finals stopped", incumbent: { id: "old:whole", from: "old", arm: "whole", features: { "full-map-navigation-v1": true }, at: "t", finals: [] } };
    expect(queueSnapshotOf(JSON.parse(JSON.stringify(gated)))).toEqual(gated);
    expect(() => queueSnapshotOf({ ...gated, gate: [{ ...running, state: "nope" }] })).toThrow("malformed /api/experiments gate");
    expect(() => queueSnapshotOf({ ...gated, gateBlock: 1 })).toThrow("malformed /api/experiments gate");
    expect(() => queueSnapshotOf({ ...gated, incumbent: { from: "x" } })).toThrow("malformed /api/experiments incumbent");
    const html = renderQueue(gated, "all", new Set(), true).queue;
    expect(html).toContain("WINNER GATE · FINALISTS RUN FROM BOOT");
    expect(html).toContain("New experiments wait: full: finals stopped");
    expect(html).toContain("INCUMBENT · whole from the old finals: <code>full-map-navigation-v1</code> ON");
    expect(html).toContain("WHOLE &lt;MAP&gt;");
    expect(html).toContain("1 · whole: <code>full-map-navigation-v1</code> ON<br>2 · both: no switch change");
    expect(html).toContain("4 runs each from boot, 45 min");
    expect(html).toContain("stop at RIVAL_MET");
    expect(html).toContain("both: FAIL (not &lt;further&gt;)");
    expect(html).toContain('data-finals-withdraw="full"');
    expect(html).toContain('data-finals-resume="w"');
    expect(html).toContain(">WINNER<");
    expect(renderQueue(gated, "all", new Set(), false).queue).not.toContain("data-finals-");
    expect(renderQueue(gated, "pending", new Set()).queue).not.toContain("WINNER GATE");

    document.body.innerHTML = readFileSync(join(import.meta.dirname, "../static/index.html"), "utf8").replace(/<script[^>]*><\/script>|<link[^>]*>/g, "");
    const root = document.querySelector<HTMLElement>('[data-ui="experiment-queue"]');
    if (root === null) throw new Error("page is missing the queue");
    const sent: string[] = [], asked: string[] = [];
    let fail = false;
    const panel = new QueuePanel(root, { fetchJson: () => Promise.resolve(gated), problem: () => undefined, sendJson: (_m, url) => { sent.push(url); return fail ? Promise.reject(new Error("no finals")) : Promise.resolve(gated); }, confirm: (text) => { asked.push(text); return true; } });
    await panel.load();
    root.querySelector<HTMLElement>('[data-finals-withdraw="full"]')?.click();
    await new Promise((r) => setTimeout(r, 0));
    root.querySelector<HTMLElement>('[data-finals-resume="w"]')?.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual(["/api/experiments/full/finals-withdraw", "/api/experiments/w/finals-resume"]);
    expect(asked[0]).toContain("new experiments keep waiting");
    fail = true;
    root.querySelector<HTMLElement>('[data-finals-withdraw="full"]')?.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(root.querySelector('[data-eq="queue"]')?.textContent).toContain("no finals");
    await panel.finals("missing", true);
    expect(sent).toHaveLength(3);
  });
});
