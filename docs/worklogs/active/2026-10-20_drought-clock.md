# story-progress-clock-v1: measurement-only story steps restart the drought clock and the progress line

## Ask

- Coordinator brief 2026-10-20: port `story-progress-clock-v1` from `archive/claude/supervisor-truth-fixes` (869aa49a RED, 92f4fe4f GREEN, round-1 fix 78f9b74e / f9bf88c1) onto current main (ba71c60f), bundle arm only, default OFF, OFF byte-identical. Re-implement against the redesigned supervisor (positive-supervisor-v1, briefing-repeat-count-v1, unfinished-activity-v1). Stop before the review loop.

## Bug (still on main)

- `packages/agent/src/stall-briefing.ts:47` skips `MEASUREMENT_ONLY_MILESTONES` for the drought clock, and `loop-supervisor.ts` `counted()` skips them for "Last story progress" and the lists headed "since your last story progress".
- Recorded: bd60 s11962 (10-minute drought note 12 turns after RIVAL_OLDALE_SEND_OFF, progress line "first pokecenter heal ... 87 turns ago"); dc5a s13819 (15-minute drought note 14 s after RIVAL_BATTLE_STARTED, mid-battle); fb46 s7174 (5-minute note 27 s after RIVAL_BATTLE_STARTED at s7091); 10a2 s14567 (20-minute note 41 s after RIVAL_BATTLE_STARTED at s14426).

## Readers of the clock and of "last story progress"

- `StallBriefing` (stall-briefing.ts): drought clock, map-cycle pairs, interface dwell, retired diagnostics under positive-supervisor-v1. CHANGED with the switch.
- `SupervisorBriefing` (loop-supervisor.ts): `lastProgress()` (loop guard, stall briefing, text-only supervisor, focused v2), `path` / `entered` (the two "since your last story progress" lists). CHANGED with the switch. `stories` / `pendingStory` (dialogue of the last story step) unchanged: those name story steps with dialogue, not progress.
- Not changed, by design: `StoryCharacterGate` ("not talked to since your last story milestone", also drives auto-talk and holds), `BattleOutcomes.recap` (pinned until the next story milestone), the loop coordinator's milestone reset, `milestone-stall-stop-v1` (a stop rule, not model text). None of them reads the drought clock or says "story progress".

## M1

- [x] RED: fixtures bd60 (from the archive branch; a re-trim of the run with the documented rules is JSON-equal line for line) and dc5a (seq 0-16700, same trim, 800 KB). `story-progress-clock.test.ts`: 17 tests, 12 red, 5 green (OFF byte-for-byte replay of all 14 bd60 and 16 dc5a recorded supervisor notes on current main; the measurement-only list; GAME_RUNNING / present_at_start are never progress). Red for the right reasons: ON notes unchanged, drought at bd60 11962 and dc5a 13819 still fires, map-cycle and dwell counts carry over, retired drought diagnostic still recorded, switch not registered.
- [ ] GREEN: switch registry, presets, defaults, wiring; explainer; pending experiment; readiness row.
- [ ] Gates: test, lint, build, coverage.
- [ ] Wiring deletion watched red.
- [ ] STOP before review (coordinator runs it).
