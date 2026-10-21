# Rejected movement and field-dialogue retention

## Problem Statement
Bundle 9f27 skipped the rival bedroom and then requested 44 rejected direction batches in turns 72–136. The unnamed woman's upstairs instruction was delivered but excluded from observed instruction memory. User authorized fixes behind separate switches and inclusion in the bundle on 2026-10-21. This is implementation authorization; no new measured run is authorized.

## Skills Loaded
feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state, feature-worklog, execute-worklog, close-the-loop. User's explicit fix request approves this scoped implementation without another approval checkpoint.

## Architecture
- rejected-movement-step-v1: only where navigation-tool-use-guard-v1 would reject a free-field direction-only batch, submit its first direction through ordinary checked input/timing and discard the rest. Return requested/submitted/dropped receipt. No inferred route or objective; ordinary collision and story scripts still apply.
- observed-field-dialogue-v1: extend observed-instructions-v1 selection to all nonempty delivered field-dialogue episodes, preserving exact pages and unknown attribution. Battle pages and failed deliveries stay excluded. No objective extraction or retirement.
- Register both optional, default OFF, with independent pending experiments; enable both in fixed bundle treatment only. Control OFF. No changes to existing running pins.

## Invariants
- INV-1 Both OFF reproduce previous bytes and native inputs; factory tests compare OFF/omitted.
- INV-2 Recovery sends exactly one ordinary direction, no remainder, no guessed path; input and result receipt tests, boundary tests.
- INV-3 Keep raw words, speaker uncertainty, source refs; no battle/failed/foreign-run memory; replay fixtures.
- INV-4 Separate switches, explicit default OFF, prerequisites, feature receipts, independent one-switch arms, unchanged control.
- INV-5 No game/RAM writes outside ordinary input, no active-run edits or measured launches.

## Security Review
No new external API, paths, subprocess interface or network authority. Dialogue remains quoted data in existing context.

## Milestones
**M1 — Two independently switched repairs and bundle registration**
- [x] RED: targeted production tests fail (7 failed, 45 passed); receipt /tmp/pokebench-rejected-red.log. Tests cover first-direction native input and actual unnamed upstairs recording.
- [ ] Implementation and experiments/explainers
- [ ] Production wiring deletion/restoration receipts
- [ ] Gates: test, lint, build, coverage >=90%, vendor
- [ ] Frozen multi-model review
- [ ] Land and verify viewer cards/explainers if review gate permits

## Closing the Loop
Production-factory tests and native input seam; replay actual 9f27 dialogue with no gameplay. Browser proof for both feature-card explainers. No claim of benchmark benefit without measured evidence.

## Session Log
- 2026-10-21: isolated managed worktree from main 143966bc. Worklog created before implementation. Existing run evidence remains immutable.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving.
