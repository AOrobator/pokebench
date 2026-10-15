import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { definitionHash, parseExperiment, type ReadinessRun } from "@pokebench/agent/experiments";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { ApprovalError, approveExperiment, revokeApproval } from "./experiment-approval.js";
import { experimentDir, type RunSource } from "./experiment-store.js";

const READY: ReadinessRun[] = ["a", "b", "c", "d"].map((id) => ({ id, model: "think-fast", start: "boot", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: ["FIRST_TRUCK_EXIT"] }));
const source: RunSource = { recent: () => READY, trial: () => null };
function setup() {
  const root = mkdtempSync(join(tmpdir(), "pokebench-approval-"));
  const paths = { experimentsDir: join(root, "experiments"), runsRoot: join(root, "runs"), readinessPath: join(root, "none.md") };
  mkdirSync(paths.runsRoot, { recursive: true });
  writeDefinition(paths.experimentsDir, definition("full-map"));
  writeDefinition(paths.experimentsDir, definition("later", { queuePosition: undefined }));
  return paths;
}
const now = new Date("2026-10-14T22:00:00Z");
const HEAD = "c".repeat(40);
const audit = (paths: { runsRoot: string }): unknown[] => readFileSync(join(experimentDir(paths.runsRoot, "full-map"), "approvals.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as unknown);

describe("approving and withdrawing experiments", () => {
  it("approves a queued draft with the current definition hash and records it", () => {
    const paths = setup();
    const view = approveExperiment(paths, source, "full-map", "viewer", now, HEAD);
    expect(view.state).toBe("approved");
    expect(JSON.parse(readFileSync(join(experimentDir(paths.runsRoot, "full-map"), "approval.json"), "utf8"))).toEqual({ experiment: "full-map", sha256: definitionHash(parseExperiment(definition("full-map"))), approvedAt: now.toISOString(), approvedBy: "viewer", commit: HEAD });
    expect(audit(paths)).toEqual([{ type: "approve", at: now.toISOString(), by: "viewer", sha256: definitionHash(parseExperiment(definition("full-map"))), commit: HEAD }]);
  });

  it("refuses pending, unknown, already approved, not-ready and finished experiments", () => {
    const paths = setup();
    expect(() => approveExperiment(paths, { ...source, recent: () => [] }, "later", "viewer", now, HEAD)).toThrow("later is pending (not ready yet); only queued experiments can be approved");
    expect(approveExperiment(paths, source, "later", "viewer", now, HEAD).state).toBe("approved");
    expect(() => approveExperiment(paths, source, "nope", "viewer", now, HEAD)).toThrow(ApprovalError);
    approveExperiment(paths, source, "full-map", "viewer", now, HEAD);
    expect(() => approveExperiment(paths, source, "full-map", "viewer", now, HEAD)).toThrow("full-map is approved");
    expect(() => approveExperiment(setup(), { ...source, recent: () => [] }, "full-map", "viewer", now, HEAD)).toThrow(/full-map is not-ready/);
    try { approveExperiment(paths, source, "nope", "viewer", now, HEAD); } catch (error) { expect((error as ApprovalError).status).toBe(404); }
    try { approveExperiment(paths, source, "full-map", "viewer", now, HEAD); } catch (error) { expect((error as ApprovalError).status).toBe(409); }
  });

  it("withdraws an approval before the experiment finishes, so the runner holds before its next trial", () => {
    const paths = setup();
    expect(() => revokeApproval(paths, source, "full-map", "viewer", now)).toThrow("full-map has no approval to withdraw");
    approveExperiment(paths, source, "full-map", "viewer", now, HEAD);
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "trials.jsonl"), JSON.stringify({ type: "launch", trial: 0, arm: "incumbent", run: "r0", at: "t", commit: HEAD }) + "\n");
    const view = revokeApproval(paths, source, "full-map", "viewer", now);
    expect(view.state).toBe("stale");
    expect(existsSync(join(experimentDir(paths.runsRoot, "full-map"), "approval.json"))).toBe(false);
    expect(audit(paths).at(-1)).toEqual({ type: "revoke", at: now.toISOString(), by: "viewer" });
    // The withdrawn experiment can be approved again to resume.
    // Both arms stay on one build: once trials ran, re-approval must be on that build.
    expect(() => approveExperiment(paths, source, "full-map", "viewer", now, "d".repeat(40))).toThrow("full-map already ran trials on ccccccc; main is now at ddddddd. Both arms must stay on one build.");
    expect(approveExperiment(paths, source, "full-map", "viewer", now, HEAD).state).toBe("held");
  });

  it("refuses to withdraw a finished experiment", () => {
    const paths = setup();
    approveExperiment(paths, source, "full-map", "viewer", now, HEAD);
    const order = "ABBAABBA";
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "trials.jsonl"), Array.from(order).map((a, i) => [JSON.stringify({ type: "launch", trial: i, arm: a === "A" ? "incumbent" : "candidate", run: `r${String(i)}`, at: "t" }), JSON.stringify({ type: "outcome", trial: i, arm: a === "A" ? "incumbent" : "candidate", run: `r${String(i)}`, at: "t", reason: "budget" })].join("\n")).join("\n") + "\n");
    writeFileSync(join(experimentDir(paths.runsRoot, "full-map"), "result.json"), JSON.stringify({ experiment: "full-map", definitionSha256: definitionHash(parseExperiment(definition("full-map"))), result: { verdict: "inconclusive", recommendation: "retain", eligible: true, problems: [], incumbent: { launched: 4, reached: 0 }, candidate: { launched: 4, reached: 0 } } }));
    expect(() => revokeApproval(paths, source, "full-map", "viewer", now)).toThrow("full-map is done; there is nothing left to stop");
  });
});
