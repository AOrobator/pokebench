# Warp target navigation

> Markdown twin of [warp-target-navigation-v1.html](../warp-target-navigation-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Switch: `warp-target-navigation-v1`. Default off, on in both arms of the current recipe.

## What went wrong without it

In run `2026-11-01T09-10-00_deepseek-v4.1-flash_control24h` the agent spent 1h40m inside Lavaridge Gym while its untried-exits line advertised the walkable step-on pads, each with a `navigate_to_target` handle, and the tool refused most of them. Two separate gates were responsible.

**Membership.** A warp target resolved only from the current observation's `interaction_targets`, while the exits line is built from the map's warp records. Seven of fifteen warp calls answered *target is not listed in the current verified state* for a pad one to three tiles away that the readout had just offered a handle for.

**Reachability.** The gym's floor-up pad sits in the planner's unwalkable set, so a route could not end on one. Three calls answered *no supported route to a valid approach* from a tile next to the pad.

## What the switch does

A warp the readout advertises becomes an acceptable target when its tile carries the gym's floor-up pad behaviour (`0x29`). That tile joins a third class beside traversable and blocked:

**Goal-only.** A route may *end* on the pad and never *cross* it. Stepping onto one in either direction moves the player to another floor, so routing through would teleport the walker mid-route.

**Canonical.** An enrolled pad resolves from the map's warp records on every read, at the tile's own elevation, so a walk does not see its own target change when a later observation happens to list it.

**Never a doorstep.** A pad is not used as the tile the harness stands on while pressing something else.

## What it deliberately does not do

- No destination, landing tile, floor mapping or route advice is added anywhere. A pad's label names its mechanic only: `Warp (step-on pad) … step onto tile`. The model still learns where one goes only by stepping on it.
- Floor-down holes (`0x68`) are untouched: they are traversable already and already work as exits.
- No map-id special case. The scope is the behaviour byte, so the switch cannot quietly admit a warp record over water, a wall, or the paired floor's leaked record.

## Reading a run

One asymmetry remains by design: a `navigate_to` may *end* on a pad, while a multi-direction `press` batch onto the same tile is still refused. A batch declares no goal, so it cannot distinguish a final step from a crossing, and the walker will not gamble on it.

With the switch off, every result string is unchanged and a pad is still refused exactly as before. With it on, a successful pad call walks the final step onto the pad and the world moves floors; an unreachable pad says *no supported route to the step-on warp at (x,y)* instead of denying that the pad exists.
