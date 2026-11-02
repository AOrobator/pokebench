import {describe, expect, it} from "vitest";
import {allocatePort, busyPorts, claimsOnPort, GAME_PORT_POOL, noPortMessage, type PortPool} from "./port-allocator.js";
import type {RunClaim} from "./run-claim.js";

const pool: PortPool = {first: 8100, last: 8103};
const none = (): boolean => false;
const closed = (): boolean => false;
const alwaysAlive = (): boolean => true;
const handle = (port: number, overrides: Partial<RunClaim> = {}): RunClaim => ({
  v: 1, run: `r${String(port)}`, pid: port, child: null, port,
  started: "2026-11-02T03:00:00.000Z", heartbeat: "2026-11-02T03:00:15.000Z", ...overrides,
});

describe("port allocation", () => {
  it("takes the first free port in the pool", () => {
    expect(allocatePort({claims: [], listening: closed}, pool)).toBe(8100);
  });

  it("skips a port a live run claims", () => {
    expect(allocatePort({claims: [handle(8100)], listening: closed, alive: alwaysAlive}, pool)).toBe(8101);
  });

  it("reuses a port whose run has ended", () => {
    const ended = handle(8100, {ended: "2026-11-02T04:00:00.000Z"});
    expect(allocatePort({claims: [ended], listening: closed, alive: alwaysAlive}, pool)).toBe(8100);
  });

  it("reuses a port whose claiming process is gone", () => {
    expect(allocatePort({claims: [handle(8100)], listening: closed, alive: none}, pool)).toBe(8100);
  });

  it("skips a port something is listening on, even with no claim", () => {
    expect(allocatePort({claims: [], listening: (port) => port === 8100}, pool)).toBe(8101);
    expect(busyPorts({claims: [], listening: (port) => port === 8100}, pool).has(8100)).toBe(true);
  });

  it("returns null when every port is taken, rather than reusing one", () => {
    const claims = [handle(8100), handle(8101), handle(8102), handle(8103)];
    expect(allocatePort({claims, listening: closed, alive: alwaysAlive}, pool)).toBeNull();
  });

  it("names the live holders when it cannot allocate", () => {
    const claims = [handle(8100), handle(8101)];
    expect(noPortMessage(pool, claims, alwaysAlive)).toContain("r8100:8100");
    expect(noPortMessage(pool, [], alwaysAlive)).toContain("listening without a claim");
  });

  it("reports the run holding a port, which is what a cleanup must ask before killing", () => {
    const claims = [handle(8100)];
    expect(claimsOnPort(claims, 8100, alwaysAlive)).toHaveLength(1);
    expect(claimsOnPort(claims, 8101, alwaysAlive)).toHaveLength(0);
    expect(claimsOnPort([handle(8100, {ended: "2026-11-02T04:00:00.000Z"})], 8100, alwaysAlive)).toHaveLength(0);
  });

  it("defaults its pool above the fixed-run lane ports", () => {
    expect(GAME_PORT_POOL.first).toBeGreaterThan(8077);
  });
});
