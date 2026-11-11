Harness switch · observation · stale-story-goal-v2 · default off · needs stale-story-goal-v1

# Stage-bound story goal

> Markdown twin of [stale-story-goal-v2.html](../stale-story-goal-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The game can mention Birch’s lab twice for two different jobs. V2 remembers the native story stage when each line was heard, so completing the starter handoff retires only the earlier invitation. It does not guess a replacement goal.

## One place, two instructions

![The starter handoff retires the early lab invitation while the later return instruction remains active until the Pokedex](stale-story-goal-v2/fig-1.svg)

## What the model sees

V1 today

### Completed goal is still printed

```
Read from game memory, always true:
Story goal: none. PROF. BIRCH's line … is done …

Location: ROUTE101
```

V2

### The empty destination slot is omitted

```
Read from game memory, always true:

Location: ROUTE101
```

The conversation remains in recorded dialogue history. Only destination guidance, its duplicate trust line, and its walk-away supervision are omitted.

## Exact boundary

| Line first observed | Current native stage | Result |
|---|---|---|
| Before stage 3 | Before stage 3 | Active lab destination |
| Before stage 3 | Stage 3 or later | Omitted; starter handoff completed that episode |
| Stage 3 or later | Stage 3–4 | Active later return destination |
| Stage 3 or later | Pokédex / stage 5 | Omitted under v1 completion |
| Stage unreadable | Any | Kept; no completion is fabricated |

## Scope and evidence

This switch uses only recorded dialogue, its resolved place, and the game’s native Birch lab stage. It names no route, character, or next step. In six archived natural-start runs the early invitation persisted beyond the handoff; four reached Route 101 and all four explicitly pursued the lab, with three re-entering it. That shows recurrence, not benefit. The pending comparison must test whether v2 improves progress.

`input-cuts-v1` can stay on. It removes duplicate active goal text within a result; v2 separately removes a destination that is no longer active. The fixed bundle is unchanged until evidence supports promotion.
