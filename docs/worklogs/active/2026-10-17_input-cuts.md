# Worklog: input-cuts-v1

Branch `input-cuts-v1`, base main `44c42815c1e7ed2ea743f20e5d016f881cb0d350`. Local only. Land only after Claude, Grok, and GPT each return `VERDICT: LGTM` on the same frozen packet.

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

Agent tests 2362 passed. Viewer tests 1137 passed. `just lint` clean. `just experiments-check`: ok, 106 experiments. `just verify-vendor`: vendor OK. `just pages-check` on the explainer prints nothing. Coverage: agent lines 98.04, branches 94.17, functions 98.28; viewer lines 95.36, branches 91.39, functions 93.79; Python lines 97.66, branches 93.82, functions 100. Floor 90.

## Principles

PB1 N/A, no run result. PB2 N/A, nothing launched. PB3 N/A, no improvement claimed. PB4 PASS, one named switch, default off. PB5 PASS, one variable, hypothesis in the pending experiment, not queued. PB6 PASS, the cuts remove repeated result text; the effect is not measured. PB7 N/A, no new event. PB8 N/A, no new model-output path. PB9 PASS, the four cuts were the operator's request. PB10 PASS, gates unchanged. PB11 N/A, no new dependency. PB12 N/A, the ROM was not read. PB13 in progress until the three review lanes return LGTM. Zero FAIL.

## Not in this branch

`stale-story-goal-v1` stays on its own branch. It is not merged here. The soft input band is not implemented.
