import { describe, expect, it } from "vitest";
import { fixedTreeDir, fixedTreeLiveJs, prepareFixedTree, type FixedTreeDeps } from "./fixed-tree.js";

const COMMIT = "f3f4b3b7".padEnd(40, "0");
const ROOT = "/repo";
const TREE = fixedTreeDir(COMMIT);
const STAMP = `${TREE}/.fixed-tree`;
const LIVE = fixedTreeLiveJs(TREE);
const TREE_PY = `${TREE}/env/.venv/bin/python`;

interface Fake { deps: FixedTreeDeps; calls: string[]; files: Map<string, string>; dirs: Set<string> }

function fake(over: { head?: string; status?: string; exec?: (cmd: string, args: readonly string[]) => string | null; sources?: string | null; worktreeFails?: boolean; rootMgba?: string | null; treeSite?: string | null } = {}): Fake {
  const calls: string[] = [];
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const deps: FixedTreeDeps = {
    root: ROOT,
    node: "/bin/node",
    git: (cwd, args) => {
      calls.push(`git ${cwd} ${args.join(" ")}`);
      if (args[0] === "worktree") {
        if (over.worktreeFails === true) throw new Error("fatal: invalid reference");
        dirs.add(TREE);
        return "";
      }
      if (args[0] === "rev-parse") return `${over.head ?? COMMIT}\n`;
      if (args[0] === "status") return over.status ?? "";
      return "";
    },
    exec: (cmd, args, cwd) => {
      calls.push(`exec ${cwd} ${cmd} ${args.join(" ")}`);
      const result = over.exec?.(cmd, args) ?? null;
      if (result === null && args.includes("tsconfig.build.json")) files.set(LIVE, "built");
      if (result === null && cmd === "uv") dirs.add(`${TREE}/env/.venv`);
      return Promise.resolve(result);
    },
    exists: (path) => files.has(path) || dirs.has(path) || (path === TREE_PY && dirs.has(`${TREE}/env/.venv`)),
    read: (path) => files.get(path) ?? null,
    write: (path, text) => { files.set(path, text); },
    copyDir: (from, to) => { calls.push(`copy ${from} ${to}`); },
    sources: () => (over.sources === undefined ? "src-hash" : over.sources),
    sitePackages: (venv) => (venv === `${ROOT}/env/.venv` ? (over.rootMgba === undefined ? `${ROOT}/env/.venv/lib/python3.12/site-packages` : over.rootMgba) : (over.treeSite === undefined ? `${venv}/lib/python3.12/site-packages` : over.treeSite)),
  };
  return { deps, calls, files, dirs };
}

