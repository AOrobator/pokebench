import {describe, expect, it} from "vitest";
import {frozenPlay, preservedPlainEnv} from "./frozen-play.js";
import type {FixedHostDeps} from "./fixed-cli.js";
import {fixedTreeDir, fixedTreeLiveJs} from "./fixed-tree.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

function hostDeps(env: Record<string, string | undefined> = {}): FixedHostDeps {
  return {
    root: "/repo", runsRoot: "/repo/runs", node: "/usr/bin/node",
    git: () => COMMIT, fetchFn: fetch, log: () => {},
    env: {POKEBENCH_ROM: "/rom.gba", ...env},
  };
}

describe("a frozen plain run", () => {
  it("runs the agent of the experiment checkout, not the main one", async () => {
    const spawned: string[][] = [];
    const code = await frozenPlay({
      host: {verifyBuild: async () => null},
      hostDeps: hostDeps(),
      spawn: async (spec) => { spawned.push([...spec.argv]); return 0; },
      out: () => {},
    }, COMMIT);
    expect(code).toBe(0);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.[0]).toBe(fixedTreeLiveJs(fixedTreeDir(COMMIT)));
    expect(spawned[0]?.[0]).toBe(`/private/tmp/pokebench-fixed-${COMMIT.slice(0, 12)}/packages/agent/dist/live.js`);
    expect(spawned[0]?.[1]).toBe("play");
  });

  it("launches only after the checkout is prepared at that commit", async () => {
    const order: string[] = [];
    await frozenPlay({
      host: {verifyBuild: async (commit: string) => { order.push(`prepare ${commit}`); return null; }},
      hostDeps: hostDeps(),
      spawn: async () => { order.push("spawn"); return 0; },
      out: () => {},
    }, COMMIT);
    expect(order).toEqual([`prepare ${COMMIT}`, "spawn"]);
  });

  it("refuses to launch when the checkout cannot be prepared, and says why", async () => {
    let spawned = false;
    const attempt = frozenPlay({
      host: {verifyBuild: async () => "the experiment checkout has changes (trials would record dirty: true)"},
      hostDeps: hostDeps(),
      spawn: async () => { spawned = true; return 0; },
      out: () => {},
    }, COMMIT);
    await expect(attempt).rejects.toThrow(/has changes/);
    expect(spawned).toBe(false);
  });

  it("passes the run's own preset and lane in, but not another run's identity or port", async () => {
    const spec = preservedPlainEnv({POKEBENCH_PLAY_PRESET: "/preset.json", POKEBENCH_MODEL: "m", POKEBENCH_RUN_ID: "other", POKEBENCH_EXPERIMENT: "x", POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:8075", POKEBENCH_RUNS_ROOT: "/elsewhere"});
    expect(spec).toEqual({POKEBENCH_PLAY_PRESET: "/preset.json", POKEBENCH_MODEL: "m"});
  });

  it("returns the run's exit code rather than swallowing a failure", async () => {
    const code = await frozenPlay({
      host: {verifyBuild: async () => null},
      hostDeps: hostDeps(),
      spawn: async () => 3,
      out: () => {},
    }, COMMIT);
    expect(code).toBe(3);
  });

  it("records where it ran", async () => {
    const lines: string[] = [];
    await frozenPlay({
      host: {verifyBuild: async () => null},
      hostDeps: hostDeps(),
      spawn: async () => 0,
      out: (line) => { lines.push(line); },
    }, COMMIT);
    expect(lines[0]).toContain("0123456");
    expect(lines[0]).toContain("pokebench-fixed-0123456789ab");
  });
});
