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
- First series (6ab9d726d RED, a49eb1fdf merge, 0b3a830e4 GREEN, e7afe2fd2 pin, 51718d2c8 gates) was cut before Codex's frontier-mistake-plan landed 11 switches on main (4b3a9e37a); merging main conflicted in ~80 files, so the coordinator asked for the change to be re-applied on top of main. The old head stays reachable as 51718d2c8.
- [x] RED tests (packages/agent/src/turn-drought-clock.test.ts), re-picked onto 4b3a9e37a as 43789bf63: 13 failing / 4 passing
- [x] GREEN implementation + registry (appended after rejected-movement-prefix-v1, the current tail, so after every frontier switch) / presets / defaults / LEGACY_ALL_ON / recipes (bundle arms keep every frontier switch, this one appended last) / explainer / pending experiment / readiness entry. Agent test registry tail indexes shifted by exactly one; experiment-incumbent exclusion lists gained the id; story-progress-clock and drought-battle-heal-hold ALL_ON fixtures pin it OFF; viewer recipe-index tests (rejected-movement-prefix-bundle, open-goal-prompt) account for the new last bundle switch. The workbench-offthread fixture bump from the first series is no longer needed on this main.
- [x] Wiring deletion red/green check: `turnClock()` forced to false gave 13 failed / 5 passed in turn-drought-clock.test.ts (production `stallBriefing` factory); restored 18 passed
- [x] Gates before the GREEN commit: `just lint` 0; `just build` 0; `just coverage` 0: agent 4749 tests (97.30 stmts / 93.31 branches / 97.79 funcs / 99.20 lines), viewer 1784 (95.47 / 91.44 / 94.44 / 97.97), Python 3975 passed (lines 97.40 / branches 93.46 / functions 100, floor 90); `just verify-vendor` OK. `just experiments-check` reports no definition problems; it exits 1 only on runs/.../starter-decision-salience trials.jsonl 'not a ledger entry' lines, as main's checkout does.
- [ ] COMMIT GREEN

## Session Log

## Surprises

- Main's docs/explainers/README.md no longer lists rejected-movement-prefix-v1 (the line from 8d09b78f1 is gone at 4b3a9e37a); left as is, out of scope.

## Multi-Model Review Log

(Coordinator runs reviews.)

## Archive Milestone (user-gated)
- [ ] ASK USER: archive
