import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_LEASE, LeaseHeldError, leaseDir, leaseStale, readLeaseOwner, takeLease, takeLeases } from "./lease.js";

const GPU = "127.0.0.1:8091", GPU2 = "127.0.0.1:8098", MAC = "127.0.0.1:18434";
const runsRoot = (): string => mkdtempSync(join(tmpdir(), "pokebench-lease-"));
function held(root: string, owner: Record<string, unknown> | null, pool = GPU): void {
  mkdirSync(leaseDir(root, pool));
  if (owner !== null) writeFileSync(join(leaseDir(root, pool), "owner.json"), JSON.stringify(owner));
}
const owner = (root: string, pool = GPU): unknown => JSON.parse(readFileSync(join(leaseDir(root, pool), "owner.json"), "utf8"));
const LIVE = new Set([100, 200]);
const alive = (pid: number): boolean => LIVE.has(pid);

describe("gameplay lease", () => {
  it("takes a free lease for its pool and names its owner and pool", () => {
    const root = runsRoot();
    expect(takeLease(root, GPU, { pid: 100, owner: "experiment-queue" }, alive)).toBe(leaseDir(root, GPU));
    expect(owner(root)).toEqual({ pid: 100, owner: "experiment-queue", pool: GPU });
    expect(readLeaseOwner(root, GPU)).toEqual({ pid: 100, owner: "experiment-queue", pool: GPU });
    expect(() => takeLease(root, GPU, { pid: 100, owner: "again" }, alive)).toThrow(LeaseHeldError);
  });

  it("holds each compute pool independently", () => {
    const root = runsRoot();
    takeLease(root, MAC, { pid: 100, owner: "qwen38-mac" }, alive);
    expect(takeLease(root, GPU, { pid: 200, owner: "fixed-run:pair" }, alive)).toBe(leaseDir(root, GPU));
    expect(readLeaseOwner(root, MAC)).toMatchObject({ owner: "qwen38-mac", pool: MAC });
    expect(readLeaseOwner(root, GPU)).toMatchObject({ owner: "fixed-run:pair", pool: GPU });
  });

  it("leaves the old single lease to the processes that still take it", () => {
    const root = runsRoot();
    mkdirSync(join(root, LEGACY_LEASE));
    writeFileSync(join(root, LEGACY_LEASE, "owner.json"), JSON.stringify({ pid: 100, owner: "qwen38-latest-harness" }));
    takeLease(root, GPU, { pid: 200, owner: "fixed-run:pair" }, alive);
    expect(JSON.parse(readFileSync(join(root, LEGACY_LEASE, "owner.json"), "utf8"))).toEqual({ pid: 100, owner: "qwen38-latest-harness" });
  });

  it("names the held pool and its holder when the lease is taken", () => {
    const root = runsRoot();
    held(root, { pid: 100, owner: "qwen38-mac", run: "r1" }, MAC);
    expect(() => takeLease(root, MAC, { pid: 101, owner: "viewer-queue" }, alive)).toThrow("the gameplay lease for 127.0.0.1:18434 is held by qwen38-mac (pid 100)");
    const torn = runsRoot();
    held(torn, null, MAC);
    expect(() => takeLease(torn, MAC, { pid: 101, owner: "viewer-queue" }, alive)).toThrow("the gameplay lease for 127.0.0.1:18434 is held by an unreadable owner");
    try { takeLease(root, MAC, { pid: 101, owner: "viewer-queue" }, alive); } catch (error) { expect(error).toMatchObject({ pool: MAC }); }
  });

  it("never takes a lease whose owner lives, whose owner is unreadable, or whose dead owner's run still plays", () => {
    for (const previous of [{ pid: 100, owner: "cohort" }, null, { pid: 300, owner: "viewer-queue", run: "next-run", child: 200 }]) {
      const root = runsRoot();
      held(root, previous);
      expect(() => takeLease(root, GPU, { pid: 101, owner: "experiment-queue" }, alive)).toThrow(LeaseHeldError);
      expect(leaseStale(root, GPU, alive)).toBe(false);
      expect(existsSync(leaseDir(root, GPU))).toBe(true);
    }
  });

  it("reclaims a lease a dead viewer left behind once its run has ended, or for the trial being adopted", () => {
    for (const previous of [{ pid: 300, owner: "experiment-queue" }, { pid: 300, owner: "viewer-queue", run: "done", child: 301 }, { pid: 300, owner: "experiment-queue", run: "orphan", child: 200 }]) {
      const root = runsRoot();
      held(root, previous);
      takeLease(root, GPU, { pid: 101, owner: "experiment-queue" }, alive, new Set(["orphan"]));
      expect(owner(root)).toEqual({ pid: 101, owner: "experiment-queue", pool: GPU });
    }
  });

  it("lets one process at a time reclaim a stale lease", () => {
    const root = runsRoot();
    held(root, { pid: 300, owner: "experiment-queue" });
    mkdirSync(`${leaseDir(root, GPU)}.reclaim`);
    expect(() => takeLease(root, GPU, { pid: 101, owner: "experiment-queue" }, alive)).toThrow(LeaseHeldError);
    expect(owner(root)).toEqual({ pid: 300, owner: "experiment-queue" });
    const old = new Date(Date.now() - 120_000);
    utimesSync(`${leaseDir(root, GPU)}.reclaim`, old, old);
    takeLease(root, GPU, { pid: 101, owner: "experiment-queue" }, alive);
    expect(owner(root)).toEqual({ pid: 101, owner: "experiment-queue", pool: GPU });
    expect(existsSync(`${leaseDir(root, GPU)}.reclaim`)).toBe(false);
  });

  it("reads no owner from a free lease or a torn owner file", () => {
    const root = runsRoot();
    expect(readLeaseOwner(root, GPU)).toBeNull();
    held(root, null);
    writeFileSync(join(leaseDir(root, GPU), "owner.json"), "{");
    expect(readLeaseOwner(root, GPU)).toBeNull();
    writeFileSync(join(leaseDir(root, GPU), "owner.json"), JSON.stringify({ pid: "x" }));
    expect(readLeaseOwner(root, GPU)).toBeNull();
  });

  it("takes several pools all or nothing, in a fixed order", () => {
    const root = runsRoot();
    expect(takeLeases(root, [GPU2, GPU, GPU2], { pid: 100, owner: "fixed-run:pair" }, alive)).toEqual([leaseDir(root, GPU), leaseDir(root, GPU2)]);
    const busy = runsRoot();
    held(busy, { pid: 200, owner: "experiment-queue" }, GPU2);
    expect(() => takeLeases(busy, [GPU, GPU2], { pid: 100, owner: "fixed-run:pair" }, alive)).toThrow("the gameplay lease for 127.0.0.1:8098 is held by experiment-queue (pid 200)");
    expect(existsSync(leaseDir(busy, GPU))).toBe(false);
    expect(readLeaseOwner(busy, GPU2)).toMatchObject({ owner: "experiment-queue" });
  });
});
