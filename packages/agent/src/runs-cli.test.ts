import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RUNS_ROOT, main, runsCli } from "./runs-cli.js";

function runsWith(bytes: number[]): string {
  const runsRoot = mkdtempSync(join(tmpdir(), "pokebench-cli-"));
  bytes.forEach((size, index) => {
    mkdirSync(join(runsRoot, `run${String(index)}`, "frames"), { recursive: true });
    writeFileSync(join(runsRoot, `run${String(index)}`, "frames", "000001_0.png"), Buffer.alloc(size));
  });
  return runsRoot;
}

describe("runsCli", () => {
  it("disk prints usage against the cap and the start limit", () => {
    const out: string[] = [];
    expect(runsCli(["disk"], runsWith([300, 100]), 1000, (line) => out.push(line))).toBe(0);
    expect(out).toEqual(["frames on disk: 400 B of 1000 B cap (40%); runs may start at or below 75%"]);
  });

  it("prune frees oldest frames down to a target percent", () => {
    const out: string[] = [];
    const runsRoot = runsWith([500, 400]);
    expect(runsCli(["prune", "50"], runsRoot, 1000, (line) => out.push(line))).toBe(0);
    expect(out).toEqual(["pruned 1 frames (500 B); frames on disk: 400 B of 1000 B cap (40%)"]);
  });

  it.each([[["prune"]], [["prune", "abc"]], [["prune", "120"]], [["explode"]], [[]]])("rejects %j", (argv) => {
    const out: string[] = [];
    expect(runsCli(argv, runsWith([]), 1000, (line) => out.push(line))).toBe(2);
    expect(out[0]).toMatch(/usage: runs-cli/);
  });
});

function runWithEvents(runsRoot: string, run: string, ended: boolean): void {
  const header = { v: 1, run, seq: 0, t: "2026-10-11T23:00:00.000-04:00", turn: 0 };
  const lines = [
    {
      ...header,
      type: "run_start",
      model: { id: "m", context_window: 1, max_tokens: 1, vision: true },
      sampling: { thinking_level: "off", max_tokens: 1 },
      system_prompt: "",
      tools: [],
      harness: { commit: "a".repeat(40), dirty: false },
      vendor_pin: "b".repeat(40),
      pi_version: "x",
      start_state: { kind: "boot" },
      harness_features: [],
      budgets: {},
      isolation: { server_dir: "s", run_data_id: run, load_checkpoint_mode: false, port: 8000 },
    },
    ...(ended
      ? [
          {
            ...header,
            seq: 1,
            type: "run_end",
            reason: "budget",
            furthest_milestone: null,
            turns: 0,
            wall_ms: 0,
            tokens: { input: 0, output: 0 },
            frames: { saved: 0, bytes: 0 },
          },
        ]
      : []),
  ];
  mkdirSync(join(runsRoot, run), { recursive: true });
  writeFileSync(join(runsRoot, run, "events.jsonl"), lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
}

describe("runsCli summary", () => {
  it("summarizes every run with an event log, oldest first", () => {
    const runsRoot = runsWith([10]);
    runWithEvents(runsRoot, "b-run", true);
    runWithEvents(runsRoot, "a-run", true);
    const out: string[] = [];
    expect(runsCli(["summary"], runsRoot, 1000, (line) => out.push(line))).toBe(0);
    expect(out.filter((line) => line.endsWith("-run") || /^[ab]-run/.test(line)).map((l) => l.slice(0, 5))).toEqual([
      "a-run",
      "b-run",
    ]);
    expect(out).toContain("2 runs: 0 incomplete");
  });

  it("summarizes only the named runs and fails on an incomplete one (PB2)", () => {
    const runsRoot = runsWith([]);
    runWithEvents(runsRoot, "done", true);
    runWithEvents(runsRoot, "lost", false);
    const out: string[] = [];
    expect(runsCli(["summary", "lost"], runsRoot, 1000, (line) => out.push(line))).toBe(1);
    expect(out.some((line) => line.startsWith("done"))).toBe(false);
    expect(out).toContain("1 runs: 1 incomplete (no run_end: live, or lost — PB2)");
  });

  it("rejects an unknown or unsafe run id", () => {
    const out: string[] = [];
    expect(runsCli(["summary", "../etc"], runsWith([]), 1000, (line) => out.push(line))).toBe(2);
    expect(runsCli(["summary", "missing"], runsWith([]), 1000, (line) => out.push(line))).toBe(2);
    expect(out).toEqual(["invalid run id: ../etc", "no event log for run: missing"]);
  });

  it("reports when there is nothing to summarize", () => {
    const out: string[] = [];
    expect(runsCli(["summary"], runsWith([]), 1000, (line) => out.push(line))).toBe(0);
    expect(out).toEqual(["no runs with an event log"]);
  });
});

describe("runs-cli main", () => {
  it("uses the repo runs/ directory and the 500 MB cap", () => {
    const out: string[] = [];
    expect(main(["disk"], (line) => out.push(line))).toBe(0);
    expect(out[0]).toMatch(/of 500\.0 MB cap/);
    expect(RUNS_ROOT).toMatch(/\/runs\/$/);
  });
});
