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
- `frontier-recording.ts`: in the viewer's display reading, probe runs keep their native splits in `probeSplits`, which only `frontierPlot` reads, so they draw dimmed and every other surface still sees none. Strict reading is unchanged.
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
- [x] COMMIT RED: `test(viewer): frontier fails open and places saves by provenance` (5356b033c after rebase)
- [x] Implement
- [x] Cheap checks: viewer lint and types clean; viewer tests 96 files, 960 passed
- [x] COMMIT GREEN: `feat(viewer): frontier fails open` (ec5227cf7 after rebase)
- [x] Docs: grading protocol note
- [x] Full gates on ec5227cf7 in the coordinator's START window: `just test` passed (viewer 960, Python 2930 + 38, no-I/O proof OK, floors met: agent 60.36/56.77/59.67/65.92, viewer 38.18/41.84/44.24/38.58). `just lint` stopped at mypy on `mgba._pylib`, which this worktree has not built; mypy with main's env passed on 142 files, and the claude-gateway ruff and mypy steps passed by hand. `just trainer-card-check` could not load art in a fresh worktree; with `runs/sprites` linked from main, 3 passed.
- [ ] Claude + GPT + fallback reviews
- [ ] Before/after headless screenshots and Hidden list on real data
- [ ] ASK USER: The operator's go to land

## Closing the Loop

Proof is in `runs/frontier-fail-open-proof/`. A scan of all 68 GB of logs on a new build would be heavy and would write `runs/.viewer-cache`, and close-the-loop forbids starting the viewer CLI on the real root, so there are two proofs:
- `after-store-end-to-end.png`: the built branch viewer on port 8795 over APFS clones of 7 real runs and 5f0f's sidecar, through the real store. ee2a origin FORTREE_GYM_ENTERED from 5f0f turn 2181, Feather Badge at 39:40.273.
- `after-all-real-runs.png`, `after-all-real-runs-phone.png`: the same branch page with `/api/workbench` answered by the live 8790 snapshot of 807 runs, plus origins and probe splits computed read-only by branch code. 700 plotted, Hidden 107, no operator exclusions.
- `before-live-8790.png`: the live viewer, 465 plotted, ee2a absent.

## Session Log

- 2026-11-05: worktree created from `claude/rayquaza-lane` at 910e07117.
- 2026-11-05: Rayquaza landed at 7010a995c; rebased with no conflicts.
- 2026-11-05: real-data proof found "not from zero" labels colliding; a label that would overlap is now left off and every rule stays. After this fix only viewer lint and the frontier tests were rerun (159 passed).

## Surprises

- The recorder drops every split for `probe` runs, although 66 of 68 have milestone events.
- Three sidecar shapes exist: manual (`run`, `turn`), milestone capture (`run`, `milestone_event.turn`) and handoff (`source_run`, `source_turn`).

## Multi-Model Review Log

Round 1, frozen 7010a995c..55e701a30, diff SHA-256 75293d91c76fef3c90f379212f9b20597a2f1c75f3912d8866dd24cd7c00759b.
- Fallback subagent: LGTM.
- GPT (Codex gpt-5.6-sol): BLOCKING. (1) Accepted: probe splits reached run details, trainer-card progress and races; they now live in `probeSplits`, read only by `frontierPlot`. (2) Accepted: a sidecar with no hash was accepted; a matching hash is now required. (3) Rebutted: `settleSkew`'s strict return drops `save`, but that run has no splits, so it is Hidden and an origin is never used.
- Claude CLI: default login expired; retried with `~/.claude-review`.

Round 2, frozen 7010a995c..86dd4726f, diff SHA-256 519ff9be6e970c1ed1987d596f47317ae5a96c887f8f6da0af63166b8ff08d1f.
- Fallback subagent: no bugs found, accepted the `settleSkew` rebuttal, no literal verdict line. Observation accepted: a load error now clears `probeSplits`.
- GPT: BLOCKING on one finding, accepted: a probe with a problem was faint but not dotted. `invalidTrial` now reports the problem for any run that is not operator excluded.

Round 3, delta on d666eccb4 (cumulative SHA-256 0ba150667a2d39625c2edae02cc397d16c5a2dc8c5431538d3d706b21095659c).
- GPT: LGTM on the delta.
- Claude CLI: no output in two attempts on the review config; stopped. Claude subagent lane, on the cumulative diff: BLOCKING, accepted: `racePlot` went through `frontierPlot`, so probe splits reached the race graph and ignored a replay rewind. `agent` now clears them. Minor, accepted: a probe source could not place a save; `reachedBy` now reads its `probeSplits`.

## Principles Self-Review

PB1 PASS (the graph draws recorded splits; grading unchanged). PB2 PASS (failed and odd runs now show). PB3 PASS (no claim from one run). PB4 PASS (resumes and assisted runs stay tagged; the frontier stays New Game only). PB5 PASS (one reporting change, hypothesis in the problem statement). PB6 N/A (no model context). PB7 PASS (the graph reads recorded events; sidecars are only provenance for a recorded save). PB8 N/A (no model tool calls). PB9 PASS (probe splits and start-unknown volume raised to the operator). PB10 PASS (no test skipped, floors unchanged, tests that encoded hiding rewritten to the new rule). PB11 N/A (no dependency change). PB12 PASS (no ROM or protected path). PB13 PASS so far: review and landing are pending and recorded.

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive
