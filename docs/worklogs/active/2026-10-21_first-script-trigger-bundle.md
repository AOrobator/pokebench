# First script trigger bundle activation

## Problem Statement
User approved bounded navigation to the first blocking script trigger and bundle inclusion for the next run. Recorded 1fe0 T72–84 shows nine refusals at the rival house landing before one DOWN triggered the introduction. Existing trigger-navigation-boundary-v1 was independently implemented and landed during investigation; reuse that separate default-OFF switch instead of duplicating it. Preserve script-free routing where available, stop after the first trigger attempt, never retry/continue or activate the originally selected target within that call. User authorization approves this scoped worklog and implementation; no new gameplay launch is authorized here.

## Skills Loaded
feature-switch, feature-explainer, experiment-queue, agent-observability, pokebench-game-state, talk-to-claude, feature-worklog, execute-worklog, close-the-loop.

## Architecture
Reuse trigger-navigation-boundary-v1 and existing navigation/semantic owners. Add rival-recording and two-trigger/no-retry cases, retain safe-route preference, and enable only fixed bundle treatment flags including bundle-v-control-2h. Existing experiment remains unapproved and pending. No game-specific route/goal instructions.

## Invariants
- INV-1 OFF/omitted retain existing inputs, descriptions and results.
- INV-2 ON prefers a script-free route; if none exists, attempt only the first active trigger and return its observed result even when already settled, facing-only, pushback or unchanged. No automatic retry or target activation.
- INV-3 Preserve collision, elevation, gates and fresh checked-input validation; walking prevents overshoot; strides stop before scripts.
- INV-4 Bundle ON/control OFF, global default OFF; actual next-run pin/flags verified by existing launcher owner, current runs untouched.

## Security Review
No new external interface, game memory write, subprocess authority or file-serving route. Existing ordinary press and recorder owners remain authoritative.

## Milestones
**M1 — Bounded trigger policy and bundle**
- [x] RED: 3 fail / 6 pass. Safe-route preference and bundle configuration fail on landed trigger policy; no-retry and recorded rival behavior already pass. Receipt /tmp/first-trigger-red.log.
- [ ] GREEN code/config/explainer and production wiring mutation
- [ ] Gates: test, lint, build, coverage >=90, vendor
- [ ] Native/manual proof and feature-card click as applicable
- [ ] Frozen independent reviews
- [ ] Landing board, main tests, viewer and launcher handoff

## Closing the Loop
Recorded rival snapshot exercised through real production factories with observed input counts; synthetic two-trigger/facing/pushback cases must return after first attempt. Keep fake responses distinct from native proof. Existing native execution may require a separate manual probe, never inputs to active runs.

## Session Log
2026-10-21: isolated managed worktree created. Read-only investigation already validated 68 raw states and 14 screenshots against exact matching ROM; no errors. Existing runtime overlap discovered and owner contacted before edits.

## Surprises
Overlapping trigger-navigation-boundary-v1 landed from another chat while work began; reuse it.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] ASK USER before archiving worklog.
