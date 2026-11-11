DEFAULT-OFF · NEEDS SEMANTIC NAVIGATION

# Deterministic exploration v1

> Markdown twin of [deterministic-exploration-v1.html](../deterministic-exploration-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`explore_map` selects one reachable thing to try. One call never consumes a whole room: the first activation or interruption returns control to the model.

**1. Read current map**

Listed native targets and verified navigation geometry.

**2. Stable choice**

Untried interaction, then warp, then walking connection; shortest route and stable identity break ties.

**3. Semantic travel**

Run, replan, approach, face, activate once.

**4. Return control**

Battle, dialogue, menu, script, forced movement, map transition, or completed activation.

## What “deterministic” means

1. The same verified state and attempted-target history produce the same selected target.
2. Each target is recorded in per-run explorer memory once its activation was actually attempted (a refusal or an interruption before activation leaves it untried), preventing the explorer from immediately choosing it again.
3. If no untried listed target has a supported route, the tool reports that fact. It does not invent a destination or walkthrough.
4. The model remains responsible for every new battle, dialogue, menu, and story decision.

## Map modes

**Whole map:** any supported route in the current native map geometry can qualify. **Visited terrain:** only terrain already delivered to the model can qualify, so the explorer can return with no supported route at the known frontier.

**Local window** (neither whole-map nor visited-terrain navigation on, as in bundle-v-control): routes are planned inside the live window around the player. A farther target is approached through the window's edge and can fail at its approach once it comes into view; that leaves it untried for the next call.

**OFF:** `explore_map` and its attempted-target memory are absent.