describe("fixed-run experiment checkout", () => {
  it("lives outside the main checkout, one per pinned commit", () => {
    expect(fixedTreeDir(COMMIT)).toBe(`/private/tmp/pokebench-fixed-${COMMIT.slice(0, 12)}`);
    expect(fixedTreeLiveJs("/t")).toBe("/t/packages/agent/dist/live.js");
  });

  it("creates a detached checkout at the pinned commit, installs, links the native mGBA binding, builds the agent and stamps it", async () => {
    const f = fake();
    expect(await prepareFixedTree(f.deps, COMMIT)).toBeNull();
    expect(f.calls).toEqual([
      `git ${ROOT} worktree add --detach ${TREE} ${COMMIT}`,
      `git ${TREE} rev-parse HEAD`,
      `git ${TREE} status --porcelain --untracked-files=no`,
      `git ${TREE} submodule update --init`,
      `exec ${TREE} pnpm install --frozen-lockfile`,
      `exec ${TREE}/env uv sync --frozen`,
      `copy ${ROOT}/env/.venv/lib/python3.12/site-packages/mgba ${TREE}/env/.venv/lib/python3.12/site-packages/mgba`,
      `exec ${TREE}/env ${TREE_PY} -c import mgba.core`,
      `exec ${TREE}/packages/agent /bin/node ${TREE}/packages/agent/node_modules/typescript/bin/tsc -p tsconfig.build.json --noEmitOnError`,
    ]);
    expect(f.files.get(STAMP)).toBe(`${COMMIT} src-hash\n`);
  });

  it("reuses a stamped checkout without rebuilding, so trials never wait on a build", async () => {
    const f = fake();
    f.dirs.add(TREE); f.dirs.add(`${TREE}/env/.venv`); f.files.set(LIVE, "built"); f.files.set(STAMP, `${COMMIT} src-hash\n`);
    expect(await prepareFixedTree(f.deps, COMMIT)).toBeNull();
    expect(f.calls).toEqual([`git ${TREE} rev-parse HEAD`, `git ${TREE} status --porcelain --untracked-files=no`]);
  });

  it("rebuilds when the stamp names other sources or the build output is gone", async () => {
    for (const setup of [(f: Fake) => { f.files.set(LIVE, "built"); f.files.set(STAMP, `${COMMIT} other\n`); }, (f: Fake) => { f.files.set(STAMP, `${COMMIT} src-hash\n`); }]) {
      const f = fake();
      f.dirs.add(TREE); setup(f);
      expect(await prepareFixedTree(f.deps, COMMIT)).toBeNull();
      expect(f.calls.some(c => c.includes("tsconfig.build.json"))).toBe(true);
      expect(f.calls.some(c => c.includes("worktree add"))).toBe(false);
    }
  });

  it("refuses a checkout that moved off the pinned commit or has changes, instead of repairing it", async () => {
    const moved = fake({ head: "a".repeat(40) });
    moved.dirs.add(TREE);
    expect(await prepareFixedTree(moved.deps, COMMIT)).toBe(`the experiment checkout ${TREE} is at aaaaaaa, not the pinned ${COMMIT.slice(0, 7)}`);
    const dirty = fake({ status: " M packages/agent/src/live.ts\n" });
    dirty.dirs.add(TREE);
    expect(await prepareFixedTree(dirty.deps, COMMIT)).toBe(`the experiment checkout ${TREE} has uncommitted changes`);
  });

  it("names the failing step", async () => {
    expect(await prepareFixedTree(fake({ sources: null }).deps, COMMIT)).toBe(`the main checkout does not have the pinned commit ${COMMIT.slice(0, 7)}`);
    expect(await prepareFixedTree(fake({ worktreeFails: true }).deps, COMMIT)).toBe(`cannot create the experiment checkout ${TREE}: fatal: invalid reference`);
    expect(await prepareFixedTree(fake({ exec: (cmd) => (cmd === "pnpm" ? "ERR_PNPM_OFFLINE" : null) }).deps, COMMIT)).toBe("pnpm install failed in the experiment checkout: ERR_PNPM_OFFLINE");
    expect(await prepareFixedTree(fake({ exec: (cmd) => (cmd === "uv" ? "no network" : null) }).deps, COMMIT)).toBe("uv sync failed in the experiment checkout: no network");
    expect(await prepareFixedTree(fake({ rootMgba: null }).deps, COMMIT)).toBe(`the main checkout's env/.venv has no site-packages; run \`just build-mgba\` there first`);
    expect(await prepareFixedTree(fake({ treeSite: null }).deps, COMMIT)).toBe("uv sync left the experiment checkout without env/.venv site-packages");
    expect(await prepareFixedTree(fake({ exec: (_cmd, args) => (args.includes("import mgba.core") ? "ModuleNotFoundError" : null) }).deps, COMMIT)).toBe("the experiment checkout cannot import mgba.core: ModuleNotFoundError");
    expect(await prepareFixedTree(fake({ exec: (_cmd, args) => (args.includes("tsconfig.build.json") ? "TS2345" : null) }).deps, COMMIT)).toBe("the agent build failed in the experiment checkout: TS2345");
  });

  it("refuses a build that produced no live.js and never stamps it", async () => {
    const f = fake();
    f.deps = { ...f.deps, exec: (cmd, args, cwd) => { f.calls.push(`exec ${cwd} ${cmd} ${args.join(" ")}`); if (cmd === "uv") f.dirs.add(`${TREE}/env/.venv`); return Promise.resolve(null); } };
    expect(await prepareFixedTree(f.deps, COMMIT)).toBe("the agent build produced no packages/agent/dist/live.js in the experiment checkout");
    expect(f.files.has(STAMP)).toBe(false);
  });
});
