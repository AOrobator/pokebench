import {createHash} from "node:crypto";
import {dirname,resolve} from "node:path";
const sha256=(text:string):string=>createHash("sha256").update(text).digest("hex");
export function mainCheckout(from: string, git: (cwd: string, args: readonly string[]) => string): string {
  return dirname(resolve(from, git(from, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim()));
}

export const BUILD_SOURCES = ["packages/agent", "env", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"] as const;
// The identity of the build sources at a commit, or null when this checkout does not have it.
// Two commits with the same identity build the same agent, whatever else differs between them.
export function sourceIdentity(git: (args: readonly string[]) => string, rev: string): string | null {
  if (!/^(HEAD|[0-9a-f]{7,64})$/.test(rev)) return null;
  try {
    return sha256(git(["ls-tree", "--full-tree", rev, "--", ...BUILD_SOURCES]));
  } catch {
    return null;
  }
}
