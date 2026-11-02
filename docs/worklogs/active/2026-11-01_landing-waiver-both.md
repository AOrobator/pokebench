# Landing record: `model-error-recovery-v1` and the `moving-npc-frame-burst-v1` promotion

Operator decision (2026-11-01): "yes we need to land A and promote B and i want both changes on main."

## Landing under an operator waiver

`CLAUDE.md` requires the Claude, Grok and GPT/Codex lanes of the review loop to each return
`VERDICT: LGTM` on the frozen packet, and says a missing or blocked cloud lane means no self-merge —
ask the operator. All three lanes were blocked on this machine, on billing and account limits:

| lane | blocker | resets |
|---|---|---|
| Claude CLI | `ActionRequiredError: You've hit your usage limit` | 2026-11-02 22:00 |
| Cursor Claude Opus | monthly model spend cap reached | 2026-11-17 |
| Cursor Claude Sonnet | same monthly spend cap | 2026-11-17 |
| Cursor Grok 4.5 | same monthly spend cap | 2026-11-17 |
| Codex GPT | `model_not_found` for `gpt-6.1-sol`, `gpt-5.3-codex`, `gpt-5.1-codex`, `gpt-5-codex`, `gpt-5.1-codex-max` | n/a |

There is no `ANTHROPIC_API_KEY` in the environment, so the `--bare` route was unavailable too. The
operator was asked and chose: **"Land both now with a recorded operator waiver (I document the blocked
lanes with their reset dates and run two advisory read-only subagent reviewers first)"**.

## What substituted for the lanes

Three read-only advisory review rounds ran against frozen packets (base `f1e53bd78`, heads
`53c1de721` / `3178ee56f` / `c49b0d625`), each with an immutable base/head/diff under
`~/.hermes/cache/scratch/`. They are advisory: they do not satisfy the `CLAUDE.md` lane requirement,
which is exactly why this waiver exists rather than a claim of compliance.

| round | scope | verdict | outcome |
|---|---|---|---|
| 1 | runtime correctness | BLOCKING | found the loop still open: fitters returned an over-limit payload silently (measured 142,667 estimated tokens with `trim: null` under a 31,822 ceiling) |
| 2 | benchmark integrity, tests | BLOCKING | found the probe blind behind the gateway, the `fail()` early return killing `failureLimit`, and that delete-the-wiring left every test green |
| 3 | delta `53c1de721..3178ee56f` | LGTM | independently proved the ceiling predicate terminates in ≤2 refusals for the recorded mlx case |
| 4 | delta `3178ee56f..c49b0d625` | LGTM | five SHOULD-FIX items, four real and fixed in `9eaf0d764` (see the worklog's second review batch) |

Every BLOCKING finding was fixed and re-tested before this landing; the fixes are in `c49b0d625`.

## Gates

`just test` ran sequentially per branch, into durable logs (`/tmp/a-gate.log`, `/tmp/b-gate.log`).

| branch | head | agent | viewer | env | gates | exit |
|---|---|---|---|---|---|---|
| A `claude/model-error-recovery-v1` | `9eaf0d764` | 5319 | 2402 | 4979 | 116 | 0 |
| B `claude/moving-npc-frame-burst-both` | `3623a82a4` (rebased onto A) | 5319 | 2407 | 4979 | 116 | 0 |

Both heads landed fast-forward only, so the gated commits are the landed commits: `main` went
`f1e53bd78` -> `9eaf0d764` (A) -> `3623a82a4` (B).

B was rebased onto A's head twice (once onto `c49b0d625`, again onto `9eaf0d764` after the final
review batch) so that every landing stayed `--ff-only`; the rebase resolved one conflict in
`experiments/feature-configs/current.json` by keeping both promotions, and B's full gate was re-run
on each rebased head. An earlier A gate showed one viewer failure out of 2402 under the coverage
runner while B's suite ran concurrently; the same suite passes 2402/2402 single-worker and passes again in the sequential run
above. It is the known `panels.test.ts` memory flake, not this change.

## Constraint that shaped the ordering

The reviewed head must not move, so this record is a docs-only commit **after** the merge rather than
part of the reviewed packet. Appending it first would have re-sealed the packet and invalidated the
head the reviewers signed.

## Deviation recorded, not smoothed over

With `model-error-recovery-v1` on, up to `failureLimit - 1` consecutive model errors are absorbed and
the `failureLimit`-th ends the run as `model_error`. PB8's default ends a run at the bound with no
absorption. The operator directed the deviation so a 24h run survives a lane refusal the harness can
work around; the bound, the loud record and the `model_error` terminal reason are all retained.
