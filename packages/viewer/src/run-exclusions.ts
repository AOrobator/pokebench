import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { isMain } from "@pokebench/agent/is-main";
// Operator rule (2026-10-27): an aborted or stopped run is not an exclusion. A run leaves results only
// when the operator records an exclusion with a reason, in runs/exclusions/<run-id>.json; run logs are never edited.
export const EXCLUSIONS_DIR = "exclusions";
const RUN_ID = new RegExp(RUN_ID_PATTERN);
interface ExclusionRecord { readonly version: 1; readonly run: string; readonly reason: string; readonly by: string; readonly at: string }
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
export const exclusionLabel = (reason: string): string => `Operator exclusion: ${reason}`;

export function readExclusions(root: string): { exclusions: Map<string, string>; problems: string[] } {
  const exclusions = new Map<string, string>(), problems: string[] = [], dir = join(root, EXCLUSIONS_DIR);
  if (!existsSync(dir)) return { exclusions, problems };
  for (const name of readdirSync(dir).filter(n => n.endsWith(".json")).sort()) {
    const path = join(dir, name);
    try {
      if (!lstatSync(path).isFile()) throw new Error("is not a regular file");
      const value: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (typeof value !== "object" || value === null) throw new Error("is not an exclusion record");
      const r = value as Partial<Record<keyof ExclusionRecord, unknown>>;
      if (r.version !== 1 || !text(r.run) || `${r.run}.json` !== name) throw new Error("does not name its own run");
      if (!text(r.reason)) throw new Error("has no reason");
      if (!text(r.by) || !text(r.at)) throw new Error("does not record who excluded it and when");
      exclusions.set(r.run, r.reason.trim());
    } catch (error) { problems.push(`Run exclusion ${name} ${error instanceof SyntaxError ? "is not valid JSON" : (error as Error).message}; the run stays in results`); }
  }
  return { exclusions, problems };
}

export function writeExclusion(root: string, run: string, reason: string, by: string, now: Date): string {
  if (!RUN_ID.test(run) || run.includes("..")) throw new Error(`not a run id: ${JSON.stringify(run)}`);
  if (!text(reason)) throw new Error("an exclusion needs a reason");
  if (!text(by)) throw new Error("an exclusion needs the operator's name");
  if (!existsSync(join(root, run, "events.jsonl")) && !existsSync(join(root, "human", run, "events.jsonl"))) throw new Error(`no recorded run ${run}`);
  const dir = join(root, EXCLUSIONS_DIR), path = join(dir, `${run}.json`);
  if (existsSync(path)) throw new Error(`${run} is already excluded (${path})`);
  mkdirSync(dir, { recursive: true });
  const record: ExclusionRecord = { version: 1, run, reason: reason.trim(), by: by.trim(), at: now.toISOString() };
  writeFileSync(path, `${JSON.stringify(record)}\n`, { flag: "wx" });
  return path;
}

export interface ExclusionIo { readonly out: (line: string) => void; readonly err: (line: string) => void; readonly now: () => Date }
export function main(argv: readonly string[], root: string, io: ExclusionIo): number {
  const [run, by, ...words] = argv;
  if (run === undefined || by === undefined || words.length === 0) { io.err("usage: exclude-run <run-id> <operator> <reason…>"); return 2; }
  try {
    const reason = words.join(" ");
    io.out(`excluded ${run}: ${reason} (${writeExclusion(root, run, reason, by, io.now())})`);
    return 0;
  } catch (error) { io.err((error as Error).message); return 1; }
}

/* v8 ignore start -- process wiring */
if (isMain(import.meta)) {
  const { execFileSync } = await import("node:child_process"), { mainCheckout } = await import("./fixed-source.js");
  const here = fileURLToPath(new URL(".", import.meta.url));
  const root = process.env.POKEBENCH_RUNS_ROOT ?? join(mainCheckout(here, (cwd, args) => execFileSync("git", [...args], { cwd, encoding: "utf8" })), "runs");
  process.exitCode = main(process.argv.slice(2), root, { out: l => { console.log(l); }, err: l => { console.error(l); }, now: () => new Date() });
}
/* v8 ignore stop */
