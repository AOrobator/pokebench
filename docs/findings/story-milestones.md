# Game-owned story milestones through Rustboro Gym

Primary reference: pret/pokeemerald731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, read-only checkout `/Users/user/dev/pokeemerald`. US Emerald ROM SHA1f3ae088181bf583e55daf962a92bb46f4f1d07b7. No ROM, save or vendor modifications.

New state `story` comes from the same snapshot lock as the screenshot/readout and existing save reader. SaveBlock1 flags+0x1270 (0x12Cbytes), variables+0x139C (256u16). Both layouts are existing verified PokeBench owners: badges use the flag array; world_context uses the variable array. New reader checks save-pointer bounds/alignment, exact reads and variable ranges; unknown is null, not zero. Production state schema and generated JSON schema preserve old logs with optional new fields. Declared story-state-v1 runs fail startup if an old server omits the new property, following the observed wrong-editable-package probe setup failure.

| Story signal | Game completion condition and source |
|---|---|
| PLAYER_NAME_CONFIRMED | Birch name YES handler accepts0 and installs SlidePlatformAway2, after keyboard text copy. Main menu return/dialog task alone and editor buffer are insufficient. |
| FIRST_TRUCK_EXIT | Recorded active field state inside truck, followed by recorded active field state outside; evidence cites both state sequences. Resuming outside the truck does not establish an in-run exit. |
| MOM_CLOCK_INSTRUCTION | VAR_LITTLEROOT_INTRO_STATE0x4092 in4/5/6/7; players_house.inc sets4 after instruction. |
| CLOCK_SET | FLAG_SET_WALL_CLOCK0x51, after clock interaction returns. Modern explicit flag overrides legacy nearby-trigger inference. |
| MOM_RIVAL_INSTRUCTION | Intro state7 after Mom's follow-up, players_house.inc. |
| RIVAL_MET | VAR_LITTLEROOT_RIVAL_STATE0x408D in3/4, following either genuine first-meeting script;4 follows lab tutorial. |
| RIVAL_HOUSE_EXITED | Navigation transition, no story variable of its own: a stable LITTLEROOT TOWN state with VAR_LITTLEROOT_RIVAL_STATE 0x408D in 3/4, directly after a stable state on the rival family's 1F (the family that is not the run's route home) also in 3/4. Evidence is [home witness, rival 1F, town], and the home witness must still show rival state 0-2, so a save that starts after the meeting cannot misname home and earn credit. The player's own 1F, the rival house before the meeting, transitions and unknown screens do not count; a save that starts after the exit gets no credit. The viewer derives it for older runs from recorded state. |
| BIRCH_RESCUE_REQUESTED | VAR_LITTLEROOT_TOWN_STATE0x4050 in2/3/4. LittlerootTown_EventScript_GoSaveBirch and GoSaveBirchTrigger set2 when the north exit sends the player toward Birch.1 is the rival meeting and does not count.3 is the lab Pokédex commit and4 is the running-shoes commit; both are later values of the same variable. |
| STARTER_CHOSEN | Verified initialized party nonempty; existing game-derived split retained. |
| BIRCH_RESCUE_COMPLETE | VAR_BIRCH_LAB_STATE0x4084 in2/3/4/5; Route101 bag script sets2 after ChooseStarter/battle returns and rescue dialogue. FLAG_RESCUED_BIRCH0x52 is set BEFORE choosing, so not used as completion. |
| BIRCH_STARTER_HANDOFF_COMPLETE | Lab stage3/4/5;3 follows agreeing to see rival after lab starter dialogue. |
| ROUTE_101_AFTER_HANDOFF | Navigation transition, measurement only (route-101-after-handoff-v1): the first settled ROUTE 101 state with VAR_BIRCH_LAB_STATE 0x4084 in 3/4/5, directly after a settled LITTLEROOT TOWN or OLDALE TOWN state also in 3/4/5 (Route101/map.json connects only those two maps). 3 is set by LittlerootTown_ProfessorBirchsLab_EventScript_AgreeToSeeRival (scripts.inc:134) after the lab handoff; 4 is Route103_EventScript_RivalEnd and 5 the Pokédex (pokeemerald 731ad5bf). Evidence is [last settled state with lab state 0/1/2, town, route]; settled excludes field_transition and unknown callbacks. A save that starts after the handoff has no pre-handoff witness and gets no credit. Never shown to the model and never restarts the stall clocks; the viewer derives it for older runs. Replays: 258d seq 9922 turn 653 (28.31 min), human_1848 seq 8901 (9.67 min, between handoff 9.12 and Oldale 11.5), c0b8 none. |
| RIVAL_BATTLE_WON | FLAG_DEFEATED_RIVAL_ROUTE1030x82, Route103 script after battle. |
| RECEIVED_POKEDEX | FLAG_RECEIVED_POKEDEX_FROM_BIRCH0x8E4, lab ReceivePokedex script. |
| STARTER_TUTORIAL_COMPLETE | FLAG_ADVENTURE_STARTED0x74 after lab Pokédex/Poké Ball conversation, not a claim about inventory when item delivery fails. |
| RUNNING_SHOES_RECEIVED | FLAG_RECEIVED_RUNNING_SHOES0x112, Littleroot Mom script. |
| DAD_FIRST_MEETING | VAR_PETALBURG_GYM_STATE0x4085 in1–8;1 is installed after first Norman/Wally introductory dialogue. |
| WALLY_TUTORIAL_COMPLETE | Petalburg Gym stage2–8;2 follows returning from Wally and Norman's badge instruction; later values advance from it. |
| TEAM_AQUA_WOODS_EVENT_COMPLETE | VAR_PETALBURG_WOODS_STATE0x4098=1 after post-battle dialogue and researcher exit. |
| RUSTBORO_GYM_COMPLETE | FLAG_DEFEATED_RUSTBORO_GYM0x4F0 in RoxanneDefeated script. |
| STONE_BADGE | Existing verified badge flag0x867 through the badges reader. |
| ROCK_TOMB_RECEIVED | FLAG_RECEIVED_TM_ROCK_TOMB0xA5 after successful item delivery; separate from badge. |

