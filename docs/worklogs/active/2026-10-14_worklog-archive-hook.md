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
