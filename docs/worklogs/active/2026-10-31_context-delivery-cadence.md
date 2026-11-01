# Context delivery cadence (battle history + gym checklist)

**Started:** 2026-10-31
**Status:** Active; operator authorized update + HyperQwen bundle restart

## Problem Statement

`battle-action-history-v1` and `discovered-gym-checklist-v1` re-inject large MEM blocks on every decision. Bundle ON / control OFF. Operator: deliver battle history in-battle and once after verified whiteout only; gym checklist on discovery / town enter / leave / badge — not a heartbeat. Viewer MEM labeling stays unchanged.

## Skills Loaded

- feature-switch, feature-explainer, execute-worklog (bounded), fixed-run-launch, close-the-loop

## Architecture

- `BattleActionHistory` / `TrainingBlock.context`: gate action text to in-battle or one pending whiteout field decision; retain current-battle intervals (keep through whiteout one-shot, then clear).
- `discoveredGymChecklist`: queue a due note on discover, enter/leave of a gym town with unfinished obligation, or native badge completion; deliver until a successful assistant reply consumes it.

## Invariants

- INV-1: OFF remains no extra context / no receipts.
- INV-2: Whiteout one-shot requires a delivered `blackout_receipt` / `blackout_receipts` on the field observation (strict CB2_WhiteOut path), not inferred loss.
- INV-3: Gym checklist never forces a route or battle; enter/leave text stays local to that town's gym.

## Milestones

**M1 — Source: event-scoped delivery**
- [ ] RED tests for both switches' new cadence
- [ ] GREEN implementation + feature copy + explainers
- [ ] Focused tests / cheap checks
- [ ] Land + restart `hyperqwen-bundle-24h`

## Session Log

- 2026-10-31: operator discussion → update both switches; restart HyperQwen bundle with the pin.

- 2026-10-31: implemented event-scoped delivery; focused tests 74 passed.
