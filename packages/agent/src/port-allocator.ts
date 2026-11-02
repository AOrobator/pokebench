// Ports are allocated from a fixed pool and recorded on the run claim, so "the port is busy" is
// answered by the registry instead of by killing whatever holds it (INV-Q5). A port is free when no
// live claim names it and nothing is listening on it.
import {claimLive, claimsMatching, pidAlive, type RunClaim} from "./run-claim.js";

export interface PortPool {
  readonly first: number;
  readonly last: number;
}

// Fixed runs pin their own lane ports and human sessions use 8040; this pool sits clear of both.
export const GAME_PORT_POOL: PortPool = {first: 8090, last: 8099};

export interface PortQuery {
  readonly claims: readonly RunClaim[];
  readonly listening: (port: number) => boolean;
  readonly alive?: (pid: number) => boolean;
}

export function busyPorts(query: PortQuery, pool: PortPool = GAME_PORT_POOL): Set<number> {
  const busy = new Set<number>();
  for (const claim of query.claims) {
    if (claimLive(claim, query.alive ?? pidAlive)) busy.add(claim.port);
  }
  // A leftover listener without a claim still owns its port; both are reasons to leave it alone.
  for (let port = pool.first; port <= pool.last; port += 1) {
    if (query.listening(port)) busy.add(port);
  }
  return busy;
}

export function allocatePort(query: PortQuery, pool: PortPool = GAME_PORT_POOL): number | null {
  const busy = busyPorts(query, pool);
  for (let port = pool.first; port <= pool.last; port += 1) {
    if (!busy.has(port)) return port;
  }
  return null;
}

// The refusal a launch prints instead of picking a port that a live run already owns.
export function noPortMessage(pool: PortPool, claims: readonly RunClaim[], alive: (pid: number) => boolean = pidAlive): string {
  const holders = claims.filter((claim) => claimLive(claim, alive) && claim.port >= pool.first && claim.port <= pool.last);
  return holders.length === 0
    ? `every port in ${String(pool.first)}-${String(pool.last)} is listening without a claim; stop the listener that is holding one`
    : `every port in ${String(pool.first)}-${String(pool.last)} is held by a live run (${holders.map((c) => `${c.run}:${String(c.port)}`).join(", ")})`;
}

export function claimsOnPort(claims: readonly RunClaim[], port: number, alive: (pid: number) => boolean = pidAlive): RunClaim[] {
  return claimsMatching(claims, {port}, alive);
}
