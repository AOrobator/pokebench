# Frontier fails open

Branch `claude/frontier-fail-open`, stacked on `claude/rayquaza-lane`. Coordinator brief 2026-11-05 relaying the operator's decision. Landing waits for the operator's go.

## Problem Statement

The frontier graph is an allow-list. DeepSeek run `2026-11-05T13-26-41_deepseek-deepseek-v4.1-flash_ee2a`, the first Feather Badge, is missing because it started from a manual save (`PAUSED_BEFORE_RESTART.state`) that `resumeCheckpoint()` does not recognize. About 230 other non-probe runs vanish the same way. The operator's decision: the frontier fails open. New or unexpected runs show with a tag, probes show dimmed, and filtering is a later explicit choice. The gold agent frontier stays New Game starts only and assisted runs never become best unhelped.

## Skills Loaded

feature-worklog, close-the-loop, viewer-e2e (headless only).

## Architecture

- `frontier.ts`: `drawnRun` is a deny-list (operator exclusion only). `startMilestone`, `checkpointResume` and `frontierTags` give each drawn run its styling and tags. `frontierCandidate` is unchanged.
- `frontier-origin.ts` (new, server only, pure): sidecar parsing, re-rooting a save path under the store root, and `resolveOrigins`, which places an arbitrary save at the furthest frontier milestone its source run had reached at or before the save's turn.
- `workbench-store.ts`: the only IO, a thin sidecar reader; the loaded runs supply the source splits.
- `workbench-data.ts`: `WorkbenchRun.origin`, validated on the wire.
- `frontier-recording.ts`: in the viewer's display reading, probe runs keep their native splits so they can be drawn dimmed. Strict reading is unchanged.
- `resumeMilestone` stays config-only because trainer cards use it and their display is protected.

## Invariants

- INV-1 Every selected run is a series or is named in Hidden with a reason. Test: guard fixtures with a made-up start kind, unknown save and unknown controller.
- INV-2 Only an operator exclusion keeps a run with plottable splits off the graph. Test: probe, problem, human and unknown-start fixtures all draw.
- INV-3 `best` stays New Game starts and unhelped. Test: existing record tests plus a faster save-start fixture.
- INV-4 No probe, problem or human run creates or renumbers a harness version. Test: `frontierVersions` fixture.
- INV-5 A sidecar only counts when it matches the loaded save's sha1. Test: mismatch gives start unknown.

## Security Review

Save paths are untrusted. The reader re-roots the part after `/runs/` under the store root, rejects `..`, ignores symlinks and bounds the size. Run names reach the page through `esc`.

## Milestones

**M1 — Frontier fails open**
- [x] Write tests
- [ ] COMMIT RED
- [ ] Implement
- [ ] Cheap checks: viewer lint, types, tests
- [ ] COMMIT GREEN
- [ ] Docs: grading protocol note
- [ ] Full gates (needs a CPU START window from the coordinator)
- [ ] Claude + GPT + fallback reviews
- [ ] Before/after headless screenshots and Hidden list on real data
- [ ] ASK USER: The operator's go to land

## Closing the Loop

Proof goes to `runs/frontier-fail-open-proof/`.

## Session Log

- 2026-11-05: worktree created from `claude/rayquaza-lane` at 910e07117.

## Surprises

- The recorder drops every split for `probe` runs, although 66 of 68 have milestone events.
- Three sidecar shapes exist: manual (`run`, `turn`), milestone capture (`run`, `milestone_event.turn`) and handoff (`source_run`, `source_turn`).

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
