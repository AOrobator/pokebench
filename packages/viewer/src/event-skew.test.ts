import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Log, START, assistant, fullRun, state } from "../test-support/events.js";
import { run as wbRun } from "../test-support/workbench.js";
import { defaultViewerBuild, gitRelation, readBuildStamp, skewOf, viewerBuildAt, writeBuildStamp, type ViewerBuild } from "./build-stamp.js";
import { createWorkbenchLoader, loadRun, workbenchSnapshot, type LoadedRun } from "./workbench-store.js";
import { createWorkbenchStore, type RunStore } from "./baseline-store.js";
import { handleBaselineRequest } from "./baseline-worker.js";
import { currentRunHtml } from "./workbench-view.js";
import { startViewer, type Viewer } from "./server.js";

const RUN_COMMIT = START.harness.commit;
const OLDER = "308ddd3e".padEnd(40, "0");
const older: ViewerBuild = { commit: OLDER, dirty: false, relation: () => "older" };
const same: ViewerBuild = { commit: RUN_COMMIT, dirty: false, relation: () => "unknown" };
const now = 2000000000000;

const root = (): string => { const p = join(mkdtempSync(join(tmpdir(), "skew-")), "runs"); mkdirSync(p); return p; };
// A run whose third event carries a field the viewer's schema does not know, the way a newer harness writes it.
function newerRun(): string[] {
  const l = new Log(); l.add(0, START); l.add(1000, assistant());
  const s = l.add(3000, state({ story: { name_confirmed: true, intro_stage: null, rival_stage: null, birch_lab_stage: null, petalburg_gym_stage: null, woods_stage: null, clock_set: null, rival_battle_won: null, pokedex_received: null, running_shoes_received: null, starter_tutorial_complete: null, rustboro_gym_complete: null, stone_badge: null, rock_tomb_received: null } }));
  l.add(3500, state());
  l.add(4000, { type: "milestone", turn: 1, name: "PLAYER_NAME_CONFIRMED", kind: "story", origin: "observed", server_timestamp: 4, evidence: [s.seq] });
  return l.events.map(e => {
    const line = { ...e, run: "newer" } as Record<string, unknown>;
    if (e.seq === 3) line.position = { x: 5, y: 8, battler_0_ready: true };
    return JSON.stringify(line);
  });
}
function write(r: string, id: string, lines: readonly string[]): string {
  mkdirSync(join(r, id)); const p = join(r, id, "events.jsonl");
  writeFileSync(p, lines.map(l => l.replace('"run":"newer"', `"run":"${id}"`)).join("\n") + "\n"); return p;
}
const snapshot = (r: string, build: ViewerBuild | null, store?: RunStore<LoadedRun>) => workbenchSnapshot(r, () => Promise.resolve(true), now, join(dirname(r), "experiments"), createWorkbenchLoader({ build, ...(store === undefined ? {} : { store }) }));

