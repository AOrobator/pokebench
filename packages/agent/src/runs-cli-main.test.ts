import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, vi } from "vitest";

// The real runs/ holds tens of GB of frames, so the store is replaced and only its wiring is checked.
const made = vi.hoisted(() => [] as { runsRoot: string; capBytes: number }[]);
vi.mock("./frames.js", async (load) => {
  const actual = await load<typeof import("./frames.js")>();
  class RecordingStore {
    constructor(readonly runsRoot: string, readonly capBytes: number) { made.push({ runsRoot, capBytes }); }
    usage(): number { return 0; }
  }
  return { ...actual, FrameStore: RecordingStore };
});
const { RUNS_ROOT, main, runsRootFor } = await import("./runs-cli.js");
const { FRAME_CAP_BYTES } = await import("./frames.js");

it("defaults the CLI to the repo runs/ directory and the 500 MB cap without scanning it", () => {
  const out: string[] = [];
  expect(main(["disk"], (line) => out.push(line))).toBe(0);
  expect(made).toEqual([{ runsRoot: RUNS_ROOT, capBytes: FRAME_CAP_BYTES }]);
  expect(FRAME_CAP_BYTES).toBe(500 * 1024 * 1024);
  expect(out).toEqual(["frames on disk: 0 B of 500.0 MB cap (0%); runs may start at or below 75%"]);
});

it("resolves the runs root as a filesystem path, so escaped characters such as spaces survive", () => {
  expect(runsRootFor("file:///Users/a%20b/pokebench/packages/agent/src/runs-cli.js")).toBe("/Users/a b/pokebench/runs/");
  expect(RUNS_ROOT).toBe(fileURLToPath(new URL("../../../runs/", import.meta.url)));
  expect(RUNS_ROOT).not.toMatch(/%[0-9A-F]{2}/i);
  expect(existsSync(join(RUNS_ROOT, "..", "justfile"))).toBe(true);
});
