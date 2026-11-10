import { describe, expect, it } from "vitest";
import { NO_ENDPOINT, RunQueue, endpointFromEnv, nextRunsLine } from "./next-run.js";

describe("viewer model endpoint", () => {
  it("uses only POKEBENCH_ENDPOINT_FILE, with no fallback to any model server's own file", () => {
    expect(endpointFromEnv({})).toBeNull();
    expect(endpointFromEnv({ POKEBENCH_ENDPOINT_FILE: "" })).toBeNull();
    expect(endpointFromEnv({ HOME: "/Users/user" })).toBeNull();
    expect(endpointFromEnv({ POKEBENCH_ENDPOINT_FILE: "/lanes/a/endpoint.json" })).toBe("/lanes/a/endpoint.json");
  });

  it("names the variable and the guide when none is set", () => {
    expect(NO_ENDPOINT).toContain("POKEBENCH_ENDPOINT_FILE");
    expect(NO_ENDPOINT).toContain("docs/connect-a-model.md");
    expect(nextRunsLine(null)).toBe(`next runs: ${NO_ENDPOINT}`);
  });

  it("names the endpoint file it was given", () => {
    expect(nextRunsLine("/lanes/a/endpoint.json")).toBe("next runs: local models from /lanes/a/endpoint.json");
  });

  it("refuses to queue a run with the same guidance", () => {
    const queue = new RunQueue({ runsRoot: "/runs", liveJs: "/live.js", endpointFile: null, leasePool: () => "pool", gamePort: 8076, healthy: () => Promise.resolve(true), now: () => new Date(0), random: () => "a1b2", launch: () => Promise.resolve(null) });
    expect(() => queue.enqueue({})).toThrow(NO_ENDPOINT);
  });
});
