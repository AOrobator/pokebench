import {mkdtempSync, mkdirSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {claimLive, claimsMatching, CLAIM_FILE, claimPath, describeClaim, listClaims, ownedMessage, readClaim, writeClaim, type RunClaim} from "./run-claim.js";


function claim(overrides: Partial<RunClaim> = {}): RunClaim {
  return {
    v: 1, run: "2026-11-02T02-55-21_test_07a7", pid: 4242, child: 4243, port: 8076,
    started: "2026-11-02T02:55:21.000Z", heartbeat: "2026-11-02T02:55:36.000Z", ...overrides,
  };
}

const alwaysAlive = (): boolean => true;
const neverAlive = (): boolean => false;

describe("the run claim", () => {

  it("stays live only while it has not ended and its process is alive", () => {
    expect(claimLive(claim(), alwaysAlive)).toBe(true);
    expect(claimLive(claim(), neverAlive)).toBe(false);
    expect(claimLive(claim({ended: "2026-11-02T03:00:00.000Z"}), alwaysAlive)).toBe(false);
  });

  it("matches a pid whether it is the run process or the game server it spawned", () => {
    const claims = [claim()];
    expect(claimsMatching(claims, {pid: 4242}, alwaysAlive)).toHaveLength(1);
    expect(claimsMatching(claims, {pid: 4243}, alwaysAlive)).toHaveLength(1);
    expect(claimsMatching(claims, {pid: 9999}, alwaysAlive)).toHaveLength(0);
    expect(claimsMatching([claim({child: null})], {pid: 4243}, alwaysAlive)).toHaveLength(0);
  });

  it("matches a port, and never matches a run that has ended", () => {
    expect(claimsMatching([claim()], {port: 8076}, alwaysAlive)).toHaveLength(1);
    expect(claimsMatching([claim()], {port: 8075}, alwaysAlive)).toHaveLength(0);
    expect(claimsMatching([claim({ended: "2026-11-02T03:00:00.000Z"})], {port: 8076}, alwaysAlive)).toHaveLength(0);
  });

  it("names the owner and the way to stop it without a signal", () => {
    const one = claim();
    expect(describeClaim(one)).toContain("pid 4242");
    expect(describeClaim(one)).toContain("server 4243");
    expect(describeClaim(one)).toContain("port 8076");
    expect(ownedMessage(one, "port 8076")).toContain("just run-control");
  });
});
