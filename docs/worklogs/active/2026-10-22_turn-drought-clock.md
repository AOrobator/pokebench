# Turn-based milestone drought clock (turn-drought-clock-v1)

Operator request: The operator, 2026-10-22 (relayed by the coordinator thread). The milestone-drought nudge is useful but wall-clock based (`STALL_DROUGHT_MS=5*60_000`): on slow GLM that is a nudge every 5-8 actions while Qwen gets about 28 actions per 5 minutes (measured: Qwen 25-30 actions/5 min across 8 recent 2h runs, GLM 5-8). Its text "What you have been trying is not working" is false during deliberate heal-and-grind; the model pushed back 7-13 times per run. Decision: make it turn based, ON in the bundle. Single milestone; reviews and landing are done by the coordinator.

## Skills Loaded

feature-switch, feature-explainer, experiment-queue, pokebench-game-state (wording), close-the-loop.

## Architecture

- `stall-briefing.ts` `StallBriefing`: with `turn-drought-clock-v1` ON (and positive-supervisor-v1 OFF, whose retired path is unchanged) the drought level is `floor(actions / STALL_DROUGHT_ACTIONS)` (30), where actions counts tool results since the clock last restarted.
- The clock restarts on a new story milestone (as before), a hold that ends after keeping a due briefing back (as before), and with ON on observed state: a party member's level going up (same identity, higher level), a trainer battle won (a trainer seen not defeated, then shown defeated), and the party reaching full HP after being below full.
- With ON the drought briefing is sent even when milestone-drought-suppression-v1 is ON; its text is a factual `action_drought` stall (`loop-supervisor.ts` `stallText`). Held-drought (drought-battle-heal-hold-v1) diagnostics use action wording; story-character gate holds are unchanged.
- OFF: wall clock, text, evidence and events byte-identical.

## Invariants

- INV-1 OFF parity (same timing, text, events).
- INV-2 ON level counts tool results only; walking and failed actions do not restart it.
- INV-3 ON resets only on observed game state (milestone, level, trainer defeated flag, party HP).
- INV-4 ON overrides milestone-drought-suppression-v1; positive-supervisor-v1 retired path unchanged.

## Milestones

**M1 — turn-drought-clock-v1**
- [x] RED tests (packages/agent/src/turn-drought-clock.test.ts): 13 failing / 3 passing (the 3 OFF-parity tests pass on unchanged code)
- [ ] GREEN implementation + registry/presets/defaults/wiring/recipes/explainer/pending experiment
- [ ] Wiring deletion red/green check
- [ ] Gates: build, lint, coverage, test, verify-vendor

## Session Log

## Surprises

## Multi-Model Review Log

(Coordinator runs reviews.)

## Archive Milestone (user-gated)
- [ ] ASK USER: archive
