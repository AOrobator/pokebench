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

describe("runs-cli main", () => {
  it("uses the repo runs/ directory and the 500 MB cap", () => {
    const out: string[] = [];
    expect(main(["disk"], (line) => out.push(line))).toBe(0);
    expect(out[0]).toMatch(/of 500\.0 MB cap/);
    expect(RUNS_ROOT).toMatch(/\/runs\/$/);
  });
});
