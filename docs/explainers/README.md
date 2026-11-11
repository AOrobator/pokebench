# PokéBench explainers

PokéBench measures how far language models get in Pokémon Emerald when they play through a
harness: a set of tools and readouts drawn from the game's own memory. Every behavior the
harness adds is a feature switch, and every switch has an explainer that says what changes for
the model, why it was added, where the facts come from in the game, and what is still unproven.

Each explainer exists twice:

- **Markdown** (`md/<id>.md`): reads on GitHub. Diagrams are separate SVG files in `md/<id>/`.
- **HTML** (`<id>.html`): the source, with the same text and diagrams in one self-contained
  page. Download it or open it from a local checkout; it makes no network requests.

The Markdown twins and this index are generated (`just explainer-twins`); edit the HTML.
[`../features.md`](../features.md) lists every switch with its default and whether it was on
in the reference run 67d7.

Status sections record what was true when each page was written: the tests, live proofs and
reviews at that time. Older pages can describe workflows the project has since retired.

345 explainers: 133 what the model sees, 118 guidance and tools, 78 guards and loop breakers, 5 measurement, 11 harness, viewer and tooling.

## What the model sees

Readouts built from game memory and placed beside the screenshot: maps, people, warps, menus, battles.

- [Active warp exits](md/active-warp-exits-v1.md) · [HTML](active-warp-exits-v1.html) — A map event is only an entrance candidate when its tile supports activation.
- [Adjacent tiles](md/adjacent-tiles-v1.md) · [HTML](adjacent-tiles-v1.html) — With the switch on, one line directly under the local map names the four tiles next to the player in words: up, down, left and right, each with its coordinates and the glyph the map draws for it.
- [An ID card for each person who comes into view](md/people-id-cards-v1.md) · [HTML](people-id-cards-v1.html) — When a person comes into view, the result shows their ID card: only what the game itself has shown or stored about them in this run.
- [Approach a qualified static template](md/static-npc-template-approach-v1.md) · [HTML](static-npc-template-approach-v1.html) — The native idle movement types NONE (0) and FACE UP, DOWN, LEFT, RIGHT (7–10) do not wander.
- [Approach an unloaded trainer template](md/npc-approach-feedback-v1.md) · [HTML](npc-approach-feedback-v1.html) — The template says where the map places this object.
- [Available exit presentation](md/available-exits-presentation-v1.md) · [HTML](available-exits-presentation-v1.html) — Keep blocked map facts separate from choices the model can act on.
- [Bag pocket truth](md/bag-pocket-truth-v1.md) · [HTML](bag-pocket-truth-v1.html) — The native pocket enum is 0 ITEMS, 1 POKE BALLS, 2 TMS HMS, 3 BERRIES, 4 KEY ITEMS.
- [Bag press feedback](md/bag-press-feedback-v1.md) · [HTML](bag-press-feedback-v1.html) — The old press comparison included phase, selection, value and readiness.
- [Battle details v2](md/battle-details-v2.md) · [HTML](battle-details-v2.html) — In a battle, the readout today lists raw numbers: status 0/0/0, stages (6, 6, 6, 6, 6, 6, 6, 6), move names with PP and nothing else.
- [Battle effective damage](md/battle-effective-damage-v1.md) · [HTML](battle-effective-damage-v1.html) — The switch turns the moves the game already exposes into a target-by-target damage matrix.
- [Battle loss recap](md/battle-loss-recap-v1.md) · [HTML](battle-loss-recap-v1.html) — After a whiteout or a lost trainer battle, every game result carries a short factual recap until the next story milestone.
- [Battle message waiting](md/battle-message-waiting-v1.md) · [HTML](battle-message-waiting-v1.html) — In a battle with no menu open, the readout now says what the battle is waiting for.
- [Battle move-learning input](md/battle-move-learn-input-v1.md) · [HTML](battle-move-learn-input-v1.html) — October 22 Frontier mistake E14 / defect B6.
- [Berry readout](md/berry-readout-v1.md) · [HTML](berry-readout-v1.html) — Visible loaded trees distinguish ripe berries from growing plants.
- [BIRCH INTRO PAGES](md/birch-intro-pages-v1.md) · [HTML](birch-intro-pages-v1.html) — The task that waits is the next function, not the one that loaded the string.
- [Birch speech pages](md/birch-speech-pages-v1.md) · [HTML](birch-speech-pages-v1.html) — During PROF. BIRCH's speech after the name is accepted, a page that waits for A or B now reads input-ready, and the interface value is the page on screen.
- [Blackout transition](md/blackout-transition-v1.md) · [HTML](blackout-transition-v1.html) — Emerald's CB2_WhiteOut waits 120 frames before healing and returning to the field.
- [Blocked exit fact](md/blocked-exit-fact-v1.md) · [HTML](blocked-exit-fact-v1.html) — When a script on an exit has turned the player back and its condition still holds in RAM, the result says so plainly and lists the map's other exits.
- [Bounded ID-card mentions](md/id-card-bound-v1.md) · [HTML](id-card-bound-v1.html) — A person's ID card can repeat every earlier dialogue page that names them.
- [Caught nickname input V2](md/caught-nickname-prompt-v2.md) · [HTML](caught-nickname-prompt-v2.html) — Emerald asks “Give a nickname to the captured SHROOMISH?” V2 reports the live YES/NO selection consistently.
- [Caught nickname question](md/caught-nickname-prompt-v1.md) · [HTML](caught-nickname-prompt-v1.html) — After a catch the game asks Give a nickname to the captured ZIGZAGOON?
- [Claude tool schemas every turn](md/gateway-tool-schemas-v1.md) · [HTML](gateway-tool-schemas-v1.html) — In session mode the gateway sent the full tool listing (names, descriptions and JSON parameter schemas) only on a session's first turn, or when the tool set changed.
- [Cleared obstacles come back](md/field-obstacle-respawn-v1.md) · [HTML](field-obstacle-respawn-v1.html) — A rock you smash or a tree you cut is gone only until the map loads again.
- [Coherent transition readouts](md/transition-coherence-v1.md) · [HTML](transition-coherence-v1.html) — At a battle start, at a screen handoff and on a frame the game has not finished writing, the readout now says the game is in a transition.
- [Compact map grid (compact-map-grid-v1)](md/compact-map-grid-v1.md) · [HTML](compact-map-grid-v1.html) — The switch is a server feature: it changes only how the game server writes the "Current map (observed elements v1)" grid in the observe result.
- [Complete Claude turn delivery](md/gateway-current-turn-v1.md) · [HTML](gateway-current-turn-v1.html) — The gateway saves screenshot handles from the same selected messages it renders into the Claude prompt, preserving their order.
- [Conversation ledger](md/instruction-ledger-v2.md) · [HTML](instruction-ledger-v2.html) — Every observe, press and navigate_to result on the free overworld gets one block right under the readout's Story line.
- [Cutscene journal](md/cutscene-journal-v1.md) · [HTML](cutscene-journal-v1.html) — Preserve what happened between the model’s game observations.
- [Dewford readout fixes](md/dewford-readout-fixes.md) · [HTML](dewford-readout-fixes.html) — Three switches, each default OFF, fix readouts that misled bundle run 2026-10-27T17-35-16_qwen36-gpu0_a702 after it received Mr. Stone's letter (turn 630):
- [Displayed place names](md/displayed-place-names-v1.md) · [HTML](displayed-place-names-v1.html) — Signs and the Littleroot buildings they name used to be labelled from the game's source code: the script symbol LittlerootTown_EventScript_MaysHouseSign became Mays House Sign, and the map constant became LITTLEROOT…
- [Dive and native screen correctness](md/opus-trace-correctness-v1.md) · [HTML](opus-trace-correctness-v1.html) — The avatar's native Dive flag selects underwater movement, including the step onto a listed water door.
- [Effectiveness heard](md/effectiveness-heard-v1.md) · [HTML](effectiveness-heard-v1.html) — At ROXANNE, run 2026-10-20T20-26-22_qwen36-gpu1_97a0 used EMBER on her GEODUDE calling it super effective against ROCK, although the game had printed "It's not very effective…" right after the previous EMBER.
- [Elevation-aware map](md/elevation-aware-map-v1.md) · [HTML](elevation-aware-map-v1.html) — GLM run 0d5d, turns 1094 to 1106 on ROUTE110 (12:48 to 1:16 PM New York, 23 October).
- [Entrance, not water](md/deep-south-warp-label-v1.md) · [HTML](deep-south-warp-label-v1.html) — The map-element table named metatile behavior 0x6E deep_water_exit.
- [Exit labels v2](md/exit-labels-v2.md) · [HTML](exit-labels-v2.html) — Every warp in the readout names the map it leads to the way the game's location popup names that map when you arrive, with its map ID.
- [Exit reachability](md/exit-reachability-v1.md) · [HTML](exit-reachability-v1.html) — One reachability check, made once by the game server, decides for every exit list and every navigate_to message whether the player can walk there from where they stand.
- [EXP EARNED LEDGER](md/exp-earned-ledger-v1.md) · [HTML](exp-earned-ledger-v1.html) — In the Training block: the amounts in the game's "… gained … EXP. Points!" pages the model was shown, by the battle they came from (trainer name, or wild and the species), for the last 10 battles that printed any,…
- [EXP NEXT LEVEL](md/exp-next-level-v1.md) · [HTML](exp-next-level-v1.html) — Each entry of the readout's Party line gains the two numbers the POKéMON summary screen shows under the stats.
- [Field call input](md/field-call-input-v1.md) · [HTML](field-call-input-v1.html) — Pret/pokeemerald 731ad5b, src/match_call.c and src/text.c.
- [Field move gates](md/field-move-gates-v1.md) · [HTML](field-move-gates-v1.html) — Correction approved 23 October 2026.
- [Foe items and League stock-up](md/foe-items-league-stock.md) · [HTML](foe-items-league-stock.html) — Three new switches, plus supplies-v1 moving into both arms, because Opus planned around foes that the trainer then healed and walked into the Elite Four with ₽130,696 and nothing to heal with.
- [Game clear ends the run](md/game-clear-completion-v1.md) · [HTML](game-clear-completion-v1.html) — Opus run 2026-11-10T13-52-15_opus-drake-continuation_b5a8 recorded GAME_CLEAR_CONFIRMED at turn 54.
- [Game-said goals](md/game-said-goals-v1.md) · [HTML](game-said-goals-v1.html) — When run 2026-10-20T20-26-22_qwen36-gpu1_97a0 faced COMBUSKEN's DOUBLE KICK prompts (turns 779+), it had lost to ROXANNE at turn 716 and had not beaten her since.
- [Gym evidence](md/gym-evidence-v1.md) · [HTML](gym-evidence-v1.html) — The model defeated Josh, Tommy and Marc, left to heal, and then claimed the Gym was finished.
- [Gym readiness readout](md/gym-readiness-readout-v1.md) · [HTML](gym-readiness-readout-v1.html) — Six recorded runs reached the Rustboro gym with a lone TORCHIC at Lv12–15.
- [Gym type gap (type-gap-team-v1)](md/type-gap-team-v1.md) · [HTML](type-gap-team-v1.html) — It puts three things side by side for each gym whose leader is not beaten yet: what this run has seen of the gym's types, the attacking types the game's own type chart makes super effective against them, and which of…
- [Gym type gap, last message (type-gap-team-last-message-v1)](md/type-gap-team-last-message-v1.md) · [HTML](type-gap-team-last-message-v1.html) — The operator picked "Build the placement switch" on 2026-10-27 after the type-gap decision probes.
- [Immediate leader loss comparison](md/leader-loss-immediate-v1.md) · [HTML](leader-loss-immediate-v1.html) — A verified loss reaches the very next decision, including outside the gym.
- [Input cuts](md/input-cuts-v1.md) · [HTML](input-cuts-v1.html) — Four lines in a result repeat something that same result already shows.
- [Interface guidance](md/interface-guidance-v1.md) · [HTML](interface-guidance-v1.html) — In run 0517, turn 1027 delivered the scientist's MATCH CALL instructions.
- [Keep battle damage readouts available safely](md/coherent-battle-observation-v1.md) · [HTML](coherent-battle-observation-v1.html) — OFF: capture timing stays unchanged.
- [Keep GYM on the door](md/gym-door-label-v1.md) · [HTML](gym-door-label-v1.html) — The location popup names the city for both the city and its Gym.
- [Last leader loss comparison](md/leader-loss-comparison-v1.md) · [HTML](leader-loss-comparison-v1.html) — Separately compares membership, levels, EXP and move IDs.
- [LEADER ATTEMPT LEDGER](md/leader-attempt-ledger-v1.md) · [HTML](leader-attempt-ledger-v1.html) — On a gym map's field, and at a ready battle decision against a GYM LEADER, each earlier battle with that leader this run: the party's levels and EXP. Points, the BAG, each of the leader's POKéMON seen with the HP it…
- [Level-up stats box](md/levelup-box-v1.md) · [HTML](levelup-box-v1.html) — After "TORCHIC grew to LV. 6!" the game shows a box with the new stats and waits for a button, twice.
- [Map exits name their tiles](md/connection-edge-tiles-v1.md) · [HTML](connection-edge-tiles-v1.html) — A map connection used to say only "walk across the matching edge".
- [Map-wide triggers](md/map-wide-triggers-v1.md) · [HTML](map-wide-triggers-v1.html) — The game server used to put coordinate-script trigger tiles in the state only when they were within 7 tiles of the player.
- [MART STOCK READOUT](md/mart-stock-readout-v1.md) · [HTML](mart-stock-readout-v1.html) — None of the 11 runs that reached ROXANNE between Oct 19 and 21 had bought anything first, though they arrived holding ¥4,286–6,960.
- [Mauville puzzle tiles](md/mauville-puzzle-readout-v1.md) · [HTML](mauville-puzzle-readout-v1.html) — When map-observability-v1 is enabled, the shared current-map renderer takes precedence and provides the Mauville facts through the unified schema and tokens.
- [Mid-frame readout](md/mid-frame-readout-v1.md) · [HTML](mid-frame-readout-v1.html) — A snapshot taken while the game is in the middle of a frame says so, instead of claiming the save data is not initialized.
- [Move matchups and Pokémon bonuses](md/move-learn-type-matchup-v1.md) · [HTML](move-learn-type-matchup-v1.html) — On move-learning text, confirmation and forget screens, and ready battle decisions, a factual block shows type effectiveness, the current Pokémon’s same-type attack bonus (STAB), actual Attack and Sp.
- [Move-learn comparison](md/move-learn-comparison-v1.md) · [HTML](move-learn-comparison-v1.html) — In run 2026-10-20T20-26-22_qwen36-gpu1_97a0 the model never weighed DOUBLE KICK during 100+ turns on COMBUSKEN's prompts: nothing in the readout described it beyond its name.
- [Move-learn early comparison](md/move-learn-early-comparison-v1.md) · [HTML](move-learn-early-comparison-v1.html) — When a POKéMON tries to learn a fifth move, the move comparison (its four moves and the new move, with type, power, accuracy, PP and the game's own description) now shows from the first page of the move-learning…
- [Move-learn question](md/move-learn-question-v1.md) · [HTML](move-learn-question-v1.html) — Run 2026-10-20T20-26-22_qwen36-gpu1_97a0 pressed B for 100+ turns from turn 779 on COMBUSKEN's DOUBLE KICK prompts.
- [Move-learn settle](md/move-learn-settle-v1.md) · [HTML](move-learn-settle-v1.html) — Run 2026-10-20T20-26-22_qwen36-gpu1_97a0 (v6 bundle) evolved TORCHIC into COMBUSKEN at turn 777.
- [Moving NPC frame burst](md/moving-npc-frame-burst-v1.md) · [HTML](moving-npc-frame-burst-v1.html) — DeepSeek’s control4h run entered Mr. Briney’s House and called navigate_to_target on the loaded person.
- [Named warp destinations](md/named-warp-destinations-v1.md) · [HTML](named-warp-destinations-v1.html) — The readout lists every door and staircase by map ID.
- [Native Surf navigation](md/surf-navigation-v1.md) · [HTML](surf-navigation-v1.html) — Run 274b was the first of 800 recorded runs to get Surf.
- [Native whiteout outcomes](md/whiteout-outcomes-v2.md) · [HTML](whiteout-outcomes-v2.html) — GLM lost to MAY three times in Rustboro City.
- [Neutral YES/NO controls](md/neutral-yes-no-readout-v1.md) · [HTML](neutral-yes-no-readout-v1.html) — The readout describes the current selection and both control paths, in the game's YES, NO order.
- [Nickname screens get the naming readout](md/in-game-naming-readout-v1.md) · [HTML](in-game-naming-readout-v1.html) — The player-name screen at the start of the game has always come with a readout of what has been typed and where the cursor is.
- [No story foreknowledge](md/no-story-foreknowledge-v1.md) · [HTML](no-story-foreknowledge-v1.html) — Run 2026-10-21T13-33-36_qwen36-gpu1_d548, seq 10001 (turn 306), was told in PETALBURG WOODS, before anything had happened there:
- [Observed battle action history](md/battle-action-history-v1.md) · [HTML](battle-action-history-v1.html) — Keep what the game printed beside what the next observation measured.
- [Observed trainer Pokémon](md/trainer-observed-party-v1.md) · [HTML](trainer-observed-party-v1.html) — Run 2026-10-22T20-40-54_glm53-mac_0d5d delivered WINGULL Lv18 at result 138432, its faint at 138711, and GROVYLE Lv20 at 139096.
- [Off-screen people and objects](md/offscreen-objects-v1.md) · [HTML](offscreen-objects-v1.html) — The readout shows only a 15×15 window around the player.
- [One current map](md/map-observability-v1.md) · [HTML](map-observability-v1.html) — Activation: enabled in control and bundle for fresh runs by the operator’s October 25 instruction.
- [One name for the current map](md/current-map-display-name-v1.md) · [HTML](current-map-display-name-v1.html) — When the model asks navigate_to_target for a target on a map it is not on, the tool refuses, sends no input, and says where the player is.
- [PARTY COVERAGE](md/party-coverage-v1.md) · [HTML](party-coverage-v1.html) — At battle decisions: for each foe type met this run, each of the player's moves used on it and the effectiveness line the game printed right after, then the foe types no party move has drawn "It's super effective!"…
- [Party item confirmation](md/party-item-confirmation-v1.md) · [HTML](party-item-confirmation-v1.html) — A completed Potion message can wait for a button while its printer task stays active.
- [Party menu message](md/party-menu-message-v1.md) · [HTML](party-menu-message-v1.html) — GLM run 0d5d, event 39808, turn 390: the screen showed “MUDKIP has no energy left to battle!” The old readout said “Dialog: none” and “input not ready”.
- [People ledger](md/people-ledger-v1.md) · [HTML](people-ledger-v1.html) — Right under the readout's Location and Position lines, the model sees every object the game has loaded on the current map, by its map-local object id, sprite kind and position, and when it last talked to that object:…
- [People not talked to](md/untalked-people-header-v1.md) · [HTML](untalked-people-header-v1.html) — The people ledger already says when each person on the map was last talked to, but as one line among about 60 in the readout.
- [Player elevation](md/player-elevation-readout-v1.md) · [HTML](player-elevation-readout-v1.html) — Native reparse of GLM run 0d5d, state 127085, raw RAM archive 21932.
- [Player map visibility V2](md/player-map-visibility-v2.md) · [HTML](player-map-visibility-v2.html) — See the whole current map when it is fully lit.
- [Poison readout](md/poison-readout-v1.md) · [HTML](poison-readout-v1.html) — The party status becomes readable independently of status-names-v1.
- [POKÉDEX OWN](md/pokedex-own-v1.md) · [HTML](pokedex-own-v1.html) — Once the POKéDEX is received, a line after the Party line gives the POKéDEX list's HOENN SEEN and OWN counts and the party size.
- [Post-battle readout](md/post-battle-readout-v1.md) · [HTML](post-battle-readout-v1.html) — Two readout fixes around move learning.
- [Preparation since the last attempt](md/leader-preparation-comparison-v1.md) · [HTML](leader-preparation-comparison-v1.html) — Show changes in the facts, leaving the choice to the model.
- [Readout rules in the prompt](md/readout-rules-in-prompt-v1.md) · [HTML](readout-rules-in-prompt-v1.html) — Every overworld readout repeated the same four blocks of text under its map: the symbol legend, the terrain rule, the warp-destination note and the trigger-elevation rule.
- [Readout truth](md/readout-truth-v1.md) · [HTML](readout-truth-v1.html) — Correctness fixes to readout lines that hedged or were wrong.
- [Respawn readout](md/respawn-readout-v1.md) · [HTML](respawn-readout-v1.html) — One readout line, right after Money:, says where the player wakes up if the party faints, how many map changes that is from here, and how much money it costs.
- [Retire goals when the game proves the task complete](md/native-task-goal-retirement-v1.md) · [HTML](native-task-goal-retirement-v1.html) — Control 0517, source 05d401b51f, dialogue seq 7559: DAD asks, “Hm?
- [Rotating gate areas](md/rotating-gate-regions-v1.md) · [HTML](rotating-gate-regions-v1.html) — A probe in runs/probes/gym-map-format-20261105 asked models which tiles they could reach on 8 recorded Fortree Gym turns.
- [Rotating gate readouts](md/rotating-gate-readouts-v1.md) · [HTML](rotating-gate-readouts-v1.html) — Five switches fix what a model sees and what navigate_to does in FORTREE CITY GYM and the TRICK HOUSE gate puzzle.
- [Route Summary](md/route-summary-v1.md) · [HTML](route-summary-v1.html) — Qwen spent 10-41% of its output tokens drawing the ASCII map column by column.
- [Safe scene capture](md/scene-journal-safe-capture-v1.md) · [HTML](scene-journal-safe-capture-v1.html) — The scene journal already attempts to sample after every emulator frame.
- [SAID TYPE MATCHES](md/said-type-matches-v1.md) · [HTML](said-type-matches-v1.html) — Every field page that names a type ("WATER-type") is kept once with its map.
- [Same map. Different section.](md/exit-labels-v3.md) · [HTML](exit-labels-v3.html) — Every physical exit keeps a distinct identity.
- [Screen-center player](md/screen-center-player-v1.md) · [HTML](screen-center-player-v1.html) — Under the Seaside Cycling Road the bridge is drawn over the player's sprite.
- [Script line presence](md/script-line-presence-v1.md) · [HTML](script-line-presence-v1.html) — When a dialogue page has no speaker, the harness now says who was on screen when it was shown.
- [SEEN TRAINERS LEDGER](md/seen-trainers-ledger-v1.md) · [HTML](seen-trainers-ledger-v1.html) — In the Training block: the trainers heal-before-trainers-v2 listed on each map the player stood on this run, by map: not beaten, battled and not beaten, or beaten, by the name a battle showed or else the sprite kind…
- [SHOP INTERFACE](md/shop-interface-v1.md) · [HTML](shop-interface-v1.html) — The Interface line is how the model knows which row the cursor is on and whether a press worked.
- [Shop shelves off the list](md/shop-shelf-hidden-v1.md) · [HTML](shop-shelf-hidden-v1.html) — A shop shelf only prints one flavor line, yet each shelf tile was listed as a candidate with a ready navigate_to_target argument.
- [Stage-bound story goal](md/stale-story-goal-v2.md) · [HTML](stale-story-goal-v2.html) — The game can mention Birch’s lab twice for two different jobs.
- [Stale story goal](md/stale-story-goal-v1.md) · [HTML](stale-story-goal-v1.html) — A story line that names a place stays the Story goal after that place's milestone is already done.
- [START menu selection (menu-option-null-id-v1)](md/menu-option-null-id-v1.md) · [HTML](menu-option-null-id-v1.html) — Select_menu_option could never pick anything on the START menu.
- [Status names](md/status-names-v1.md) · [HTML](status-names-v1.html) — The Party line names a Pokémon's status with the label the game's own party and summary screens show (PSN, PAR, SLP, FRZ, BRN), instead of the raw status number.
- [Story destinations](md/story-destinations-v1.md) · [HTML](story-destinations-v1.html) — When a story character's latest line names a place ("head back to the LAB", "come by my POKéMON LAB later", "He lives right next door"), the readout says which map that is and where its door or edge is, using the…
- [Story goal: player name](md/story-goal-player-name-v1.md) · [HTML](story-goal-player-name-v1.html) — When a story line says "He lives…" or "She lives…", the harness looks for the one story character named earlier in the conversation and points the Story goal at that character's house.
- [Story line campaign steps](md/story-line-campaign-flags-v1.md) · [HTML](story-line-campaign-flags-v1.html) — The game server reads a fixed set of early flags, ending around route104 cindy defeated.
- [Story line done on event](md/story-line-done-on-event-v1.md) · [HTML](story-line-done-on-event-v1.html) — A line counted as done on first entry to its place plus any later step, and a place milestone on that same arrival was enough.
- [Story line start steps](md/story-line-start-steps-v1.md) · [HTML](story-line-start-steps-v1.html) — A checkpoint run begins with badges and story steps it never earned on screen.
- [Supplies (supplies-v1)](md/supplies-v1.md) · [HTML](supplies-v1.html) — Approved by the operator on 2026-10-27, reworked the same day at the operator's request.
- [Surf movement and refusals](md/surf-navigation-correctness-v1.md) · [HTML](surf-navigation-correctness-v1.html) — A direction batch previously refused the first ocean tile while the player was already surfing.
- [Surf-gated exits](md/surf-gated-exits-v1.md) · [HTML](surf-gated-exits-v1.html) — An exit the player can reach only across water is not listed as an exit until the player can use Surf.
- [Surf-gated exits v2](md/surf-gated-exits-v2.md) · [HTML](surf-gated-exits-v2.html) — The notes surf-gated-exits-v1 adds to water-only exits say only that the water cannot be crossed yet; they no longer name the Balance Badge or SURF.
- [The current screen owns input](md/owned-battle-context-v1.md) · [HTML](owned-battle-context-v1.html) — The native battle bit can remain set while evolution or move-forget callbacks own the screen.
- [The registration page accepts A or B](md/caught-dex-input-v1.md) · [HTML](caught-dex-input-v1.html) — The registration page runs inside the battle callback.
- [TM/HM learning visibility](md/tmhm-learning-visibility-v1.md) · [HTML](tmhm-learning-visibility-v1.html) — Enabled in both arms of the current recipe and in the Opus Rayquaza lane.
- [Tutorial party owner](md/tutorial-party-owner-v1.md) · [HTML](tutorial-party-owner-v1.html) — In Norman's Wally scene the readout shows the ZIGZAGOON the game lends the player, and a party whose owner cannot be established no longer makes the agent throw away the whole observation.
- [Unset dynamic warp](md/unset-dynamic-warp-v1.md) · [HTML](unset-dynamic-warp-v1.html) — Before the moving truck stops, its exits read as a dynamic destination, not PETALBURG CITY.
- [Untaken exits](md/untaken-exits-v1.md) · [HTML](untaken-exits-v1.html) — The readout gains one factual line under the player's position: the exits on this map that the run has not used yet.
- [Untalked people in gym (untalked-in-gym-v1)](md/untalked-in-gym-v1.md) · [HTML](untalked-in-gym-v1.html) — On a gym map, each game-tool result carries, ahead of the readout, the people on the map the player has not talked to this run, with their tiles.
- [Verified warp reachability](md/verified-warp-reach-v1.md) · [HTML](verified-warp-reach-v1.html) — The terrain estimate includes the ladder at (42,25), even from the bridge at (21,11).
- [Verified Waterfall handoff](md/waterfall-handoff-verification-v1.md) · [HTML](waterfall-handoff-verification-v1.html) — At the foot of a waterfall, a direction press can leave the player facing away.
- [Warp arrival settle](md/warp-arrival-settle-v1.md) · [HTML](warp-arrival-settle-v1.html) — After a door, stairs or warp, the observation now waits, one emulated frame at a time, until the game's own door/warp task lets go of the player.
- [Warp target navigation](md/warp-target-navigation-v1.md) · [HTML](warp-target-navigation-v1.html) — In run 2026-11-01T09-10-00_deepseek-v4.1-flash_control24h the agent spent 1h40m inside Lavaridge Gym while its untried-exits line advertised the walkable step-on pads, each with a navigate_to_target handle, and the…
- [Warps by landing area](md/warp-areas-v1.md) · [HTML](warp-areas-v1.html) — On turn 1,533 of DeepSeek run 274b, standing at (0,10) on LAVARIDGE TOWN GYM B1F, 15 Warp destination lines took 13,252 of the 38,156 characters the model got.
- [Whiteout healed](md/whiteout-healed-v1.md) · [HTML](whiteout-healed-v1.html) — In run 2026-10-20T16-14-34_qwen36-gpu1_c6c2 the model lost to MAY at turn 256 and whited out.
- [Whiteout notice](md/blackout-readout-v1.md) · [HTML](blackout-readout-v1.html) — When the player whites out, the readout says so once and the same observation records a durable blackout event: the party had no usable Pokémon left, the game took the player back to the last place they healed,…
- [Who is actually here](md/character-presence-v1.md) · [HTML](character-presence-v1.html) — The model keeps seeing PROF. BIRCH where he is not.
- [Who spoke in the Rustboro chase?](md/authored-scene-labels-v1.md) · [HTML](authored-scene-labels-v1.html) — This experimental switch supplies authored speaker roles for the stolen-Goods chase and the later Devon employee request.
- [YES/NO answer readout](md/yes-no-answer-readout-v1.md) · [HTML](yes-no-answer-readout-v1.html) — Run 2026-10-20T19-58-04_qwen36-gpu0_ef9f set the wall clock and then answered NO on the confirmation, again and again, from turn ~100 to 156 (8:02–8:09 PM ET).

## Guidance and tools

Prompt text, navigation tools and automatic input handling that help the model act on what it sees.

- [A battle decision starts at a decision screen.](md/battle-decision-ready-v1.md) · [HTML](battle-decision-ready-v1.html) — The harness dismisses ordinary battle messages before asking the model what to do.
- [A goal on another map is not a map change](md/cross-map-goal-v1.md) · [HTML](cross-map-goal-v1.html) — Navigate_to takes a map_id with every target.
- [Advisory instruction goals](md/instruction-goal-advisory-v1.md) · [HTML](instruction-goal-advisory-v1.html) — With the instruction ledger enabled, pending dialogue and rejected bookkeeping no longer prevent a game-changing tool from reaching its ordinary validation.
- [Align cache window rewrites](md/cache-aligned-window-v1.md) · [HTML](cache-aligned-window-v1.html) — Both experiment arms use this policy when explicitly selected.
- [Auto-bike](md/bike-navigation-v1.md) · [HTML](bike-navigation-v1.html) — Three switches, all default off, all in the bundle arm only (the operator 2026-11-03: "i agree with ur changes, u can build it").
- [Automatic running](md/automatic-running-v1.md) · [HTML](automatic-running-v1.html) — When this switch is ON, running is a harness decision, not a model choice.
- [Away note in town buildings](md/away-note-buildings-v1.md) · [HTML](away-note-buildings-v1.html) — With harness-trust-v1, a SUPERVISOR note follows the header when the player's own last two moves both took them farther from the place the Story goal line names.
- [Badge resets cycles](md/badge-resets-cycles-v1.md) · [HTML](badge-resets-cycles-v1.html) — Run 37ca was told "You are stalling.
- [Battle action tool](md/battle-move-tool-v1.md) · [HTML](battle-move-tool-v1.html) — A tool call for the battle menu instead of a button path.
- [Battle text auto-advance](md/battle-text-auto-advance-v1.md) · [HTML](battle-text-auto-advance-v1.html) — Battle messages advance the way field dialogue already does.
- [Battle triage guidance](md/battle-triage-guidance-v1.md) · [HTML](battle-triage-guidance-v1.html) — The model fights every wild battle, even when its own Pokémon is nearly fainted.
- [Blocked batch results](md/blocked-batch-result-v1.md) · [HTML](blocked-batch-result-v1.html) — When the model presses one direction several times and the player does not move, the press result now says the player was blocked, where it is standing, which way it faces, and what the readout shows on the next tile.
- [Bounded refusal history (refusal-ledger-bound-v1)](md/refusal-ledger-bound-v1.md) · [HTML](refusal-ledger-bound-v1.html) — That switch adds "Navigation refusal history" to the belief ledger message: one entry for each target on the current map that navigation refused.
- [Briefing repeat count](md/briefing-repeat-count-v1.md) · [HTML](briefing-repeat-count-v1.html) — When the loop guard sends a supervisor briefing, the focused briefing (supervisor-briefing-v2) lists the three most recent attempts.
- [Catch Rayquaza](md/opus-rq-catch-v1.md) · [HTML](opus-rq-catch-v1.html) — Sootopolis crisis resolved and Master Ball held.
- [Cited destination](md/cited-destination-v1.md) · [HTML](cited-destination-v1.html) — Runs invent exits: e046 wrote "Oldale's east exit to Petalburg" (s18744) and "Route 103's north exit to Rustboro" (s17437) when no such line was ever shown.
- [Claude schema re-ask hint](md/gateway-schema-hint-v1.md) · [HTML](gateway-schema-hint-v1.html) — When a reply's arguments fail validation, the gateway re-asks once with the error.
- [Current boundary facts](md/boundary-crossing-facts-v1.md) · [HTML](boundary-crossing-facts-v1.html) — E3 repeatedly asked to navigate to the tile already occupied.
- [Current question focus](md/current-question-focus-v1.md) · [HTML](current-question-focus-v1.html) — Qwen can remember the right task and still answer a different question.
- [Dark area FLASH reminder](md/dark-area-flash-reminder-v1.md) · [HTML](dark-area-flash-reminder-v1.html) — On the first free-field result after entering an unlit cave, say what your bag, your badge and your party say about FLASH — then let the model decide.
- [Delivered person and place evidence](md/delivered-place-evidence-v1.md) · [HTML](delivered-place-evidence-v1.html) — Frontier mistakes E2/E3/E6: keep what the game said usable without inventing a person or a route.
- [Destination-first navigation](md/destination-first-navigation-v1.md) · [HTML](destination-first-navigation-v1.html) — Choose where to go.
- [Deterministic exploration v1](md/deterministic-exploration-v1.md) · [HTML](deterministic-exploration-v1.html) — Explore_map selects one reachable thing to try.
- [Deterministic warp navigation](md/deterministic-warp-navigation-v1.md) · [HTML](deterministic-warp-navigation-v1.html) — When a requested exit is one tile in a safely identical row, navigate_to can take the lowest-cost one under the active A* rules.
- [Dialogue A line](md/dialogue-a-line-v1.md) · [HTML](dialogue-a-line-v1.html) — B is the button for a message.
- [Dialogue button B](md/dialog-button-b-v1.md) · [HTML](dialog-button-b-v1.html) — B moves a message along.
- [Dialogue kept in context](md/dialogue-context-kept-v1.md) · [HTML](dialogue-context-kept-v1.html) — Older tool results still shrink to one line, but the dialogue they showed stays, whole.
- [Dialogue log and recall_dialogue](md/dialogue-log-v1.md) · [HTML](dialogue-log-v1.html) — The harness writes down every dialogue page the model was actually shown, in order, for the whole run.
- [Dialogue reads itself to the next decision](md/dialogue-auto-advance-v1.md) · [HTML](dialogue-auto-advance-v1.html) — About half of Think Fast's turns are a single A or B press through dialogue.
- [Discovered gym checklist](md/discovered-gym-checklist-v1.md) · [HTML](discovered-gym-checklist-v1.html) — A gym becomes an obligation only when its identity appears in a successful delivered location, entrance, sign or field-dialogue observation.
- [Disproved beliefs ledger](md/disproved-beliefs-v1.md) · [HTML](disproved-beliefs-v1.html) — In run sh02 the model kept acting on beliefs the game had already contradicted: it looked for Professor Birch on the lab's tiles while every lab readout said he was not on the map and the scientist said he was away,…
- [Doubled context window](md/double-context-window-v1.md) · [HTML](double-context-window-v1.html) — This switch doubles how much: up to 40 turns instead of 20, and 12 full tool results with their screenshots instead of 6.
- [Eight badge mission](md/eight-badge-mission-v1.md) · [HTML](eight-badge-mission-v1.html) — The untargeted mission explicitly includes all eight Gym Badges.
- [Every tool in the system prompt](md/tool-prompt-docs-v1.md) · [HTML](tool-prompt-docs-v1.html) — The model is given a list of tools, each with its own short description, and a system prompt that explains how to play.
- [Explicit evolution decision](md/evolution-decision-v1.md) · [HTML](evolution-decision-v1.html) — The model chooses whether to evolve or cancel.
- [Explore a new edge. Don’t mistake it for a verified route.](md/navigation-refusal-reasons-v3.md) · [HTML](navigation-refusal-reasons-v3.html) — Control run 7945 was below a one-way ledge in Petalburg Woods.
- [Fail-open input](md/fail-open-input-v1.md) · [HTML](fail-open-input-v1.html) — The operator, 2026-10-20: a fail-open design for boxes or UI the harness does not recognize, so the model decides from what is on screen, and B can dismiss them.
- [Family and repeat conversations](md/explorer-family-guidance-v1.md) · [HTML](explorer-family-guidance-v1.html) — No experiment launched or gameplay benefit established.
- [Finish the message. Then make a new choice.](md/pending-field-dialogue-v1.md) · [HTML](pending-field-dialogue-v1.html) — An ordinary dialogue box can appear just after navigation returns.
- [Focused supervisor briefings](md/supervisor-briefing-v2.md) · [HTML](supervisor-briefing-v2.html) — Make the next decision easier to see
- [Game evidence first](md/game-evidence-priority-v1.md) · [HTML](game-evidence-priority-v1.html) — A system-prompt section that tells the model this game's own evidence outranks what it remembers about Pokémon.
- [Gate turns and push log](md/rotating-gate-turns-log-v1.md) · [HTML](rotating-gate-turns-log-v1.html) — Two switches for maps with rotating gates.
- [Get and register the Mach Bike](md/opus-rq-mach-bike-v1.md) · [HTML](opus-rq-mach-bike-v1.html) — Free field in Mauville or Rydel’s shop.
- [Goal review repair feedback](md/goal-review-repair-feedback-v1.md) · [HTML](goal-review-repair-feedback-v1.html) — Show the invalid field and real references.
- [Grass Cost Switch](md/grass-cost-switch.md) · [HTML](grass-cost-switch.html) — A new switch, grass-cost-navigation-v1, makes the walking planner count each step into grass as 1.5 steps.
- [Grass strides (grass-strides-v1)](md/grass-strides-v1.md) · [HTML](grass-strides-v1.html) — When it is on, a navigate_to stride may cross ordinary tall grass, so the player can run there instead of being forced to walk.
- [Harness trust](md/harness-trust-v1.md) · [HTML](harness-trust-v1.html) — The model keeps losing true facts to what it remembers about Pokémon games: run 4caa read MAY's "head back to the LAB" and then decided the lab was in Rustboro.
- [How A\* navigation works in our harness and PokeAgent's](md/astar-navigation.md) · [HTML](astar-navigation.html) — A* finds the shortest route across a grid of tiles.
- [Instruction goals](md/instruction-goal-ledger-v1.md) · [HTML](instruction-goal-ledger-v1.html) — The game supplies exact dialogue.
- [Instruction ledger](md/instruction-ledger-v1.md) · [HTML](instruction-ledger-v1.html) — A short block pinned before every decision: the latest dialogue the model was shown, the rooms it visited with what it heard there, and contradictions it recorded itself.
- [Instruction memory YAML](md/instruction-memory-yaml-v1.md) · [HTML](instruction-memory-yaml-v1.html) — The selected instruction-memory payload becomes readable YAML.
- [JIT v2 · stable core, timely guidance](md/just-in-time-prompt-v2.md) · [HTML](just-in-time-prompt-v2.html) — Exact proposed experiment preset, measured locally from source on 2026-10-18.
- [Keep the instruction whole.](md/observed-instructions-v1.md) · [HTML](observed-instructions-v1.html) — The model still chooses what to do.
- [Keep the upstairs instruction](md/observed-field-dialogue-v1.md) · [HTML](observed-field-dialogue-v1.html) — All delivered field-dialogue episodes enter the existing instruction memory, including WOMAN_4 or null speaker attribution.
- [Learn move tool](md/move-learn-tool-v1.md) · [HTML](move-learn-tool-v1.html) — A new tool, learn_move(forget), answers the game's move-learning prompts in one call.
- [Ledges are one-way doors, not walls](md/ledge-hops-v1.md) · [HTML](ledge-hops-v1.html) — Emerald's ledges are marked as collision in the map data, so our map drew them as # and navigate_to walked around them.
- [Menu item guidance](md/menu-item-guidance-v1.md) · [HTML](menu-item-guidance-v1.html) — Requested after bundle run gpu1_2e93, turns 548–563: Torchic stayed at 24/31 HP and Potion ×1 while the model repeatedly opened SUMMARY.
- [Milestone instruction memory](md/milestone-instruction-memory-v1.md) · [HTML](milestone-instruction-memory-v1.html) — Keep the evidence.
- [Move-learning goal reminder](md/move-learn-goal-reminder-v1.md) · [HTML](move-learn-goal-reminder-v1.html) — Updated October 23: every verified move-learning choice gets a reminder when the switch is ON.
- [Navigate already here](md/navigate-already-here-v1.md) · [HTML](navigate-already-here-v1.html) — When the model calls navigate_to for the tile the player already stands on, the route is empty and no button is pressed.
- [Navigate_to first](md/navigate-first-prompt-v1.md) · [HTML](navigate-first-prompt-v1.html) — With the switch on, the model is told in three places that navigate_to is how it moves: the tool list in the system prompt, a new last section of the prompt, and the start of the navigate_to description.
- [navigate_to now climbs stairs and crosses bridges](md/elevation-transitions.md) · [HTML](elevation-transitions.html) — Every map tile has an elevation from 0 to 15, and the player carries one too.
- [navigate_to says why it cannot walk](md/navigation-refusal-reasons-v1.md) · [HTML](navigation-refusal-reasons-v1.html) — When navigate_to refuses, the model used to get one of two generic lines.
- [Navigation and dialogue messages that match the game](md/navigation-truth-v1.md) · [HTML](navigation-truth-v1.html) — The 2026-10-16 cook audit found seven places where navigate_to, the loop guard or dialogue auto-advance told the model something the game did not support.
- [Navigation refusal history](md/refusal-ledger-v1.md) · [HTML](refusal-ledger-v1.html) — Qwen repeatedly asked for the same destination after the harness returned a route refusal.
- [Next-milestone hint](md/next-milestone-hint-v1.md) · [HTML](next-milestone-hint-v1.html) — Tells the model the next main-story milestone to pursue.
- [No exit here](md/no-exit-here-v1.md) · [HTML](no-exit-here-v1.html) — Runs invent exits and then walk into a map edge that leads nowhere: e046 wrote "Oldale's east exit to Petalburg" (s18744) and "Route 103's north exit to Rustboro" (s17437); deb4 read "SOUTH -> ROUTE116" and "EAST ->…
- [No open story goal](md/no-open-story-goal-v1.md) · [HTML](no-open-story-goal-v1.html) — After the Magma Emblem in run a0b4, the latest place-naming line was ARCHIE's, about MT. PYRE, a place the run had already reached.
- [Notice the starter decision. Keep the choice with the model.](md/starter-decision-salience-v1.md) · [HTML](starter-decision-salience-v1.html) — This treatment adds one neutral reminder at a verified ready starter menu.
- [Open goal prompt](md/open-goal-prompt-v1.md) · [HTML](open-goal-prompt-v1.html) — One sentence of the system prompt changes.
- [Original-speed deadline pacing](md/original-speed-pacing-v1.md) · [HTML](original-speed-pacing-v1.html) — The operator goal is an actual 80 core frames per second during normal play.
- [Pick up the Master Ball](md/opus-rq-master-ball-v1.md) · [HTML](opus-rq-master-ball-v1.html) — Free field in Aqua Hideout B1F with a readable bag.
- [Plan the corridor. Validate each step. Stop at its end.](md/safe-navigation-strides-v1.md) · [HTML](safe-navigation-strides-v1.html) — A* still routes to the coordinate the model chooses.
- [PokéNav call auto-advance](md/pokenav-call-auto-advance-v1.md) · [HTML](pokenav-call-auto-advance-v1.html) — Qwen run 88ea spent 116 turns and about 22 minutes inside the forced tutorial.
- [Positive supervisor](md/positive-supervisor-v1.md) · [HTML](positive-supervisor-v1.html) — Today's learning (the operator, 2026-10-20): telling the model what to do, and changing what it sees, beat warnings that it is looping.
- [Presence penalty 1.5](md/presence-penalty-v1.md) · [HTML](presence-penalty-v1.html) — With the switch on, every chat request the agent sends the model carries presence_penalty: 1.5.
- [Push-back press results](md/pushback-press-result-v1.md) · [HTML](pushback-press-result-v1.html) — Scripts move the player while dialogue auto-advance pages their message, between two snapshots of one press, and between one call and the next.
- [Quoted destination evidence](md/citation-evidence-v1.md) · [HTML](citation-evidence-v1.html) — The model selects where to walk.
- [Rayquaza lane guide](md/rq-milestone-guide-v1.md) · [HTML](rq-milestone-guide-v1.html) — Two switches for the Rayquaza lane, also called the Ray Ray lane.
- [Reachable departure section alternatives](md/reachable-section-alternatives-v1.md) · [HTML](reachable-section-alternatives-v1.html) — E9 repeatedly tried an unreachable edge of ROUTE 104.
- [Reachable story guidance](md/reachable-story-guidance-v1.md) · [HTML](reachable-story-guidance-v1.html) — Separate destination identity from local access
- [Remember only the ground already seen](md/visited-terrain-navigation-v1.md) · [HTML](visited-terrain-navigation-v1.html) — An emulator checkpoint restores the game, not this memory.
- [Remember the employee’s request](md/native-instruction-tasks-v1.md) · [HTML](native-instruction-tasks-v1.html) — The existing instruction ledger can automatically retain one verified game request: the Rustboro employee asks for his DEVON GOODS.
- [Remember what the model actually saw](md/navigation-evidence-memory-v1.md) · [HTML](navigation-evidence-memory-v1.html) — Ordinary observations and the existing sliding conversation.
- [Restored live memory](md/restored-memory-run-v1.md) · [HTML](restored-memory-run-v1.html) — A continuation keeps its history and follows new observations.
- [Reuse retained JIT guidance](md/jit-guide-reuse-v1.md) · [HTML](jit-guide-reuse-v1.html) — Requires JIT v2; affects only its guidance projection.
- [ROM identity](md/rom-identity-v1.md) · [HTML](rom-identity-v1.html) — This is the exact tested text.
- [Roxanne campaign reminder](md/roxanne-campaign-reminder-v1.md) · [HTML](roxanne-campaign-reminder-v1.html) — The candidate arm appends one bounded strategy reminder after restored history.
- [Sand, caves and mountain tops are floor, not walls](md/walkable-floor-v1.md) · [HTML](walkable-floor-v1.html) — The map text has always drawn these tiles as ., but navigate_to kept its own short list of walkable tile types: plain ground, grass and doors.
- [Say when the route leaves the local map](md/navigation-refusal-reasons-v2.md) · [HTML](navigation-refusal-reasons-v2.html) — Local navigate_to plans over the 15x15 tiles around the player.
- [Scene follow-up](md/scene-followup-prompt-v1.md) · [HTML](scene-followup-prompt-v1.html) — When a scene plays out on its own, the next request gets one SUPERVISOR message.
- [Screenshot and button baseline](md/screenshot-button-baseline-v1.md) · [HTML](screenshot-button-baseline-v1.html) — The model sees screenshots, ordinary conversation history and two tools: observe and press.
- [Select a menu option](md/menu-option-tool-v1.md) · [HTML](menu-option-tool-v1.html) — OFF uses the previous tools and prompt.
- [Semantic current-map feedback](md/semantic-current-map-feedback-v1.md) · [HTML](semantic-current-map-feedback-v1.html) — A stale map request gets current facts.
- [Semantic navigation v1](md/semantic-navigation-v1.md) · [HTML](semantic-navigation-v1.html) — The model chooses a game-owned target.
- [Semantic navigation v2](md/semantic-navigation-v2.md) · [HTML](semantic-navigation-v2.html) — Recorded probe, run f28d turn 443: Birch has just said to go see MAY, and she is on the same map.
- [Send the reasoning effort](md/reasoning-effort-request-v1.md) · [HTML](reasoning-effort-request-v1.html) — Run f604's first request, sent to vLLM's tokenizer on the real server:
- [Speed runs skip nicknames](md/no-nickname-guidance-v1.md) · [HTML](no-nickname-guidance-v1.html) — One system-prompt paragraph: a nickname only costs time, so answer NO when the game offers one, and if the naming screen is already open, leave it with START then A.
- [Step into a walking path](md/moving-npc-intercept-v1.md) · [HTML](moving-npc-intercept-v1.html) — After the DEVON GOODS, MR. BRINEY and PEEKO walk the same loop around the table in the cottage, nonstop.
- [Talk to people](md/explorer-guidance-v1.md) · [HTML](explorer-guidance-v1.html) — A short system-prompt section saying that in this game, people tell you where to go next.
- [Talk to people, v2](md/explorer-guidance-v2.md) · [HTML](explorer-guidance-v2.html) — A generic version of the talk-to-people prompt section.
- [Teach the speedrun moveset](md/opus-rq-moveset-v1.md) · [HTML](opus-rq-moveset-v1.html) — Rain Badge held and Rayquaza in the party.
- [Tell a restored run that it resumed.](md/save-state-task-truth-v1.md) · [HTML](save-state-task-truth-v1.html) — Verified save state input is not a fresh boot.
- [The bedroom chair has walls on two sides](md/one-way-tiles-v1.md) · [HTML](one-way-tiles-v1.html) — The chair in the player's bedroom has no collision, so the map drew it as plain floor (.).
- [The current screen selects the instructions](md/just-in-time-prompt-v1.md) · [HTML](just-in-time-prompt-v1.html) — Before every live model request, the harness reads its latest recorded screen and selects matching prompt sections and tools.
- [The scripted Gym tour names a real destination.](md/scripted-place-guidance-v1.md) · [HTML](scripted-place-guidance-v1.html) — Pokémon Emerald forces a boy to lead the player to Petalburg Gym.
- [Town Center checkpoint](md/town-center-checkpoint-v1.md) · [HTML](town-center-checkpoint-v1.html) — Entering a Center sets the local blackout return point even with a healthy party.
- [Trainer heal guidance](md/trainer-heal-guidance-v1.md) · [HTML](trainer-heal-guidance-v1.html) — One system-prompt section with the game's rules for trainer and rival battles: they cannot be fled, losing costs half your money and a trip back, and you should heal first when your Pokémon is below half HP.
- [Trainer sight check](md/trainer-sight-check-v1.md) · [HTML](trainer-sight-check-v1.html) — Before navigate_to walks, the game server tests every tile of the planned route against the line of sight of every trainer on the map the player has not beaten, using the game's own rule.
- [Transition press results](md/transition-press-result-v1.md) · [HTML](transition-press-result-v1.html) — The "Press result:" line compares the game state read just before a press with the state after it.
- [Truthful text-only supervisor](md/text-only-supervisor-v2.md) · [HTML](text-only-supervisor-v2.html) — Keep warning text consistent with stopping policy
- [Unfinished activity memory](md/unfinished-activity-v1.md) · [HTML](unfinished-activity-v1.html) — The agent remembers what it started and did not finish, across detours, in the game's own words.
- [Unique instruction memory](md/instruction-memory-dedup-v1.md) · [HTML](instruction-memory-dedup-v1.html) — The instruction-memory and person/place switches can both select the same conversation.
- [Unnamed place story line](md/unnamed-place-story-line-v1.md) · [HTML](unnamed-place-story-line-v1.html) — In run ee2a, unnamed Aqua grunts said "Okay!
- [What happens on entering Rusturf?](md/rusturf-entry-followup-v1.md) · [HTML](rusturf-entry-followup-v1.html) — One reminder follows the first safe, current Rusturf observation actually delivered to the model.
- [When does the startup prompt reach Qwen?](md/checkpoint-research-note-v1.md) · [HTML](checkpoint-research-note-v1.html) — The implemented trigger is configured saved-game startup.
- [Window escape route](md/window-escape-route-v1.md) · [HTML](window-escape-route-v1.html) — With full-map-navigation-v1 off, navigate_to plans only inside the 15x15 local map around the player.
- [You can talk across a counter](md/counter-talk-v1.md) · [HTML](counter-talk-v1.html) — The tile in front of a Pokémon Center nurse is a counter.

## Guards and loop breakers

Checks that catch a stuck or looping model, refuse unsafe actions, or end a stalled run under limits the operator set.

- [A milestone drought produces a notice](md/milestone-stall-stop-v1.md) · [HTML](milestone-stall-stop-v1.html) — After 10 unpaused minutes with no newly observed milestone counted by this clock, it requests one factual note.
- [Auto-talk after a quiet stretch](md/auto-talk-v3.md) · [HTML](auto-talk-v3.html) — Auto-talk-v1 only acts on a loop: 8 turns making the same call while the game state stays the same, or 3 replies with no tool call.
- [Auto-talk on the field only](md/auto-talk-field-only-v1.md) · [HTML](auto-talk-field-only-v1.html) — Auto-talk walks the player to someone and presses A. That only makes sense on the free field.
- [Auto-talk: skip beaten trainers](md/auto-talk-v2.md) · [HTML](auto-talk-v2.html) — Auto-talk is the loop breaker's last stage: after 3 replies in a row with no tool call, or 8 turns making the same call while the game state stays the same, the harness walks the player to someone on the map and…
- [Bag ineffective loop](md/bag-ineffective-loop-v1.md) · [HTML](bag-ineffective-loop-v1.html) — Three equivalent attempts on an owned, ready bag list trigger the existing ineffective-action guard.
- [Battle menu loop](md/battle-menu-loop-v1.md) · [HTML](battle-menu-loop-v1.html) — On the control arm of the cook, a wild WINGULL fight spent 8.9 minutes opening the POKéMON screen and coming back to the same menu choice.
- [Battle observation loop](md/battle-observation-loop-v1.md) · [HTML](battle-observation-loop-v1.html) — In sh02 the model called observe 270 times in a row during a wild battle while the game waited for a button, and the loop guard never fired.
- [Bounded supervisor briefing (supervisor-briefing-bound-v1)](md/supervisor-briefing-bound-v1.md) · [HTML](supervisor-briefing-bound-v1.html) — The switch changes three lines of the loop-guard and stall briefings that used to grow for as long as the stall lasted.
- [Briefing battle outcomes](md/briefing-battle-outcomes-v1.md) · [HTML](briefing-battle-outcomes-v1.html) — The supervisor briefings now say whether the last battle against a story character was won or lost, and whether the player whited out, from recorded game state.
- [Briefing exit facts](md/briefing-exits-v1.md) · [HTML](briefing-exits-v1.html) — The supervisor briefings told the model that exits it had just used were untried, and they put the one exit that mattered last, under a bare map number.
- [Checked requested movement](md/rejected-movement-stride-v1.md) · [HTML](rejected-movement-stride-v1.html) — Frontier E6 and E8 show repeated one-tile cuts.
- [Clock view loop](md/clock-view-loop-v1.md) · [HTML](clock-view-loop-v1.html) — After the clock is set, opening it again lands the result on a transition the loop guard does not treat as an interface.
- [Coherent healing feedback](md/coherent-healing-feedback-v1.md) · [HTML](coherent-healing-feedback-v1.html) — Implementation candidate; no measured benefit or experiment launch.
- [Context token budget](md/context-token-budget-v1.md) · [HTML](context-token-budget-v1.html) — The model server holds 65,536 tokens.
- [Cut-off reply feedback](md/cut-off-reply-feedback-v1.md) · [HTML](cut-off-reply-feedback-v1.html) — When a reply stops at the max_tokens limit before it makes any tool call, the next message tells the model so, instead of the plain "Keep playing" nudge.
- [Drought counts turns only](md/drought-turns-only-v1.md) · [HTML](drought-turns-only-v1.html) — The note fired after 5 minutes of play, which is about 11 DeepSeek turns.
- [Drought hold in battles and heals](md/drought-battle-heal-hold-v1.md) · [HTML](drought-battle-heal-hold-v1.html) — The milestone-drought briefing fires after every 5 minutes of active play with no new story milestone.
- [Drought holds on battle screens](md/drought-hold-screens-v1.md) · [HTML](drought-hold-screens-v1.html) — Run 37ca got the drought note on the evolution screen right after beating Flannery.
- [drought-progress-credit-v2](md/drought-progress-credit-v2.md) · [HTML](drought-progress-credit-v2.html) — One line: while the last GYM LEADER battle this run is still a loss, a level-up restarts the turn-drought-clock-v1 drought clock only when it lands on a POKéMON that battle saw.
- [Exact context count](md/context-exact-count-v1.md) · [HTML](context-exact-count-v1.html) — On 2026-10-27 the HyperQwen 3h control run 2026-10-27T15-23-07_hyperqwen-gpu0_e1f1 ended at turn 178 (4:38 PM New York time) with model_error.
- [Faced interaction history](md/faced-interaction-history-v1.md) · [HTML](faced-interaction-history-v1.html) — Run 2026-10-18T01-30-48_qwen36-gpu1_cdb1 sent LEFT, LEFT, LEFT, UP, A. Its first dialogue page was attributed to the faced television at (4,1): “MOM might like this program.” The next loop note listed that same…
- [Factual drought briefing](md/drought-progress-facts-v1.md) · [HTML](drought-progress-facts-v1.html) — A quiet clock is evidence about recorded milestones.
- [Factual healing guidance](md/factual-healing-guidance-v1.md) · [HTML](factual-healing-guidance-v1.html) — Requested after bundle run gpu1_2e93, turns 548–563: Torchic stayed at 24/31 HP and Potion ×1 while the model repeatedly opened SUMMARY.
- [Failed navigation outcomes](md/ineffective-navigation-v2.md) · [HTML](ineffective-navigation-v2.html) — The detector groups free-field attempts that leave the position and relevant game conditions unchanged.
- [Field ownership feedback](md/field-ownership-feedback-v1.md) · [HTML](field-ownership-feedback-v1.html) — Field tools walk the player on the overworld.
- [First visit cycle credit](md/first-visit-cycle-credit-v1.md) · [HTML](first-visit-cycle-credit-v1.html) — In run ee2a the map_cycle note fired on MT PYRE 1F at turn 370.
- [Fixed-point breaker](md/fixed-point-breaker-v1.md) · [HTML](fixed-point-breaker-v1.html) — A fixed point is a turn the model keeps repeating: the same call, and the game state the same afterwards.
- [Fresh retry](md/fresh-retry-v1.md) · [HTML](fresh-retry-v1.html) — When the model answers without calling a tool, the harness nudges it and asks again.
- [Gym heal warning](md/gym-heal-warning-v1.md) · [HTML](gym-heal-warning-v1.html) — The operator, 2026-10-20: "the supervisor warning for when it enters a gym without full HP is the right way to go".
- [Gym puzzle supervisor hold](md/gym-puzzle-supervisor-hold-v1.md) · [HTML](gym-puzzle-supervisor-hold-v1.html) — Run 37ca (DeepSeek) entered the FORTREE CITY GYM at turn 1773 and came close to its last gate.
- [Heal before trainers](md/heal-before-trainers-v1.md) · [HTML](heal-before-trainers-v1.html) — A simple v1 of "heal before trainer fights" (the operator, 2026-10-17).
- [Heal before trainers v2](md/heal-before-trainers-v2.md) · [HTML](heal-before-trainers-v2.html) — V1 only saw trainers the game had loaded near the camera, and only knew POKéMON CENTERs the player had walked into.
- [Heal before trainers: BAG items](md/bag-healing-items-v1.md) · [HTML](bag-healing-items-v1.html) — The model could see its POTION all along, but nothing ever connected it to the weak lead in front of a trainer.
- [Ineffective loops](md/ineffective-loops-v1.md) · [HTML](ineffective-loops-v1.html) — Two kinds of repetition today's loop guard misses.
- [Instruction memory cap](md/instruction-memory-cap-v1.md) · [HTML](instruction-memory-cap-v1.html) — Recorded runs, replayed.
- [Instruction memory junk filter](md/instruction-memory-junk-filter-v1.md) · [HTML](instruction-memory-junk-filter-v1.html) — The existing cap limits instruction memory to 16,000 Unicode code points.
- [Junk filter leader lines](md/junk-filter-leader-lines-v1.md) · [HTML](junk-filter-leader-lines-v1.html) — The junk filter's trainer rule dropped a faced trainer's lines, and gym leaders are trainers.
- [Let the cutscene continue](md/milestone-drought-suppression-v1.md) · [HTML](milestone-drought-suppression-v1.html) — In GLM run 557c, turn 313, the Devon researcher cutscene had just begun.
- [Longest valid prefix for walking batches](md/rejected-movement-prefix-v1.md) · [HTML](rejected-movement-prefix-v1.html) — The navigation tool-use guard intercepts a press of two or more directions (for example eight UPs) while the player stands free in the field.
- [Loop guard screen](md/loop-guard-screen-v1.md) · [HTML](loop-guard-screen-v1.html) — The loop guard's note was describing the bedroom while the clock was open.
- [Loop guards preserve runs](md/loop-guard-supervisor-v1.md) · [HTML](loop-guard-supervisor-v1.html) — The deterministic loop switch warns on repeated planning, observations, ineffective actions, cycles and refusals.
- [Low-HP trainer warning](md/low-hp-trainer-warning-v1.md) · [HTML](low-hp-trainer-warning-v1.html) — A one-time SUPERVISOR paragraph on a game-tool result when the lead Pokémon is below half HP and the Route 103 rival, not yet beaten, is on the map.
- [Map-cycle briefings can repeat](md/map-cycle-recovery-v1.md) · [HTML](map-cycle-recovery-v1.html) — With navigation-recovery-v1 enabled, this switch adds visit counts and exits not matched to departures.
- [Model error recovery](md/model-error-recovery-v1.md) · [HTML](model-error-recovery-v1.html) — When the lane refuses a request or dies, the harness lowers what it asks for and waits for the lane before giving up — it absorbs two consecutive lane errors and ends on the third.
- [Move-learning loop fingerprint](md/move-learn-loop-fingerprint-v1.md) · [HTML](move-learn-loop-fingerprint-v1.html) — The loop guard notices when the game keeps returning to the same states.
- [Moving NPC target](md/moving-npc-target-v1.md) · [HTML](moving-npc-target-v1.html) — The model chooses an already listed, loaded NPC by local ID.
- [Named move decline](md/move-learn-offer-identity-v1.md) · [HTML](move-learn-offer-identity-v1.html) — For learning, use the existing move name in forget.
- [Navigation cycle stop](md/navigation-cycle-stop-v1.md) · [HTML](navigation-cycle-stop-v1.html) — In GLM run 0d5d, turns 1031 and 1032 requested tile (6,5) in Stern’s Shipyard.
- [Navigation recovery keeps playing](md/navigation-recovery-v1.md) · [HTML](navigation-recovery-v1.html) — Two stale-map requests or an observed map cycle open a warning.
- [Navigation tool-use guard](md/navigation-tool-use-guard-v1.md) · [HTML](navigation-tool-use-guard-v1.html) — Walking batches return to the model before input.
- [Navigator elevation-zero pads](md/navigator-elevation-zero-pads-v1.md) · [HTML](navigator-elevation-zero-pads-v1.html) — Lavaridge Gym 1F's pads sit on elevation-0 tiles, with warp events at elevation 3.
- [Navigator ledge drops and surf starts](md/navigator-ledge-drops-v1.md) · [HTML](navigator-ledge-drops-v1.html) — Sixteen recorded refusals named the warp at Lilycove (70,5).
- [One direction after a rejected batch](md/rejected-movement-step-v1.md) · [HTML](rejected-movement-step-v1.html) — A model request for UP, UP, UP on a controllable field submits only UP.
- [open-milestone-stall-v1](md/open-milestone-stall-v1.md) · [HTML](open-milestone-stall-v1.html) — One line: while the last GYM LEADER battle this run is still a loss, every 30 actions the loop guard sends one supervisor note that names the trainer, the place and turn of the loss, the party the readout showed when…
- [Progress-aware cycle warnings](md/progress-aware-cycles-v1.md) · [HTML](progress-aware-cycles-v1.html) — A healing gate can tell the player to leave a battle and heal.
- [Provider wait pause](md/provider-wait-pause-v1.md) · [HTML](provider-wait-pause-v1.html) — When the gateway pauses a run during a model request, PokéBench freezes the emulator and suspends the active wall clock.
- [Push-back loop detection](md/pushback-loop-detection-v1.md) · [HTML](pushback-loop-detection-v1.html) — Some game scripts stop the player and walk them back: the Littleroot twin before the player has a POKéMON, and PROF. BIRCH on Route 101 ("Wh-Where are you going?!").
- [Random starter pick](md/random-starter-v1.md) · [HTML](random-starter-v1.html) — The operator, 2026-10-22: most long runs chose Torchic, so there is little long-play data on the other two starters.
- [Recognize a repeated map trigger before five minutes pass.](md/trigger-script-loop-v1.md) · [HTML](trigger-script-loop-v1.html) — A coordinate trigger can run the same story script through several row wrappers.
- [Recovery note off the battle screen](md/recovery-note-field-only-v1.md) · [HTML](recovery-note-field-only-v1.html) — Navigation-recovery-v1 sends its open note (NAVIGATION RECOVERY: The repeated map cycle remains unresolved…) with every model request until the episode resolves.
- [Reopened dialogue loop](md/reopened-dialogue-loop-v1.md) · [HTML](reopened-dialogue-loop-v1.html) — A press can show a sign and close it before the result comes back.
- [Same target, no progress](md/same-target-no-progress-v1.md) · [HTML](same-target-no-progress-v1.html) — In control run 2026-10-20T16-14-34_qwen36-gpu0_a8f9, from turn 1282 (6:42 PM New York) the model called navigate_to {x:29, y:16, map_id:[24,4]} again and again in RUSTURF TUNNEL: 39 times, then 12 or more times to…
- [Same-plan breaker](md/same-plan-breaker-v1.md) · [HTML](same-plan-breaker-v1.html) — In both 30-turn stalls of run sh02 (the twin at Littleroot (11,1), T142–T171, and Birch's "Don't leave me" on Route 101, T263–T307) the model wrote the same plan, nearly word for word, every turn, while the game only…
- [Shop refusals preserve runs](md/menu-refusal-recovery-v1.md) · [HTML](menu-refusal-recovery-v1.html) — Two no-button battle_action refusals in a verified ready shop menu warn with the selected option and the observed controls: B quits this menu.
- [Short-cycle fixed point](md/short-cycle-fixed-point-v1.md) · [HTML](short-cycle-fixed-point-v1.html) — Duplicate-turn-collapse-v1 leaves out of each request a run of 3 or more identical turns: the same thinking, text and tool calls, each leaving the same game state.
- [Stale plan fact](md/stale-plan-fact-v1.md) · [HTML](stale-plan-fact-v1.html) — When a reply's thinking is word for word the previous reply's, but the game now shows a different interface or asks a different question than when that thinking was first written, the tool result ends with one line…
- [Stall briefing](md/stall-briefing-v1.md) · [HTML](stall-briefing-v1.html) — The loop guard only notices a loop when the game state repeats exactly.
- [Stop repeating a refused battle action](md/battle-refusal-loop-v1.md) · [HTML](battle-refusal-loop-v1.html) — A recorded round-2 visited-map episode repeated 322 FIGHT calls while a message needed A or B. Each call refused correctly, pressed nothing and returned a normal result.
- [Story battle heal first line](md/story-battle-heal-first-v1.md) · [HTML](story-battle-heal-first-v1.html) — When a story battle the player cannot run from is on the current map and a party Pokémon is hurt, the harness puts one line at the very top of the game-tool result: each hurt Pokémon's HP, that the battle cannot be…
- [Story battle heal gate](md/story-battle-heal-gate-v1.md) · [HTML](story-battle-heal-gate-v1.html) — While any party Pokémon (not an egg) is below its max HP, the harness does not start an action that would start a trainer battle the player has not won and cannot run from.
- [Story battle heal warning](md/low-hp-trainer-warning-v2.md) · [HTML](low-hp-trainer-warning-v2.html) — V2 of the low-HP trainer warning.
- [Story progress clock](md/story-progress-clock-v1.md) · [HTML](story-progress-clock-v1.html) — Seven story milestones are measurement-only: they are recorded for splits but are never a run's target.
- [Story-character stall gate](md/story-character-stall-gate-v1.md) · [HTML](story-character-stall-gate-v1.html) — The loop guard should do no harm.
- [Text-only supervisor](md/text-only-supervisor-v1.md) · [HTML](text-only-supervisor-v1.html) — Without this switch, three replies in a row that call no tool end the run as a model error.
- [Trainer sight: target walks](md/trainer-sight-check-v2.md) · [HTML](trainer-sight-check-v2.html) — Trainer-sight-check-v1 stops navigate_to from walking a route an unbeaten trainer can see.
- [Transition loop detection](md/transition-loop-detection-v1.md) · [HTML](transition-loop-detection-v1.html) — The loop guard could not see a player bouncing through a door or up and down stairs.
- [Turn drought clock (turn-drought-clock-v1)](md/turn-drought-clock-v1.md) · [HTML](turn-drought-clock-v1.html) — The milestone-drought briefing fired every 5 minutes of play with no new story milestone (STALL_DROUGHT_MS).
- [Whole-game story checkpoints](md/story-checkpoints-whole-game-v1.md) · [HTML](story-checkpoints-whole-game-v1.html) — A conservative extension to instruction memory, from Slateport through the Hall of Fame and the optional Rayquaza encounter.

## Measurement

Recording only: milestones, splits and evidence the viewer and reports read. The model never sees these.

- [Campaign progress counts](md/campaign-progress-clock-v1.md) · [HTML](campaign-progress-clock-v1.html) — Campaign arrivals and story completions through the League and game clear.
- [First interaction with Roxanne](md/roxanne-first-interaction-v1.md) · [HTML](roxanne-first-interaction-v1.html) — A run gets credit for reaching Roxanne’s introduction even if it later loses the battle.
- [Leave bedroom after the clock](md/bedroom-exit-v1.md) · [HTML](bedroom-exit-v1.html) — Leave home (PLAYER_HOUSE_EXITED_AFTER_CLOCK) already fired once per run.
- [Route 103 rival splits](md/route103-rival-splits-v1.md) · [HTML](route103-rival-splits-v1.html) — Each split fires once per run, at its first qualifying state.
- [Story progress through all eight gyms](md/all-gym-story-milestones-v1.md) · [HTML](all-gym-story-milestones-v1.html) — Milestones now continue beyond Rock Tomb.

## Harness, viewer and tooling

How runs are launched, recorded, verified and shown, and audits that are not a single switch.

- [Codex capture](md/codex-capture.md) · [HTML](codex-capture.html) — Keep the player’s native transcript, exposed reasoning summaries, observations and actions together.
- [Current run on the story frontier](md/current-run-frontier.md) · [HTML](current-run-frontier.html) — The human baseline and agent record stay visible.
- [Current runs before history](md/current-run-snapshots.md) · [HTML](current-run-snapshots.html) — The viewer reads a small persisted snapshot before reconstructing a recording.
- [Give a promising run more time](md/extend-run.md) · [HTML](extend-run.html) — EXTEND adds 30 minutes or 1 hour to the current run's active-time limit.
- [Let the game run its scripts](md/trigger-navigation-boundary-v1.md) · [HTML](trigger-navigation-boundary-v1.html) — A matching coordinate script is an observation boundary on the route the model selected.
- [Map observation audit](md/map-observation-audit.md) · [HTML](map-observation-audit.html) — Is the map we show the model telling the truth?
- [Run recorder](md/run-recorder.md) · [HTML](run-recorder.html) — Pokebench_env.recorder saves a run's moving picture and sound to files, with no screen involved.
- [Runs survive viewer restarts](md/run-survives-viewer.md) · [HTML](run-survives-viewer.html) — The 8790 viewer serves the run page and the stats page.
- [This run’s settings, without editing them](md/current-run-harness-config.md) · [HTML](current-run-harness-config.html) — PokéNav → HARNESS CONFIG shows the selected live or replayed run’s recorded configuration as themed summary and feature cards.
- [Whole-Map Navigation](md/full-map-navigation.md) · [HTML](full-map-navigation.html) — A switch that shows the model the entire current map and lets navigate_to walk the whole route, plus a faster open list so re-planning before every press stays cheap.
- [Zoom to frontier](md/frontier-zoom.md) · [HTML](frontier-zoom.html) — The story frontier graph on Runs & Comparisons has 36 checkpoints.
