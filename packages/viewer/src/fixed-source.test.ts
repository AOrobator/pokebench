import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { BUILD_SOURCES, mainCheckout, sourceIdentity } from "./fixed-source.js";

it("resolves the canonical checkout from either checkout or worktree", () => {
  expect(mainCheckout("/repo/worktree", (cwd, args) => {
    expect(cwd).toBe("/repo/worktree");
    expect(args).toEqual(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    return "/repo/main/.git\n";
  })).toBe("/repo/main");
});
it("compares fixed-run build sources, refusing invalid or unavailable revisions", () => {
  const git = (args: readonly string[]): string => {
    expect(args).toEqual(["ls-tree", "--full-tree", "HEAD", "--", ...BUILD_SOURCES]);
    return "source-tree";
  };
  expect(sourceIdentity(git, "HEAD")).toBe(createHash("sha256").update("source-tree").digest("hex"));
  expect(sourceIdentity(git, "--bad-revision")).toBeNull();
  expect(sourceIdentity(() => { throw Error("missing"); }, "a".repeat(40))).toBeNull();
});
