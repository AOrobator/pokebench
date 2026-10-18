# Hide replay controls for runs in progress

## Problem Statement

The viewer header always draws the replay play button, speed picker and scrubber. For a run in progress they are only greyed out, so on a phone they take a header row and look usable (the operator, 2026-10-16). They mean nothing until the run is a replay.

## Architecture

Viewer only, no harness behavior change, so no feature switch. `static/index.html` gives the `.replay-controls` group `data-ui="replay-controls"`; `App.render` sets `hidden` whenever there is no replay clock (loading, live, not responding) and clears it once the run is a replay. The global `[hidden] { display: none !important }` rule already beats `.bar .replay-controls { display: inline-flex }`.

## Milestones

**M1 — hide the controls while a run is in progress**
- [x] RED: live run hides the group; it shows once the run ends and replays; a recorded replay shows it
- [x] GREEN, gates: `pnpm -r build`, `pnpm -r lint`, `pnpm -r coverage` pass (viewer 904 tests; 95.32 stmts / 91.1 branches / 93.62 funcs / 97.62 lines; agent 1619 tests). Python untouched.
- [x] Review on packet b43ae12c (base 154d905e, head d68f7107): Claude (subagent) LGTM; Grok (Cursor cursor-grok-4.5-high) LGTM; GPT: Cursor gpt-5.6-sol-xhigh hit its usage limit, Codex (gpt-5.6-sol) round 1 BLOCKING on missing browser proof, round 2 LGTM after the viewer-e2e receipt (`runs/reviews/2026-10-16-hide-replay-e2e/receipt.md`: RUNNING, LOADING and NOT RESPONDING hidden; REPLAY and live-to-ended visible and usable at 375px)
- [x] Landed: main b0310914 merged into the branch, gates rerun (viewer 906, agent 1629 tests), branch diff still b43ae12c; `git merge --ff-only` -> main 8c98cb7c. `just test` on main: first run timed out `runs-cli.test.ts` "uses the repo runs/ directory and the 500 MB cap" (5 s limit scanning the 20 GB real runs/; unrelated to this change), rerun passed (TS 1629 + 906, Python 2297).

Follow-ups (not in scope): `runs-cli.test.ts` repo-runs test is load-sensitive; `viewer-restart.sh` kills any process matching live.js, including vitest children (coordinator note 2026-10-16 6:28 AM EDT).
