import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { navigationFixture } from "../test-support/navigation-queue.js";
import { Log, START } from "../test-support/events.js";
import { workbenchSnapshot } from "./workbench-store.js";
import { frontierReferences, milestoneStatus } from "./frontier.js";
import { parseWorkbench } from "./workbench-data.js";
function setup() {
  const repo = mkdtempSync(join(tmpdir(), "frontier-queue-store-")), root = join(repo, "runs"), folder = join(root, "launch-receipts", "navigation-memory-think-fast-n4"); mkdirSync(folder, { recursive: true });
  const f = navigationFixture(repo), manifestBytes = JSON.stringify(f.manifest), digest = createHash("sha256").update(manifestBytes).digest("hex");
  writeFileSync(join(folder, "manifest.json"), manifestBytes);
  const rows = (values: object[]) => { writeFileSync(join(folder, "trials.jsonl"), values.map(row => JSON.stringify({ ...row, manifest_sha256: digest })).join("\n") + "\n"); };
  return { root, folder, f, rows, digest };
}
function writeRun(root: string, f: ReturnType<typeof navigationFixture>): void {
  const run = new Log(); run.add(0, { ...START, model: { ...START.model, id: f.manifest.model.id }, harness: { ...START.harness, commit: f.manifest.source } });
  mkdirSync(join(root, "real_run")); writeFileSync(join(root, "real_run", "events.jsonl"), run.events.map(e => JSON.stringify({ ...e, run: "real_run" })).join("\n") + "\n");
}
it("discovers the real eight-position format without fabricating 24 trial rows and binds actual source/model", async () => {
  const { root, f, rows } = setup(); rows([f.row]);
  const run = new Log(); run.add(0, { ...START, model: { ...START.model, id: f.manifest.model.id }, harness: { ...START.harness, commit: f.manifest.source } }); mkdirSync(join(root, "real_run")); writeFileSync(join(root, "real_run", "events.jsonl"), run.events.map(e => JSON.stringify({ ...e, run: "real_run" })).join("\n") + "\n");
  const data = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(true), Date.now()));
  expect(data.problems).toEqual([]); expect(data.runs[0]?.cohort).toBe(f.manifest.id);
  rows([f.row, f.process, f.outcome]); const completed = parseWorkbench(await workbenchSnapshot(root, () => Promise.resolve(false), Date.now())); expect(completed.runs[0]).toMatchObject({ cohort: f.manifest.id, excluded: null });
  writeFileSync(join(root, "real_run", "events.jsonl"), readFileSync(join(root, "real_run", "events.jsonl"), "utf8").replace(f.manifest.source, "c".repeat(40)));
  const mismatch = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now()); expect(mismatch.runs[0]?.cohort).toBeNull(); expect(mismatch.problems.join()).toContain("source/model");
});
it("accepts a frozen unlaunched plan, rejects late-invalid ledgers atomically and surfaces malformed receipts", async () => {
  const { root, folder, f, rows } = setup(); writeRun(root, f);
  const planned = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now()); expect(planned.problems).toEqual([]); expect(planned.runs[0]?.cohort).toBeNull();
  rows([f.row, f.process, { ...f.outcome, events_sha256: null }]); const invalid = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now()); expect(invalid.problems.join()).toContain("outcome"); expect(invalid.runs[0]?.cohort).toBeNull();
  writeFileSync(join(folder, "trials.jsonl"), "bad"); expect((await workbenchSnapshot(root, () => Promise.resolve(false), Date.now())).problems.length).toBe(1);
});

it("qualifies a frozen execution checkout only when its runs directory resolves to this viewer root", async () => {
  const { root, folder, f } = setup(); writeRun(root, f);
  const checkout = mkdtempSync(join(tmpdir(), "frontier-frozen-"));
  symlinkSync(root, join(checkout, "runs"));
  const manifest = { ...f.manifest, root: checkout };
  const bytes = JSON.stringify(manifest), digest = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(folder, "manifest.json"), bytes); writeFileSync(join(folder, "trials.jsonl"), JSON.stringify({ ...f.row, manifest_sha256: digest }) + "\n");
  const accepted = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now());
  expect(accepted.problems).toEqual([]); expect(accepted.runs[0]?.cohort).toBe(f.manifest.id);
  const unrelated = mkdtempSync(join(tmpdir(), "frontier-unrelated-")); mkdirSync(join(unrelated, "runs"));
  writeFileSync(join(folder, "manifest.json"), JSON.stringify({ ...manifest, root: unrelated }));
  const rejected = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now());
  expect(rejected.problems.join()).toContain("root"); expect(rejected.runs[0]?.cohort).toBeNull();
  const incomplete = mkdtempSync(join(tmpdir(), "frontier-incomplete-"));
  writeFileSync(join(folder, "manifest.json"), JSON.stringify({ ...manifest, root: incomplete }));
  const missingRuns = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now());
  expect(missingRuns.problems.join()).toContain("root"); expect(missingRuns.runs[0]?.cohort).toBeNull();
});

