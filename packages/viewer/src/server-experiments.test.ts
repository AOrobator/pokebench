import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReadinessRun } from "@pokebench/agent/experiments";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { HOST, startViewer, type Viewer } from "./server.js";

const open: Viewer[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((v) => new Promise<void>((resolve) => { v.server.close(() => { resolve(); }); }))); });

function call(viewer: Viewer, path: string, method = "GET"): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: HOST, port: viewer.port, path, method, headers: { host: `${HOST}:${String(viewer.port)}`, origin: `http://${HOST}:${String(viewer.port)}`, "content-type": "application/json" } }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      res.on("end", () => { resolve({ status: res.statusCode ?? 0, body }); });
    });
    req.on("error", reject);
    req.end(method === "GET" ? undefined : "{}");
  });
}

describe("GET /api/experiments", () => {
  it("serves the queue snapshot, caches it briefly and never accepts writes (INV-Q8)", async () => {
    const root = mkdtempSync(join(tmpdir(), "pokebench-srv-eq-"));
    const paths = { experimentsDir: join(root, "experiments"), runsRoot: join(root, "runs"), readinessPath: join(root, "readiness.md") };
    mkdirSync(paths.runsRoot, { recursive: true });
    writeDefinition(paths.experimentsDir, definition("full-map"));
    let calls = 0, now = 0, fail = false;
    const recent: ReadinessRun[] = ["a", "b", "c", "d"].map((id) => ({ id, model: "think-fast", start: "boot", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: ["FIRST_TRUCK_EXIT"] }));
    const viewer = await startViewer({ runsRoot: paths.runsRoot, staticDir: join(root, "static"), appDir: join(root, "app"), port: 0, now: () => new Date(now), experiments: { paths, source: { recent: () => { calls += 1; if (fail) throw new Error("runs unreadable"); return recent; }, trial: () => null } } });
    open.push(viewer);
    const first = await call(viewer, "/api/experiments");
    expect(first.status).toBe(200);
    expect((JSON.parse(first.body) as { queue: { id: string; state: string }[] }).queue.map((v) => [v.id, v.state])).toEqual([["full-map", "draft"]]);
    await call(viewer, "/api/experiments");
    expect(calls).toBe(1);
    now = 10_000;
    fail = true;
    expect((await call(viewer, "/api/experiments")).status).toBe(500);
    fail = false;
    expect((await call(viewer, "/api/experiments")).status).toBe(200);
    expect(calls).toBe(3);
    expect((await call(viewer, "/api/experiments", "POST")).status).toBe(404);
    expect((await call(viewer, "/api/experiments", "PUT")).status).toBe(404);
  });

  it("reads experiments/ beside the runs directory by default", async () => {
    const root = mkdtempSync(join(tmpdir(), "pokebench-srv-eq-default-"));
    mkdirSync(join(root, "runs"), { recursive: true });
    writeDefinition(join(root, "experiments"), definition("solo", { queuePosition: undefined }));
    writeFileSync(join(root, "experiments", "broken.json"), "{");
    const viewer = await startViewer({ runsRoot: join(root, "runs"), staticDir: join(root, "static"), appDir: join(root, "app"), port: 0 });
    open.push(viewer);
    const body = JSON.parse((await call(viewer, "/api/experiments")).body) as { pending: { id: string }[]; problems: string[] };
    expect(body.pending.map((v) => v.id)).toEqual(["solo"]);
    expect(body.problems[0]).toMatch(/^broken.json: /);
  });
});
