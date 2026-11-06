# First visit cycle credit

The operator 2026-11-06: "first-visit-cycle-credit-v1, i want this on in both arms. this supervisor suppression feels like a correctness fix." Spec from the coordinator, confirmed with the operator in the thread.

## Spec

- Revised below: the first version also reset the map-pair counts on a first entry. That is gone.
- `map_cycle` and `milestone_drought` notes are held for the next 10 tool results, each recorded once as a `would_warn` diagnostic naming the map.
- When the hold ends, a note still due is sent under the normal rules; one no longer due is recorded, never dropped silently.
- Another first entry restarts the hold. Interface dwell, text-only, battle and other guards are unchanged. No model-facing wording changes.
- Default OFF, byte-identical to today. onInBoth in `current.json`, explicit true in `current-control-24h-8k`. Not added to the Rayquaza lane; that recipe is a separate copy and the operator's pointer question is open.

The entering call's own result does not count as one of the 10.

## Replay of recorded runs

Superseded by the revision below: these numbers are the version with the pair reset.

Recorded events through `StallBriefing` with the switch off and on, every note accepted (the fixed recording, so an approximation of what a run with the switch would do).

- ee2a: 39 map_cycle and drought notes off, 27 on. map_cycle falls from 10 (turns 100, 199, 286, 370, 375, 392, 433, 481, 497, 592) to 2 (474, 481). The turn-370 note does not fire on: Mt. Pyre's upper floors were first entries, so the pair counts reset on the way down.
- 274b: 98 notes off, 68 on, with 5 held notes no longer due.

The pair reset does most of the work. A run exploring new maps gets far fewer cycle notes, not just later ones.

## Milestone 1

- [x] RED tests in `stall-briefing.test.ts`: 4 failing, 24 passing
- [x] GREEN in `stall-briefing.ts`, wiring, viewer timeline exclusion: 30 stall-briefing tests, 161 viewer focused tests. Mutations: removing the drought wiring failed the drought test, removing the timeline exclusion failed the viewer test; both restored.
- [x] Explainer, recipe, preset, README
- [x] Gates, review, landing

## Review log

- Round 1 GPT (Codex CLI, gpt-5.6-sol) on 76f71140b: BLOCKING, one finding. Fix: held-note keys merged a later drought or rebuilt pair with an earlier note at the same level, so one could go unrecorded. Held notes are now tied to the pair or drought clock they counted. Two tests added; 32 stall-briefing tests pass.
- Round 1 Claude (subagent), read through 7d1597848: LGTM on 7d1597848; it found the same key bug at 76f71140b. Fix: README and explainer said the switch only changes when notes fire, but the pair reset removes them; corrected. Follow-ups, not in this change: `loop-recovery.ts` counts held rows as interventions; `milestone-stall-stop-v1` (off in both configs) sends around the hold; `map-cycle-recovery-v1` (off) can clear a held pair on the result that ends a hold, with no record.

## Gates on 7d1597848

`just test` passed: 2,596 agent, 993 viewer, 2,965 env and 38 gateway tests, every coverage floor and `just no-io-proof`. Lint clean, each step run, with env mypy on the main venv because the worktree venv has no mGBA binding. `just verify-vendor` clean. Explainer `just pages-check` clean.

Round 2 GPT (Codex CLI, gpt-5.6-sol) on cumulative delta 76f71140b..d662e30eb: LGTM, finding closed. Grok out until 11/17. Main did not move, so the gates on 7d1597848 stand: only prose changed after it.

## Revision: delay, do not erase

The operator 2026-11-06 picked option 1 after the wording probe showed the note helps at ee2a T371 and T372 (16 vs 8, 10 vs 2 of 16). A first entry no longer resets the pair counts. The hold stays. Landed fb7237d27 is the version being revised.

- [x] RED on `claude/first-visit-delay`: three pair-reset tests deleted, two added; 2 failing, 29 passing
- [x] GREEN: the reset removed; 31 stall-briefing tests pass.

Replay with the same method (recorded events, every note accepted):

- ee2a: map_cycle 10 off, 9 on. Off: turns 100, 199, 286, 370, 375, 392, 433, 481, 497, 592. On: 100, 199, 286, 370, 392, 393, 440, 481, 497. Turn 370 fires on time: the last first entry was at turn 350. All map_cycle and drought notes: 39 off, 34 on.
- 274b: 98 notes off, 88 on, with 6 held notes no longer due.
- ee2a's tenth note, turn 592, was still held when the run ended.

Review, round 1 on 74a5046a9. GPT: LGTM, no findings. Claude: BLOCKING on a test gap and doc claims, no model-facing bug. Fix: restored rebuilt-pair coverage through a milestone, and corrected "when only" and "never erased" wording, the stale Spec bullet and the overreaching probe sentence. Follow-ups, not in this change: a note due at release that stops being due before it is sent gets no second row (its hold row stays; explainer narrowed); the T372 probe arm points against the hold, for the next probe.
