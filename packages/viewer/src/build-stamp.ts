// The viewer's own build (dist/build-stamp.json, written after tsc) and the version skew between it
// and a run's harness build. A run recorded by a newer harness can carry event fields this viewer's
// schema does not know; that is a stale viewer, not a corrupt run.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface BuildIdentity { readonly commit: string; readonly dirty: boolean }
export type BuildRelation = "older" | "newer" | "unknown";
// relation(run) says how this viewer's commit relates to a run's commit.
export interface ViewerBuild extends BuildIdentity { readonly relation: (run: string) => BuildRelation }

const COMMIT = /^[0-9a-f]{40}$/;
const STAMP = "build-stamp.json";
const short = (commit: string): string => commit.slice(0, 7);

export function writeBuildStamp(dir: string, git: (args: readonly string[]) => string): BuildIdentity {
  const commit = git(["rev-parse", "HEAD"]).trim();
  if (!COMMIT.test(commit)) throw new Error(`git did not name a commit: ${JSON.stringify(commit)}`);
  const stamp = { commit, dirty: git(["status", "--porcelain"]).trim() !== "" };
  writeFileSync(join(dir, STAMP), `${JSON.stringify(stamp)}\n`);
  return stamp;
}

export function readBuildStamp(path: string): BuildIdentity | null {
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof value !== "object" || value === null) return null;
    const { commit, dirty } = value as Record<string, unknown>;
    return typeof commit === "string" && COMMIT.test(commit) && typeof dirty === "boolean" ? { commit, dirty } : null;
  } catch {
    return null;
  }
}

// Ancestry from the viewer's own git tree (a worktree shares the repository's objects), one git call per run commit.
export function gitRelation(cwd: string, viewer: string): (run: string) => BuildRelation {
  const known = new Map<string, BuildRelation>();
  const ancestor = (a: string, b: string): boolean => {
    try { execFileSync("git", ["merge-base", "--is-ancestor", a, b], { cwd, stdio: "ignore" }); return true; } catch { return false; }
  };
  return (run) => {
    let relation = known.get(run);
    if (relation === undefined) {
      relation = ancestor(viewer, run) ? "older" : ancestor(run, viewer) ? "newer" : "unknown";
      known.set(run, relation);
    }
    return relation;
  };
}

export function viewerBuildAt(stampPath: string): ViewerBuild | null {
  const stamp = readBuildStamp(stampPath);
  return stamp === null ? null : { ...stamp, relation: gitRelation(dirname(stampPath), stamp.commit) };
}

// The stamp beside this module: dist/build-stamp.json in a built viewer; absent when running from source.
export function defaultViewerBuild(): ViewerBuild | null {
  return viewerBuildAt(fileURLToPath(new URL(`./${STAMP}`, import.meta.url)));
}

// describe: startless when the run's run_start was among the skipped events, so the run cannot be graded.
export interface Skew { readonly head: string; describe(count: number, first: string, startless?: boolean): string }
// A run is skewed when the viewer knows its own build and the run's build is not contained in it: a
// newer or diverged commit, or the same commit with either side dirty. Null for an unknown viewer
// build, the identical clean build, or a run whose commit is an ancestor of the viewer's: the viewer's
// schema includes everything such a run could write, so its schema failures are integrity failures.
export function skewOf(viewer: ViewerBuild | null, run: BuildIdentity): Skew | null {
  if (viewer === null) return null;
  const relation = viewer.commit === run.commit ? (viewer.dirty || run.dirty ? "same" : null) : viewer.relation(run.commit);
  if (relation === null || relation === "newer") return null;
  const verb = relation === "older" ? "is older than" : relation === "same" ? "is not the same build as" : "differs from";
  const head = `viewer build ${short(viewer.commit)}${viewer.dirty ? " (dirty)" : ""} ${verb} this run's build ${short(run.commit)}${run.dirty ? " (dirty)" : ""}: restart the viewer (just viewer-main)`;
  return { head, describe: (count, first, startless = false) => `${head}.${startless ? " It cannot read this run's run_start, so the run is not graded." : ""} It skipped ${String(count)} event${count === 1 ? "" : "s"} it cannot read; first: ${first}` };
}

if (import.meta.main) {
  const here = dirname(fileURLToPath(import.meta.url));
  const stamp = writeBuildStamp(here, args => execFileSync("git", [...args], { cwd: here, encoding: "utf8" }));
  console.log(`viewer build stamp ${short(stamp.commit)}${stamp.dirty ? " (dirty)" : ""}`);
}
