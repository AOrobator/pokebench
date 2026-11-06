# First visit cycle credit

The operator 2026-11-06: "first-visit-cycle-credit-v1, i want this on in both arms. this supervisor suppression feels like a correctness fix." Spec from the coordinator, confirmed with the operator in the thread.

## Spec

- A map this run has never been on, entered: map-pair counts reset, so the entry cannot complete a cycle.
- `map_cycle` and `milestone_drought` notes are held for the next 10 tool results, each recorded once as a `would_warn` diagnostic naming the map.
- When the hold ends, a note still due is sent under the normal rules; one no longer due is recorded, never dropped silently.
- Another first entry restarts the hold. Interface dwell, text-only, battle and other guards are unchanged. No model-facing wording changes.
- Default OFF, byte-identical to today. onInBoth in `current.json`, explicit true in `current-control-24h-8k`. Not added to the Rayquaza lane; that recipe is a separate copy and the operator's pointer question is open.

The entering call's own result does not count as one of the 10.

## Replay of recorded runs

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
