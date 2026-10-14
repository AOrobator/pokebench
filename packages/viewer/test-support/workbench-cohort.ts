import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { counterbalancedTrials, sha256, type ComparisonManifest } from "@pokebench/agent/serial-comparison";
export function cohort(root: string, rows: readonly Record<string, unknown>[] = [], id = "cohort"): { manifest: ComparisonManifest; path: string; ledger: string; digest: string } {
  const repoRoot = dirname(root);
  const artifact = { path: join(root, "receipt.json"), sha256: "a".repeat(64) };
  const manifest: ComparisonManifest = { version: 1, id, repoRoot, sourceCommit: "a".repeat(40), build: { path: join(repoRoot, "packages/agent/dist/live.js"), sha256: "a".repeat(64), treeSha256: "a".repeat(64) }, presets: { diagnostic: artifact, enforced: artifact }, lanes: ["alpha", "beta", "gamma"].map(id => ({ id, model: id, gatewayUrl: "http://localhost/v1", endpointFile: null, serving: artifact, environment: artifact, imageTool: artifact, configurationSha256: "a".repeat(64) })), criteria: { completionLossTolerance: 0, medianSpeedGain: 0.1 }, trials: counterbalancedTrials(id, ["alpha", "beta", "gamma"]) };
  const folder = join(root, "launch-receipts/prep", id); mkdirSync(folder, { recursive: true }); const path = join(folder, "manifest.json"); writeFileSync(path, JSON.stringify(manifest));
  const dir = join(root, "launch-receipts", id); mkdirSync(dir, { recursive: true }); const ledger = join(dir, "trials.jsonl"), digest = sha256(JSON.stringify(manifest));
  writeFileSync(ledger, rows.map((row, index) => JSON.stringify({ manifestSha256: digest, at: new Date(1_800_000_000_000 + index * 1000).toISOString(), ...(row.type === "outcome" ? { eventsSha256: row.exitCode === 0 ? "a".repeat(64) : null } : {}), ...row })).join("\n") + "\n");
  return { manifest, path, ledger, digest };
}
