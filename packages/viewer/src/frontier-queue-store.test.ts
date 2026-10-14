import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { navigationFixture } from "../test-support/navigation-queue.js";
import { Log, START } from "../test-support/events.js";
import { workbenchSnapshot } from "./workbench-store.js";
import { parseWorkbench } from "./workbench-data.js";
function setup() {
  const repo = mkdtempSync(join(tmpdir(), "frontier-queue-store-")), root = join(repo, "runs"), folder = join(root, "launch-receipts", "navigation-memory-think-fast-n4"); mkdirSync(folder, { recursive: true });
  const f = navigationFixture(repo), manifestBytes = JSON.stringify(f.manifest), digest = createHash("sha256").update(manifestBytes).digest("hex");
  writeFileSync(join(folder, "manifest.json"), manifestBytes);
  const rows = (values: object[]) => { writeFileSync(join(folder, "trials.jsonl"), values.map(row => JSON.stringify({ ...row, manifest_sha256: digest })).join("\n") + "\n"); };
  return { root, folder, f, rows, digest };
}
it("discovers the real eight-position format without fabricating 24 trial rows and binds actual source/model", async () => {
  const { root, folder, f, rows, digest } = setup(); rows([f.row]);
  mkdirSync(join(root, ".naming-gameplay.lock")); writeFileSync(join(root, ".naming-gameplay.lock", "owner.json"), JSON.stringify({ ...f.owner, manifest_sha256: digest, pid: process.pid })); writeFileSync(join(folder, "queue.json"), JSON.stringify({ ...f.queue, pid: process.pid }));
  const run = new Log(); run.add(0, { ...START, model: { ...START.model, id: f.manifest.model.id }, harness: { ...START.harness, commit: f.manifest.source } }); mkdirSync(join(root, "real_run")); writeFileSync(join(root, "real_run", "events.jsonl"), run.events.map(e => JSON.stringify({ ...e, run: "real_run" })).join("\n") + "\n");
  const data = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(true), { state: "idle" }, Date.now()));
  expect(data.queue).toHaveLength(8); expect(data.queue[0]).toMatchObject({ id: "real_run", status: "running", arm: "off" }); expect(data.queue.slice(1).every(q => q.status === "queued" && q.id.includes(":trial-"))).toBe(true); expect(data.runs[0]?.cohort).toBe(f.manifest.id);
  rows([f.row, f.process, f.outcome]); const completed = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now())); expect(completed.queue[0]?.status).toBe("completed"); expect(completed.queue.slice(1).every(q => q.status === "withheld")).toBe(true);
  writeFileSync(join(root, "real_run", "events.jsonl"), readFileSync(join(root, "real_run", "events.jsonl"), "utf8").replace(f.manifest.source, "c".repeat(40)));
  const mismatch = await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now()); expect(mismatch.runs[0]?.cohort).toBeNull(); expect(mismatch.problems.join()).toContain("source/model");
});
it("keeps frozen unlaunched slots withheld, rejects late-invalid ledgers atomically and surfaces malformed receipts", async () => {
  const { root, folder, f, rows } = setup();
  const planned = await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now()); expect(planned.queue).toHaveLength(8); expect(planned.queue.every(q => q.status === "withheld")).toBe(true);
  rows([f.row, f.process, { ...f.outcome, events_sha256: null }]); const invalid = await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now()); expect(invalid.queue).toEqual([]); expect(invalid.problems.join()).toContain("outcome");
  writeFileSync(join(folder, "trials.jsonl"), "bad"); expect((await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now())).problems.length).toBe(1);
});

it("qualifies a frozen execution checkout only when its runs directory resolves to this viewer root", async () => {
  const { root, folder, f } = setup();
  const checkout = mkdtempSync(join(tmpdir(), "frontier-frozen-"));
  symlinkSync(root, join(checkout, "runs"));
  const manifest = { ...f.manifest, root: checkout };
  writeFileSync(join(folder, "manifest.json"), JSON.stringify(manifest));
  const accepted = await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now());
  expect(accepted.queue).toHaveLength(8); expect(accepted.problems).toEqual([]);
  const unrelated = mkdtempSync(join(tmpdir(), "frontier-unrelated-")); mkdirSync(join(unrelated, "runs"));
  writeFileSync(join(folder, "manifest.json"), JSON.stringify({ ...manifest, root: unrelated }));
  const rejected = await workbenchSnapshot(root, () => Promise.resolve(false), { state: "idle" }, Date.now());
  expect(rejected.queue).toEqual([]); expect(rejected.problems.join()).toContain("root");
});
