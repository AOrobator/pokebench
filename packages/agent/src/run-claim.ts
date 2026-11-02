// A run's claim on the process and port it owns. Cleanup, viewer restarts and port reuse ask this
// registry before touching a pid: a run that is alive here is not an orphan, and killing it ends a
// scored run (INV-Q5). The claim outlives the run as a tombstone so the port's history stays readable.
import {existsSync, readdirSync, readFileSync, renameSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {Type, type Static} from "typebox";
import {Value} from "typebox/value";

const ClaimSchema = Type.Object({
  v: Type.Literal(1),
  run: Type.String(),
  pid: Type.Integer({minimum: 1}),
  child: Type.Union([Type.Integer({minimum: 1}), Type.Null()]),
  port: Type.Integer({minimum: 1}),
  started: Type.String(),
  heartbeat: Type.String(),
  ended: Type.Optional(Type.String()),
  end_reason: Type.Optional(Type.String()),
  operator_signal: Type.Optional(Type.String()),
}, {additionalProperties: false});
export type RunClaim = Static<typeof ClaimSchema>;

export const CLAIM_FILE = "run-claim.json";

// Fresh enough that a claim is believed without a pid probe, and short enough that a hard kill
// leaves a claim that is visibly stale rather than silently plausible.
export const HEARTBEAT_MS = 15_000;

export function claimPath(runDir: string): string {
  return join(runDir, CLAIM_FILE);
}

export function writeClaim(runDir: string, claim: RunClaim): void {
  const path = claimPath(runDir);
  const text = JSON.stringify(claim);
  // Written whole then renamed, so a torn claim cannot read as an unowned run. A filesystem (or test
  // double) without atomic rename still gets a complete claim from the direct write.
  try {
    writeFileSync(`${path}.tmp`, text);
    renameSync(`${path}.tmp`, path);
  } catch {
    writeFileSync(path, text);
  }
}

export function readClaim(runDir: string): RunClaim | null {
  const path = claimPath(runDir);
  if (!existsSync(path)) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    return Value.Check(ClaimSchema, value) ? value : null;
  } catch {
    return null;
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

// Model runs sit directly under runs/, human recordings under runs/human/.
export function listClaims(runsRoot: string): RunClaim[] {
  const claims: RunClaim[] = [];
  const roots = [runsRoot, join(runsRoot, "human")];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      const claim = readClaim(join(root, entry.name));
      if (claim !== null) claims.push(claim);
    }
  }
  return claims;
}

export function claimLive(claim: RunClaim, alive: (pid: number) => boolean = pidAlive): boolean {
  return claim.ended === undefined && alive(claim.pid);
}

export interface ClaimQuery {
  readonly pid?: number;
  readonly port?: number;
}

// A pid matches whether it is the run's own process or the game server it spawned: both are the run.
export function claimsMatching(claims: readonly RunClaim[], query: ClaimQuery, alive: (pid: number) => boolean = pidAlive): RunClaim[] {
  return claims.filter((claim) => claimLive(claim, alive)
    && (query.pid === undefined || claim.pid === query.pid || claim.child === query.pid)
    && (query.port === undefined || claim.port === query.port));
}

export function describeClaim(claim: RunClaim): string {
  return `${claim.run} (pid ${String(claim.pid)}${claim.child === null ? "" : `, server ${String(claim.child)}`}, port ${String(claim.port)})`;
}

// What a cleanup tool prints before refusing to touch something.
export function ownedMessage(claim: RunClaim, what: string): string {
  return `${what} belongs to the live run ${describeClaim(claim)}; stop it with a control request (just run-control ${claim.run} abort), not a signal`;
}
