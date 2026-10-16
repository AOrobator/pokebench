# Bundle pre-launch fixes F5–F8 (M5 of 2026-10-16_prelaunch-fixes)

Parent worklog: `docs/worklogs/active/2026-10-16_prelaunch-fixes.md` (approved by the operator 2026-10-16 12:46 AM EDT), milestone M5. Branch `claude/bundle-prelaunch-fixes`, unmerged; M6 integrates.

## Problem

Forensics of bundle qualification run `2026-10-15T23-47-41_qwen36-gpu1_3f21` (`runs/reviews/2026-10-16-qualification-forensics/bundle-3f21.md`) found four bundle-only harness bugs inside default-off switches that have never run in a measured cohort. Per the approved worklog they are bug fixes inside those switches; no new switch. OFF of each switch still reproduces today exactly.

| Fix | Switch | Evidence |
|---|---|---|
| F5 stall briefing cites the last story-instruction pages (whole, with speaker) and untried warps across maps since the last progress | `stall-briefing-v1` (loop supervisor text unchanged) | T166 seq 3310; Mom's "next door" at T98 seq 1773 |
| F6 navigate_to/press results reflect the post-advance state | `dialogue-auto-advance-v1` | T98 seq 1776, T132 seq 2609, T146 seq 2902, T56 seq 901 |
| F7 warp targets get a real refusal reason | `navigation-refusal-reasons-v1` | T107 seq 1956, T150/151/153, T57 seq 909, T61 seq 960 |
| F8 no queued button after a message appeared | `dialogue-auto-advance-v1` | T95 seq 1634/1635 |

## Invariants

- INV-1 OFF of each switch reproduces today's text (stall-briefing OFF never runs stallText; the loop supervisor's `text()`/`textOnly()` are byte-identical to the recorded T65 seq 1010 note).
- INV-3 No model-facing truncation; pages whole.
- INV-5 Every new line is grounded in recorded state or game source.

## Milestones

**M5 — F5–F8**
- [x] RED: tests from real 3f21 events (fixtures under `packages/agent/test-support/bundle-3f21/`): `packages/agent/src/bundle-3f21-fixes.test.ts`, 10 failing / 2 passing (the two passing pin the both-arm supervisor T65 note byte for byte and the recorded generic refusal with the switch OFF). Replays reproduce the recorded text exactly before the fix (T95 press line, T98 navigate line, T166 briefing lines, T56 pages).
- [x] GREEN F5–F8: agent 82 files / 1278 tests pass; lint + build clean. Two existing ON-switch tests updated on purpose (door warp now has a specific reason; stall briefing adds three lines, all other lines still equal the loop briefing).
- [x] F12 (naming-editor briefing + interface_dwell stall) was added at the coordinator's request (RED 51006938, GREEN 7261cdd6), then dropped on a scope change: another thread owns F12 and builds it on top of F5 after this branch merges. Reverted in one commit; findings for that thread: N=30 calls from 23 naming episodes in 133 runs (normal <=25; stuck 48/79/97/153); pokeemerald naming_screen.c START moves to OK, A on OK saves, SaveInputText keeps the preloaded nickname when the text is empty.
- [x] Gates: `just test` (agent 1288, viewer 786, env 1960 passed/2 skipped), `just lint` agent/viewer clean, `just build` ok, `just coverage` agent L99.0/B93.8/F97.8, viewer L97.6/B90.4/F93.6, env L97.0/B92.6/F100 (floor 90), `just verify-vendor` ok
- [x] Explainer updates (local): fix sections in docs/explainers/{stall-briefing-v1,dialogue-auto-advance-v1,navigation-refusal-reasons-v1}.html (already linked from Harness Config cards); rendered and checked in the browser pane
- [x] Review: Codex (BLOCKING, fixed, then LGTM) + grok (LGTM)

## Session Log

- 2026-10-16: F12 dropped (coordinator scope change); reverted.
- 2026-10-16: GREEN F5–F8 committed. Scope addition from coordinator: F12 (naming-editor/owned-interface awareness + interface-dwell stall) inside stall-briefing-v1.
- 2026-10-16: RED committed (see COMMIT lines below).
- 2026-10-16: worktree created from main `fa09dbe6`; worklog written.

## Multi-Model Review Log

- Codex gpt-5.6-sol round 2 (delta): LGTM. Non-blocking: the supervisor no-leak assertions still searched for the old phrase; updated.

- cursor-grok-4.5-high round 1: LGTM. Non-blocking: free-field walk batches still go as one press (F8 scope is the one-at-a-time path); a door whose entry tile is on the map and reachable still gets the generic text (the planner reaches it then); afterAdvance needs a lock note to rewrite.

- Codex gpt-5.6-sol round 1: BLOCKING. The F5 line called the pages of an earlier story milestone "your last story step" when a later story milestone (CLOCK_SET) came with no pages: misattributed evidence. Fix: the line says "your latest story step that came with dialogue" and names that milestone; RED then GREEN.

## Surprises

## Commits

- COMMIT: `test(bundle): no-leak assertions use the new F5 wording`

- COMMIT: `fix(bundle): name the story step the quoted dialogue came with` — agent 1288 tests

- COMMIT: `test(bundle): RED for review fix: name the story step the quoted dialogue came with`

- COMMIT: `docs(explainers): F5–F8 before/after from run 3f21`

- COMMIT: `test(bundle): cover every F5–F7 branch; stall-briefing registry text` — agent 1288 tests

- COMMIT: `revert(bundle): drop F12` (scope change; removes RED 51006938 and GREEN 7261cdd6)
- COMMIT: `fix(bundle): F12 stall briefing knows the naming editor and briefs an interface dwell` (7261cdd6)
- COMMIT: `test(bundle): RED for F12 stall briefing in an owned interface` (51006938)
- COMMIT: `fix(bundle): F5–F8 inside stall-briefing, auto-advance and refusal-reason switches` (47aa276c); agent 1278 tests pass

- COMMIT: `test(bundle): RED for F5–F8 replayed from bundle run 3f21` (b718b137)
