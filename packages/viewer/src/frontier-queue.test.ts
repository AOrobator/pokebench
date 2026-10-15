import { describe, expect, it } from "vitest";
import { parseNavigationReceipt } from "./frontier-queue.js";
import { navigationFixture as fixture } from "../test-support/navigation-queue.js";
describe("actual eight-trial receipt adapter", () => {
  it("keeps eight planned positions and dynamic run identities", () => {
    const f = fixture(), result = parseNavigationReceipt(f.manifest, [f.row], f.digest, "/repo");
    expect(result.trials).toHaveLength(8); expect(result.trials[0]).toMatchObject({ run: "real_run", phase: "launched" }); expect(result.trials.slice(1).every(t => t.run === null && t.phase === "planned")).toBe(true);
  });
  it("retains completed model failures and held process failures without calling either a faster success", () => {
    const f = fixture(), result = parseNavigationReceipt(f.manifest, [f.row, f.process, { ...f.outcome, reason: "model_error" }], f.digest, "/repo");
    expect(result.trials[0]?.phase).toBe("completed");
    const held = parseNavigationReceipt(f.manifest, [f.row, { ...f.process, code: 1 }, { at: f.row.at, manifest_sha256: f.digest, type: "launcher_error", error: "exit1" }], f.digest, "/repo");
    expect(held.trials[0]?.failed).toBe(true); expect(held.failure).toBe("exit1");
  });
  it.each(["wrong digest", "missing hash", "out of order", "duplicate", "after failure", "wrong arm", "invalid time", "unknown row"])("rejects %s atomically", kind => {
    const f = fixture(); let rows: unknown[] = [f.row];
    if (kind === "wrong digest") rows = [{ ...f.row, manifest_sha256: "wrong" }];
    if (kind === "missing hash") rows = [f.row, f.process, { ...f.outcome, events_sha256: null }];
    if (kind === "out of order") rows = [f.process];
    if (kind === "duplicate") rows = [f.row, f.row];
    if (kind === "after failure") rows = [f.row, { at: f.row.at, manifest_sha256: f.digest, type: "launcher_error", error: "held" }, f.process];
    if (kind === "wrong arm") rows = [{ ...f.row, arm: "on" }];
    if (kind === "invalid time") rows = [{ ...f.row, at: "invalid" }];
    if (kind === "unknown row") rows = [{ ...f.row, type: "invented" }];
    expect(() => parseNavigationReceipt(f.manifest, rows, f.digest, "/repo")).toThrow();
  });
  it("rejects malformed protocol/root/arm settings without coercing them into a legacy 24-run plan", () => {
    const f = fixture(); expect(() => parseNavigationReceipt({ ...f.manifest, order: Array(24).fill("off") }, [], f.digest, "/repo")).toThrow("manifest");
    expect(() => parseNavigationReceipt(f.manifest, [], f.digest, "/other")).toThrow("manifest");
    expect(() => parseNavigationReceipt({ ...f.manifest, expected_harness_features: { off: [], on: [] } }, [], f.digest, "/repo")).toThrow("arm");
  });
});
