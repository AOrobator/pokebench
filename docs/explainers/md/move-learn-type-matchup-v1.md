# Move matchups and Pokémon bonuses

> Markdown twin of [move-learn-type-matchup-v1.html](../move-learn-type-matchup-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Candidate `move-learn-type-matchup-v1`. Default OFF. Requires the existing effective-damage readout and its battle-information dependencies. Intended evaluation: bundle ON, control OFF. Decision probes precede landing; no gameplay benefit has been established.

## What changes

On move-learning text, confirmation and forget screens, and ready battle decisions, a factual block shows type effectiveness, the current Pokémon’s same-type attack bonus (STAB), actual Attack and Sp. Atk, and supported known ability conditions. It never picks a move.

Foe name + types delivered<br>
Successful observation only

→

ROM chart + learner facts<br>
Current stats and ability

→

Move matchup block<br>
Model chooses its action

## Recorded Double Kick decision

Qwen run9c88, turn668, state31936/result31937: COMBUSKEN is on an early move-learning text page. Its actual party Attack is37 and Sp. Atk35. The model later declined DOUBLE KICK while asserting that ROCK resists FIGHTING. The feature must appear before the YES/NO question.

The table scrolls horizontally on narrow screens.

| Move | vs GEODUDE ROCK/GROUND | COMBUSKEN STAB | Partial product |
|---|---|---|---|
| SCRATCH / NORMAL | ×0.5 | ×1 | ×0.5 |
| EMBER / FIRE | ×0.5 | ×1.5 | ×0.75 |
| DOUBLE KICK / FIGHTING | ×2 | ×1.5 | ×3 |

The partial product is not predicted damage. DOUBLE KICK uses Attack and has two30-power hits; EMBER uses Sp. Atk. GROWL and FOCUS ENERGY are status moves. BLAZE is inactive at47/47HP; its FIRE power bonus activates at one third HP or below.

## Current damage and historical opponents

Current battle ranges reuse the existing Emerald calculator: stats, stages, STAB, type effectiveness, supported abilities, items, screens, weather, burn and rounding. Fixed two-hit moves report per-hit damage and an unchanged-conditions total; effects between hits may make the estimate unavailable. Accuracy and critical hits stay separate.

A past foe’s type profile is explicitly historical. The block does not claim its old defense, ability, HP or field conditions still apply. No hidden trainer party or future encounter enters the ledger. Current targets appear first, followed by recent profiles; at most12 profiles are displayed and64 retained, with omissions disclosed.

## Source and OFF contract

pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`: `battle_main.c:gTypeEffectiveness`, `battle_script_commands.c:Cmd_typecalc`, `gBattleMoves` and the existing source-faithful damage owner. The chart is read from the matching US Emerald ROM. Distinct defending types multiply once: Fire vs Rock/Ground is0.5, not0.25. Pure Rock’s duplicated type slots count once.

OFF preserves prior observations, prompts, tools and damage behavior. There are no new tools, button presses, routes or move rankings. The block is transient request context with recorded evidence references.

## Validation

RED tests precede implementation. Factory delivery, hidden-information boundaries, early-page coverage, ability thresholds, type arithmetic, two-hit rounding and OFF invariance are tested. Exploratory OFF/ON decision probes cover9c88,88ea,a702 and contrast decisions; inspected families are not untouched confirmation evidence.

<details>
<summary>What the probes can establish</summary>

They can show that the production block is delivered and changes next-action behavior in these recorded contexts. They cannot establish better full-game progress, a general success rate, or authorization to activate the switch.

</details>
