deterministic-warp-navigation-v1 · guidance · bundle arm only · default off

# Deterministic warp navigation

> Markdown twin of [deterministic-warp-navigation-v1.html](../deterministic-warp-navigation-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

When a requested exit is one tile in a safely identical row, `navigate_to` can take the lowest-cost one under the active A\* rules. If the player already stands on a directional warp, it sends the required direction once and checks the final observed map.

## The lab case

The two south-arrow tiles in Professor Birch's lab share the same complete destination, behavior and elevation. OFF preserves the requested right-hand coordinate. ON selects the reachable left-hand coordinate because its A\* route is shorter, then performs the warp's DOWN press.

![OFF walks around to the requested right exit; ON takes the nearer identical exit and presses down](deterministic-warp-navigation-v1/fig-1.svg) ![OFF walks around to the requested right exit; ON takes the nearer identical exit and presses down](deterministic-warp-navigation-v1/fig-2.svg)

*The solid route is selected from live geometry. The dashed route is the old route to the model's exact right-hand target.*

## Exact equivalence gate

**Must match**Same source map; all three destination fields, including destination warp ID; the source-known behavior; and target elevation.

**Must be reachable**Each candidate uses the active A\* options and weighted terrain/ledge cost. Lowest cost wins; y then x breaks an equal-cost tie.

**Fail closed**Dynamic destination `0x7F`, missing or duplicate target data, unknown behavior, behavior mismatch, elevation mismatch, or no route keeps the requested coordinate.

## One press, no retry

![Known directional behavior maps to one checked direction press and either a changed map or a stop](deterministic-warp-navigation-v1/fig-3.svg)![Known directional behavior maps to one checked direction press and either a changed map or a stop](deterministic-warp-navigation-v1/fig-4.svg)

*Step-on warps and doors retain their old execution. The short circuit exists only for behaviors whose required direction is grounded in the game source.*

## What the receipt says

With the switch on, the navigation receipt keeps `target` as the coordinate the model requested and adds `selected_target` for the coordinate actually chosen. Successful directional activation reports `directional warp activated; inspect destination`. A final observation on the same map reports failure; an unavailable map identity reports an unverified transition. Both stop without retrying.

## Status

Landed on `main`. Focused behavior tests and the full agent, viewer and Python suites are green. The switch is default off and added only to the bundle arm. Its isolated experiment is blocked from the standalone queue because the treatment is measured through the bundle; no measured run has been approved, queued or launched.
