Input switch · automatic-running-v1 · default off

# Automatic running

> Markdown twin of [automatic-running-v1.html](../automatic-running-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

When this switch is ON, running is a harness decision, not a model choice. For ordinary directional field travel, the harness checks the game's native running state immediately before the input and holds B whenever running is actually permitted.

## Deterministic input path

Model requests a direction through `press` or `navigate_to`

Harness reads the fresh field and running owners

Permitted: send the direction with B held through guarded travel

Not permitted: send the same direction normally; never guess

The ON schemas do not offer a `walking` argument. A stale caller that still sends `walking:true` cannot suppress running. Direction and destination remain model choices; walk-versus-run does not. If one held running input crosses several tiles, navigation accepts the whole displacement only when every crossed tile is the next collinear prefix of the planned route; an off-route push, teleport or other unexpected displacement still stops immediately.

## Native permission boundary

| Harness requests running only when | Harness withholds running when |
|---|---|
| The input is direction-only, the screen is the overworld, field controls are unlocked, no interface is active, and the decoded `running.permitted` and `running.controllable` owners are both true. | The player lacks the Running Shoes; the map or metatile disallows running; battle, dialogue, a menu, a script, forced movement or a transition owns input; the avatar is not controllably on foot; or native state is unavailable. |

This follows pret/pokeemerald revision `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. `PlayerNotOnBikeStep` selects `PlayerRun` only while B is held, `FLAG_SYS_B_DASH` is set, the avatar is not underwater, and `IsRunningDisallowed` is false. That function checks `gMapHeader.allowRunning` and the current metatile. PokeBench reads those owners rather than inferring permission from a location name.

## Switch boundary

When OFF, the previous behavior is preserved: `press` and `navigate_to` expose the optional `walking` argument, ordinary movement uses the incumbent action path, and the model may deliberately request walking. When ON, the public override is removed and eligible travel uses the guarded running path.

## Why this correction exists

A 2026-10-19 live run with the earlier implementation showed the model set `walking:true` once and then repeat it on all 30 subsequent `navigate_to` calls, including coherent outside states where native running was permitted. The guard itself was working; the model-owned override defeated the intended treatment. This version removes that decision from the model.

## Evaluation status

This is the corrected bundle-arm contract for `automatic-running-v1`. The experiment remains pending; this explainer makes no benchmark-benefit claim, and current measured runs are not retroactively changed.
