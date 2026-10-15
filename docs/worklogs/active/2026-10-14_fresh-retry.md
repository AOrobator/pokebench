# Fresh retry after a text-only reply

Branch `claude/fresh-retry`, worktree `/private/tmp/pokebench-fresh-retry`.

## Why

Two of the first six trials of the Think Fast 2×2 (whole-map navigation × navigation memory) ended `model_error`. Neither was a server error, timeout, malformed call or context overflow. Both were three text-only replies in a row (no tool call), which the governor counts as failures.

Evidence (runs/2026-10-14T19-30-06_think-fast_26e0 turns 268–270, runs/2026-10-14T19-59-09_think-fast_0c89 turns 217–219, runs/2026-10-14T15-23-36_think-fast_965d turns 219–221, runs/2026-10-14T09-50-13_think-fast_8e5d turns 289–291):

- The model is stuck in game and deliberates at length. Thinking is cut mid-sentence (think-fast runs llama.cpp with `--reasoning-budget 1024`); the reply then has prose or nothing and no tool call. 41% of text-only replies end their thinking mid-sentence, against 1% of tool-call replies.
- The failed reply stays in the context with its reasoning (`preserve_thinking`), and the retry copies it: 0c89 turns 217 and 218 are byte-identical 1,178-token replies; 8e5d repeats one 221-token reply 14 times. Sampling is not greedy (first turns differ across runs), so the repeats are copies.
- Rate: 64 text-only replies in 25,085 Think Fast turns since 10-13; 4 runs ended `model_error`, all on 10-14.

The governor already drops an errored reply before retrying (`play` slices it off). A text-only reply is kept. That asymmetry is the harness bug.

## Change

`fresh-retry-v1` (guard, default OFF): the context sent to the model omits assistant replies that made no tool call. The nudge stays. Recording is unchanged. OFF sends them as before.

## Milestone

- [x] RED: tests for the filter, the wiring and the registry (7 failing, 51 passing in harness, play-wiring, features)
- [x] GREEN: switch registered, wired through `contextTools`, explainer (agent 1033 + viewer 563 tests pass; wiring removed once → play-wiring test red, restored)
- [x] Pending experiment `experiments/fresh-retry.json` pinned to 7f1bcc2 (parses; candidate flips only fresh-retry-v1); readiness READY recorded
- [x] Gates at 5f85f32: `pnpm -r lint` clean; `pnpm -r coverage` agent 1033 tests, 97.43/93.88/98 lines/branches/functions; viewer 564 tests, 94.83/90.17/93.6. Python untouched.
- [x] Reviews on diff sha256 8620061… (base b17a67a, head 5f85f32): Claude CLI LGTM, cursor-grok-4.5-high LGTM. Both flagged PB10 evidence as written before the gate ran (now recorded above). Explainer now states the filter order. Deferred hardening: assert emit still records a text-only reply when ON (architecture verified by both reviewers in pinned pi-agent-core 0.73.1).
- [ ] Operator approval before merging to main
