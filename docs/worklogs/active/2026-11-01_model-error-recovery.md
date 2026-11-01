# Worklog: model-error-recovery-v1

## Problem Statement

Run `2026-11-01T09-25-00_deepseek-v4.1-flash-mlx_control24h` ended `model_error` at turn 210 with
`reason: model_error` after mlx-serve refused a prompt: "This prompt (42430 tokens) does not fit in
GPU memory even after freeing the prefix cache: it requires ~2160MB GPU memory but only ~2046MB is
available." The harness resent the identical request three times inside one second and
`Governor.fail()` set `stopReason = model_error` on the third, even with
`replyFailuresEndRun: false`. A four-hour run died of a lane limit that the harness could see and
work around.

Operator (2026-11-01): build `model-error-recovery-v1`, land it, and put it on in both arms for the
DeepSeek restart.

## Skills Loaded

- `.claude/skills/execute-worklog/SKILL.md`
- `.claude/skills/feature-switch/SKILL.md`
- `.claude/skills/agent-observability/SKILL.md` (retry events are Activity History, not timeline)

## Architecture

`packages/agent/src/model-error-recovery.ts` (new) parses the refused prompt size from the lane's
memory-refusal wording and from the existing overflow wordings (`overflowTokens`), keeps a sticky
`InputCeiling` at `floor(0.75 x refused)`, and owns a condition-based readiness wait on
`GET {baseUrl}/models`.

Wiring, all agent side:

- `harness.ts`: `GovernorDeps` gains `modelErrorRecovery`, `onModelError` and the readiness wait is
  composed into `piLoop`'s `gate`, which is awaited before every model call. `Governor.fail()` never
  stops a run for a failure streak that contains a model error when the switch is on; budget,
  operator stop and loop guard still end runs.
- `context-budget.ts` / `exact-context.ts`: `capAt(tokens)` lowers the effective limit of whichever
  fitter is in use, so the next request drops oldest whole turns to `<= ceiling`.
- `live.ts`: builds the recovery object once per run from `model.baseUrl` and the recorder, then
  passes it to `controlledRun` and to `gate`.

Each ceiling change and each readiness wait is recorded as a `retry` event with its numbers in the
reason, so Activity History shows it without a new event type or timeline mark.

## Invariants

- INV-1: switch OFF leaves every path byte-identical; three consecutive model errors still end the
  run. Test: governor ON/OFF pair, `piLoop` gate absent when off.
- INV-2: switch ON, model errors never set `stopReason`; the turn is still counted, so budget and
  operator stop still end the run. Test: governor unit test plus a `play()` script that errors five
  times and then stops on budget.
- INV-3: a refusal lowers the ceiling to `floor(0.75 x N)` and the next fitted request is at or
  under it and smaller than the refused request. Test: `ContextBudget` with the real 42430 message.
- INV-4: the readiness wait polls the probe with a growing interval (capped at 60 s), is abortable
  and never a fixed sleep. Test: injected probe/clock.
- INV-5: registry default and `DEFAULT_NEXT_RUN` stay OFF; the recipe activates it. Test: registry
  and next-run pins.

## Security Review

No new attack surface: the probe is a GET to the run's own lane base URL (the same host the model
calls already use), no new user input, no file or shell access. The refused size is parsed from the
lane's own error body and only ever lowers a token ceiling.

## Milestones

### M1 — parse, ceiling and readiness module (RED then GREEN)
- [ ] RED: `model-error-recovery.test.ts` pins the real mlx wording, the 0.75 ceiling, stickiness,
      the growth and cap of the readiness interval, and abort.
- [ ] GREEN: module.
- [ ] Cheap checks: focused agent tests.

### M2 — Governor and fitters behind the switch
- [ ] RED: governor ON keeps running through model errors, OFF still ends; budget/exact cap.
- [ ] GREEN: `harness.ts`, `context-budget.ts`, `exact-context.ts`.
- [ ] Delete-the-wiring proof: remove the `gate` composition and watch the readiness test go red.

