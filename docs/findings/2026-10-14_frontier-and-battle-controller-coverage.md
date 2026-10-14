# Frontier subsidiary and battle-controller coverage

Primary source `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, exact US ROM SHA1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. `runs/frontier-owner-proof/rom-proof.json` retains bytecode/literal receipts. These are source/ROM and fixture qualifications; no native visit to the postgame Frontier or Safari Zone is claimed.

## Battle controller audit

Only `battle_controller_player.c` and `battle_controller_safari.c` read human `JOY_NEW` among controller files. Normal player action/move/target/reorder owners were already mapped. Added regular PlayerHandleYesNoInput080599D5 (source1419, native cursor03005D74). The unused HandleMoveInputUnused is never installed as a controller and is not an input owner. Local link players use the regular player handlers; link partner/opponent, Wally, recorded player and AI partner controllers are remote or scripted and do not accept human directional choices.

Safari action owner081593D9 uses native action cursor020244AC and emits action5SafariBall/6Pokeblock/7GoNear/8Run. `battle_main.c:3403` deliberately zeroes the Safari player's BattlePokemon: this bank represents the human trainer, not a species0 Pokémon. The continuous reader omits that strictly-zero bank from the Pokémon array and exposes `non_pokemon_battlers`. Nonzero data is a harness bug. Safari choice journal uses actor `{kind:trainer,battler,position}` and distinct action names; ordinary Pokémon actor contracts remain unchanged. Pokeblock choice receipts retain preference code1–3 and color0–14 from BufferBbytes1/2. Color0 is permitted because the native Pokeblock clearing order can yield it; no fake bag item or Pokémon actor is substituted.

Recorded playback has an additional human input outside controller files: BattleMainCB2 accepts heldB stop only when RECORDED flag is set and completion byte0203CCD0 is0. Exact getter08186450 loads literal08186464. `BattleState.playback` exposes finished/stoppable/control; readiness requires battle screen callback08038421, so external menus cannot receive this B. Dedicated UI phase `frontier_battle_replay` records the control. Post-link record confirmation is distinct callback0803937D→AskRecordBattle0803939C, communication0state5 and communication1yes/no cursor. Source table states0–12 and window12 ownership distinguish printing, selection, saving and completion; template085CD28F is decoded from ROM.

## Dome cards, bracket and results

Dedicated callback08194B55 owns tournament bracket input0819395D/state2/cursor0–31, trainer/opponent/match info input08190CD5/state2, static tournament results08194951/state3. Info heap0203CD78 has16sprite IDs followed by page position at10hex, and native task mode distinguishes next opponent/trainer/match. Dormant bracket controller beneath an info card does not make the owner ambiguous. Init tasks08194221/08190401 are explicit transitions.

Native SaveBlock2+D24 contains16 trainer entries stride4; +D64 contains48 mon IDs. Player1023/FrontierBrain1022 store direct species; other trainers use native gFacilityTrainerMons pointer0203BC8C, qualified Frontier table085D97BC stride16. Decoder validates every species and name; invalid IDs or table mismatch is a harness defect. Exact ROM trainer-order array0860D080 is verified byte-for-byte. Native trainer words, all team IDs/species and tournament round are recorded. This avoids inventing species for opponent cards.

## Facility records windows

Fourteen exact ROM script PCs qualify Tower4modes, Dome2, Palace2, Arena, Factory2, Pike, Pyramid, and Link Contest. Each script sets vars8004=7/8005facility/(optional)8006mode, calls special234CallFrontierUtilFunc, waits opcode6D, then calls special524RemoveRecordsWindow. Ready requires exact bytecode, ScriptContext mode2/native WaitForAB0809AC99/status0, matching native vars, and drawn records window ID0203AB74. Ordinary field YES/NO or unrelated button waits cannot impersonate these windows.

Decoded records retain native current/record streaks, actual current/previous flags, battle/level modes, Dome and Pike totals, Factory rental/swap counts, and all20 LinkContest category/place cells. Current streak display caps are recorded separately. Generic read_dialog is not used as a proxy for the records table.

## Shared and separately owned interfaces

Tent entry/prizes: concrete scripts in Verdanturf/Fallarbor/Slateport BattleTentLobby use common `MULTI_CHALLENGEINFO`, `MSGBOX_YESNO` save confirmation, participation Party menu, native message/default-item dialogue. Existing field multichoice/YESNO readers own actual task callbacks, IDs and ROM labels, not guessed labels. Party and save subsidiary owners are separate modules. Tent rental/swap interfaces share the Factory subsystem owned by the Pokémon agent.

Pike continue/retire: BattlePikeThreePathRoom script129–149 uses multichoice MULTI_YESNO for proceed, then ordinary YESNO retire message; the exact common field task/menu table owners observe these controls and native dialogue. Pyramid retire is not the script YESNO: it uses start_menu save-dialog callback chain and is owned by `menu_save.py` (menu agent), including Yes/No defaultNo and return/retire states. FrontierPass and PyramidBag have separate existing producers; this module does not duplicate them.

Replay entry on FrontierPass uses that module's source-owned selection; playback/record confirmation controls are handled above. Battle records (Trainer Hill and Link Battle, distinct from Link Contest) belong to the auxiliary menu agent. No navigation solver, measured run, source ROM, save RAM or model runtime was changed.

## Temporary party ownership

`party_ownership.py` separates native temporary rentals from real player-owned Pokémon throughout Factory/Slateport Tent selection, corridor, battle and restoration. Exact source map IDs: Factory(26,31–33), SlateportTent(9,2–4); rental/swap callbacks0819A4C9/0819C7E1. These are qualification scope, not ownership proof by themselves. A full rental proof matches the three current PID/species pairs to native SaveBlock2+E70 RentalMon entries stride12 and the actual native facility table (Frontier085D97BC/882 or Slateport085DE02C/70, stride16), with OT0 for initial screen creation or player trainer ID for resume reconstruction. The saved original-party header identities (SaveBlock1+234 count, +238 mons) provide a known-owned baseline; root must not fabricate Pokémon records from those IDs.

Source `battle_factory_screen.c:1815–1824` writes current rentals and their reference PIDs; `battle_factory.c:429+` reconstructs them outside battle; `load_save.c:SavePlayerParty/LoadPlayerParty` preserves/restores originals. `frontier_util.c:SaveGameFrontier` temporarily loads original party for saving, then restores current challenge party. Pike uses the selected original party, not rental ownership. VAR_FRONTIER_FACILITY40CF persists after exit and is insufficient alone. Full match is rental; saved-original match is player; incomplete native rental copy or undecodable Pokémon remains unknown. Unmatched genuine player acquires/evolution remain player-owned. Original/rental identity overlap or invalid native species/table is explicit harness error, not silent exclusion.

Final focused validation:133 tests; BattleState95%, Choice99%, Frontier98%, PartyOwnership100%, combined97%. Ruff and mypy passed for owned producers. Source/ROM qualification of unvisited postgame paths remains distinct from actual native play proof. Native first-battle and Potion proofs are described in the battle findings; no frontier benefit/deployment claim follows from fixture coverage.

## Apprentice mandatory answer menus

A dedicated `menu_apprentice.py` covers all actual menu types: level0, three species1, two species2, move alternatives3, give/no-need4, yes/no6. These are not ordinary cancellable field choices. Native Task_ChooseAnswer081A070D reads data4noB/data5wrap/data6window; constructor always noB1/wrap0 for2–3answers. Reader verifies actual menu/window ownership and exposes mandatory_answer=true/b_cancels=false with correct native selected option. Printing081A0A35 is not answer readiness; A/B continuation081A16DD is a separate message owner.

Exact ROM special table081DBA64 index407 points CallApprenticeFunction081A085D; function table086114E0 entry7→Script_CreateApprenticeMenu081A0A21→constructor081A04E4. Native QuestionData pointer030062F0 supplies paired species/moves. Three-species answers use SaveBlock2+B0 apprenticeID/B2party-choice bits/B4species-index nibbles and species subtable086109A4 stride88. Every one of160species IDs was compared against pinned `src/data/battle_frontier/apprentice.h`; all match. Fixed native level/give/yes/no option text pointers were decoded from ROM. Receipt `runs/apprentice-owner-proof/rom-proof.json` retains hashes/table comparison/options/function chain. Bad species, move, menu type, progress or ownership becomes explicit harness diagnostic, with no question-cancel claim. Focused20tests/96%coverage plus Ruff/mypy passed. This closes source/ROM/fixture ownership; an actual postgame Apprentice interaction was not claimed.

Rental clarification: actual IN_BATTLE plus native rental battle-type bit19 is independently sufficient to label battle party rental, even if field facility/map state is absent or stale. Outside battle requires the combined reference proof described above. Added explicit regression test for the independent battle flag.


## Wally temporary party ownership

The source saves the original party, creates a level-7 Zigzagoon in player slot zero, runs the tutorial catch against an enemy Ralts, then restores the original party. The replacement exists during field movement and dialog before and after the battle, so the battle flag alone does not cover the full borrowed-party interval.

The exact ROM contains a unique `special SavePlayerParty` / `special LoadWallyZigzagoon` pair at `081DC32F`, with `special LoadPlayerParty` at `081DC37D`. The helper qualifies current script PC or the bounded native return stack in `081DC335 <= PC < 081DC380`. It marks the live level-7 Zigzagoon party as tutorial-owned, keeps saved original identities as the restore baseline, and marks restored originals player-owned. An unexpected partial copy remains unavailable. An active battle with native Wally tutorial bit 9 independently establishes tutorial ownership; a stale battle flag outside battle does not suppress real player Pokémon.

The ROM receipt is `runs/frontier-owner-proof/wally-party-ownership-rom-proof.json`. These are source/ROM checks and focused fixtures; a live Wally tutorial was not visited. The ownership test suite now has 29 passing tests.
