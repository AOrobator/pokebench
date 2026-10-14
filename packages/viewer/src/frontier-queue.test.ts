import { describe, expect, it } from "vitest";
import { parseNavigationReceipt } from "./frontier-queue.js";
import { navigationFixture as fixture } from "../test-support/navigation-queue.js";
describe("actual eight-trial receipt adapter", () => {
  it("keeps eight planned positions and dynamic run identities, qualifying scheduling from matching receipt/owner", () => {
    const f = fixture(), result = parseNavigationReceipt(f.manifest, [f.row], f.queue, f.owner, f.digest, "/repo", () => true);
    expect(result.trials).toHaveLength(8); expect(result.active).toBe(true); expect(result.trials[0]).toMatchObject({ run: "real_run", phase: "launched" }); expect(result.trials.slice(1).every(t => t.run === null && t.phase === "planned")).toBe(true);
    expect(parseNavigationReceipt(f.manifest, [f.row], f.queue, { ...f.owner, manifest_sha256: "wrong" }, f.digest, "/repo", () => true).active).toBe(false);
    expect(parseNavigationReceipt(f.manifest, [f.row], f.queue, f.owner, f.digest, "/repo", () => false).active).toBe(false);
    expect(parseNavigationReceipt(f.manifest, [f.row], { ...f.queue, completed: 1 }, f.owner, f.digest, "/repo", () => true).active).toBe(false);
  });
  it("retains completed model failures and held process failures without calling either a faster success", () => {
    const f = fixture(), result = parseNavigationReceipt(f.manifest, [f.row, f.process, { ...f.outcome, reason: "model_error" }], null, null, f.digest, "/repo", () => false);
    expect(result.trials[0]?.phase).toBe("completed"); expect(result.active).toBe(false);
    const held = parseNavigationReceipt(f.manifest, [f.row, { ...f.process, code: 1 }, { at: f.row.at, manifest_sha256: f.digest, type: "launcher_error", error: "exit1" }], null, null, f.digest, "/repo", () => false);
    expect(held.trials[0]?.failed).toBe(true); expect(held.failure).toBe("exit1"); expect(held.active).toBe(false);
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
    expect(() => parseNavigationReceipt(f.manifest, rows, f.queue, f.owner, f.digest, "/repo", () => true)).toThrow();
  });
  it("rejects malformed protocol/root/arm settings without coercing them into a legacy 24-run plan", () => {
    const f = fixture(); expect(() => parseNavigationReceipt({ ...f.manifest, order: Array(24).fill("off") }, [], null, null, f.digest, "/repo", () => false)).toThrow("manifest");
    expect(() => parseNavigationReceipt(f.manifest, [], null, null, f.digest, "/other", () => false)).toThrow("manifest");
    expect(() => parseNavigationReceipt({ ...f.manifest, expected_harness_features: { off: [], on: [] } }, [], null, null, f.digest, "/repo", () => false)).toThrow("arm");
  });
});