Name task ROM identity: `Task_NewGameBirchSpeech_ProcessNameYesNoMenu` at0x08031188 calls Menu_ProcessInputNoWrapClearOnChoose at0x08198C58, branches YES to0x080311AE, and stores function literal0x08031221 through0x080311EA/EC (literal at0x080311F8). NO/B branch stores BoyOrGirl from0x0803120C/0E, not the confirmed chain. Following exact task pointers0x08031221/1259/133D/13E5/14C5 correspond to SlidePlatformAway2, ReshowBirchLotad, WaitForSpriteFadeInAndTextPrinter, AreYouReady, ShrinkPlayer. Match active task records16×0x28 atgTasks0x03005E00, and owning callbacks0x0802F6B1/0x08031679. Unsupported phases stay unknown until initialized field state establishes completion. Read-only native name probe91f0 verifies question false, NO no completion, YES true before field startup. Named pointer set is finite, not a broad ROM-address-range classifier.

Clock script ROM bytes16 92 40 06 00 29 51 00 uniquely at0x082927B2 match setvar intro6 + setflag0x51. Script opcodes are from data/script_cmd_table.inc (setvar0x16/setflag0x29); operands from source constants/macros. Other fields use the same verified arrays and literal source operands; independent single-field variable and flag-bit tests exercise the production reader, JSON and detector. Their late positive gameplay effects are not all live-calibrated through first gym; no new model or performance claim.

Recording: StateMilestones.observe consumes the actual state event's snapshot and sequence, avoiding a second read that could belong to another frame. RunRecorder captures validated observe/press result details.state even with objective tracking disabled, emits milestones once with kind/story/navigation/legacy, origin and evidence IDs, and keeps furthest progress monotonic. Run teardown takes one final snapshot, so a script that commits after the last tool frame can still be recorded before the server stops. Other older MilestoneSource implementations retain their poll interface. Resumed saves tag already-present progress at the first usable save observation and withhold it from performance splits; first truck exit still requires an in-run witness. Explicit PLAYER_NAME_SET retains its historical gameplay-start meaning; PLAYER_NAME_CONFIRMED is a separate ID, so earlier proxy timings are not silently renamed. Navigation/location splits remain navigation. Viewer Field State shows new story fields and unknowns; action rows/inspector expose evidence; catalog order is tested against production. Parent's historical CLOCK_SET recovery remains sampled/derived and never rewrites logs or overrides a modern story observation.

