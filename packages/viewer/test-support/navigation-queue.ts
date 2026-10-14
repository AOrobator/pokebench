export function navigationFixture(repoRoot = "/repo") {
  const digest = "a".repeat(64), source = "b".repeat(40), order = ["off", "on", "on", "off", "on", "off", "off", "on"];
  const manifest = { version: 1, id: "navigation-memory-think-fast-n4", root: repoRoot, source, model: { id: "lane" }, order, presets: { off: { version: 2, id: "off", features: { "navigation-evidence-memory-v1": false } }, on: { version: 2, id: "on", features: { "navigation-evidence-memory-v1": true } } }, expected_harness_features: { off: [], on: ["navigation-evidence-memory-v1"] } };
  const row = { at: "2026-10-14T16:00:00Z", manifest_sha256: digest, type: "launch", trial: 1, arm: "off", run: "real_run", pid: 42, viewer: "http://127.0.0.1:8793/#run=real_run" };
  const queue = { status: "running", total: 8, completed: 0, trial: 1, arm: "off", run: "real_run", remaining: order.slice(1), pid: 42 };
  const owner = { pid: 42, cohort: manifest.id, source, manifest_sha256: digest };
  const process = { ...row, type: "process_outcome", code: 0, signal: null };
  const outcome = { ...row, type: "outcome", reason: "budget", turns: 1500, events_sha256: digest, system_prompt_sha256: digest, memory_context_count: 0, destination_writes: 0, milestones: [], warnings: [] };
  return { manifest, row, queue, owner, digest, process, outcome };
}
