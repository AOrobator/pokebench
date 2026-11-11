# Whole-game story checkpoints

> Markdown twin of [story-checkpoints-whole-game-v1.html](../story-checkpoints-whole-game-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Default OFF. A conservative extension to instruction memory, from Slateport through the Hall of Fame and the optional Rayquaza encounter. No gameplay benefit has been measured.

## When an episode closes

\1. All native closing milestones are recorded

\2. The episode was heard by their latest turn

\3. Every page matches the scene map and speaker

All three hold ↓<br>
Retire the whole episode

Any unmatched page keeps the whole episode eligible. The cap may still leave it out for space; the recording retains it.

## OFF and ON

| OFF | ON |
|---|---|
| The original 15 checkpoints through Devon Goods delivery in Slateport. | 41 checkpoints, including 26 new scopes through the Hall of Fame and optional Rayquaza encounter. |
| The existing memory cap remains 16,000 code points. Episode text is never cut. This switch requires the memory cap. |  |

## A later instruction stays open

At the Space Center, STEVEN asks the player to visit his home. Finishing the battle closes the occupation, but that instruction remains eligible until HM DIVE is received as well. The two milestones are both required.

## Conservative limits

Aqua Hideout chase and item clues, Route 110 and Route 119 rival tutorials, Steven's reusable Dive and Devon Scope explanations, Wally's father's Surf explanation, and Sootopolis Steven/Wallace advice stay unscoped. Their map and speaker also identify reusable or still-open advice. No English-text matching or new attribution parser is used.

Awakening Rayquaza, resolving the Sootopolis crisis, and the optional Rayquaza encounter are separate native predicates. The optional encounter supplies no story-frontier credit. Its native flag is not a capture-specific claim.

## Offline stress limits

Whole-episode packing is sensitive to small metadata changes: correcting a speaker label by one character moved which steps lost a hint. Removing an unsafe Aqua retirement scope moved the misses again. In the final source-correct snapshot, dedup ON leaves the Steven-house hint out at Aqua Hideout and Steven's Space Center invitation. Those exact known limits are recorded; other tested treatment steps keep the sampled active hints. The ranking follow-up is a separate proposal.

## Recorded form

The existing OBSERVED INSTRUCTION MEMORY payload is retained. Source result, dialogue and state event references remain in the run recording. When a completed episode is left out, the usual omitted-episode count applies. Historical runs do not acquire this setting retroactively.

## Source and validation

pret/pokeemerald 731ad5bfd: map_groups.json, scene map scripts and object sprites; flags.h, vars.h, and GameClear in post_battle_event_funcs.c. Native bindings and exact scopes are audited by story-checkpoints.test.ts. The new factory and closure checks are in whole-game-checkpoints.test.ts. The tracked whole-game story-checkpoints worklog records gate, review and landing evidence. Enabling this switch is a separate operator decision.
