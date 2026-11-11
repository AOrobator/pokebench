POKÉBENCH · RECOVERY TREATMENT

# Failed navigation outcomes

> Markdown twin of [ineffective-navigation-v2.html](../ineffective-navigation-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Count outcomes across different destinations

`ineffective-navigation-v2` · omitted/default OFF · fixed bundle ON · fixed control OFF

![Recorded evidence flows through this switch into the next model request](ineffective-navigation-v2/fig-1.svg)

*The harness supplies feedback; the model retains control of gameplay.*

## What changes

| OFF | ON |
|---|---|
| Different coordinate → counter resets | Three unchanged failed navigation calls → warning |

The detector groups free-field attempts that leave the position and relevant game conditions unchanged. Three attempts trigger the existing ineffective-loop event. Turning or moving fewer than four tiles from the episode origin does not discharge it. Four tiles of displacement, a changed condition or qualified interaction can recover. Native story progress resets it.

## Boundaries

No count is added for errors, battle, menus, locked/unknown fields or successful partial walks. It never presses a button or chooses a route. Geometry comparisons use overlap in the bounded local tile window. Nearby objects and triggers are compared by identity, so scrolling the window alone is not recovery. Missing optional evidence never proves a change. The first readable value establishes a baseline without clearing the warning; a later confirmed change can clear it, including after an unreadable gap. The helper retains at most 512 nearby identities, as well as its bounded geometry window.

## Evidence and status

Observed failure: whole-map round 6, `2026-10-19T16-13-42-353Z_qwen36-gpu0_petalburg2h-r6-whole-map`, source `b419848eb9f0`. Turns 184–236 made 53 navigation calls; turns 408–491 made no tool call. This motivates the treatment and is not a measured benefit.

Implementation branch: a working branch. Gates and independent review are recorded in `docs/worklogs/active/2026-10-19_supervisor-recovery.md`. Pending experiment; no new trial or promotion is claimed.
