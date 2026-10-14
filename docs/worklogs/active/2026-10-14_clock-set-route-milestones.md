# Clock set save: leave home and rival house

Operator approved landing 2026-10-14. A Clock set save starts after the clock is set, so the pre-clock home witness never exists and leave-home / rival-house never record. Fresh boot stays on that witness. Do not restart the in-progress run.

## Problem Statement

`PLAYER_HOUSE_EXITED_AFTER_CLOCK` and `RIVAL_HOUSE_ENTERED` require a home identity taken while the clock is still unset. A run loaded from `CLOCK_SET.state` has `clock_set` already true and intro stage 6 or 7, so both milestones stay missing even after the run leaves home and enters the other house.

## Skills Loaded

- `.claude/skills/pokebench-story-milestones/SKILL.md`
- `.claude/skills/feature-worklog/SKILL.md`

## Architecture

Home for a resumed run is the first stable Littleroot house before the run has been seen on any other map. Route proof accepts that house as the anchor when the clock is already set. A save that starts outside does not adopt a later house as home. The native target stop uses the same anchor.

## Invariants

- INV-1: A fresh boot still records leave-home only from the pre-clock witness, the post-clock 1F, and Littleroot Town. Test: existing post-clock route test.
- INV-2: A Clock set save that starts inside the player's house records leave-home and rival house after those transitions, and does not count the player's own 1F as the rival house. Test: checkpoint-start case.
- INV-3: A save that starts already outside does not receive either milestone for a later house visit. Test: checkpoint-start case.

## Security Review

Recording only. No new process, port, or path. The model-visible hint stays behind its existing switch.

## Milestones

**M1 — Checkpoint-start proof**
- [x] COMMIT: `test(agent): RED for leave-home and rival house after a Clock set save` (2e92c34). Failed on `expected undefined` for leave-home before the proof change.
- [x] Implement home from the starting house, and the same anchor in the native target stop
- [x] Skill requires the checkpoint-start case
- [x] Gates: agent 1028 tests; statements 97.43, branches 93.87, functions 98, lines 98.85. `tsc --noEmit` and eslint clean on the touched files.
- [x] COMMIT: `feat(agent): record leave-home and rival house from the house a Clock set save starts in`

## Closing the Loop

The live run `26e0` is not restarted. Missed rows in that log stay missed.

## Session Log

- 2026-10-14: Checkpoint-start test written. It failed before the proof change because home stayed unset. RED `2e92c34`.
- 2026-10-14: Home for a resumed run is the first stable house before any other map. Fresh boot still uses the pre-clock witness. Agent coverage stays above 90.

## Surprises

None yet.

## Multi-Model Review Log

Not run.

## Boy Scout Log

None.

## Archive Milestone

- [ ] ASK USER: archive this worklog
