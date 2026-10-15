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
- [ ] Review (Claude CLI, Cursor Grok)
- [ ] Operator approves the local merge; restart the 8790 viewer on main.
