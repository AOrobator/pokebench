import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { createFrontierCache } from "./frontier-cache.js";
import { frontierPair, frontierSplits, pairFrontier } from "./frontier.js";
import type { WorkbenchRun } from "./workbench-data.js";

const agent = (id: string, nameMs: number, extra: Partial<WorkbenchRun> = {}): WorkbenchRun => Object.assign(run({ id, splits: [{ name: "PLAYER_NAME_CONFIRMED", elapsedMs: nameMs, segmentMs: 0, seq: 1, turn: 1, inputTokens: 0, outputTokens: 0 }], ...extra }), {
  measurement: { controller: "agent" as const, features: ["story-milestones-v2"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] },
});
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
    // The previous route ranked every run except the one asking.
    for (const id of ["slow", "fast", "mid", "aborted", "unknown"]) {
      expect(pairFrontier(pair, id, false)).toEqual(frontierPair(runs.filter(r => r.id !== id)).best);
      expect(pairFrontier(pair, id, false)).toEqual(frontierSplits(runs, id));
    }
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

  it("answers a checkpoint resume at once: it races no frontier", async () => {
    const cache = createFrontierCache({ read: () => new Promise(() => undefined), now: () => 0 });
    expect(await cache.answer("resumed", true)).toEqual({ state: "ready", frontier: null });
  });

  it("warms at start and survives a failed ranking, reporting it once", async () => {
    let fail = true, reads = 0;
    const errors: unknown[] = [];
    const cache = createFrontierCache({ read: () => { reads += 1; return fail ? Promise.reject(new Error("disk")) : Promise.resolve([agent("best", 1000)]); }, now: () => 0, waitMs: 1, onError: error => errors.push(error) });
    cache.warm();
    expect(reads).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(errors).toEqual([new Error("disk")]);
    expect(await cache.answer("x", false)).toEqual({ state: "loading", frontier: null });
    expect(errors).toHaveLength(2);
    fail = false;
    expect(await cache.answer("x", false)).toMatchObject({ state: "ready", frontier: { run: "best" } });
  });
});
