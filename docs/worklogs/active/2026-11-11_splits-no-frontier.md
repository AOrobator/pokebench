# SPLITS: settle when there is no frontier to race

Status: M1 LANDED on local main at defa1cf1a (the operator 19:58:13Z: "@claude land view-release and splits-no-frontier"); post-main `just test` green. No push; live on 8790 after `just viewer-main` at 22e7432f4 on `claude/splits-no-frontier` (worktree `~/dev/pokebench-splits-no-frontier`), off main 640ba5c74. Asked for by the coordinator 2026-11-11 19:23Z, from the view-release browser check. Landing needs the operator.

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
- [x] Cheap checks; guard deletion; full gates on d3c52da64: `just lint` exit 0; `just test` exit 0 (agent 3,042, viewer 1,279, env 3,258, gateway 39; floors; no-I/O proof)
- [x] Browser check (multi-run gap recorded as a separate follow-up): the real 67d7 release in a scratch viewer (single-run root) shows the settled line, at desktop and phone, plus a multi-run root still racing
- [x] Codex review: GPT LGTM; stopped at ready to land

**M2 — Landing** (the operator); then `just viewer-main` only on the operator's words
- [x] Rebased onto main twice (view-release landing, then a worklog-only archive commit); the feature diff is byte-identical each time (patch-id 71ce56b0…); splits tests 48/48. Merged with `git merge --ff-only` only after confirming number 1 on the board: main → defa1cf1a. Post-main `just test` exit 0 (agent 3,042, viewer 1,279, env 3,319, gateway 39; floors; no-I/O proof).
- [x] `just viewer-main` on the operator's words (20:06:21Z "@claude run viewer-main"): "viewer and current projector at 22e7432f4", one 8790 listener whose build stamp names 22e7432f4 (clean), no older-build problems in /api/workbench (836 runs), 0 gameplay processes before and after. Live: 67d7 SPLITS on 8790 still races "9:02:23 ahead of the FRONTIER".

## Closing the Loop

This branch's built viewer, detached on scratch ports (stopped afterwards; the live 8790 viewer untouched), headless Playwright Chromium at 1280×900 and 375×812:

- **Single-run root** (the real 67d7 release unpacked by `view-release`, port 8797). `/api/runs/<id>/frontier` returns `{"state":"ready","frontier":null}`. SPLITS settles within about a second at both widths: headline "ASSISTED …67d7: no frontier comparison for this run.", STORY GRAPH "No frontier run to plot." No page errors; page width equals the viewport. Before the fix it stayed "Loading the frontier run…" for over 10 minutes. Screenshots `runs/mockups/splits-no-frontier/single-{1280,375}.png` (opened and looked at).
- **Multi-run root** (67d7 plus APFS clones of DeepSeek 37ca's events, frames and checkpoints, port 8798). The server answers a real frontier (37ca), and SPLITS still says "Loading the frontier run…" after 5 minutes, the same as before this change. Cause: without the current-run projector service (503 on `/api/current-runs`, as on any scratch or release root), the client builds its workbench from an empty current-run list, so a real frontier waits for a run record that never comes. On the live 8790 viewer, which has the projector, the same page races (9:02:23 ahead). This is pre-existing and unchanged by this branch; it is a separate follow-up (enrich the workbench from `/api/cards` when the current projector has no runs).

## Session Log

## Surprises

## Multi-Model Review Log

### Round 1 — GPT (JOB review-gpt-splits-no-frontier-d3c52da64)

Base 640ba5c74, head d3c52da64, SHA-256 5b00df33…a1705. Traced the frontier-cache ready/stale/loading responses, loadFrontier settlement and retry, selection reset, and drawRace headline and graph gating: only a settled null frontier can show no comparison without a workbench record. Screenshots inspected. `VERDICT: LGTM`. The coordinator confirmed no switch is needed (viewer-only).

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
