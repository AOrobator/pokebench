import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Log, START, assistant, state, tAt } from "../test-support/events.js";
import type { ViewerBuild } from "./build-stamp.js";
import { createWorkbenchLoader, loadRun, parseLoadedRun, workbenchSnapshot, type LoadedRun } from "./workbench-store.js";
import { createWorkbenchStore, type RunStore } from "./baseline-store.js";
import { listRuns } from "./runs.js";
import { milestoneStatus } from "./frontier.js";
import { startViewer, type Viewer } from "./server.js";

const RUN_COMMIT = START.harness.commit;
const OLDER = "308ddd3e".padEnd(40, "0");
const older: ViewerBuild = { commit: OLDER, dirty: false, relation: () => "older" };
const viewerNewer: ViewerBuild = { ...older, relation: () => "newer" };
const same: ViewerBuild = { commit: RUN_COMMIT, dirty: false, relation: () => "unknown" };
const now = Date.parse(tAt(60_000));
const HEAD = "viewer build 308ddd3 is older than this run's build 0123456: restart the viewer (just viewer-main)";
const START_PROBLEM = "line 1: invalid run_start event at /: unexpected property surprise";

const root = (): string => { const p = join(mkdtempSync(join(tmpdir(), "newer-start-")), "runs"); mkdirSync(p); return p; };
const END = { type: "run_end", turn: 2, reason: "budget", furthest_milestone: null, turns: 2, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } } as const;
// A run whose run_start carries a field this viewer's schema does not know, as a newer harness writes it.
function lines(id: string, edit: (start: Record<string, unknown>) => void = s => { s.surprise = { added: true }; }, ended = false): string[] {
  const l = new Log(); l.add(0, START); l.add(1000, assistant()); l.add(2000, state()); l.add(3000, assistant({ turn: 2 }));
  l.add(3500, { type: "milestone", turn: 2, name: "PLAYER_NAME_CONFIRMED", kind: "story", origin: "observed", server_timestamp: 4, evidence: [2] });
  if (ended) l.add(6000, END);
  return l.events.map(e => {
    const line = { ...e, run: id } as Record<string, unknown>;
    if (e.seq === 0) edit(line);
    return JSON.stringify(line);
  });
}
function write(r: string, id: string, text: readonly string[]): void {
  mkdirSync(join(r, id)); writeFileSync(join(r, id, "events.jsonl"), text.join("\n") + "\n");
}
const snapshot = (r: string, build: ViewerBuild | null, store?: RunStore<LoadedRun>) => workbenchSnapshot(r, () => Promise.resolve(true), now, join(dirname(r), "experiments"), createWorkbenchLoader({ build, ...(store === undefined ? {} : { store }) }));

