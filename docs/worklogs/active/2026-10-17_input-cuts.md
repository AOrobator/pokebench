# Worklog: input-cuts-v1

Landed on main by fast-forward to `0ccb8a1c87d0b7f2dd658addfeac5c7b676ec809`. `input-cuts-v1` stays last in the registry, after clock-view-loop-v1 and stale-story-goal-v1. Local only.

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

PB1 N/A, no run result. PB2 N/A, nothing launched. PB3 N/A, no improvement claimed. PB4 PASS, one named switch, default off. PB5 PASS, one variable, hypothesis in the pending experiment, not queued. PB6 PASS, the cuts remove repeated result text; the effect is not measured. PB7 N/A, no new event. PB8 N/A, no new model-output path. PB9 PASS, the four cuts were the operator's request, then only the navigate_to miss. PB10 PASS, gates unchanged. PB11 N/A, no new dependency. PB12 N/A, the ROM was not read. PB13 PASS, the three cloud lanes returned LGTM on one packet and the diff SHA was unchanged after main's docs-only move. Zero FAIL.

## navigate_to Story goal

Round 2 found that `goalOnce` read only the first text part. A `navigate_to` result puts `Navigation:` there and the story-destinations block in a later part, so the Story goal line was still added. The check now reads every text part of a `navigate_to` result. Characters still come from the first part. Observe and press are unchanged. The production test asserts the ON `navigate_to` result contains the destinations header and not `Story goal:`.

A retired goal is not treated as a repeated Story goal. Its header is the stale line, which is not a duplicate of the destinations block. `goalOnce` and `retireLab` are both passed from `playGameTools`. The production factory turns both switches on and checks observe and navigate_to: the stale line stays, including when the destinations block is a later text part. Removing `goal.done!==true` drops that line and the test goes red.

## Not in this branch

The soft input band is not implemented.

## Landed

`git merge --ff-only 0ccb8a1c87d0b7f2dd658addfeac5c7b676ec809` on the main worktree (`/private/tmp/pokebench-land-main`). During review, main moved from `bcde8cd4ea2b8e2cb5b403be4d984eac830195ee` to `b0e04564030194969977ae435677db2d5b444f1f` (docs only: the stale-story-goal-v1 review note). The branch merged that commit, and `git diff --binary b0e04564 0ccb8a1c` SHA-256 is `5559b5a90fb5a215d794149be7f3dfa677415d8af60a2b13b63e6d3f0110d944`, the same as the reviewed packet.

Post-land `just test` on that worktree: the TypeScript suites passed after `just build`. The first viewer run failed on a stale dist; after the build, viewer tests were 1141 passed, and `pnpm -r test` passed before pytest. Pytest then failed 198 because this worktree's vendor submodule was not checked out. `git submodule update --init` checked out the pinned `bbab97ad`, and pytest passed 2707. The viewer on port 8790 was not restarted. A bundle cook is live (`just fixed-run dry-run bundle-v-control --phase cook`, two `live.js play` processes).

`experiments/input-cuts-v1.json` `source.commit` is the merge SHA `0ccb8a1c87d0b7f2dd658addfeac5c7b676ec809`. The entry stays pending, not queued, and not approved. `just experiments` was not re-run: that command writes through the primary checkout, which is on another branch.

## Multi-Model Review Log

Reviewed packet: base `bcde8cd4ea2b8e2cb5b403be4d984eac830195ee`, head `95f2394ba83086369acdcdaa6e88cd09dee170af`, diff `/tmp/review-20261018014629-51539.diff`, SHA-256 `5559b5a90fb5a215d794149be7f3dfa677415d8af60a2b13b63e6d3f0110d944`. Cursor ask mode. Empty stderr on every lane. Local inference reviewers were not run.

- Earlier head `51498b2e` (the navigate_to fix and the main merge, before the retired-goal test), diff SHA-256 `d7965ac2533919189799d203fcc845fdfa95beb7ac1d025cd44b007331e6d3b0`: Claude `claude-opus-5-5-high` VERDICT: BLOCKING (no test reaches `goal.done===true` while `goalOnce` is on, so deleting `goal.done!==true` stayed green). Grok `grok-4.7-high` VERDICT: LGTM. GPT `gpt-5.6-sol-xhigh` VERDICT: LGTM. Fix: the production factory test in `stale-story-goal.test.ts`. Removing the guard failed that test; restoring it passed.
- First pass on head `95f2394b`: Claude `claude-opus-5-5-high` VERDICT: LGTM. Grok `grok-4.7-high` VERDICT: LGTM. GPT `gpt-5.6-sol-xhigh` VERDICT: BLOCKING. The pending entry says it is not designed, and `docs/experiments/input-cuts-v1.html` does not exist.
- Rebut, no code change (`/tmp/review-20261018014629-51539-boundary-r2.md`): the operator registered this as a pending entry and said not to design, queue, or approve it. No queue position. Clock-view, stale-story, and battle-menu on main have the same shape.
- Rebuttal round, same SHA-256: Claude `claude-opus-5-5-high` VERDICT: LGTM. Grok `grok-4.7-high` VERDICT: LGTM. GPT `gpt-5.6-sol-xhigh` VERDICT: LGTM. One verdict line each. Those three are the landing verdicts.
