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
| STARTER_CHOSEN | Verified initialized party nonempty; existing game-derived split retained. |
| BIRCH_RESCUE_COMPLETE | VAR_BIRCH_LAB_STATE0x4084 in2/3/4/5; Route101 bag script sets2 after ChooseStarter/battle returns and rescue dialogue. FLAG_RESCUED_BIRCH0x52 is set BEFORE choosing, so not used as completion. |
| BIRCH_STARTER_HANDOFF_COMPLETE | Lab stage3/4/5;3 follows agreeing to see rival after lab starter dialogue. |
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
