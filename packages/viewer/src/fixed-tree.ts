// The experiment checkout: every fixed-run trial runs the agent and env from a detached checkout at
// the pinned commit, outside the main checkout, so merges and builds on main never reach a trial.
import { join } from "node:path";

export interface FixedTreeDeps {
  readonly root: string;
  readonly node: string;
  // Throws on a non-zero exit.
  readonly git: (cwd: string, args: readonly string[]) => string;
  // Resolves null on success, otherwise the reason.
  readonly exec: (cmd: string, args: readonly string[], cwd: string) => Promise<string | null>;
  readonly exists: (path: string) => boolean;
  readonly read: (path: string) => string | null;
  readonly write: (path: string, text: string) => void;
  readonly copyDir: (from: string, to: string) => void;
  readonly sources: (commit: string) => string | null;
  // A venv's site-packages directory, or null when it has none.
  readonly sitePackages: (venv: string) => string | null;
}

export function fixedTreeDir(commit: string): string {
  return `/private/tmp/pokebench-fixed-${commit.slice(0, 12)}`;
}

export function fixedTreeLiveJs(tree: string): string {
  return join(tree, "packages", "agent", "dist", "live.js");
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).trim();

export async function prepareFixedTree(d: FixedTreeDeps, commit: string): Promise<string | null> {
  const sources = d.sources(commit);
  if (sources === null) return `the main checkout does not have the pinned commit ${commit.slice(0, 7)}`;
  const tree = fixedTreeDir(commit);
  if (!d.exists(tree)) {
    try {
      d.git(d.root, ["worktree", "add", "--detach", tree, commit]);
    } catch (error) {
      return `cannot create the experiment checkout ${tree}: ${errorText(error)}`;
    }
  }
  const head = d.git(tree, ["rev-parse", "HEAD"]).trim();
  if (head !== commit) return `the experiment checkout ${tree} is at ${head.slice(0, 7)}, not the pinned ${commit.slice(0, 7)}`;
  // A trial records `git status --porcelain` (untracked included) as harness.dirty.
  const changes = d.git(tree, ["status", "--porcelain"]).trim();
  if (changes !== "") return `the experiment checkout ${tree} has changes (trials would record dirty: true): ${changes.split("\n").join(", ")}`;
  // Under the ignored dist/, so the checkout stays clean and trials record dirty: false.
  const stamp = join(tree, "packages", "agent", "dist", ".fixed-tree");
  const expected = `${commit} ${sources}\n`;
  const liveJs = fixedTreeLiveJs(tree);
  const venv = join(tree, "env", ".venv");
  const python = join(venv, "bin", "python");
  if (d.read(stamp) === expected && d.exists(liveJs) && d.exists(python)) return null;

  d.git(tree, ["submodule", "update", "--init"]);
  const installed = await d.exec("pnpm", ["install", "--frozen-lockfile"], tree);
  if (installed !== null) return `pnpm install failed in the experiment checkout: ${installed}`;
  const synced = await d.exec("uv", ["sync", "--frozen"], join(tree, "env"));
  if (synced !== null) return `uv sync failed in the experiment checkout: ${synced}`;
  // The native mGBA binding is built once per clone (`just build-mgba`) and is not in the sources.
  const mainSite = d.sitePackages(join(d.root, "env", ".venv"));
  if (mainSite === null) return "the main checkout's env/.venv has no site-packages; run `just build-mgba` there first";
  const treeSite = d.sitePackages(venv);
  if (treeSite === null) return "uv sync left the experiment checkout without env/.venv site-packages";
  d.copyDir(join(mainSite, "mgba"), join(treeSite, "mgba"));
  const imported = await d.exec(python, ["-c", "import mgba.core"], join(tree, "env"));
  if (imported !== null) return `the experiment checkout cannot import mgba.core: ${imported}`;
  const agent = join(tree, "packages", "agent");
  const built = await d.exec(d.node, [join(agent, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json", "--noEmitOnError"], agent);
  if (built !== null) return `the agent build failed in the experiment checkout: ${built}`;
  if (!d.exists(liveJs)) return "the agent build produced no packages/agent/dist/live.js in the experiment checkout";
  const residue = d.git(tree, ["status", "--porcelain"]).trim();
  if (residue !== "") return `the experiment checkout ${tree} is not clean after preparing it (trials would record dirty: true): ${residue.split("\n").join(", ")}`;
  d.write(stamp, expected);
  return null;
}
