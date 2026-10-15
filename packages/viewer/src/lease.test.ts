import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LeaseHeldError, readLeaseOwner, takeLease } from "./lease.js";
import { LEASE } from "./next-run.js";

const runsRoot = (): string => mkdtempSync(join(tmpdir(), "pokebench-lease-"));
function held(root: string, owner: Record<string, unknown> | null): void {
  mkdirSync(join(root, LEASE));
  if (owner !== null) writeFileSync(join(root, LEASE, "owner.json"), JSON.stringify(owner));
}
const owner = (root: string): unknown => JSON.parse(readFileSync(join(root, LEASE, "owner.json"), "utf8"));
const LIVE = new Set([100, 200]);
const alive = (pid: number): boolean => LIVE.has(pid);

describe("gameplay lease", () => {
  it("takes a free lease and names its owner", () => {
    const root = runsRoot();
    expect(takeLease(root, { pid: 100, owner: "experiment-queue" }, alive)).toBe(join(root, LEASE));
    expect(owner(root)).toEqual({ pid: 100, owner: "experiment-queue" });
    expect(readLeaseOwner(root)).toEqual({ pid: 100, owner: "experiment-queue" });
    expect(() => takeLease(root, { pid: 100, owner: "again" }, alive)).toThrow(LeaseHeldError);
  });

  it("never takes a lease whose owner lives, whose owner is unreadable, or whose dead owner's run still plays", () => {
    for (const previous of [{ pid: 100, owner: "cohort" }, null, { pid: 300, owner: "viewer-queue", run: "next-run", child: 200 }]) {
      const root = runsRoot();
      held(root, previous);
      expect(() => takeLease(root, { pid: 101, owner: "experiment-queue" }, alive)).toThrow("the gameplay lease is held (another run, cohort or queue is active)");
      expect(existsSync(join(root, LEASE))).toBe(true);
    }
  });

  it("reclaims a lease a dead viewer left behind once its run has ended, or for the trial being adopted", () => {
    for (const previous of [{ pid: 300, owner: "experiment-queue" }, { pid: 300, owner: "viewer-queue", run: "done", child: 301 }, { pid: 300, owner: "experiment-queue", run: "orphan", child: 200 }]) {
      const root = runsRoot();
      held(root, previous);
      takeLease(root, { pid: 101, owner: "experiment-queue" }, alive, new Set(["orphan"]));
      expect(owner(root)).toEqual({ pid: 101, owner: "experiment-queue" });
    }
  });

  it("lets one process at a time reclaim a stale lease", () => {
    const root = runsRoot();
    held(root, { pid: 300, owner: "experiment-queue" });
    mkdirSync(join(root, `${LEASE}.reclaim`));
    expect(() => takeLease(root, { pid: 101, owner: "experiment-queue" }, alive)).toThrow(LeaseHeldError);
    expect(owner(root)).toEqual({ pid: 300, owner: "experiment-queue" });
    const old = new Date(Date.now() - 120_000);
    utimesSync(join(root, `${LEASE}.reclaim`), old, old);
    takeLease(root, { pid: 101, owner: "experiment-queue" }, alive);
    expect(owner(root)).toEqual({ pid: 101, owner: "experiment-queue" });
    expect(existsSync(join(root, `${LEASE}.reclaim`))).toBe(false);
  });

  it("reads no owner from a free lease or a torn owner file", () => {
    const root = runsRoot();
    expect(readLeaseOwner(root)).toBeNull();
    held(root, null);
    writeFileSync(join(root, LEASE, "owner.json"), "{");
    expect(readLeaseOwner(root)).toBeNull();
    writeFileSync(join(root, LEASE, "owner.json"), JSON.stringify({ pid: "x" }));
    expect(readLeaseOwner(root)).toBeNull();
  });
});
