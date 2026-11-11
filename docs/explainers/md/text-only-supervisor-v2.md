POKÉBENCH · RECOVERY TREATMENT

# Truthful text-only supervisor

> Markdown twin of [text-only-supervisor-v2.html](../text-only-supervisor-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Keep warning text consistent with stopping policy

`text-only-supervisor-v2` · omitted/default OFF · fixed bundle ON · fixed control OFF

![Recorded evidence flows through this switch into the next model request](text-only-supervisor-v2/fig-1.svg)

*The harness supplies feedback; the model retains control of gameplay.*

## What changes

| OFF | ON |
|---|---|
| After note 3, the run ends—even when disabled | Reply stopping disabled; turn/time budgets still apply |

The production live path passes replyFailuresEndRun into the briefing owner. Enabled reply stopping retains the existing third-note message. Disabled reply stopping explicitly names the configured turn/time budgets. After the three detailed notes, continuing retries receive a short action reminder.

## Boundaries

No stop policy, retry limit or run budget changes. This treatment does not guarantee the model will call a tool. Recorded retries and note events stay available; the short reminder uses the existing governor follow-up path.

## Evidence and status

Observed failure: whole-map round 6, `2026-10-19T16-13-42-353Z_qwen36-gpu0_petalburg2h-r6-whole-map`, source `b419848eb9f0`. Turns 184–236 made 53 navigation calls; turns 408–491 made no tool call. This motivates the treatment and is not a measured benefit.

Implementation branch: a working branch. Gates and independent review are recorded in `docs/worklogs/active/2026-10-19_supervisor-recovery.md`. Pending experiment; no new trial or promotion is claimed.
