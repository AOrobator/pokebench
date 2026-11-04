import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent, type RunEvent } from "./events.js";
import { FrameStore } from "./frames.js";
import { harnessInfo, newRunId, withRun, type RunHost, type RunPlan } from "./run.js";






describe("newRunId", () => {
  it("is Eastern time, the model and a random suffix", () => {
    expect(newRunId(new Date("2026-10-12T01:40:05Z"), "think-swarm", () => "a1b2")).toBe(
      "2026-10-11T21-40-05_think-swarm_a1b2",
    );
  });

  it("makes an unusual model id path-safe", () => {
    expect(newRunId(new Date("2026-10-12T01:40:05Z"), "org/Qwen 3:35b", () => "zz")).toBe(
      "2026-10-11T21-40-05_org-Qwen-3-35b_zz",
    );
  });
});

describe("harnessInfo", () => {
  it("reads the commit and dirty state with argv-only git calls", () => {
    const seen: string[][] = [];
    const info = harnessInfo((args) => {
      seen.push(args);
      return args[0] === "rev-parse" ? "0123456789abcdef0123456789abcdef01234567\n" : " M file.ts\n";
    });
    expect(info).toEqual({ commit: "0123456789abcdef0123456789abcdef01234567", dirty: true });
    expect(seen).toEqual([["rev-parse", "HEAD"], ["status", "--porcelain"]]);
  });

  it("is clean when status prints nothing", () => {
    expect(harnessInfo((args) => (args[0] === "rev-parse" ? "a".repeat(40) : "")).dirty).toBe(false);
  });
});

it('derives the canonical human lease from Git common-dir for primary and linked checkouts',async()=>{
 const {humanLeasePath,HUMAN_GAMEPLAY_LEASE_NAME}=await import('./run.js');
 expect(HUMAN_GAMEPLAY_LEASE_NAME).toBe('.human-gameplay.lock');
 expect(humanLeasePath('/test-owned/repo','.git')).toBe('/test-owned/repo/runs/.human-gameplay.lock');
 expect(humanLeasePath('/test-owned/worktree','/test-owned/repo/.git')).toBe('/test-owned/repo/runs/.human-gameplay.lock');
 expect(humanLeasePath('/test-owned/worktree','../repo/.git')).toBe('/test-owned/repo/runs/.human-gameplay.lock');
});
