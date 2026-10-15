import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FixedStatusError, parseFixedStatus, readFixedStatuses, writeFixedStatus, type FixedStatus } from "./fixed-status.js";
import { fixedRunCards } from "./queue-view.js";

function status(over: Partial<FixedStatus> = {}): FixedStatus {
  return {
    kind: "fixed-run", version: 1, experiment: "bundle-v-control", title: "Bundle vs <fixed> control", definitionSha256: "d".repeat(64), pid: 4321,
    updatedAt: "2026-10-16T04:00:00.000Z", state: "running", total: 140, valid: 12, invalid: 1,
    invalidTrials: [{ slot: 3, lane: "B", arm: "bundle", phase: "confirmatory", run: "r3", reason: "model/gateway error: model error: HTTP 502" }],
    reserve: { usedMs: 900_000, totalMs: 14_400_000 },
    lanes: [
      { id: "A", gpu: "GPU1", port: 8071, state: "running", reason: "trial 14 (confirmatory, control)", slot: 14, arm: "control", phase: "confirmatory", run: "r14", since: "2026-10-16T03:55:00.000Z", retryAt: null, lastError: null, valid: 7, total: 70 },
      { id: "B", gpu: "GPU0", port: 8072, state: "paused", reason: "lane B cannot serve: connect ECONNREFUSED 127.0.0.1:8098", slot: null, arm: null, phase: null, run: null, since: "2026-10-16T03:58:00.000Z", retryAt: "2026-10-16T04:02:00.000Z", lastError: "lane B cannot serve: connect ECONNREFUSED 127.0.0.1:8098", valid: 5, total: 70 },
    ],
    lastError: "lane B: lane B cannot serve: connect ECONNREFUSED 127.0.0.1:8098",
    ...over,
  };
}

describe("fixed-run status files", () => {
  it("round-trips through status.json and rejects anything else", () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "fixed-status-"));
    writeFixedStatus(runsRoot, status());
    expect(readFixedStatuses(runsRoot, () => true)).toEqual([{ ...status(), runnerAlive: true }]);
    expect(() => parseFixedStatus({ ...status(), state: "halted" })).toThrow(FixedStatusError);
  });

  it("lists every experiment's status, marks a dead runner and skips other experiment directories and unreadable files", () => {
    const runsRoot = mkdtempSync(join(tmpdir(), "fixed-status-"));
    writeFixedStatus(runsRoot, status());
    writeFixedStatus(runsRoot, status({ experiment: "bundle-v-control-dryrun", pid: 99 }));
    mkdirSync(join(runsRoot, "experiments", "full-map-navigation"), { recursive: true });
    mkdirSync(join(runsRoot, "experiments", "broken"), { recursive: true });
    writeFileSync(join(runsRoot, "experiments", "broken", "status.json"), "{");
    writeFileSync(join(runsRoot, "experiments", "runner.json"), "{}");
    const views = readFixedStatuses(runsRoot, (pid) => pid !== 99);
    expect(views.map((v) => [v.experiment, v.runnerAlive])).toEqual([["bundle-v-control", true], ["bundle-v-control-dryrun", false]]);
    expect(readFixedStatuses(join(runsRoot, "missing"), () => true)).toEqual([]);
  });
});

describe("fixedRunCards", () => {
  it("shows progress, invalid count, reserve, every lane's state and reason, and the last error", () => {
    const html = fixedRunCards([{ ...status(), runnerAlive: true }]);
    expect(html).toContain("Bundle vs &lt;fixed&gt; control");
    expect(html).toContain("12 / 140 done");
    expect(html).toContain("1 invalid");
    expect(html).toContain("reserve 0.25 / 4.00 GPU-h");
    expect(html).toContain("LANE A · GPU1 · :8071");
    expect(html).toContain("RUNNING");
    expect(html).toContain("trial 14 (confirmatory, control)");
    expect(html).toContain("7 / 70");
    expect(html).toContain("PAUSED");
    expect(html).toContain("lane B cannot serve: connect ECONNREFUSED 127.0.0.1:8098");
    expect(html).toContain("retry 2026-10-16T04:02:00.000Z");
    expect(html).toContain("LAST ERROR");
    expect(html).toContain("r3: model/gateway error: model error: HTTP 502");
  });

  it("says loudly when the runner is gone before the experiment finished, and is empty with no fixed runs", () => {
    expect(fixedRunCards([{ ...status(), runnerAlive: false }])).toContain("RUNNER NOT RUNNING (pid 4321, last update 2026-10-16T04:00:00.000Z)");
    expect(fixedRunCards([{ ...status({ state: "finished", lastError: null, invalid: 0, invalidTrials: [] }), runnerAlive: false }])).not.toContain("RUNNER NOT RUNNING");
    expect(fixedRunCards([])).toBe("");
  });
});
