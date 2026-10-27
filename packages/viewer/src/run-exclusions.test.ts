import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { endedByOperator } from "./frontier.js";
import { EXCLUSIONS_DIR, exclusionLabel, main, readExclusions, writeExclusion } from "./run-exclusions.js";

const RUN = "2026-10-25T10-50-57_gpt-6-astra_429f";
function store(): string {
  const root = mkdtempSync(join(tmpdir(), "exclusions-"));
  mkdirSync(join(root, RUN)); writeFileSync(join(root, RUN, "events.jsonl"), "{}\n");
  return root;
}
const AT = new Date("2026-10-27T20:00:00Z");

describe("operator run exclusions", () => {
  it("has none until the operator records one", () => {
    expect(readExclusions(store())).toEqual({ exclusions: new Map(), problems: [] });
  });

  it("records an exclusion with its reason in a separate annotation file and leaves the run log untouched", () => {
    const root = store();
    const path = writeExclusion(root, RUN, "  wrong ROM loaded  ", "The operator", AT);
    expect(path).toBe(join(root, EXCLUSIONS_DIR, `${RUN}.json`));
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ version: 1, run: RUN, reason: "wrong ROM loaded", by: "The operator", at: "2026-10-27T20:00:00.000Z" });
    expect(readFileSync(join(root, RUN, "events.jsonl"), "utf8")).toBe("{}\n");
    expect(readExclusions(root).exclusions.get(RUN)).toBe("wrong ROM loaded");
    expect(exclusionLabel("wrong ROM loaded")).toBe("Operator exclusion: wrong ROM loaded");
  });

  it("requires a reason, a known run and a named operator, and never overwrites an exclusion", () => {
    const root = store();
    expect(() => writeExclusion(root, RUN, "   ", "The operator", AT)).toThrow("reason");
    expect(() => writeExclusion(root, RUN, "x", " ", AT)).toThrow("operator");
    expect(() => writeExclusion(root, "../escape", "x", "The operator", AT)).toThrow("run id");
    expect(() => writeExclusion(root, "2026-10-25T10-50-57_missing_0000", "x", "The operator", AT)).toThrow("no recorded run");
    writeExclusion(root, RUN, "first", "The operator", AT);
    expect(() => writeExclusion(root, RUN, "second", "The operator", AT)).toThrow("already excluded");
  });

  it("reports malformed or mismatched annotation files as problems instead of excluding the run", () => {
    const root = store(), dir = join(root, EXCLUSIONS_DIR);
    mkdirSync(dir);
    writeFileSync(join(dir, `${RUN}.json`), JSON.stringify({ version: 1, run: RUN, reason: "", by: "The operator", at: AT.toISOString() }));
    writeFileSync(join(dir, "other_run.json"), JSON.stringify({ version: 1, run: RUN, reason: "x", by: "The operator", at: AT.toISOString() }));
    writeFileSync(join(dir, "broken.json"), "{");
    writeFileSync(join(dir, "notes.txt"), "ignored");
    mkdirSync(join(dir, "nested.json"));
    symlinkSync(join(dir, "broken.json"), join(dir, "linked.json"));
    const read = readExclusions(root);
    expect(read.exclusions.size).toBe(0);
    expect(read.problems).toHaveLength(5);
    expect(read.problems.join("\n")).toContain("has no reason");
  });

  it("marks runs the operator ended early without excluding them", () => {
    expect(endedByOperator("operator_abort")).toBe("Ended by operator abort (operator_abort): progress before the abort counts; later milestones are censored, not failures");
    expect(endedByOperator("operator_stop")).toBe("Ended by operator stop (operator_stop): progress before the stop counts; later milestones are censored, not failures");
    expect(endedByOperator("budget")).toBeNull();
    expect(endedByOperator(null)).toBeNull();
  });

  it("writes through the CLI and explains its usage", () => {
    const root = store(), out: string[] = [], err: string[] = [];
    const io = { out: (l: string) => out.push(l), err: (l: string) => err.push(l), now: () => AT };
    expect(main([], root, io)).toBe(2);
    expect(err.join("\n")).toContain("usage");
    expect(main([RUN, "The operator"], root, io)).toBe(2);
    expect(main([RUN, "The operator", "harness", "bug"], root, io)).toBe(0);
    expect(out.join("\n")).toContain(`excluded ${RUN}: harness bug`);
    expect(main([RUN, "The operator", "again"], root, io)).toBe(1);
    expect(err.join("\n")).toContain("already excluded");
  });
});
