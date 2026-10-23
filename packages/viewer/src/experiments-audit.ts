import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
// Completeness check for recorded comparison provenance: every run whose run_start names an experiment
// (evaluation.experiment) must have an internal cohort mapping.
export interface AuditFinding { readonly run: string; readonly experiment: string; readonly problem: string }
export interface AuditRuns { readonly runs: readonly { readonly id: string; readonly cohort: string | null; readonly problem: string | null }[] }
const CHUNK = 64 * 1024, MAX_FIRST_LINE = 16 * 1024 * 1024, chunk = Buffer.alloc(CHUNK);
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
// The first line only, read in small chunks through one reused buffer.
function firstLine(path: string): string {
  const fd = openSync(path, "r"), parts: Buffer[] = [];
  try {
    for (let at = 0; at < MAX_FIRST_LINE;) {
      const read = readSync(fd, chunk, 0, CHUNK, at); if (read === 0) break;
      const cut = chunk.subarray(0, read).indexOf(0x0a);
      parts.push(Buffer.from(chunk.subarray(0, cut < 0 ? read : cut))); if (cut >= 0) break;
      at += read;
    }
  } finally { closeSync(fd); }
  return Buffer.concat(parts).toString("utf8");
}
// The experiment id a run's own first line names, read without the viewer's schema so a run the
// viewer cannot parse is still found.
function namedExperiment(path: string): string | null {
  let start: unknown;
  try { start = JSON.parse(firstLine(path)); } catch { return null; }
  if (!record(start) || start.type !== "run_start" || !record(start.evaluation) || !record(start.evaluation.experiment)) return null;
  const id = start.evaluation.experiment.id;
  return typeof id === "string" && id !== "" ? id : null;
}
export function experimentsAudit(runsRoot: string, data: AuditRuns): AuditFinding[] {
  const findings: AuditFinding[] = [], byId = new Map(data.runs.map(r => [r.id, r]));
  for (const base of [runsRoot, join(runsRoot, "human")]) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      const path = join(base, entry.name, "events.jsonl");
      if (!entry.isDirectory() || !existsSync(path)) continue;
      const experiment = namedExperiment(path); if (experiment === null) continue;
      const run = byId.get(entry.name);
      if (run === undefined) findings.push({ run: entry.name, experiment, problem: "not in the workbench snapshot" });
      else if (run.cohort === null) findings.push({ run: entry.name, experiment, problem: `in no result provenance cohort${run.problem === null ? "" : ` (${run.problem})`}` });
    }
  }
  return findings.sort((a, b) => a.run.localeCompare(b.run));
}
export interface AuditDeps { readonly runsRoot: string; snapshot(runsRoot: string): Promise<AuditRuns>; out(line: string): void; err(line: string): void }
// Prints nothing and returns 0 when every tagged run is in a cohort; one line per finding and 1 otherwise.
export async function auditMain(argv: readonly string[], deps: AuditDeps): Promise<number> {
  if (argv.length > 1) { deps.err("usage: experiments-audit [runs-root]"); return 2; }
  const root = argv[0] ?? deps.runsRoot;
  let findings: AuditFinding[];
  try { findings = experimentsAudit(root, await deps.snapshot(root)); } catch (error) { deps.err(`experiments-audit: ${error instanceof Error ? error.message : String(error)}`); return 2; }
  for (const f of findings) deps.out(`${f.run}\t${f.experiment}\t${f.problem}`);
  if (findings.length === 0) return 0;
  deps.err(`experiments-audit: ${String(findings.length)} tagged run${findings.length === 1 ? " is" : "s are"} in no result provenance cohort`);
  return 1;
}
/* v8 ignore start -- process wiring */
if (import.meta.main) {
  const { cohortIndex } = await import("./workbench-store.js"), { mainCheckout } = await import("./fixed-source.js");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const runsRoot = join(mainCheckout(here, (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" })), "runs");
  process.exitCode = await auditMain(process.argv.slice(2), { runsRoot, snapshot: root => cohortIndex(root), out: line => { console.log(line); }, err: line => { console.error(line); } });
}
/* v8 ignore stop */
