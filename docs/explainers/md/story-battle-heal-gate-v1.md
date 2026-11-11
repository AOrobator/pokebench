# Story battle heal gate

> Markdown twin of [story-battle-heal-gate-v1.html](../story-battle-heal-gate-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`story-battle-heal-gate-v1` · guard · bundle arm only · default off · needs `heal-before-trainers-v2`

While any party Pokémon (not an egg) is below its max HP, the harness does not start an action that would start a trainer battle the player has not won and cannot run from. It says so in the game's words, names each hurt Pokémon's HP and the places the run knows of that heal the party, and the model can go ahead by calling again with `confirm: true`. Operator asked for it at 8:53 PM ET on 2026-10-20: "yes i also want the gate built", then "the gate could also be useful for the gym".

## What happened in 97a0

| Seq | Turn | What happened |
|---|---|---|
| 4539 | 156 | The navigate_to result carried the story battle warning: "Your party is not at full HP: TORCHIC 5/22. … Heal to full before this battle". |
| 4549 | 157 | navigate_to_target `{"kind":"object","local_id":2}`: MAY. |
| 4671 | 157 | RIVAL_BATTLE_STARTED. TORCHIC 5/22 against MUDKIP 20/20. |
| 4780 | 159 | Blackout at 8:44:21 PM ET. ₽3000 became ₽1500. |

A warning paragraph is advice the model can read past. The gate is a stop the model has to answer.

## How a call is decided

![One decision per checked call. "Free field" means overworld, not in battle, field controls unlocked and the player's party. A trainer who has spotted the player locks the controls as it walks over, and any script does too, so a battle the game has already started or is forcing is never gated. Every checked call while engaged is one story_battle_heal_gate event.](story-battle-heal-gate-v1/fig-1.svg)

*One decision per checked call. "Free field" means overworld, not in battle, field controls unlocked and the player's party. A trainer who has spotted the player locks the controls as it walks over, and any script does too, so a battle the game has already started or is forcing is never gated. Every checked call while engaged is one `story_battle_heal_gate` event.*

## What counts as reaching an opponent

| Call | Gated when |
|---|---|
| navigate_to_target | The target is an object on the current map that is a covered opponent. |
| press | The first A faces a covered opponent the game has loaded. Direction buttons before it count only when each one points at an adjacent opponent: a person blocks the step, so the press turns the player toward them. Any other leading button ends the check (the press is sent). |
| navigate_to | The model's own call, at its first planned route (the planner's tiles, as trainer-sight-check-v1 reads them): the walk ends on a tile next to an opponent with its last step toward it, or the route runs into an opponent's tile (an object the game has not loaded yet: the walk stops on the tile before it, facing it). On a map whose game name contains GYM, also when an unbeaten trainer can see a route tile (trainer_see.c CheckTrainer, the game server's `POST /pokebench/trainer-sight`). |

Covered opponents: the Route 103 rival MAY or BRENDAN while FLAG_DEFEATED_RIVAL_ROUTE103 is clear and the rival's object is loaded (`Route103_EventScript_Rival` runs `trainerbattle_no_intro`), and on a GYM map every trainer the game server lists in `heal_before_trainers` (a `trainerbattle` script with its trainer flag clear, loaded or not). The Gym Leader is named when it is ROXANNE (`RustboroCity_Gym_EventScript_Roxanne`, TRAINER_ROXANNE_1); other trainers are named by object id and sprite only.

![ROUTE103 (map 0/18) around MAY, from 97a0's state at seq 4540 (TORCHIC 5/22, player at (14,10)). The planner's last step to (9,3) is RIGHT, so the walk would end facing MAY: not started. To (10,4) the last step is RIGHT (facing (11,4)) and to (11,3) it is UP (facing (11,2)): both walk. These three goals are tests in story-battle-heal-gate.test.ts.](story-battle-heal-gate-v1/fig-2.svg)

*ROUTE103 (map 0/18) around MAY, from 97a0's state at seq 4540 (TORCHIC 5/22, player at (14,10)). The planner's last step to (9,3) is RIGHT, so the walk would end facing MAY: not started. To (10,4) the last step is RIGHT (facing (11,4)) and to (11,3) it is UP (facing (11,2)): both walk. These three goals are tests in `story-battle-heal-gate.test.ts`.*

## What the model would have read

97a0 turn 157, `navigate_to_target` on MAY (recorded state 4540; the OLDALE TOWN center was listed as an exit in result 4191):