it("keeps a retained navigation receipt after its execution checkout is archived", async () => {
  const { root, folder, f } = setup(); writeRun(root, f);
  const archived = join(mkdtempSync(join(tmpdir(), "archived-navigation-parent-")), "removed-checkout");
  const manifest = { ...f.manifest, root: archived };
  const bytes = JSON.stringify(manifest), digest = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(folder, "manifest.json"), bytes);
  writeFileSync(join(folder, "trials.jsonl"), JSON.stringify({ ...f.row, manifest_sha256: digest }) + "\n");
  const retained = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now());
  expect(retained.problems).toEqual([]);
  expect(retained.runs[0]?.cohort).toBe(f.manifest.id);
  writeFileSync(join(root, "real_run", "events.jsonl"), readFileSync(join(root, "real_run", "events.jsonl"), "utf8").replace(f.manifest.model.id, "different-model"));
  const mismatchedModel = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now());
  expect(mismatchedModel.problems.join()).toContain("source/model");
  expect(mismatchedModel.runs[0]?.cohort).toBeNull();
});

it("rejects an empty execution root and filesystem failures other than a missing checkout", async () => {
  const { root, folder, f } = setup(); writeRun(root, f);
  for (const receiptRoot of ["", join("/", "a".repeat(10_000))]) {
    const manifest = { ...f.manifest, root: receiptRoot };
    const bytes = JSON.stringify(manifest), digest = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(folder, "manifest.json"), bytes);
    writeFileSync(join(folder, "trials.jsonl"), JSON.stringify({ ...f.row, manifest_sha256: digest }) + "\n");
    const rejected = await workbenchSnapshot(root, () => Promise.resolve(false), Date.now());
    expect(rejected.problems.join()).toContain("root");
    expect(rejected.runs[0]?.cohort).toBeNull();
  }
});

it("retains process-failed recordings as outcomes but excludes them from best-run rank and timing credit", async () => {
 const { root, f, rows }=setup();
 rows([f.row,{...f.process,code:1},{...f.row,type:"launcher_error",error:"child exit 1"}]);
 const reference: {agent:{events:unknown[]}}=JSON.parse(readFileSync(join(import.meta.dirname,"../test-support/frontier-reference.json"),"utf8")) as {agent:{events:unknown[]}};
 const events=reference.agent.events.map(raw=>{
  const event=raw as Record<string,unknown>;
  return event.type==="run_start"?{...event,run:"real_run",harness:{...(event.harness as Record<string,unknown>),commit:f.manifest.source},model:{...(event.model as Record<string,unknown>),id:f.manifest.model.id}}:{...event,run:"real_run"};
 });
 mkdirSync(join(root,"real_run"));writeFileSync(join(root,"real_run/events.jsonl"),events.map(e=>JSON.stringify(e)).join("\n")+"\n");
 const data=await workbenchSnapshot(root,()=>Promise.resolve(false), Date.now());
 expect(data.runs[0]).toMatchObject({id:"real_run",status:"ended",reason:"budget",excluded:"Infrastructure outcome: child exit 1"});
 expect(frontierReferences(data.runs).best).toBeNull();
 expect(data.runs.map(r=>milestoneStatus(r,"RIVAL_MET"))).toEqual(["excluded"]);
 rows([f.row,f.process,f.outcome]);
 const recovered=await workbenchSnapshot(root,()=>Promise.resolve(false), Date.now());
 expect(recovered.runs[0]?.excluded).toBeNull();expect(frontierReferences(recovered.runs).best?.id).toBe("real_run");
});