Native probes are ordinary logged manual sessions under the owned worktree's runs folder, excluded from benchmark summaries. Name/exit91f0: accepted name atstate42, truck witness67 → exit74. Positive fixture46d6: clocktrue,intro7,rival3,lab3,Torchic party and paired frame/readout; already-present markers are not new achievements. Clock62f8: stopped-clock dialog and adjustment/NO question all read clock=false; selecting NO returned to adjustment without a milestone; UP/YES returned to field with intro6/clock=true. Next observe records CLOCK_SET once with state52 as evidence. Paired PNG/JSON/text captures are in that run’s proof directory. Initialf0cb had old Python editable-package drift, terminal preserved and excluded from candidate proof. The corrected environment owns the Python package; only the stable read-only mGBA binding points to canonical main, and each native core/server/run is separate. No measured session or parent viewer process was touched.

Gate and review receipts will be recorded in the worklog; source/ROM semantics, synthetic coverage, native calibration, review, landing and model performance are separate claims.

Resumed-run attribution is per predicate. A null/unreadable observation cannot establish an incomplete baseline. Its first readable positive is `present_at_start`, excluded from earned timing and furthest progress. An explicit negative followed by a positive is `observed`, even if unreadable samples intervene. Known pregame screens can establish negative location/gameplay-start predicates; they cannot establish missing story flag values. Final name false/true reads remain independent of gameplay startup.

Naming-screen ownership: pinned `src/naming_screen.c` DoNamingScreen uses shared CB2_NamingScreen for player names, caught-mon names and nicknames (template-specific setup at395/411, callback install540, callbacks2064–2079, template table2133). Therefore a bare `screen=naming` with unknown story cannot prove pregame. The detector uses only already-verified Birch confirmation task evidence (`name_confirmed` false/true) to establish a player-naming baseline while that shared screen is open. No new template API or reader ownership path is introduced. Independent reviewer production-reader nickname shape is retained in a JSON test fixture; it is neither a ROM nor a save asset.


M5 pre-confirmation negatives (2026-10-13): the same verified `main_menu.c` task graph has 23 exact roots before YES acceptance. `Task_NewGameBirchSpeech_` suffix/address pairs are Init/080307B1, WaitToShowBirch/080308B1, WaitForSpriteFadeInWelcome/08030929, ThisIsAPokemon/080309CD, MainSpeech/08030A2D, AndYouAre/08030BCD, StartBirchLotadPlatformFade/08030C19, SlidePlatformAway/08030C91, StartPlayerFadeIn/08030CD5, WaitForPlayerFadeIn/08030D85, BoyOrGirl/08030DC9, WaitToShowGenderMenu/08030E09, ChooseGender/08030E39, SlideOutOldGenderSprite/08030ED5, SlideInNewGenderSprite/08030F7D, WhatsYourName/08030FD5, WaitForWhatsYourNameToPrint/08031015, WaitPressBeforeNameChoice/08031041, StartNamingScreen/08031091, ReturnFromNamingScreenShowTextbox/0803261D, SoItsPlayerName/08031105, CreateNameYesNo/08031145, ProcessNameYesNoMenu/08031189. These are odd Thumb task pointers, not function-byte addresses or a range. The pinned source NewGame branch (main_menu.c1056–1068) installs Init; Continue destroys the menu task. Definitions1265–1640 and2293 onward establish the pre-YES path, including NO/B returning to BoyOrGirl. StartNamingScreen1597–1606 and return callback1788–1853 join the player naming path without treating shared naming callbacks as sufficient evidence.

The reader now emits name_confirmed=false only for an active task (isActive exactly1) in this finite pre-confirmation set under the two previously qualified callbacks. Existing five post-YES positive roots take precedence. The remaining late-post roots08031581/080315BD/08031631 stay unknown. Intro/title/main-menu labels, shared naming callbacks, inactive/invalid tasks, helpers and adjacent addresses remain insufficient. No save defaults are exposed. The model text remains “Story: no completion confirmed”; JSON distinguishes verified false from unknown for grading. No loop policy, menu/navigation assistance, prompt, renderer, schema or milestone predicate changes.