Semantic navigation: not started: it would start a trainer battle you cannot run from while your party is not at full HP. Selected map object 2. Battle not started: talking to your rival MAY (object 2, at (10,3)) starts a trainer battle, and your party is not at full HP: TORCHIC 5/22. In a trainer battle the game says "No! There's no running from a TRAINER battle!" If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home. Places you know of that heal your party, nearest first: - the POKéMON CENTER in OLDALE TOWN (map 2/2), 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (6,16) in OLDALE TOWN; its nurse says "We restore your tired POKéMON to full health." - your house in LITTLEROOT TOWN (map 1/0), 4 map changes from here in the game's map table, where MOM says "I think you should rest a bit." and heals your party. To talk anyway, call navigate_to_target again with the same map_id and target and confirm: true.

Then the usual observation follows. With `confirm: true` the call runs as before.

b300 turn 501, `navigate_to` to (5,2) in RUSTBORO CITY GYM at TORCHIC 11/35 (state 15233 with the server's heal_before_trainers as heal-before-trainers-v2 replays it at result 15222):

Navigation: not started: it would start a trainer battle you cannot run from while your party is not at full HP; 0 bounded movement actions. Battle not started: this walk would start a trainer battle, and your party is not at full HP: TORCHIC 11/35. - a trainer you have not beaten (object 5, sprite HIKER, at (1,6), not loaded now: the tile the map places it on): the walk would end at (1,7), next to it and facing it; talking to it there starts the battle. - object 3, sprite YOUNGSTER at (3,9) (loaded, its tile now), facing LEFT, sight 3 tiles: it can see (1,9), step 12 of 23 on the route. - object 5, sprite HIKER at (1,6) (not loaded; where the map places it, it may have moved), facing DOWN, sight 3 tiles: it can see (1,9), step 12 of 23 on the route. A trainer who sees you walks up to you and starts a battle. In a trainer battle the game says "No! There's no running from a TRAINER battle!" If your party faints, you black out: you lose half your money (₽3222 of ₽6444) and wake up back at the last POKéMON CENTER you entered, or at home. Places you know of that heal your party, nearest first: - the POKéMON CENTER in RUSTBORO CITY (map 11/5), 2 map changes from here in the game's map table; you have not entered it, but an earlier result listed it as an exit at (16,38) in RUSTBORO CITY; its nurse says "We restore your tired POKéMON to full health." - your house in LITTLEROOT TOWN (map 1/0), 8 map changes from here in the game's map table, where MOM says "I think you should rest a bit." and heals your party. To walk anyway, call navigate_to again with the same x, y and map_id and confirm: true.

The route passes HIKER MARC's template tile (1,6), so the walk would also end next to him at (1,7). The sight lines are trainer-sight-check-v1's own lines, reused.

## With trainer-sight-check-v1

| Situation | What happens |
|---|---|
| Party hurt, the gate triggers | One server request serves both switches. The gate's refusal is the only one: it lists every sighting trainer-sight would list, and no `trainer_sight_check` event is written for that call. With `confirm: true` the gate lets it through and trainer-sight records the same sightings as confirmed, so there is no second refusal. |
| Party hurt, the gate does not trigger | trainer-sight acts exactly as before, with its own `confirm_trainer_sight`. |
| Party at full HP, or no covered opponent | The gate is silent and records nothing; trainer-sight acts exactly as before. |

## Game grounding

- "No! There's no running from a TRAINER battle!": `sText_NoRunningFromTrainers`, src/battle_message.c (pret/pokeemerald 731ad5bf).
- Blackout cost: DoWhiteOut keeps half the money, rounded down (src/overworld.c), as the existing warnings say it.
- Sight: GetTrainerApproachDistance and CheckPathBetweenTrainerAndPlayer in src/trainer_see.c, computed by `env/pokebench_env/trainer_sight.py` (trainer-sight-check-v1), not duplicated.
- Heal places: heal-before-trainers-v2's list (centers entered, the center of SaveBlock1.lastHealLocation, POKéMON CENTER 1F maps a delivered result listed as an exit, home while MOM heals), all of them nearest first by map changes in the game's map table, with the nurse's and MOM's lines.

## Wiring

`playGameTools` builds heal-before-trainers' arm once (`healArm`) and shares it with the warnings, so the gate names the same places. press and navigate_to_target are wrapped right inside the warnings (`withStoryBattleHealGate`): a refused call sends no input and returns the gate's text with a fresh observation. navigate_to's check sits beside trainer-sight's, inside `navigationTool`. explore_map and auto-talk are not gated. Off: no wrapper, no confirm argument or description sentence, no request and no event.

## Status

Gates and the Claude and Grok review are recorded in the worklog. Not measured: the pending experiment `experiments/story-battle-heal-gate-v1.json` waits for the operator.
