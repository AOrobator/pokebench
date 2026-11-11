POKÉBENCH · DEFAULT OFF · BUNDLE TREATMENT

# One direction after a rejected batch

> Markdown twin of [rejected-movement-step-v1.html](../rejected-movement-step-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`rejected-movement-step-v1`

A model request for UP, UP, UP on a controllable field submits only UP. The other directions are dropped. This uses the ordinary input endpoint and timing (10 hold frames, 8 release frames), with automatic running disabled. A direction may only turn, collide or trigger a script; movement is not promised. The next state is returned before another decision. Mixed-button requests, menus, battles, scripts and internal checked navigation retain existing behavior.

![ON: the observed result returns before the next model decision.](rejected-movement-step-v1/fig-1.svg)

*ON: the observed result returns before the next model decision.*

## OFF and ON

OFF: the original guard sends no inputs for the rejected walking batch.

ON: only the first requested direction is sent, with requested/submitted/dropped receipt.

## Illustrative receipt

```
Requested: ["UP","UP","UP"]
Submitted: ["UP"]
Dropped: ["UP","UP"]
```

Source: run 2026-10-21T11-08-02_qwen36-gpu0_9f27. Rejected batches: tool-result seq 1481 and following.

Prerequisite: `navigation-tool-use-guard-v1`. Global and control defaults remain OFF. Each repair has an independent pending experiment; no trial is approved or launched here.

Regression tests verify this mechanism. Review and landing are recorded in the worklog; measured benefit requires separate comparison runs.
