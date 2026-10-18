# Worklog: input-cuts-v1

Branch `input-cuts-v1`. The feature commit is on main `44c42815c1e7ed2ea743f20e5d016f881cb0d350`. This tip merges main `bcde8cd4ea2b8e2cb5b403be4d984eac830195ee` (clock-view-loop-v1, stale-story-goal-v1, and the preset fix that accepts both). `input-cuts-v1` stays last in the registry, after those two. Local only. Land only after Claude, Grok, and GPT each return `VERDICT: LGTM` on the same frozen packet.

## Problem

The bundle arm's tool results repeat text the same result already shows: this call's dialogue in the conversation ledger, a cited-destination Because line for a quote the game never showed, the Story goal in both the harness-trust header and the destinations block, and an ID card that says a person has not spoken on the result that printed their lines. That extra text is re-sent on later turns.

## Switch

`input-cuts-v1`, observation, needs nothing, default off, last in the registry. Bundle arm of `experiments/fixed/bundle-v-control.json` turns it on; the base preset leaves it false. Pending experiment `experiments/input-cuts-v1.json` has no queue position. Not designed and not queued.

OFF is the previous text. ON:

- The ledger does not quote this call. It says `this result's dialogue list`. Earlier turns stay quoted.
- A not-found citation is recorded with text null and is not written on the result. A quote under two words is still said. The walk still runs.
- When this result already contains `Latest story line naming a place` and the goal quote, the trust header leaves the Story goal line out.
- An ID card does not say `Has not spoken to you in this run.` for a person whose lines are in this result. The summary says they spoke during this call.

## Delete-wiring check

Removed `silenceMiss` and `goalOnce` from `playGameTools`. `input-cuts.test.ts` "the production tools drop the repeated Story goal and the not-found line only when the switch is on" went red: the observe result still contained `Story goal:`. Restored both passes. The test is green again.

## Gates

After merging main `bcde8cd4`: agent tests 2400 passed, viewer tests 1141 passed, pytest 2707 passed. `just lint` clean. `just experiments-check`: ok, 106 experiments. `just verify-vendor`: vendor OK. `just pages-check` on the explainer prints nothing. Coverage: agent statements 98.01, branches 94.18, functions 98.30, lines 99.25; viewer statements 95.36, branches 91.38, functions 93.79, lines 97.62; Python lines 97.66, branches 93.82, functions 100. Floor 90. The viewer coverage run used a 15 second test timeout; under the default 5 second timeout the pre-existing long-stream test sits next to the limit and timed out once, then passed alone. The non-coverage viewer suite passed at the default timeout.

## Principles

PB1 N/A, no run result. PB2 N/A, nothing launched. PB3 N/A, no improvement claimed. PB4 PASS, one named switch, default off. PB5 PASS, one variable, hypothesis in the pending experiment, not queued. PB6 PASS, the cuts remove repeated result text; the effect is not measured. PB7 N/A, no new event. PB8 N/A, no new model-output path. PB9 PASS, the four cuts were the operator's request. PB10 PASS, gates unchanged. PB11 N/A, no new dependency. PB12 N/A, the ROM was not read. PB13 in progress until the three review lanes return LGTM. Zero FAIL.

## navigate_to Story goal

Round 2 found that `goalOnce` read only the first text part. A `navigate_to` result puts `Navigation:` there and the story-destinations block in a later part, so the Story goal line was still added. The check now reads every text part of a `navigate_to` result. Characters still come from the first part. Observe and press are unchanged. The production test asserts the ON `navigate_to` result contains the destinations header and not `Story goal:`.

A retired goal is not treated as a repeated Story goal. Its header is the stale line, which is not a duplicate of the destinations block. `goalOnce` and `retireLab` are both passed from `playGameTools`.

## Not in this branch

The soft input band is not implemented.
