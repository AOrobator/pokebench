Observation switch · battle-effective-damage-v1 · needs battle-details-v2 · default off

# Battle effective damage

> Markdown twin of [battle-effective-damage-v1.html](../battle-effective-damage-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The switch turns the moves the game already exposes into a target-by-target damage matrix. It computes Emerald's landed, non-critical 85–100 damage rolls from current RAM and pinned ROM facts, then leaves the choice to the model. The harness does not rank moves, recommend a move, press a button, or hide weaker options.

## What the model sees

```
Effective damage (landed, non-critical normal hit; Emerald rolls 85-100; accuracy separate; PP availability shown; other move locks not decoded; no move ranking):
 For TORCHIC:
  1 SCRATCH · acc 100:
   -> WURMPLE (foe, screen right): 10-12 HP (66-80% of current 15 HP) · 0/16 normal-hit KO rolls · type ×1 · no STAB
  2 GROWL · acc 100 · no direct damage
  4 EMBER · acc 100:
   -> WURMPLE (foe, screen right): 51-60 HP (340-400% of current 15 HP) · 16/16 normal-hit KO rolls · type ×2 · STAB ×1.5
```

Accuracy is deliberately separate: the range is conditional on the move landing. “KO rolls” counts the sixteen ordinary damage rolls against current HP; it is not a hit-probability or a guarantee through Protect, Endure, Focus Band, or a future action.

## Deterministic pipeline

Current battler stats, stages, status, ability and held item

Move power, Gen III physical/special category, field weather and screens

Emerald integer damage order, STAB, type chart and all 16 rolls

One factual line per legal current target

Implemented against pret/pokeemerald revision `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, especially `CalculateBaseDamage`, `Cmd_damagecalc`, `Cmd_typecalc`, and `ApplyRandomDmgMultiplier`. Current modifiers include stat stages, burn, Reflect/Light Screen, rain/sun, spread damage, Charge and Mud/Water Sport, badge boosts, supported held-item effects, common stat/damage abilities, and type or ability immunities. Dual types follow the game's sequential integer rounding and minimum-one rule instead of collapsing the pair into one approximate multiplier.

## Double battles

| Move targeting | Readout |
|---|---|
| Selected target | Lists each living legal foe separately. |
| Random target | Labels that the game selects one, then shows each possible living target. |
| Spread | Lists every affected living target and applies Emerald's ×0.5 spread modifier only when two defenders remain. |
| Self / ally-capable | Labels self and ally distinctly; absent and fainted battlers are omitted. |

## Refusal boundary

Status moves say “no direct damage.” A move with 0 PP says unavailable; when every move has 0 PP, the readout shows the game's actual typeless STRUGGLE choice. Variable hit-count, fixed-damage, script-derived power or type, unknown held-item effects, and a target behind a Substitute whose HP is not decoded say “not deterministically computed.” The harness never fills a missing fact with a guess.

The calculation is a snapshot before future choices execute. It cannot know a partner's later Helping Hand, whether a move will hit, critical hits, Protect-style success, or script-controlled damage that is not a pure function of the decoded current state. Disable, Encore, Taunt, Torment, Imprison and Choice-lock state are not decoded, so PP availability is exact but those other move locks remain explicit limitations.

In doubles, selectable and random lines are the nominal pre-redirection target matrix. The current Follow Me timer and Lightning Rod turn-order redirection are not decoded; the model must not treat those rows as a promise that its selected target will remain the execution target.

## Switch boundary

When OFF, the damage context is not read and the effective-damage block is absent; the previous battle readout remains byte-for-byte unchanged. The fixed bundle records the switch OFF so it can be isolated later. Turning it ON requires `battle-details-v2`.

## Evaluation status

Implementation candidate only. The pending experiment design uses the Petalburg checkpoint and a 45-minute cap, but it is not approved, queued, or launched. Readiness and a worthwhile effect threshold must be fixed before GPU work.