Synthetic native-reader→JSON/readout tests cover all23 roots;31 isolated mutations individually remove each root or weaken callback/activity/address/positive-priority boundaries and fail intended assertions. Existing actual Swarm trial02 state/text/frame001938 records the pre-repair unknown and full Birch speech, but historical events do not retain raw task pointers. The reused qualified-task-graph receipt plus reverified ROM/source identity is address grounding, not a new paired native probe. Newly produced native-probe evidence is recorded separately in the M5 worklog and cannot rewrite or upgrade the old cohort.


Rustboro trainer defeats (2026-10-14): source revision rechecked as
`731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, with clean reference checkout.
`data/maps/RustboroCity_Gym/scripts.inc:41–54` binds Josh, Tommy and Marc to
`trainerbattle_single`. `include/constants/opponents.h:324–325,575` assigns
320, 321 and 571 respectively; `TRAINER_FLAGS_START` is 0x500, so their flag
IDs are 0x640, 0x641 and 0x73B. `src/battle_setup.c:GetTrainerAFlag`,
`GetTrainerBFlag` and `SetBattledTrainersFlags` own the exact flag calculation
and set both participants' bits for a two-opponent battle. `CB2_EndTrainerBattle`
first rejects `IsPlayerDefeated` (LOST/DREW); its ordinary trainer return path
sets the battled bits. `B_OUTCOME_WON` is a non-defeat outcome. These are
persistent battle-result flags, not proximity, trainer interaction or narration.

There is a second writer: Roxanne's victory script sets
`FLAG_DEFEATED_RUSTBORO_GYM` (0x4F0) before calling
`Common_EventScript_SetGymTrainers`. Its Rustboro branch
(`data/scripts/set_gym_trainers.inc:13–17`) calls `settrainerflag` for all
three trainers, including skipped ones; `SetTrainerFlag` writes the same bits.
Therefore a post-clear set bit cannot prove that the trainer was actually
battled. `GYM_TRAINER_FLAGS` is a separate semantic owner from the unconditional
`FLAG_FIELDS`: `rustboro_josh_defeated`, `rustboro_tommy_defeated` and
`rustboro_marc_defeated` expose known booleans only while the coherent snapshot
has gym-clear false. Once gym-clear is true, all three become null, regardless
of their bit values. Missing/uninitialized save state remains null. Previously
recorded native milestone evidence remains valid after the reader becomes
ambiguous; the recorder must retain it rather than erase it or generate new
wins from post-badge bits.

The reader reuses the existing save flags at +0x1270, in the existing 0x12C-byte
snapshot. No additional address, emulator read, RAM write, source checkout
change or runtime/server change is required. Nullable dataclass fields pass
through native state JSON and model readout. Synthetic tests exercise the
production coherent reader, exact/adjacent bits, each independent trainer,
two simultaneous trainers, pregame nulls and gym-clear ambiguity with and
without auto-set bits. RED: all 11 new cases failed before implementation with
the task-owned Python import path. GREEN: all 69 story tests passed. Removing
the gym-clear guard made both ambiguity regressions fail; restored source
passes. Targeted lint and formatting checks pass. Broader state/readout coverage
initially exposed the existing exact StoryState fixture needing three explicit
false fields; this is tracked separately from reader verification.

Native paired state/frame/text evidence of new trainer wins remains pending the
next operator run. No game actions or new run were performed for this repair.
The current 1848 recording lacks these raw trainer flags, so historical wins
cannot be recovered from narration or gym-clear evidence. Source semantics and
synthetic propagation are qualified separately from native proof, review,
landing and benchmark benefit.


### Expanded activity RAM: exact US ROM correspondence (2026-10-14)

Reference remains pret/pokeemerald731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, US ROM SHA1f3ae088181bf583e55daf962a92bb46f4f1d07b7. Read-only Thumb disassembly verifies GetGameStat0x080847F8: guard index<=0x33; literal0x0808481C holds save1 pointer owner0x03005D8C;0x08084820 holds0x159C;0x08084824 holds save2 owner0x03005D90. Instructions0x08084806–18 index*4, add159C, load encryptionKey+AC, XOR. SetGameStat0x08084830 independently uses the same layout/key. Counter values require initialized valid save blocks and coherent snapshot, never fabricated zeros on unavailable reads.

CB2_WhiteOut function0x08085F58/callback0x08085F59 matches source overworld.c: ROM0x08085F5C literalgMain0x030022C0, state+0x438 increments, compares0x77 before DoWhiteOut0x08084620 at0x08085F7E. The callback runs120frames and then loads last-heal map and returns to CB2_Overworld0x08085E5D. DoWhiteOut ROM0x08084620 calls immediate script, halves money at save1+0x490, heals party, resets state and warps, matching source. A blackout activity is a newly observed entry into this callback with a known prior false state; it is not inferred from fainted HP, money loss or a teleport. Polling may miss the entire callback across gaps; no exhaustive count is claimed. This is ROM/source correspondence, not a performed native blackout in the active user run.

### Expanded initial victories and activity RAM semantics (2026-10-14)

Verified read-only pret source revision remains `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`.
Initial opponent IDs in `include/constants/opponents.h`, resolved from the actual
Route102/104 scripts, map through `TRAINER_FLAGS_START=0x500`:
Route102 Calvin318, Rick615, Tiana603, Allen333; Route104 Ivan337, Billy319,
Haley604, Winston136, Cindy114, Gina and Mia483, Darian696; Roxanne265.
Gina and Mia's two scripts share one trainer ID and one victory. These initial
flags remain readable after gym clear; only the previously added Josh/Tommy/Marc
flags are made ambiguous by `Common_EventScript_SetGymTrainers`.
`CB2_EndTrainerBattle` in `src/battle_setup.c` sets the battled-trainer flags on
its non-defeat branch; lost/drawn player outcomes take the whiteout branch.
Rematch registration reuses an initial trainer ID for its initial victory split;
this does not count each subsequent rematch as a new milestone.

`GetGameStat`/`SetGameStat` in `src/overworld.c` XOR the SaveBlock1 game-stat
words at +0x159C with the SaveBlock2 key at +0xAC. Index0 is saved-game attempts,
11 Pokémon captures,14 evolved Pokémon,15 Pokémon Center uses. The counters
saturate at0xFFFFFF; larger decoded values are unavailable. Read validation now
requires the SaveBlock1 pointer to contain the additional256-byte stat array.
The words and key are read through the existing coherent frame/snapshot owner.

The capture counter is incremented after a successful normal ball throw in
`data/battle_scripts_2.s`, before nickname/storage prompts. Safari-ball captures
skip this counter, so it is explicitly a normal capture counter, not an all-game
Safari total. The evolution counter increments after species mutation and
Pokédex updates in `src/evolution_scene.c`; canceled evolution does not do so.
The nurse script increments Center uses before the animation and
`HealPlayerParty`. Therefore the counter by itself proves an accepted heal
interaction, not its completion. Completed-heal recording needs a subsequent
verified script-release witness. `SaveDoSaveCallback` increments index0 before
`TrySavingData`; the raw increment records an attempt, not guaranteed write
success. Labels must retain that distinction.

Party identity uses the already decoded Pokémon header personality and original
trainer ID (+0/+4) as hexadecimal `personality:ot_id`, preserving identity across
species, level, nickname and party-order changes. It is an identification key
rather than a claim of global uniqueness; duplicate identities must not be
matched for level-up inference. New reader tests cover all initial trainer bits
and adjacent negatives, pregame unavailability, XOR keys including all-bits-set,
exact stat indices, invalid/short reads, identity across reorder/evolution, and
exact blackout callback versus adjacent-address negatives. These synthetic
receipts do not claim new native battles, healing, or saves occurred.

Reader mutation receipts: moving the stat array from +0x159C to +0x15A0 fails
all three XOR/index tests. Replacing the exact whiteout callback with adjacent
0x08085F5B fails two callback-boundary tests. Source restored, then all145
focused reader/story/readout tests pass. The first adjacent-callback mutation
check reused Python bytecode because its replacement had identical size and
same-second mtime; deleting only the reader cache and rerunning established the
failure above. No source or ROM bytes remain mutated.