### M3 — registration, recipe and copy
- [ ] Registry entry (guard, default off), preset plumbing, `DEFAULT_NEXT_RUN` off.
- [ ] `current.json`: `onInBoth` + base true (operator 2026-11-01: "promote A ... both changes on
      main"; the switch is harness resilience, not treatment).
- [ ] Explainer page and `FEATURE_EXPLAINERS` map.
- [ ] Worklog updated per commit.

### M4 — gates and review
- [ ] `just lint`, `just build`, `just test`, `just verify-vendor` in the worktree.
- [ ] Multi-model review: Claude, Grok, GPT lanes on the frozen packet.

### M5 — land
- [ ] Landing board slot, `git merge --ff-only`, post-merge `just test`, `just viewer-main`.

## Closing the Loop

A DeepSeek control restart with `model-error-recovery-v1` on both arms survives a prompt the lane
refuses: the run trims to the ceiling, keeps playing, and the refusal is visible in Activity
History as a retry with the refused and ceiling token counts.

## Session Log

- 2026-11-01: branch `claude/model-error-recovery-v1` from main `8c2fa0614`; worklog drafted.

## Surprises

(none yet)

## Multi-Model Review Log

(pending)

## Boy Scout Log

(none)

## Archive Milestone

ASK USER before archive.

## Recipe placement

`experiments/feature-configs/current.json`: `model-error-recovery-v1` added to `onInBoth` and set
`true` in `features`, so both arms get it and registry default stays off. This is harness support,
not a treatment: the arm contrast stays on the 68 bundle switches. Four-line diff, no reformatting.

## Explainer

`docs/explainers/model-error-recovery-v1.html`, indexed in `docs/explainers/README.md`, mapped in
`packages/viewer/src/panels.ts` (`FEATURE_EXPLAINERS`) so the Harness Config card links it, with a
`panels.test.ts` card-link test and a `server.test.ts` byte-for-byte serve test.

## Tests

- `packages/agent/src/model-error-recovery.test.ts` — refusal parsing (mlx 42430, llama.cpp,
  vLLM), `ceilingFor`, `InputCeiling`, `LaneReadiness`, `modelsProbe`.
- `packages/agent/src/model-error-recovery-governor.test.ts` — a run survives five consecutive
  model errors with the switch on and still ends on the third with it off; a text-only streak still
  ends the run; the turn budget still stops a run that is absorbing errors; both fitters drop whole
  turns under the ceiling and never cut text; the production wiring builds a fitter when only
  recovery is on; registry membership, position, default-off and unchanged prompt/tool list.

## Decisions

- Ceiling is 75% of the refused prompt, floor. The refusal is the lane's own measurement of what
  does not fit; asking for three quarters leaves room for the reply and for the fitter's estimate
  error. A second refusal lowers it again; it never rises during a run.
- Text is never cut. The fitters drop oldest whole turns, which keeps every surviving message
  intact and keeps the prompt cache warm on the tail.
- Absorbed model errors reset the failure streak after being recorded, so the recorded attempt is
  per error rather than cumulative; the streak has no meaning once it cannot end the run.

## Review finding: a refusal the ceiling cannot answer (fixed)

The runtime advisory reviewer found the failure this fix addresses: both fitters stop at "keep the
newest turn" and then return the over-limit list unchanged, so when `floor(0.75 x refused)` is below
the weight of (task + system/tools + newest turn) the harness resent the *same* over-ceiling request,
the lane refused it again, the ceiling ratcheted down, and nothing ended the run — a slow hang
bounded only by the 20,000-turn budget, which is exactly what PB8's bound exists to prevent.

Fix: `ModelErrorRecovery.observe` now returns whether the run can still make progress. A refusal
that cannot lower the ceiling (the refused prompt is no smaller than what the ceiling already
allows) records `prompt refused again at N tokens; it cannot fit under the input ceiling M; ending
the run` and `live.ts` ends the run with stop reason `model_error`. The fitter behaviour is
unchanged: it still drops whole turns and never cuts text; it is now the caller that stops instead
of asking again.

Tests: a refusal lowers 42430 -> 31822 and does not end the run; a smaller refusal lowers again
(42000 -> 31500); a third refusal at the same size returns true, records the end, and the wired
governor reaches `stopReason === "model_error"`.
