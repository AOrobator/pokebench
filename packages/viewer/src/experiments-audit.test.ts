import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Log, START, assistant } from "../test-support/events.js";
import { run } from "../test-support/workbench.js";
import { auditMain, experimentsAudit } from "./experiments-audit.js";
import { workbenchSnapshot } from "./workbench-store.js";
import type { WorkbenchData } from "./workbench-data.js";
const root = (): string => { const p = join(mkdtempSync(join(tmpdir(), "audit-")), "runs"); mkdirSync(p); return p; };
const evaluation = (experiment: Record<string, unknown>) => ({ preset_id: "p", target: null, failure_limit: 3, flags: { loopGuard: false, activeUi: false, interfaceDocs: false, objectives: false }, experiment });
function write(dir: string, first: unknown, rest = ""): void { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "events.jsonl"), (typeof first === "string" ? first : JSON.stringify(first)) + "\n" + rest); }
function recorded(r: string, id: string, experiment: Record<string, unknown> | null): void {
  const log = new Log(); log.add(0, experiment === null ? START : { ...START, evaluation: evaluation(experiment) } as typeof START); log.add(1000, assistant());
  mkdirSync(join(r, id)); writeFileSync(join(r, id, "events.jsonl"), log.events.map(e => JSON.stringify({ ...e, run: id })).join("\n") + "\n");
}
const data = (runs: WorkbenchData["runs"]): WorkbenchData => ({ version: 1, at: 1, milestones: [], runs, problems: [] });
describe("experiments audit", () => {
  it("lists tagged runs that are missing from the snapshot or in no dropdown cohort", () => {
    const r = root(), tag = { v: 1, seq: 0, t: "x", type: "run_start", evaluation: { experiment: { id: "bundle-v-control", arm: "control", trial: 1, of: 2 } } };
    write(join(r, "in-cohort"), tag); write(join(r, "orphan"), tag); write(join(r, "missing"), tag); write(join(r, "human", "human-tagged"), tag);
    write(join(r, "untagged"), { type: "run_start", evaluation: { preset_id: "p" } }); write(join(r, "no-evaluation"), { type: "run_start" });
    write(join(r, "not-start"), { type: "turn", evaluation: tag.evaluation }); write(join(r, "torn"), "{\"type\":\"run_st"); write(join(r, "array"), "[1]");
    write(join(r, "blank-id"), { type: "run_start", evaluation: { experiment: { id: "" } } });
    mkdirSync(join(r, "no-log")); writeFileSync(join(r, "loose.txt"), "x"); mkdirSync(join(r, "empty-log")); writeFileSync(join(r, "empty-log", "events.jsonl"), "");
    const findings = experimentsAudit(r, data([run({ id: "in-cohort", cohort: "experiment:bundle-v-control@abc" }), run({ id: "orphan", cohort: null, problem: "Run identity is invalid" }), run({ id: "human-tagged", cohort: "x" })]));
    expect(findings).toEqual([
      { run: "missing", experiment: "bundle-v-control", problem: "not in the workbench snapshot" },
      { run: "orphan", experiment: "bundle-v-control", problem: "in no EXPERIMENT dropdown cohort (Run identity is invalid)" },
    ]);
    expect(experimentsAudit(join(r, "absent"), data([]))).toEqual([]);
  });
  it("finds nothing on a real snapshot of tagged runs, and flags a tagged run the viewer cannot read", async () => {
    const r = root();
    recorded(r, "2026-10-16T05-00-00_qwen36-gpu1_main", { id: "bundle-v-control", arm: "control", trial: 1, of: 2 });
    recorded(r, "2026-10-16T05-00-01_qwen36-gpu1_none", null);
    expect(experimentsAudit(r, await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000))).toEqual([]);
    recorded(r, "2026-10-16T05-00-02_qwen36-gpu1_bad", { id: "bundle-v-control", arm: "control", trial: 1, of: 2, extra: true });
    const findings = experimentsAudit(r, await workbenchSnapshot(r, () => Promise.resolve(false), 2000000000000));
    expect(findings.map(f => f.run)).toEqual(["2026-10-16T05-00-02_qwen36-gpu1_bad"]);
    expect(findings[0]?.problem).toContain("in no EXPERIMENT dropdown cohort");
  });
  it("prints nothing and exits zero when complete, one line per finding and exits one otherwise", async () => {
    const r = root(); write(join(r, "orphan"), { type: "run_start", evaluation: { experiment: { id: "x" } } });
    const lines: string[] = [], errors: string[] = [];
    const deps = (runs: WorkbenchData["runs"]) => ({ runsRoot: r, snapshot: (at: string) => { expect(at).toBe(r); return Promise.resolve(data(runs)); }, out: (l: string) => { lines.push(l); }, err: (l: string) => { errors.push(l); } });
    expect(await auditMain([], deps([run({ id: "orphan", cohort: "c" })]))).toBe(0); expect(lines).toEqual([]);
    expect(await auditMain([], deps([]))).toBe(1); expect(lines).toEqual(["orphan\tx\tnot in the workbench snapshot"]); expect(errors).toEqual(["experiments-audit: 1 tagged run is in no EXPERIMENT dropdown cohort"]);
    write(join(r, "orphan-2"), { type: "run_start", evaluation: { experiment: { id: "y" } } });
    expect(await auditMain([], deps([]))).toBe(1); expect(errors.at(-1)).toBe("experiments-audit: 2 tagged runs are in no EXPERIMENT dropdown cohort");
    const other = root(); expect(await auditMain([other], { ...deps([]), snapshot: (at: string) => { expect(at).toBe(other); return Promise.resolve(data([])); } })).toBe(0);
    expect(await auditMain(["a", "b"], deps([]))).toBe(2); expect(errors.at(-1)).toContain("usage");
    expect(await auditMain([], { ...deps([]), snapshot: () => Promise.reject(new Error("boom")) })).toBe(2); expect(errors.at(-1)).toBe("experiments-audit: boom");  });
});