describe("a run whose run_start is from a newer harness build", () => {
  it("stays listed on the stats page, live, ungraded, with the restart-the-viewer problem", async () => {
    const r = root(); write(r, "newer", lines("newer"));
    const d = await snapshot(r, older), run = d.runs[0];
    expect(run).toMatchObject({ id: "newer", status: "live", model: "think-swarm", started: tAt(0), turn: 2, config: null, splits: [] });
    expect(run?.measurement).toBeUndefined();
    expect(run?.problem).toBe(`${HEAD}. It cannot read this run's run_start, so the run is not graded. It skipped 1 event it cannot read; first: ${START_PROBLEM}`);
    expect(run?.elapsedMs).toBe(60_000);
    expect(d.problems).toContain(`Run newer: ${run?.problem ?? ""}`);
    expect(run === undefined ? null : milestoneStatus(run, "PLAYER_NAME_CONFIRMED")).toBe("excluded");
  });
  it("takes an ended status and reason from the rest of the log", async () => {
    const r = root(); write(r, "done", lines("done", undefined, true));
    const run = (await snapshot(r, older)).runs[0];
    expect(run).toMatchObject({ status: "ended", reason: "budget", turn: 2, elapsedMs: 6000, splits: [] });
    expect(run?.problem).toContain(HEAD);
  });
  it("counts every event it skips after the run_start", async () => {
    const r = root(), text = lines("more"); text[2] = (text[2] ?? "").replace('"location"', '"surprise":1,"location"'); write(r, "more", text);
    expect((await snapshot(r, older)).runs[0]?.problem).toContain("It skipped 2 events it cannot read; first: line 1:");
  });
  it.each([
    ["the same clean build", same],
    ["a viewer build that already contains the run's build", viewerNewer],
    ["an unknown viewer build", null],
  ])("stays invalid with today's message for %s", async (_label, build) => {
    const r = root(); write(r, "newer", lines("newer"));
    const run = (await snapshot(r, build)).runs[0];
    expect(run).toMatchObject({ status: "invalid", problem: "run newer has no readable run_start", splits: [] });
  });
  it.each([
    ["a non-hex commit", (s: Record<string, unknown>) => { s.surprise = 1; s.harness = { commit: "Z".repeat(40), dirty: false }; }],
    ["a missing harness", (s: Record<string, unknown>) => { s.surprise = 1; delete s.harness; }],
    ["another run's id", (s: Record<string, unknown>) => { s.surprise = 1; s.run = "other"; }],
  ])("stays invalid when the loose identity has %s", async (_label, edit) => {
    const r = root(); write(r, "newer", lines("newer", edit));
    expect((await snapshot(r, older)).runs[0]).toMatchObject({ status: "invalid", problem: "run newer has no readable run_start" });
  });
  it("stays invalid for broken JSON, a broken order or an unreadable run_end", async () => {
    const r = root();
    const json = lines("json"); json[0] = "{broken"; write(r, "json", json);
    const gap = lines("gap"); gap[2] = (gap[2] ?? "").replace('"seq":2', '"seq":7'); write(r, "gap", gap);
    const end = lines("end", undefined, true); end[5] = (end[5] ?? "").replace('"reason"', '"surprise":1,"reason"'); write(r, "end", end);
    const second = lines("second"); second[3] = JSON.stringify({ ...JSON.parse(second[0] ?? "{}") as object, seq: 3 }); write(r, "second", second);
    const d = await snapshot(r, older), by = (id: string) => d.runs.find(x => x.id === id);
    for (const id of ["json", "gap", "end", "second"]) expect(by(id)?.status, id).toBe("invalid");
    expect(by("json")?.problem).toBe("run json has no readable run_start");
    expect(by("gap")?.problem).toContain("event order");
    expect(by("end")?.problem).toContain("invalid run_end event");
    expect(by("second")?.problem).toContain("event order");
  });
  it("keeps a symlinked log invalid", async () => {
    const r = root(); write(r, "real", lines("link"));
    const { symlinkSync } = await import("node:fs"); mkdirSync(join(r, "link")); symlinkSync(join(r, "real", "events.jsonl"), join(r, "link", "events.jsonl"));
    expect(loadRun(r, "link", { commit: OLDER, dirty: false }).run).toMatchObject({ status: "invalid", problem: "Run log is symlinked; no split graded" });
  });
  it("hands the loader plain data marking the run_start unreadable, and persists it by viewer build", async () => {
    const r = root(); write(r, "done", lines("done", undefined, true));
    const loaded = loadRun(r, "done", { commit: OLDER, dirty: false });
    expect(loaded.skew).toEqual({ commit: RUN_COMMIT, dirty: false, count: 1, first: START_PROBLEM, startless: true });
    expect(loaded.run.problem).toBeNull(); expect(loaded.port).toBe(8011); expect(loaded.tag).toBeNull();
    expect(parseLoadedRun(structuredClone(loaded))).toEqual(loaded);
    expect(parseLoadedRun({ ...loaded, skew: { ...loaded.skew, startless: false } })).toBeNull();
    expect(loadRun(r, "done", { commit: RUN_COMMIT, dirty: false }).run).toMatchObject({ status: "invalid", problem: "run done has no readable run_start" });
    const store = createWorkbenchStore(join(dirname(r), "cache"));
    expect((await snapshot(r, older, store)).runs[0]).toMatchObject({ status: "ended", problem: expect.stringContaining(HEAD) as unknown });
    expect((await snapshot(r, older, store)).runs[0]).toMatchObject({ status: "ended", problem: expect.stringContaining(HEAD) as unknown });
    expect((await snapshot(r, viewerNewer, store)).runs[0]).toMatchObject({ status: "invalid", problem: "run done has no readable run_start" });
  });
  it("is listed in the run list with the restart-the-viewer problem", () => {
    const r = root(); write(r, "newer", lines("newer")); write(r, "done", lines("done", undefined, true));
    const json = lines("json", s => { s.surprise = 1; s.harness = { commit: "abc", dirty: false }; }); write(r, "json", json);
    const by = (build?: ViewerBuild | null) => new Map(listRuns(r, build).map(s => [s.id, s]));
    expect(by(older).get("newer")).toEqual({ id: "newer", model: "think-swarm", started: tAt(0), ended: false, reason: null, problem: `${HEAD}. It cannot read this run's run_start: ${START_PROBLEM}` });
    expect(by(older).get("done")).toMatchObject({ ended: true, reason: null, problem: expect.stringContaining(HEAD) as unknown });
    expect(by(older).get("json")?.problem).toContain("invalid run_start event");
    expect(by(older).get("json")?.problem).not.toContain("restart the viewer");
    for (const build of [undefined, null, same, viewerNewer]) {
      expect(by(build).get("newer")).toEqual({ id: "newer", model: null, started: null, ended: false, reason: null, problem: "invalid run_start event at /: unexpected property surprise" });
    }
  });
});

