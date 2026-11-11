DEFAULT-OFF HARNESS SWITCH

# Semantic navigation v1

> Markdown twin of [semantic-navigation-v1.html](../semantic-navigation-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The model chooses a game-owned target. The harness owns current identity, route, running, approach tile, facing, and one activation. It continues progress-making route segments without an end-to-end move cap (a call ends, without activating, when a segment makes no progress or ends on a tile an earlier segment already ended on, so cycling routes cannot loop) and rechecks ownership, target identity, and the native interaction recipient before every travel, facing, or activation input.

**Model selects**<br>
object id, interaction, warp, or edge

→

**Harness proves**<br>
route, elevation, native slot priority

→

**Move and face**<br>
run valid route prefixes

→

**Activate once**<br>
return verified state

**People and objects**<br>
Resolved by current map-local object ID plus the exact active `gObjectEvents` slot. The ON state includes every active slot in native array order, even invisible entries omitted from the display-oriented target list. When the faced tile is a counter (`MB_COUNTER` `0x80`), the harness can choose the reachable stand tile two spaces away and prove the object behind the counter is the native recipient. If the receipt is missing or an earlier compatible slot wins, the harness refuses.

**Fixed interactions**<br>
Resolved by listed kind, map coordinate, facing, and the engine's asymmetric elevation rule. A native object recipient takes priority—including an object one tile beyond a faced counter—so the harness refuses a background/metatile target that A would not actually activate. Ambiguous fixed candidates are also refused.

**Exits**<br>
Warps bind the first elevation-compatible native event at the requested tile. Arrow warps submit their game-owned direction when needed; walking connections use verified edge tiles.

**Interruption boundary**<br>
Battle, dialogue, menus, scripts, forced movement, map changes, unavailable ownership, or target drift stop the call before another input. The harness never chooses a battle or dialogue response.

## Running displacement

A held running press can cross more than one tile only when every crossed tile is the next collinear prefix of the route planned immediately before the press. Pushback, teleportation, or off-route movement stops navigation.

**Source boundary:** counter recipient selection follows `GetInteractedObjectEventScript` in pinned `pokeemerald`: inspect the faced coordinate first; if it has no non-player object and its metatile is a counter, inspect one coordinate farther in the same direction before considering the faced background. Each coordinate keeps native slot order: select the first compatible slot, then reject a player sentinel without scanning to a later object.

**OFF:** native slot receipts and `navigate_to_target` are absent. Coordinate `navigate_to` keeps its incumbent schema, execution, and result receipts.