describe("viewer build stamp", () => {
  it("writes the build's commit and cleanliness from git and reads it back", () => {
    const dir = mkdtempSync(join(tmpdir(), "stamp-")), calls: string[][] = [];
    const stamp = writeBuildStamp(dir, args => { calls.push([...args]); return args[0] === "rev-parse" ? `${RUN_COMMIT}\n` : " M packages/viewer/src/x.ts\n"; });
    expect(stamp).toEqual({ commit: RUN_COMMIT, dirty: true });
    expect(calls).toEqual([["rev-parse", "HEAD"], ["status", "--porcelain"]]);
    expect(readBuildStamp(join(dir, "build-stamp.json"))).toEqual({ commit: RUN_COMMIT, dirty: true });
    expect(writeBuildStamp(dir, args => args[0] === "rev-parse" ? RUN_COMMIT : "")).toEqual({ commit: RUN_COMMIT, dirty: false });
  });
  it("treats a missing or malformed stamp as an unknown build", () => {
    const dir = mkdtempSync(join(tmpdir(), "stamp-"));
    expect(readBuildStamp(join(dir, "absent.json"))).toBeNull();
    writeFileSync(join(dir, "bad.json"), "{not json"); expect(readBuildStamp(join(dir, "bad.json"))).toBeNull();
    writeFileSync(join(dir, "short.json"), JSON.stringify({ commit: "abc", dirty: false })); expect(readBuildStamp(join(dir, "short.json"))).toBeNull();
    expect(() => writeBuildStamp(dir, () => "not a commit")).toThrow("git did not name a commit");
  });
  it("has no stamp when running from source", () => {
    expect(defaultViewerBuild()).toBeNull();
  });
  it("orders builds by git ancestry, caching each answer", () => {
    const repo = mkdtempSync(join(tmpdir(), "stamp-git-")), git = (...args: string[]): string => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
    git("init", "--quiet"); git("config", "user.email", "t@example.invalid"); git("config", "user.name", "t");
    git("commit", "--quiet", "--allow-empty", "-m", "a"); const a = git("rev-parse", "HEAD");
    git("commit", "--quiet", "--allow-empty", "-m", "b"); const b = git("rev-parse", "HEAD");
    expect(gitRelation(repo, a)(b)).toBe("older");
    expect(gitRelation(repo, b)(a)).toBe("newer");
    const relation = gitRelation(repo, a);
    expect(relation("f".repeat(40))).toBe("unknown");
    expect(relation("f".repeat(40))).toBe("unknown");
    writeBuildStamp(repo, args => git(...args));
    const built = viewerBuildAt(join(repo, "build-stamp.json"));
    expect(built).toMatchObject({ commit: b, dirty: false });
    expect(built?.relation(a)).toBe("newer");
    expect(viewerBuildAt(join(repo, "absent.json"))).toBeNull();
  });
  it("calls a run skewed only when the viewer build is known and differs", () => {
    expect(skewOf(null, START.harness)).toBeNull();
    expect(skewOf(same, START.harness)).toBeNull();
    expect(skewOf(older, START.harness)?.describe(2, "line 4: invalid state event at /position: unexpected property battler_0_ready")).toBe("viewer build 308ddd3 is older than this run's build 0123456: restart the viewer (just viewer-main). It skipped 2 events it cannot read; first: line 4: invalid state event at /position: unexpected property battler_0_ready");
    expect(skewOf({ ...older, relation: () => "newer" }, START.harness)).toBeNull();
    expect(skewOf({ ...older, relation: () => "unknown" }, { commit: RUN_COMMIT, dirty: true })?.describe(1, "x")).toMatch(/^viewer build 308ddd3 differs from this run's build 0123456 \(dirty\): restart the viewer/);
    expect(skewOf({ ...same, dirty: true }, START.harness)?.describe(1, "x")).toMatch(/^viewer build 0123456 \(dirty\) is not the same build as this run's build 0123456: restart the viewer/);
    expect(skewOf(same, { commit: RUN_COMMIT, dirty: true })).not.toBeNull();
  });
});

describe("a run from a newer build than the viewer", () => {
  it("stays listed and live with a restart-the-viewer problem, keeping its valid splits", async () => {
    const r = root(); write(r, "newer", newerRun());
    const d = await snapshot(r, older), run = d.runs[0];
    expect(run?.status).toBe("live");
    expect(run?.problem).toBe("viewer build 308ddd3 is older than this run's build 0123456: restart the viewer (just viewer-main). It skipped 1 event it cannot read; first: line 4: invalid state event at /position: unexpected property battler_0_ready");
    expect(run?.splits.map(s => s.name)).toEqual(["PLAYER_NAME_CONFIRMED"]);
    expect(run?.turn).toBe(1);
    expect(d.problems).toContain(`Run newer: ${run?.problem ?? ""}`);
  });
  it("marks the same build's malformed event invalid, naming the type and path", async () => {
    const r = root(); write(r, "newer", newerRun());
    const run = (await snapshot(r, same)).runs[0];
    expect(run?.status).toBe("invalid"); expect(run?.splits).toEqual([]);
    expect(run?.problem).toBe("line 4: invalid state event at /position: unexpected property battler_0_ready");
  });
  it("marks the run invalid when the viewer's build already contains the run's build", async () => {
    const r = root(); write(r, "newer", newerRun());
    const run = (await snapshot(r, { ...older, relation: () => "newer" })).runs[0];
    expect(run?.status).toBe("invalid"); expect(run?.problem).toBe("line 4: invalid state event at /position: unexpected property battler_0_ready");
  });
  it("marks the run invalid when the viewer cannot tell its own build", async () => {
    const r = root(); write(r, "newer", newerRun());
    expect((await snapshot(r, null)).runs[0]?.status).toBe("invalid");
  });
  it("still marks broken JSON, a broken envelope or an unreadable run_end invalid under skew", async () => {
    const r = root();
    const json = write(r, "json", newerRun()); appendFileSync(json, "{broken\n");
    const gap = newerRun(); gap[3] = (gap[3] ?? "").replace('"seq":3', '"seq":9'); write(r, "gap", gap);
    const end = newerRun(); end.push(JSON.stringify({ v: 1, run: "newer", seq: 5, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "budget", surprise: true })); write(r, "end", end);
    const noEnvelope = newerRun(); noEnvelope[3] = JSON.stringify({ type: "state", position: { x: 1, y: 1, battler_0_ready: true } }); write(r, "envelope", noEnvelope);
    const d = await snapshot(r, older), by = (id: string) => d.runs.find(x => x.id === id);
    for (const id of ["json", "gap", "end", "envelope"]) expect(by(id)?.status, id).toBe("invalid");
    expect(by("json")?.problem).toContain("not JSON");
    expect(by("gap")?.problem).toContain("event order");
    expect(by("end")?.problem).toContain("invalid run_end event");
    expect(by("envelope")?.problem).toContain("line 4: invalid state event");
  });
  it("keys persisted runs by the viewer build, so another build never reuses them", async () => {
    const r = root(), lines = newerRun();
    lines.push(JSON.stringify({ v: 1, run: "newer", seq: 5, t: "2026-10-11T22:00:06.000-04:00", turn: 1, type: "run_end", reason: "budget", furthest_milestone: "PLAYER_NAME_CONFIRMED", turns: 1, wall_ms: 6000, tokens: { input: 500, output: 100 }, frames: { saved: 0, bytes: 0 } }));
    write(r, "newer", lines);
    const store = createWorkbenchStore(join(dirname(r), "cache"));
    expect((await snapshot(r, same, store)).runs[0]?.status).toBe("invalid");
    expect((await snapshot(r, older, store)).runs[0]).toMatchObject({ status: "ended", problem: expect.stringContaining("restart the viewer") as unknown });
    expect((await snapshot(r, older, store)).runs[0]?.status).toBe("ended");
    expect((await snapshot(r, same, store)).runs[0]?.status).toBe("invalid");
  });
  it("gives a worker the build stamp as plain data and refuses a malformed one", () => {
    const r = root(); write(r, "newer", newerRun());
    const stamp = { commit: OLDER, dirty: false };
    expect(handleBaselineRequest({ id: 1, kind: "workbench", runsRoot: r, runId: "newer", viewer: stamp })).toEqual({ id: 1, outcome: loadRun(r, "newer", stamp) });
    expect(loadRun(r, "newer", stamp).skew).toEqual({ commit: RUN_COMMIT, dirty: false, count: 1, first: "line 4: invalid state event at /position: unexpected property battler_0_ready" });
    expect(loadRun(r, "newer", stamp).run.problem).toBeNull();
    expect(loadRun(r, "newer").run.status).toBe("invalid");
    expect(loadRun(r, "newer", { commit: RUN_COMMIT, dirty: false }).run.status).toBe("invalid");
    expect(handleBaselineRequest({ id: 2, kind: "workbench", runsRoot: r, runId: "newer", viewer: { commit: "x", dirty: false } })).toEqual({ id: -1, failure: "invalid baseline request" });
    expect(handleBaselineRequest({ id: 3, kind: "workbench", runsRoot: r, runId: "newer", viewer: 7 })).toEqual({ id: -1, failure: "invalid baseline request" });
  });
  it("shows the problem on the current-run plate", () => {
    const html = currentRunHtml([wbRun({ status: "live", problem: "viewer build 308ddd3 is older than this run's build 0123456: restart the viewer (just viewer-main) <x>" })], 1000, 2000, null);
    expect(html).toContain('data-current-field="problem"');
    expect(html).toContain("restart the viewer (just viewer-main) &lt;x&gt;");
    expect(currentRunHtml([wbRun({ status: "live" })], 1000, 2000, null)).not.toContain('data-current-field="problem"');
  });
});

describe("the single-run stream under version skew", () => {
  const open: Viewer[] = [];
  afterEach(async () => { while (open.length > 0) await open.pop()?.close(); });
  async function stream(build: ViewerBuild): Promise<string> {
    const base = mkdtempSync(join(tmpdir(), "skew-srv-")), runsRoot = join(base, "runs"); mkdirSync(runsRoot); mkdirSync(join(base, "static")); mkdirSync(join(base, "app"));
    const log = newerRun(); log.push(JSON.stringify({ ...fullRun().events.at(-1), run: "newer", seq: 5 }));
    log[2] = (log[2] ?? "").replace('"x":5', '"x":5,"surprise":1');
    write(runsRoot, "s", log);
    const viewer = await startViewer({ runsRoot, staticDir: join(base, "static"), appDir: join(base, "app"), port: 0, pollMs: 10, build }); open.push(viewer);
    return await (await fetch(`${viewer.url}api/runs/s/events`)).text();
  }
  it("reports one restart-the-viewer problem instead of a misleading error per line", async () => {
    const text = await stream(older);
    const problems = text.split("\n").filter(l => l === "event: problem");
    expect(problems).toHaveLength(1);
    expect(text).toContain("viewer build 308ddd3 is older than this run's build 0123456: restart the viewer (just viewer-main)");
    expect(text).toContain("viewer build 308ddd3 is older than this run's build 0123456: restart the viewer (just viewer-main). First event it cannot read: line 3: invalid state event at /position: unexpected property surprise");
    expect(text).toContain("event: done");
  });
  it("reports each bad line with its type and path for the same build", async () => {
    const text = await stream(same);
    expect(text.split("\n").filter(l => l === "event: problem")).toHaveLength(2);
    expect(text).toContain("invalid state event at /position: unexpected property battler_0_ready");
    expect(text).toContain("invalid state event at /position: unexpected property surprise");
    expect(text).not.toContain("restart the viewer");
  });
  it("keeps the stamp file format readable by the build script", () => {
    const dir = mkdtempSync(join(tmpdir(), "stamp-")); writeBuildStamp(dir, args => args[0] === "rev-parse" ? RUN_COMMIT : "");
    expect(JSON.parse(readFileSync(join(dir, "build-stamp.json"), "utf8"))).toEqual({ commit: RUN_COMMIT, dirty: false });
  });
});
