# Experiment pin by source tree

Operator request (2026-10-15, approved in the "Resume the finals" thread): any merge to main, viewer-only ones included, stalls running experiments, because `productionHost.verifySource` refuses unless main's HEAD equals the commit the first trial launched on.

Change: both arms still run on one build, but "one build" means the same agent and env sources, not the same commit. The identity is the git tree entries at a commit for `packages/agent`, `env` (its tree carries the vendor submodule pin), `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`. The ledger keeps recording the commit; the identity is always derived from it (`git ls-tree <commit> -- <paths>`), so existing ledgers, including the finals pinned at 74ad319, need no migration.

Not a feature switch: this is the runner's admission check, not agent behavior.

Landing note: the 8790 viewer runs the queue with the code it loaded at start, so the finals pick up the new check only after `just viewer-main` restarts it at the merged main.

## M1: verifySource compares source identity

- [x] RED: a viewer-only commit on top of the pinned commit verifies; an agent, env, submodule-pin or lockfile change still refuses; an unknown commit refuses; a viewer-only uncommitted change does not block; the build stamp survives a viewer-only commit without a rebuild.
  COMMIT: `test(viewer): RED experiments pin agent and env sources, not main's commit` (see git log)
  Tests: experiment-cli 2 failed / 9 passed, as expected.
- [x] GREEN: `sourceIdentity` (sha256 of `git ls-tree --full-tree <rev> -- BUILD_SOURCES`) replaces the HEAD equality check; the uncommitted-changes check and the dist stamp use the build sources too, so a viewer-only merge neither holds nor rebuilds. Checked on the real repo: 74ad319 and this branch share one identity; codex/dialog-loop-recovery differs.
  COMMIT: `feat(viewer): experiments pin agent and env sources, so viewer-only merges keep them running` (see git log)
  Tests: agent 1083, viewer 656, python 1877 passed. Coverage: agent 97.5/93.87/98.15, viewer 95.39/91.19/94.4 (gate 90). Lint: tsc, eslint, ruff clean; mypy fails only on the unbuilt mGBA binding in this worktree's env (no Python touched).
  Note: the main checkout's existing dist stamp names a commit, so the first verify after landing rebuilds the agent once (under the lease, never during a live run).
- [x] Review round 1 (Claude CLI; Cursor grok-4.7-high): both LGTM. Real-repo identities: 74ad319 and 6cc5394 both e66b7541…fc728; codex/dialog-loop-recovery fb275279…21f7.
  - Medium (Claude, pre-existing): untracked files are ignored, so an untracked env/ module would run under a matching identity. Fix: refuse untracked files under any build source before the fresh-stamp shortcut.
  - Low: the experiments.ts schema comment still says commit equality; the ledger `commit` now means the commit whose sources the trials run. Fix: comments.
  - Low: the rev guard has no test. Fix: assertions that a non-hex rev never reaches git.
  - Noted, no change: lockfile or root manifest bumps hold (conservative by design); re-approval after a definition change still compares commits (outside this change); git's own stderr on an unknown commit; build-mgba.sh output in env/.venv is outside the identity (never rebuilt by the runner).
- [x] RED round 2: `test(viewer): RED untracked build sources hold; the rev guard never reaches git` (see git log)
- [x] GREEN round 2: untracked files under any build source hold before the fresh-stamp shortcut (replaces the agent-src-only check); schema and ledger comments say sources, not HEAD; the test repo ignores dist/ like the real one.
  COMMIT: `fix(viewer): untracked agent or env sources hold experiments; comments say sources, not HEAD` (see git log)
  Tests: agent 1083, viewer 656 passed. Coverage: agent 97.5/93.84/98.15, viewer 95.4/91.2/94.4. TS lint clean. Main checkout has no untracked files under the build sources (checked).
- [x] Review round 2 (Claude CLI; Cursor grok-4.7-high): both LGTM. Verified the real main checkout lists no untracked build sources and every build output is gitignored. Deferred (pre-existing): untracked files inside the vendor submodule's own worktree are invisible to the superproject check; `just verify-vendor` owns that tree.
- [x] Pre-merge: reverted the experiments.ts schema comment, because any byte under packages/agent changes the agent tree and would hold the running finals (pinned at 74ad319). The contract now lives only in the viewer comments; the schema comment is fixed with the next agent change. Branch now touches no build source.
- [x] Rebased onto main bb23bda (restart-safe viewer; one import conflict in experiment-cli.test.ts). Tests: agent 1083, viewer 674 passed; coverage agent 97.5/93.87/98.15, viewer 95.23/90.99/94.16; TS lint clean. Build sources at 74ad319, bb23bda and this branch are identical trees.
- [x] Operator approved the merge in this thread (2026-10-15 19:12Z). The 8790 restart is done by the restart-safe viewer thread after this lands.
