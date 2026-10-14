# Worklog archive hook (2026-10-14)

Operator approved (20:43Z, walkable-floor thread): let a commit that archives a worklog pass the
pre-commit freshness check. Before, moving the last updated body out of `docs/worklogs/active/`
left only other sessions' stale bodies, so the archive commit was refused.

## Change

- [x] `.githooks/pre-commit`: a staged delete of `docs/worklogs/active/<name>.md` paired with a staged
      add of `docs/worklogs/<name>.md` adds the archived body to the freshness set. It must still be
      updated since the last commit. Detection uses `--no-renames` so an edited body still pairs.
- [x] Tests (`env/tests/tooling/test_pre_commit_hook.py`): archive of an updated body passes with
      other stale bodies; un-updated archive blocked; moves elsewhere blocked; a new archive file
      without a matching delete blocked.

## Gates
- RED: `test: archiving a worklog passes the freshness hook` (f4eb93c); the allow case fails on the old hook (1 failed, 31 passed).
- GREEN: `fix: let an archive commit satisfy the worklog hook`. tooling 32/32, ruff clean, shellcheck clean.
- Review round 1 (packet cd13c11): Claude LGTM, Grok LGTM, Codex BLOCKING: the `-f $to` check made a staged archive whose working copy was deleted fall through and commit unchecked. Fix: `fix: fail closed when a staged archive has no working copy` drops the check, so a missing file fails the mtime read. New test breaks with the old condition (1 failed) and passes with the fix. tooling 33/33, ruff and shellcheck clean.
- Review round 2 (packet aeba8c9): Claude LGTM, Grok LGTM, Codex BLOCKING: the destination lookup was a Git pathspec, so `[ab].md` could pair with a staged `a.md` and borrow an unstaged file's mtime. Fix: `fix: pair archive paths literally` reads staged deletes and adds once each and compares strings in bash (also drops the per-delete git call). Tests: bracket name blocked then committed once staged literally (fails on the old hook), basename with spaces. tooling 35/35, ruff and shellcheck clean. A Grok-lane scratch file (.scratch-hash.py) was left in the worktree; moved out, not committed. Two rounds had new blockers, so round 3 waits for operator scope confirmation.
