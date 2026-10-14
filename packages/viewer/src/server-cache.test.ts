import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ALL_ON, playHarnessFeatures } from "@pokebench/agent/features";
import { fullRun } from "../test-support/events.js";
import { startViewer, type Viewer } from "./server.js";

vi.mock("node:fs", async (original) => ({ ...await original<typeof import("node:fs")>() }));

const viewers: Viewer[] = [], roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const viewer of viewers.splice(0)) await viewer.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

it("shares cached validated splits across HTTP comparisons, milestones and feature history", async () => {
  const root = fs.mkdtempSync(join(tmpdir(), "viewer-cache-http-"));
  roots.push(root);
  for (const id of ["selected", "reference"]) {
    const dir = join(root, id);
    fs.mkdirSync(dir);
    const lines = fullRun().events.map((e) => JSON.stringify({ ...e, run: id, ...(e.type === "run_start" ? { harness_features: playHarnessFeatures(ALL_ON, null) } : {}) }));
    fs.writeFileSync(join(dir, "events.jsonl"), lines.join("\n") + "\n");
  }
  const viewer = await startViewer({ runsRoot: root, staticDir: root, appDir: root, port: 0 });
  viewers.push(viewer);
  const get = async (path: string): Promise<unknown> => {
    const response = await fetch(new URL(path, viewer.url));
    expect(response.status).toBe(200);
    return response.json() as Promise<unknown>;
  };
  const io = vi.spyOn(fs, "readSync");
  const comparisons = await get("api/runs/selected/comparisons");
  expect(comparisons).toMatchObject({ candidates: [{ run: "reference", milestones: [{ name: "GAME_RUNNING", offsetMs: 10 }, { name: "PLAYER_NAME_SET", offsetMs: 3100 }] }], best: { run: "reference" }, baseline: null });
  const coldReads = io.mock.calls.length;
  io.mockClear();
  expect(await get("api/runs/selected/comparisons")).toEqual(comparisons);
  expect(io.mock.calls.length).toBe(coldReads - 2);
  io.mockClear();
  expect(await get("api/runs/reference/milestones")).toEqual({ run: "reference", milestones: [{ name: "GAME_RUNNING", offsetMs: 10 }, { name: "PLAYER_NAME_SET", offsetMs: 3100 }] });
  expect(io).not.toHaveBeenCalled();
  // History warms the selected run as well; subsequent milestones must also hit this same cache.
  await get("api/features/history");
  io.mockClear();
  expect(await get("api/runs/selected/milestones")).toEqual({ run: "selected", milestones: [{ name: "GAME_RUNNING", offsetMs: 10 }, { name: "PLAYER_NAME_SET", offsetMs: 3100 }] });
  expect(io).not.toHaveBeenCalled();
  const freshViewer = await startViewer({ runsRoot: root, staticDir: root, appDir: root, port: 0 });
  viewers.push(freshViewer);
  io.mockClear();
  const fresh = await fetch(new URL("api/runs/selected/comparisons", freshViewer.url));
  expect(fresh.status).toBe(200);
  expect(await fresh.json()).toEqual(comparisons);
  expect(io.mock.calls.length).toBe(coldReads);
  const path = join(root, "reference", "events.jsonl");
  fs.writeFileSync(path, fs.readFileSync(path, "utf8").replace('"name":"PLAYER_NAME_SET"', '"name":42'));
  expect(await get("api/runs/selected/comparisons")).toEqual({ candidates: [], best: null, baseline: null });
  const malformed = await fetch(new URL("api/runs/reference/milestones", viewer.url));
  expect(malformed.status).toBe(422);
});
