# Model error recovery

> Markdown twin of [model-error-recovery-v1.html](../model-error-recovery-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

When the lane refuses a request or dies, the harness lowers what it asks for and waits for the lane before giving up — it absorbs two consecutive lane errors and ends on the third.

## Why: a 24h run died at turn 210 for a reason the harness could have survived

Run `2026-11-01T09-25-00_deepseek-v4.1-flash-mlx_control24h` ended with `model_error` at turn 210. The lane said, verbatim:

```
This prompt (42430 tokens) does not fit in GPU memory even after freeing the prefix cache: it requires ~2160MB GPU memory but only ~2046MB is available.
```

The harness sent the identical 42430-token request three times inside one second and ended the run on the third, although `replyFailuresEndRun` was off. Nothing about the run was wrong except the size it asked for.

## What it does

A refusal that names a prompt size sets a ceiling on model input for the rest of the run at three quarters of the refused size, `floor(0.75 x 42430) = 31822`. The next request drops the oldest whole turns until it fits under that ceiling. A second refusal lowers the ceiling again; it never rises. If even the shortest request that still holds the task and the newest turn is over the ceiling, nothing can be dropped to make it fit: that request still goes out once, and the next refusal ends the run with `model_error` instead of resending it forever.

Any other model error — a dead process, a 502, a timeout — waits until the lane answers `GET /models` with a 200 before the next model call, probing on a growing interval capped at one minute.

## What it never does

It never cuts text. It drops whole turns only, through the fitters that already exist, so a message is never truncated mid-sentence. It never hides a lane failure either: two consecutive lane errors are absorbed and recorded, the third ends the run as `model_error`, and a refusal nothing can be dropped to satisfy ends it on the next refusal, not after a loop. The turn budget, Operator stop and the loop guard still end runs exactly as before.

## The gate

`model-error-recovery-v1` is a **guard** switch, registry default **off**, and **on in both arms** of the current recipe — the harness behaviour is support, not a treatment, so the arm contrast stays on the 68 bundle switches. Off: the identical request is resent, three consecutive model errors end the run, and no ceiling or wait is applied. On: up to two consecutive lane errors are absorbed and the third ends the run as `model_error`, so a dead lane still shows up as itself.

## Where to see it

Every ceiling change and every wait is recorded as a `retry` event. Activity History shows the refused size, the resulting ceiling, and how long the lane took to answer.
