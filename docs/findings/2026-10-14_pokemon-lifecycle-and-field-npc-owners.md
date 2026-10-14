# Pokémon lifecycle and field NPC input owners

Pinned primary source: `pret/pokeemerald` revision
`731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`; native US ROM SHA1
`f3ae088181bf583e55daf962a92bb46f4f1d07b7`.

| Family | Native source owner | Recorded selection and contents |
|---|---|---|
| Evolution | callbacks `0813D9B1/DD7D/DF71/E3A5/E3C1`; tasks `0813E571/F1B9` | Validated Pokémon identity/species/nickname/language, pre/post species, cancel availability, actual new move, normal custom versus trade generic YES/NO cursors, source move-learning phases |
| Egg hatch | callbacks `080717A1/08071A95`, pointer `03000DE0` | Hatch party identity, species, phase, actual nickname YES/NO selection |
| Use Pokéblock | callbacks `0816624D/62C1/6305/631D`, pointers `0203BCAC/0203BC90` | Filtered actual party indices, candidate identities/nicknames, recipient, fullness, before/after conditions and enhancements, recipient confirmation/results readiness |
| Daycare level choice | task `08071205` | List IDs `0/1/2`, real saved BoxMons, nickname/gender and computed level, selected daycare slot or EXIT |
| Mauville trader | task `08133C49` | Four actual decoration rows, source FiveMarks placeholder for unavailable rows, EXIT, saved previous-owner names/languages and already-traded flag |
| Storyteller | task `081212FD` | Actual story titles from ROM table `0859F048` stride16, saved trainer names/languages/stat values and IDs, selected story or EXIT, initialization |
| SS Tidal porthole | task `080FB5E9` | All four scene phases, cruise state, exit request, map identity; A-to-exit only in source IDLE phase |
| Field Match Call | task `081960E1` | All eight call phases, trainer ID/script origin/minutes, actual expanded message, source printer and both SE-player delay gates, A/B continuation |

Daycare list labels are deliberately empty strings in `sLevelMenuItems`.
`DaycarePrintMonInfo` draws their contents separately. Reading just list text
would lose the Pokémon names and levels. The shared pure `daycare.py` reader
uses `SaveBlock1.daycare` at `3030`, two records of140 bytes, BoxMon80 and steps
at136. It implements the source unsigned32-bit experience-plus-steps and the
actual growth table, capped at source level100. The native source function
`GetLevelFromBoxMonExp` at `080690C0` loads ROM literal `0831F72C` at
`08069124` and species-info table `083203CC` at `08069128`; species stride28,
growth offset19, six tables of404 bytes. The shared resource snapshot captures
occupied daycare Pokémon throughout a run, independent of the open menu.
Source `ZeroBoxMon` empty records are excluded; corrupt occupied records remain
explicit diagnosed Pokémon, with bounded raw bytes.

Field Match Call uses ordinary TextPrinters despite its custom task dispatcher.
`MatchCall_PrintMessage` at `08196330` calls `RunMatchCallTextPrinter`, then
`IsSEPlaying` at `080A38A0`, then checks A/B. The exact ROM literals at
`080A38D0/D4` give MusicPlayerInfo `030075F0/03007630`; status is+4. Both paused
players or both zero-track players are inactive, matching source behavior.
Printer active is `020201B0 + 24hex * window + 1Bhex`. A stale gStringVar4 is
never read outside state5 and a verified drawn call window.

Historical primary assembly at `16c05694fb02eb979f62a0de2f728772f715c883`
provides the exact lifecycle/daycare/trader/storyteller function sequence.
Field Match Call was decompiled in commit
`e1092028ecaeaa64b35352cefd21b70aa2194577`; its parent
`f8c708a82a42a9b104cd8d1d36ba6f919f589201` contains the complete matching
`asm/battle_frontier_1.s`. The similarly named older PokeNav Match Call file
is a separate interface and was not used as field-call proof. Source caches
remain outside the repository at `/tmp/pokebench-misc-menu-map`.

These late-game/lifecycle/NPC owners have source/ROM qualification and coherent
synthetic tests. They have not been reached and rendered through an ordinary
native playthrough from the pre-Gym repair probe. This finding does not claim
that proof. Actual native Pokémon representation proof is retained separately
in `2026-10-14_pokemon-decoding.md`.

The final input-source inventory also identified custom scrollable field
multichoice, Apprentice lessons, SS Tidal porthole continuation, Berry Update,
eReader and auxiliary maintenance screens. These are assigned to the primary
menu and Frontier lanes in the coordination worklog. Generic text/list/menu
engines, overworld/player movement and Braille movement puzzles are reusable
input primitives rather than additional unowned menu families.

The porthole residual is qualified by `asm/porthole.s` at
`2ad419e4b914ba17b5b3c3e60ef56726da0cf59b`, before source decompile
`244842618352ec090234bd63a0878f47459ea4a3`. The source A-button handler is
`Task_HandlePorthole`, not a fossil interface. Truck movement is automatic.