describe("the single-run viewer for a newer run_start", () => {
  const open: Viewer[] = [];
  afterEach(async () => { while (open.length > 0) await open.pop()?.close(); });
  async function serve(build: ViewerBuild | null): Promise<Viewer> {
    const base = mkdtempSync(join(tmpdir(), "newer-start-srv-")), runsRoot = join(base, "runs"); mkdirSync(runsRoot); mkdirSync(join(base, "static")); mkdirSync(join(base, "app"));
    write(runsRoot, "s", lines("s", undefined, true));
    const viewer = await startViewer({ runsRoot, staticDir: join(base, "static"), appDir: join(base, "app"), port: 0, pollMs: 10, build }); open.push(viewer);
    return viewer;
  }
  it("streams one restart-the-viewer problem for the run_start and the rest of the run", async () => {
    const viewer = await serve(older), text = await (await fetch(`${viewer.url}api/runs/s/events`)).text();
    expect(text.split("\n").filter(l => l === "event: problem")).toHaveLength(1);
    expect(text).toContain(`${HEAD}. First event it cannot read: ${START_PROBLEM}`);
    expect(text.split("\n").filter(l => l === "event: ev")).toHaveLength(5);
    expect(text).toContain("event: done");
    const runs = await (await fetch(`${viewer.url}api/runs`)).json() as { id: string; problem: string | null }[];
    expect(runs[0]?.problem).toBe(`${HEAD}. It cannot read this run's run_start: ${START_PROBLEM}`);
  });
  it("streams the plain problem for the same build", async () => {
    const viewer = await serve(same), text = await (await fetch(`${viewer.url}api/runs/s/events`)).text();
    expect(text).toContain(`"problem":"invalid run_start event at /: unexpected property surprise"`);
    expect(text).not.toContain("restart the viewer");
    const runs = await (await fetch(`${viewer.url}api/runs`)).json() as { problem: string | null }[];
    expect(runs[0]?.problem).toBe("invalid run_start event at /: unexpected property surprise");
  });
});
