// The gameplay lease (INV-Q3) that NEXT RUN and fixed-run cohorts share, one per
// compute pool (the model endpoint's host:port). A viewer that dies mid-run leaves its lease
// behind; a fresh viewer may take it back only once its owner is gone and its run no longer
// plays, or to adopt that very run.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { LEGACY_LEASE, leaseName, leasePool } from "@pokebench/agent/lease-pool";

export { LEGACY_LEASE, leasePool };

const OwnerSchema = Type.Object({ pid: Type.Integer({ minimum: 1 }), owner: Type.String(), run: Type.Optional(Type.String()), child: Type.Optional(Type.Integer({ minimum: 1 })) });
export type LeaseOwner = Static<typeof OwnerSchema>;

export function leaseDir(runsRoot: string, pool: string): string {
  return join(runsRoot, leaseName(pool));
}

export function leaseHolder(owner: LeaseOwner | null): string {
  return owner === null ? "an unreadable owner" : `${owner.owner} (pid ${String(owner.pid)})`;
}

export class LeaseHeldError extends Error {
  override readonly name = "LeaseHeldError";
  constructor(readonly pool: string, readonly holder: LeaseOwner | null) {
    super(`the gameplay lease for ${pool} is held by ${leaseHolder(holder)}`);
  }
}

export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function readLeaseOwner(runsRoot: string, pool: string): LeaseOwner | null {
  const path = join(leaseDir(runsRoot, pool), "owner.json");
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Value.Check(OwnerSchema, value) ? value : null;
  } catch {
    return null;
  }
}

// An unreadable owner is never stale: it may be a lease taken a moment ago.
export function leaseStale(runsRoot: string, pool: string, alive: (pid: number) => boolean, adoptable: ReadonlySet<string> = new Set()): boolean {
  const owner = readLeaseOwner(runsRoot, pool);
  if (owner === null || alive(owner.pid)) return false;
  const adopting = owner.run !== undefined && adoptable.has(owner.run);
  return owner.child === undefined || adopting || !alive(owner.child);
}

// A reclaim takes milliseconds; one left by a process that died mid-reclaim is cleared after this.
export const RECLAIM_STALE_MS = 60_000;

// Only one process at a time judges and replaces a stale lease, so two never both hold it.
function reclaim(runsRoot: string, pool: string, alive: (pid: number) => boolean, adoptable: ReadonlySet<string>): void {
  const lease = leaseDir(runsRoot, pool);
  const lock = `${lease}.reclaim`;
  const held = (): LeaseHeldError => new LeaseHeldError(pool, readLeaseOwner(runsRoot, pool));
  try {
    if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > RECLAIM_STALE_MS) rmSync(lock, { recursive: true, force: true });
    mkdirSync(lock);
  } catch {
    throw held();
  }
  try {
    if (!leaseStale(runsRoot, pool, alive, adoptable)) throw held();
    rmSync(lease, { recursive: true, force: true });
    try {
      mkdirSync(lease);
    } catch {
      throw held();
    }
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

export function takeLease(runsRoot: string, pool: string, owner: Readonly<Record<string, unknown>>, alive: (pid: number) => boolean = pidAlive, adoptable: ReadonlySet<string> = new Set()): string {
  const lease = leaseDir(runsRoot, pool);
  try {
    mkdirSync(lease);
  } catch {
    reclaim(runsRoot, pool, alive, adoptable);
  }
  try {
    writeFileSync(join(lease, "owner.json"), JSON.stringify({ ...owner, pool }), { flag: "wx" });
  } catch (error) {
    rmSync(lease, { recursive: true, force: true });
    throw error;
  }
  return lease;
}

// Every pool or none, in sorted order so two takers of overlapping pools cannot each hold half.
export function takeLeases(runsRoot: string, pools: readonly string[], owner: Readonly<Record<string, unknown>>, alive: (pid: number) => boolean = pidAlive, adoptable: ReadonlySet<string> = new Set()): string[] {
  const taken: string[] = [];
  try {
    for (const pool of [...new Set(pools)].sort()) taken.push(takeLease(runsRoot, pool, owner, alive, adoptable));
  } catch (error) {
    for (const lease of taken) rmSync(lease, { recursive: true, force: true });
    throw error;
  }
  return taken;
}

function previousPool(path: string): { pool?: string } {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof value === "object" && value !== null && "pool" in value && typeof value.pool === "string" ? { pool: value.pool } : {};
  } catch {
    return {};
  }
}

// The holder names the run it plays and, once spawned, its pid, so a lease left by a dead
// viewer stays held while that run plays. A failed write keeps the previous owner.
export function nameLeaseRun(lease: string, owner: Readonly<Record<string, unknown>>): void {
  try {
    // Written whole then renamed: a torn owner would read as never stale.
    const path = join(lease, "owner.json");
    writeFileSync(`${path}.tmp`, JSON.stringify({ ...owner, ...previousPool(path) }));
    renameSync(`${path}.tmp`, path);
  } catch {
    // The lease still names this process; only the run or pid is missing.
  }
}
