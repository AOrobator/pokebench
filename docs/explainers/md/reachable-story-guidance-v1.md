POKÉBENCH · RECOVERY TREATMENT

# Reachable story guidance

> Markdown twin of [reachable-story-guidance-v1.html](../reachable-story-guidance-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Separate destination identity from local access

`reachable-story-guidance-v1` · omitted/default OFF · fixed bundle ON · fixed control OFF

![Recorded evidence flows through this switch into the next model request](reachable-story-guidance-v1/fig-1.svg)

*The harness supplies feedback; the model retains control of gameplay.*

## What changes

| OFF | ON |
|---|---|
| Way in: this map’s NORTH edge | NORTH edge: not reachable on foot from here |

The Story goal still quotes the game character and resolves the destination against the ROM map table. Direct entrances on the current map carry foot / water / none / unknown qualification. Unknown or malformed reach data never becomes an accessibility claim. Unreachable local edges are excluded from tile-based walk-away comparisons.

## Boundaries

Topology-only cross-map distance warnings are suppressed in this treatment because disconnected map sections can make them misleading. This does not solve a multi-map route. The flood is optimistic: listed foot reach does not guarantee the navigation solver can execute a path.

## Evidence and status

Observed failure: whole-map round 6, `2026-10-19T16-13-42-353Z_qwen36-gpu0_petalburg2h-r6-whole-map`, source `b419848eb9f0`. Turns 184–236 made 53 navigation calls; turns 408–491 made no tool call. This motivates the treatment and is not a measured benefit.

Implementation branch: a working branch. Gates and independent review are recorded in `docs/worklogs/active/2026-10-19_supervisor-recovery.md`. Pending experiment; no new trial or promotion is claimed.
