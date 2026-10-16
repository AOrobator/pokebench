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
- [x] RED F12 (scope addition): `packages/agent/src/stall-interface.test.ts` from showcase run `2026-10-16T00-34-26_qwen36-gpu1_show` (fixture `test-support/showcase-nickname/events.jsonl.gz`, events to seq 9563): 3 failing, 1 passing (the both-arm supervisor reproduces recorded notes T59 seq 855 and T158 seq 3118 byte for byte). Dwell threshold N=30 from evidence: 23 naming episodes in 133 runs (2026-10-13..16); every episode that ended normally took <=25 calls (player naming p50 7, max normal 25; nickname 3 and 19); the stuck ones took 48, 79, 97, 153.
- [ ] GREEN F12
- [ ] Gates: test, lint, build, coverage (90%), verify-vendor
- [ ] Explainer updates (local)
- [ ] Review: Codex + grok

## Session Log

- 2026-10-16: GREEN F5–F8 committed. Scope addition from coordinator: F12 (naming-editor/owned-interface awareness + interface-dwell stall) inside stall-briefing-v1.
- 2026-10-16: RED committed (see COMMIT lines below).
- 2026-10-16: worktree created from main `fa09dbe6`; worklog written.

## Multi-Model Review Log

## Surprises

## Commits

- COMMIT: `fix(bundle): F5–F8 inside stall-briefing, auto-advance and refusal-reason switches` (47aa276c); agent 1278 tests pass

- COMMIT: `test(bundle): RED for F5–F8 replayed from bundle run 3f21` (b718b137)
