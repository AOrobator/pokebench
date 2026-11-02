// An ordinary run gets the same experiment checkout a fixed trial does: prepared at a pinned commit,
// refused when that checkout is dirty, and executed from there. Builds and post-landing gates on main
// then cannot reach a run in flight, and a run cannot record harness.dirty.
import type {FixedLaunchSpec} from "./fixed-cli.js";
import {fixedLaunchSpec, type FixedHostDeps} from "./fixed-cli.js";
import type {FixedHost} from "./fixed-runner.js";
import {fixedTreeDir, fixedTreeLiveJs} from "./fixed-tree.js";

// Runs under the fixed harness read these from their lane; a plain run carries them in from its own
// environment, and gets a fresh runs root, run id and game-server port.
export const PRESERVED_PLAIN_VARIABLES = ["POKEBENCH_PLAY_PRESET", "POKEBENCH_GATEWAY_URL", "POKEBENCH_MODEL", "POKEBENCH_ENDPOINT_FILE"] as const;

export interface FrozenPlayDeps {
  readonly host: Pick<FixedHost, "verifyBuild">;
  readonly hostDeps: FixedHostDeps;
  readonly spawn: (spec: FixedLaunchSpec) => Promise<number>;
  readonly out: (line: string) => void;
}

export function preservedPlainEnv(env: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const preserved: Record<string, string> = {};
  for (const key of PRESERVED_PLAIN_VARIABLES) {
    const value = env[key];
    if (value !== undefined) preserved[key] = value;
  }
  return preserved;
}

// Returns the run's exit code. Throws only when the checkout cannot be prepared, which is a launch
// failure, not a run outcome.
export async function frozenPlay(deps: FrozenPlayDeps, commit: string): Promise<number> {
  const problem = await deps.host.verifyBuild(commit);
  if (problem !== null) throw new Error(problem);
  const spec = fixedLaunchSpec(deps.hostDeps, commit, preservedPlainEnv(deps.hostDeps.env));
  if (spec.argv[0] !== fixedTreeLiveJs(fixedTreeDir(commit))) throw new Error("the launch spec does not point into the experiment checkout");
  deps.out(`run ${commit.slice(0, 7)} from ${fixedTreeDir(commit)}`);
  return deps.spawn(spec);
}
