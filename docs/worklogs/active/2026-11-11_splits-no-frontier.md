# SPLITS: settle when there is no frontier to race

Status: M1 in progress on `claude/splits-no-frontier` (worktree `~/dev/pokebench-splits-no-frontier`), off main 640ba5c74. Asked for by the coordinator 2026-11-11 19:23Z, from the view-release browser check. Landing needs the operator.

## Problem Statement

On a runs root with no other run to race (a downloaded release opened with `just view-release`), the SPLITS headline says "Loading the frontier run…" and STORY GRAPH says "Loading the story graph…" forever. The server answers `/api/runs/<id>/frontier` with `{"state":"ready","frontier":null}`. The client still counts the race as loading whenever its workbench record of the run is missing (`loading = frontier === null && (recording === undefined || !frontierSettled)`), and on a release root that record may never arrive. On the live viewer it never shows, because a real frontier exists.

## Skills Loaded

- `feature-worklog`, `execute-worklog`, `close-the-loop`, `viewer-e2e` (background browser only), `steady-screen` (a redraw by itself)

## Architecture

The rule moves into a pure exported function `raceLoading(frontier, recordingKnown, settled)` in `packages/viewer/src/splits-race.ts`: still loading while the frontier request is unsettled, or while a real frontier waits for the run's workbench record; settled otherwise. `app.ts` `drawRace` uses it. A settled empty frontier then shows the existing honest lines: headline "…: no frontier comparison for this run." (or the save-run wording), graph "No frontier run to plot." The text is unchanged. The only behavior change is that a settled `null` frontier is no longer drawn as loading.

No feature switch: this is a viewer-only correctness fix that changes nothing the model sees or does. `.claude/skills/feature-switch/SKILL.md` excludes viewer-only changes.

Files: `packages/viewer/src/splits-race.ts`, `packages/viewer/src/app.ts`, `packages/viewer/src/splits-race.test.ts`.

## Invariants

- **INV-1** A settled `null` frontier is never drawn as loading. Test: `raceLoading(null, false, true) === false`.
- **INV-2** Every case that loaded before still loads: unsettled with or without a recording; a real frontier still waiting for the workbench record. Test: the full truth table.

## Security Review

No new input, network or file access; HTML escaping unchanged.

## Milestones

**M1 — Source readiness**
- [x] Worklog
- [x] Tests (RED): `raceLoading` truth table
- [x] Implement (`raceLoading` in splits-race.ts; app.ts `drawRace` uses it). RED 529c860db: 3 failed (`raceLoading` missing). GREEN: splits-race tests 48/48; viewer `tsc --noEmit` and eslint clean. Guard: restoring the old rule (any missing workbench record means loading) turns 2 tests red; restored.
- [ ] Cheap checks; guard deletion; full gates (`just lint`, `just test`)
- [ ] Browser check: the real 67d7 release in a scratch viewer (single-run root) shows the settled line, at desktop and phone, plus a multi-run root still racing
- [ ] Codex review; stop at ready to land

**M2 — Landing** (the operator); then `just viewer-main` only on the operator's words

## Closing the Loop

## Session Log

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
