// The one gameplay lease (INV-Q3) that NEXT RUN, the experiment queue and cohorts share.
// A viewer that dies mid-run leaves it behind; a fresh viewer may take it back only
// once its owner is gone and its run no longer plays, or to adopt that very run.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const LEASE = ".naming-gameplay.lock";
const OwnerSchema = Type.Object({ pid: Type.Integer({ minimum: 1 }), owner: Type.String(), run: Type.Optional(Type.String()), child: Type.Optional(Type.Integer({ minimum: 1 })) });
export type LeaseOwner = Static<typeof OwnerSchema>;

export class LeaseHeldError extends Error {
  override readonly name = "LeaseHeldError";
  constructor() {
    super("the gameplay lease is held (another run, cohort or queue is active)");
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

export function readLeaseOwner(runsRoot: string): LeaseOwner | null {
  const path = join(runsRoot, LEASE, "owner.json");
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Value.Check(OwnerSchema, value) ? value : null;
  } catch {
    return null;
  }
}

// An unreadable owner is never stale: it may be a lease taken a moment ago.
export function leaseStale(runsRoot: string, alive: (pid: number) => boolean, adoptable: ReadonlySet<string> = new Set()): boolean {
  const owner = readLeaseOwner(runsRoot);
  if (owner === null || alive(owner.pid)) return false;
  const adopting = owner.run !== undefined && adoptable.has(owner.run);
  return owner.child === undefined || adopting || !alive(owner.child);
}

export function takeLease(runsRoot: string, owner: Readonly<Record<string, unknown>>, alive: (pid: number) => boolean = pidAlive, adoptable: ReadonlySet<string> = new Set()): string {
  const lease = join(runsRoot, LEASE);
  try {
    mkdirSync(lease);
  } catch {
    if (!leaseStale(runsRoot, alive, adoptable)) throw new LeaseHeldError();
    rmSync(lease, { recursive: true, force: true });
    try {
      mkdirSync(lease);
    } catch {
      throw new LeaseHeldError();
    }
  }
  try {
    writeFileSync(join(lease, "owner.json"), JSON.stringify(owner), { flag: "wx" });
  } catch (error) {
    rmSync(lease, { recursive: true, force: true });
    throw error;
  }
  return lease;
}
