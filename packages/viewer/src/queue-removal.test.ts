import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("removes experiment controls and navigation from both viewer surfaces", () => {
  for (const name of ["index", "workbench"]) {
    const html = readFileSync(new URL(`../static/${name}.html`, import.meta.url), "utf8");
    expect(html).not.toMatch(/experiment|data-wb="cohort"|data-page="queue"/i);
  }
});
it("never starts or polls the removed queue", () => {
  for (const name of ["cli", "app", "workbench", "server"]) {
    const source = readFileSync(new URL(`./${name}.ts`, import.meta.url), "utf8");
    expect(source).not.toMatch(/ExperimentAutoRun|QueuePanel|queueSnapshot|queueApi|\/api\/experiments/);
  }
});

it("returns no experiment API and exposes only hardware locations for fixed-run cards", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { startViewer } = await import("./server.js");
  const root = mkdtempSync(join(tmpdir(), "queue-removed-"));
  const dir = join(root, "experiments", "historical-fixed");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "status.json"), JSON.stringify({ kind: "fixed-run", version: 1, experiment: "historical-fixed", title: "Recorded comparison", definitionSha256: "a".repeat(64), pid: process.pid, updatedAt: "2026-10-22T00:00:00Z", state: "running", total: 2, valid: 0, invalid: 0, invalidTrials: [], reserve: { usedMs: 0, totalMs: 0 }, lanes: [{ id: "A", gpu: "GPU1", port: 8071, state: "running", reason: "playing", slot: 0, arm: "control", phase: "screen", run: "recorded-run", since: "2026-10-22T00:00:00Z", retryAt: null, lastError: null, valid: 0, total: 2 }], lastError: null }));
  const viewer = await startViewer({ runsRoot: root, port: 0, staticDir: new URL("../static/", import.meta.url).pathname, appDir: root });
  try {
    expect((await fetch(`${viewer.url}api/experiments`)).status).toBe(404);
    for (const action of ["approve", "revoke", "finals-withdraw", "finals-resume"]) {
      expect((await fetch(`${viewer.url}api/experiments/old/${action}`, { method: "POST", headers: { origin: viewer.url.slice(0, -1), "content-type": "application/json" }, body: "{}" })).status).toBe(404);
    }
    expect(await (await fetch(`${viewer.url}api/run-lanes`)).json()).toEqual([{ run: "recorded-run", lane: "A", gpu: "GPU1" }]);
  } finally { await viewer.close(); rmSync(root, { recursive: true, force: true }); }
});
