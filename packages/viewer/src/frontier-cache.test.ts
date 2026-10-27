import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { FRONTIER_FRESH_MS, createFrontierCache, readFrontierFile } from "./frontier-cache.js";
import { frontierPair, frontierSplits, pairFrontier } from "./frontier.js";
import type { WorkbenchRun } from "./workbench-data.js";

const agent = (id: string, nameMs: number, extra: Partial<WorkbenchRun> = {}): WorkbenchRun => Object.assign(run({ id, splits: [{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: nameMs, segmentMs: 0, seq: 1, turn: 1, inputTokens: 0, outputTokens: 0 }], ...extra }), {
  measurement: { controller: "agent" as const, features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] },
});
const temp = (): string => mkdtempSync(join(tmpdir(), "frontier-cache-"));
const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } => {
  let resolve: (value: T) => void = () => undefined, reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe("frontier pair", () => {
  it("answers every run from the frontier and the runner-up, exactly as ranking the other runs would", () => {
    const runs = [agent("slow", 9000), agent("fast", 1000), agent("mid", 5000), agent("aborted", 3000, { reason: "operator_abort" })];
    const pair = frontierPair(runs);
    expect([pair.best?.run, pair.runnerUp?.run]).toEqual(["fast", "aborted"]);
    for (const id of ["slow", "fast", "mid", "aborted", "unknown"]) expect(pairFrontier(pair, id, false)).toEqual(frontierSplits(runs, id));
    expect(pairFrontier(pair, "slow", true)).toBeNull();
    expect(frontierPair([agent("only", 1000)])).toEqual({ best: { run: "only", milestones: [{ name: "PLAYER_NAME_CONFIRMED", offsetMs: 1000 }] }, runnerUp: null });
    expect(frontierPair([])).toEqual({ best: null, runnerUp: null });
  });
});

describe("frontier cache", () => {
  it("answers loading, never no frontier, until the runs are ranked, then the definitive answer", async () => {
    const ranking = deferred<WorkbenchRun[]>();
    const cache = createFrontierCache({ read: () => ranking.promise, now: () => 0, waitMs: 1 });
    expect(await cache.answer("a", false)).toEqual({ state: "loading", frontier: null });
    ranking.resolve([]);
    await ranking.promise; await Promise.resolve();
    expect(await cache.answer("a", false)).toEqual({ state: "ready", frontier: null });
  });

  it("waits briefly for a quick first ranking and ranks once for concurrent requests", async () => {
    let reads = 0;
    const cache = createFrontierCache({ read: () => { reads += 1; return Promise.resolve([agent("best", 1000), agent("next", 2000)]); }, now: () => 0 });
    const [own, other] = await Promise.all([cache.answer("best", false), cache.answer("x", false)]);
    expect(own).toEqual({ state: "ready", frontier: { run: "next", milestones: [{ name: "PLAYER_NAME_CONFIRMED", offsetMs: 2000 }] } });
    expect(other.frontier?.run).toBe("best");
    expect(reads).toBe(1);
  });

  it("re-ranks when stale, answering the last ranking meanwhile, and persists only a changed ranking", async () => {
    const dir = temp(), file = join(dir, "nested", "frontier.json");
    let now = 0, runs = [agent("old", 5000)], reads = 0;
    const next = deferred<null>();
    const cache = createFrontierCache({ read: async () => { reads += 1; if (reads === 3) await next.promise; return runs; }, now: () => now, file });
    expect((await cache.answer("x", false)).frontier?.run).toBe("old");
    expect(readFrontierFile(file)?.best?.run).toBe("old");
    now = FRONTIER_FRESH_MS - 1;
    expect(await cache.answer("x", false)).toMatchObject({ state: "ready" });
    expect(reads).toBe(1);
    // An unchanged ranking does not rewrite the file.
    writeFileSync(file, readFileSync(file, "utf8").replace("{", "{ "));
    now = FRONTIER_FRESH_MS;
    expect(await cache.answer("x", false)).toMatchObject({ state: "stale" });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(readFileSync(file, "utf8").startsWith("{ ")).toBe(true);
    expect(await cache.answer("x", false)).toMatchObject({ state: "ready" });
    // A new run that takes the lead invalidates the ranking on the next refresh.
    runs = [agent("old", 5000), agent("new", 1000)]; now = 2 * FRONTIER_FRESH_MS;
    expect(await cache.answer("x", false)).toMatchObject({ state: "stale", frontier: { run: "old" } });
    next.resolve(null);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(await cache.answer("x", false)).toMatchObject({ state: "ready", frontier: { run: "new" } });
    expect(await cache.answer("new", false)).toMatchObject({ frontier: { run: "old" } });
    expect(readFrontierFile(file)).toMatchObject({ best: { run: "new" }, runnerUp: { run: "old" } });
  });

  it("answers a restart from disk as stale until it has ranked the runs itself", async () => {
    const dir = temp(), file = join(dir, "frontier.json");
    await createFrontierCache({ read: () => Promise.resolve([agent("best", 1000), agent("next", 2000)]), now: () => 0, file }).answer("x", false);
    const ranking = deferred<WorkbenchRun[]>();
    const restarted = createFrontierCache({ read: () => ranking.promise, now: () => 0, file, waitMs: 60_000 });
    expect(await restarted.answer("best", false)).toEqual({ state: "stale", frontier: { run: "next", milestones: [{ name: "PLAYER_NAME_CONFIRMED", offsetMs: 2000 }] } });
    ranking.resolve([agent("next", 2000)]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(await restarted.answer("best", false)).toMatchObject({ state: "ready", frontier: { run: "next" } });
    expect(await restarted.answer("next", false)).toEqual({ state: "ready", frontier: null });
  });

  it("warms at start and survives a failed ranking", async () => {
    let fail = true, reads = 0;
    const cache = createFrontierCache({ read: () => { reads += 1; return fail ? Promise.reject(new Error("disk")) : Promise.resolve([agent("best", 1000)]); }, now: () => 0, waitMs: 1 });
    cache.warm();
    expect(reads).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(await cache.answer("x", false)).toEqual({ state: "loading", frontier: null });
    fail = false;
    expect(await cache.answer("x", false)).toMatchObject({ state: "ready", frontier: { run: "best" } });
  });

  it("treats a missing, foreign or malformed file as a miss and tolerates an unwritable one", async () => {
    const dir = temp(), file = join(dir, "frontier.json");
    const good = { run: "a", milestones: [{ name: "N", offsetMs: 1, derived: true }] };
    expect(readFrontierFile(file)).toBeNull();
    for (const [body, expected] of [
      ["not json", null], [{ version: 2, best: null, runnerUp: null }, null], [{ version: 1, best: 3, runnerUp: null }, null],
      [{ version: 1, best: { run: "a", milestones: [{ name: "N" }] }, runnerUp: null }, null], [{ version: 1, best: { run: "a", milestones: [{ name: "N", offsetMs: 1, derived: false }] }, runnerUp: null }, null],
      [{ version: 1, best: null, runnerUp: good }, null], [{ version: 1, best: good, runnerUp: good }, null], [{ version: 1, best: { run: 1, milestones: [] }, runnerUp: null }, null],
      [{ version: 1, best: good, runnerUp: null }, { best: good, runnerUp: null }], [{ version: 1, best: null, runnerUp: null }, { best: null, runnerUp: null }],
    ] as const) {
      writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
      expect(readFrontierFile(file)).toEqual(expected);
    }
    const blocked = join(dir, "frontier.json", "below.json");
    expect(await createFrontierCache({ read: () => Promise.resolve([agent("a", 1)]), now: () => 0, file: blocked }).answer("x", false)).toMatchObject({ state: "ready", frontier: { run: "a" } });
    expect(existsSync(blocked)).toBe(false);
  });
});
