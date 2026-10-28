# Whole-game instruction checkpoint source audit

Reference: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, clean; US Emerald ROM SHA-1 `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Offline source/synthetic proof; no new native gameplay is claimed.

41 checkpoints: the original 15 plus 26 default-OFF scopes. Existing map/speaker matching and whole-episode selection remain the only runtime owners. Every closing milestone must be recorded, and the episode turn must be at or before their latest turn. A mixed episode remains eligible.

## Native predicates and writers

### mauville-wally

FLAG_DEFEATED_WALLY_MAUVILLE (include/constants/flags.h:212). Native reader predicates, not arrival or inferred dialogue completion.

- `MAUVILLE_WALLY_DEFEATED`: `{"name":"MAUVILLE_WALLY_DEFEATED","label":"Mauville Wally scene complete","flag":190}`

Scopes: MauvilleCity [0/2]: WALLY.

- Writer `data/maps/MauvilleCity/scripts.inc:149`: `setflag FLAG_DEFEATED_WALLY_MAUVILLE`

### wattson-gym

FLAG_BADGE03_GET (include/constants/flags.h:1361). Native reader predicates, not arrival or inferred dialogue completion.

- `DYNAMO_BADGE`: `{"name":"DYNAMO_BADGE","label":"Dynamo Badge","flag":2153}`

Scopes: MauvilleCity_Gym [10/0]: WATTSON.

- Writer `data/maps/MauvilleCity_Gym/scripts.inc:94`: `setflag FLAG_BADGE03_GET`

### meteor-falls-confrontation

FLAG_MET_ARCHIE_METEOR_FALLS (include/constants/flags.h:229); FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY (include/constants/flags.h:161). Native reader predicates, not arrival or inferred dialogue completion.

- `METEOR_FALLS_CONFRONTATION_RESOLVED`: `{"name":"METEOR_FALLS_CONFRONTATION_RESOLVED","label":"Meteor Falls confrontation resolved","flag":207,"anchor":"LAVARIDGE_GYM_ENTERED"}`
- `MT_CHIMNEY_STORY_COMPLETE`: `{"name":"MT_CHIMNEY_STORY_COMPLETE","label":"Mt. Chimney story complete","flag":139,"anchor":"LAVARIDGE_GYM_ENTERED"}`

Scopes: MeteorFalls_1F_1R [24/0]: AQUA_MEMBER_M, MAGMA_MEMBER_M, ARCHIE.

- Writer `data/maps/MeteorFalls_1F_1R/scripts.inc:79`: `setflag FLAG_MET_ARCHIE_METEOR_FALLS`
- Writer `data/maps/MtChimney/scripts.inc:64`: `setflag FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY`

### mt-chimney-magma

FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY (include/constants/flags.h:161). Native reader predicates, not arrival or inferred dialogue completion.

- `MT_CHIMNEY_STORY_COMPLETE`: `{"name":"MT_CHIMNEY_STORY_COMPLETE","label":"Mt. Chimney story complete","flag":139,"anchor":"LAVARIDGE_GYM_ENTERED"}`

Scopes: MtChimney [24/12]: MAXIE, MAGMA_MEMBER_M, MAGMA_MEMBER_F.

- Writer `data/maps/MtChimney/scripts.inc:64`: `setflag FLAG_DEFEATED_EVIL_TEAM_MT_CHIMNEY`

### flannery-gym

FLAG_BADGE04_GET (include/constants/flags.h:1362). Native reader predicates, not arrival or inferred dialogue completion.

- `HEAT_BADGE`: `{"name":"HEAT_BADGE","label":"Heat Badge","flag":2154}`

Scopes: LavaridgeTown_Gym_1F [4/1]: FLANNERY.

- Writer `data/maps/LavaridgeTown_Gym_1F/scripts.inc:62`: `setflag FLAG_BADGE04_GET`

### norman-gym

FLAG_BADGE05_GET (include/constants/flags.h:1363). Native reader predicates, not arrival or inferred dialogue completion.

- `BALANCE_BADGE`: `{"name":"BALANCE_BADGE","label":"Balance Badge","flag":2155}`

Scopes: PetalburgCity_Gym [8/1]: NORMAN.

- Writer `data/maps/PetalburgCity_Gym/scripts.inc:369`: `setflag FLAG_BADGE05_GET`

### weather-institute-aqua

VAR_WEATHER_INSTITUTE_STATE (include/constants/vars.h:199); FLAG_RECEIVED_RED_OR_BLUE_ORB (include/constants/flags.h:234). Native reader predicates, not arrival or inferred dialogue completion.

- `WEATHER_INSTITUTE_AQUA_WITHDRAWN`: `{"name":"WEATHER_INSTITUTE_AQUA_WITHDRAWN","label":"Weather Institute Aqua withdrawal","variable":16563,"values":[1,2],"maximum":2,"anchor":"FORTREE_GYM_ENTERED"}`
- `MAGMA_EMBLEM_RECEIVED`: `{"name":"MAGMA_EMBLEM_RECEIVED","label":"Magma Emblem received","flag":212,"anchor":"MOSSDEEP_GYM_ENTERED"}`

Scopes: Route119_WeatherInstitute_1F [32/0]: AQUA_MEMBER_M, AQUA_MEMBER_F; Route119_WeatherInstitute_2F [32/1]: AQUA_MEMBER_M, AQUA_MEMBER_F.

- Writer `data/maps/Route119_WeatherInstitute_2F/scripts.inc:60`: `setvar VAR_WEATHER_INSTITUTE_STATE, 1`
- Writer `data/maps/MtPyre_Summit/scripts.inc:59`: `setflag FLAG_RECEIVED_RED_OR_BLUE_ORB`

### winona-gym

FLAG_BADGE06_GET (include/constants/flags.h:1364). Native reader predicates, not arrival or inferred dialogue completion.

- `FEATHER_BADGE`: `{"name":"FEATHER_BADGE","label":"Feather Badge","flag":2156}`

Scopes: FortreeCity_Gym [12/1]: WINONA.

- Writer `data/maps/FortreeCity_Gym/scripts.inc:34`: `setflag FLAG_BADGE06_GET`

### mt-pyre-aqua

FLAG_RECEIVED_RED_OR_BLUE_ORB (include/constants/flags.h:234). Native reader predicates, not arrival or inferred dialogue completion.

- `MAGMA_EMBLEM_RECEIVED`: `{"name":"MAGMA_EMBLEM_RECEIVED","label":"Magma Emblem received","flag":212,"anchor":"MOSSDEEP_GYM_ENTERED"}`

Scopes: MtPyre_Summit [24/22]: AQUA_MEMBER_M, AQUA_MEMBER_F.

- Writer `data/maps/MtPyre_Summit/scripts.inc:59`: `setflag FLAG_RECEIVED_RED_OR_BLUE_ORB`

### magma-hideout

FLAG_GROUDON_AWAKENED_MAGMA_HIDEOUT (include/constants/flags.h:131). Native reader predicates, not arrival or inferred dialogue completion. MAXIE pursues GROUDON: keep through VAR_SKY_PILLAR_STATE (include/constants/vars.h:222), states 2/3.

- `MAGMA_HIDEOUT_STORY_COMPLETE`: `{"name":"MAGMA_HIDEOUT_STORY_COMPLETE","label":"Magma Hideout story complete","flag":111,"anchor":"MOSSDEEP_GYM_ENTERED"}`
- `SOOTOPOLIS_CRISIS_RESOLVED`: `{"name":"SOOTOPOLIS_CRISIS_RESOLVED","label":"Sootopolis crisis resolved","variable":16586,"values":[2,3],"maximum":3,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`

Scopes: MagmaHideout_4F [24/91]: MAXIE, MAGMA_MEMBER_M.

- Writer `data/maps/MagmaHideout_4F/scripts.inc:56`: `setflag FLAG_GROUDON_AWAKENED_MAGMA_HIDEOUT`
- Writer `data/maps/SootopolisCity/scripts.inc:158`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:503`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:552`: `setvar VAR_SKY_PILLAR_STATE, 2`

### slateport-submarine-theft

FLAG_MET_TEAM_AQUA_HARBOR (include/constants/flags.h:115); FLAG_TEAM_AQUA_ESCAPED_IN_SUBMARINE (include/constants/flags.h:132). Native reader predicates, not arrival or inferred dialogue completion.

- `SLATEPORT_SUBMARINE_THEFT_WITNESSED`: `{"name":"SLATEPORT_SUBMARINE_THEFT_WITNESSED","label":"Slateport submarine theft witnessed","flag":97,"anchor":"MOSSDEEP_GYM_ENTERED"}`
- `AQUA_HIDEOUT_ESCAPE_COMPLETE`: `{"name":"AQUA_HIDEOUT_ESCAPE_COMPLETE","label":"Aqua Hideout submarine escape complete","flag":112,"anchor":"MOSSDEEP_GYM_ENTERED"}`

Scopes: SlateportCity_Harbor [9/9]: ARCHIE, AQUA_MEMBER_M.

- Writer `data/maps/SlateportCity_Harbor/scripts.inc:63`: `setflag FLAG_MET_TEAM_AQUA_HARBOR`
- Writer `data/maps/AquaHideout_B2F/scripts.inc:44`: `setflag FLAG_TEAM_AQUA_ESCAPED_IN_SUBMARINE`

### tate-liza-gym

FLAG_BADGE07_GET (include/constants/flags.h:1365). Native reader predicates, not arrival or inferred dialogue completion.

- `MIND_BADGE`: `{"name":"MIND_BADGE","label":"Mind Badge","flag":2157}`

Scopes: MossdeepCity_Gym [14/0]: TATE, LIZA.

- Writer `data/maps/MossdeepCity_Gym/scripts.inc:66`: `setflag FLAG_BADGE07_GET`

### space-center-magma

VAR_MOSSDEEP_SPACE_CENTER_STATE (include/constants/vars.h:179). Native reader predicates, not arrival or inferred dialogue completion.

- `SPACE_CENTER_STORY_COMPLETE`: `{"name":"SPACE_CENTER_STORY_COMPLETE","label":"Space Center occupation ended","variable":16543,"values":[3],"maximum":3,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`

Scopes: MossdeepCity_SpaceCenter_1F [14/9]: MAGMA_MEMBER_M, MAGMA_MEMBER_F; MossdeepCity_SpaceCenter_2F [14/10]: MAXIE, MAGMA_MEMBER_M.

- Writer `data/maps/MossdeepCity_SpaceCenter_2F/scripts.inc:61`: `setvar VAR_MOSSDEEP_SPACE_CENTER_STATE, 2`
- Writer `data/maps/MossdeepCity_SpaceCenter_2F/scripts.inc:263`: `setvar VAR_MOSSDEEP_SPACE_CENTER_STATE, 3`

### space-center-steven

VAR_MOSSDEEP_SPACE_CENTER_STATE (include/constants/vars.h:179); FLAG_RECEIVED_HM_DIVE (include/constants/flags.h:145). Native reader predicates, not arrival or inferred dialogue completion.

- `SPACE_CENTER_STORY_COMPLETE`: `{"name":"SPACE_CENTER_STORY_COMPLETE","label":"Space Center occupation ended","variable":16543,"values":[3],"maximum":3,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`
- `HM_DIVE_RECEIVED`: `{"name":"HM_DIVE_RECEIVED","label":"Dive received","flag":123,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`

Scopes: MossdeepCity_SpaceCenter_1F [14/9]: STEVEN; MossdeepCity_SpaceCenter_2F [14/10]: STEVEN.

- Writer `data/maps/MossdeepCity_SpaceCenter_2F/scripts.inc:61`: `setvar VAR_MOSSDEEP_SPACE_CENTER_STATE, 2`
- Writer `data/maps/MossdeepCity_SpaceCenter_2F/scripts.inc:263`: `setvar VAR_MOSSDEEP_SPACE_CENTER_STATE, 3`
- Writer `data/maps/MossdeepCity_StevensHouse/scripts.inc:37`: `setflag FLAG_RECEIVED_HM_DIVE`
- Writer `data/maps/MossdeepCity_StevensHouse/scripts.inc:142`: `setflag FLAG_RECEIVED_HM_DIVE`

### seafloor-cavern-crisis

FLAG_KYOGRE_ESCAPED_SEAFLOOR_CAVERN (include/constants/flags.h:151); VAR_SKY_PILLAR_STATE (include/constants/vars.h:222). Native reader predicates, not arrival or inferred dialogue completion.

- `SEAFLOOR_KYOGRE_RELEASE_CONFIRMED`: `{"name":"SEAFLOOR_KYOGRE_RELEASE_CONFIRMED","label":"Seafloor Cavern Kyogre release","flag":129,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`
- `SOOTOPOLIS_CRISIS_RESOLVED`: `{"name":"SOOTOPOLIS_CRISIS_RESOLVED","label":"Sootopolis crisis resolved","variable":16586,"values":[2,3],"maximum":3,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`

Scopes: SeafloorCavern_Room9 [24/36]: ARCHIE, MAXIE, MAGMA_MEMBER_M, MAGMA_MEMBER_F.

- Writer `data/maps/SeafloorCavern_Room9/scripts.inc:114`: `setflag FLAG_KYOGRE_ESCAPED_SEAFLOOR_CAVERN`
- Writer `data/maps/SootopolisCity/scripts.inc:158`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:503`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:552`: `setvar VAR_SKY_PILLAR_STATE, 2`

### wallace-origin-sky-pillar

FLAG_WALLACE_GOES_TO_SKY_PILLAR (include/constants/flags.h:337); VAR_SOOTOPOLIS_CITY_STATE (include/constants/vars.h:114). Native reader predicates, not arrival or inferred dialogue completion.

- `WALLACE_SKY_PILLAR_DISCUSSION_COMPLETE`: `{"name":"WALLACE_SKY_PILLAR_DISCUSSION_COMPLETE","label":"Wallace Sky Pillar discussion complete","flag":311,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`
- `RAYQUAZA_AWAKENED`: `{"name":"RAYQUAZA_AWAKENED","label":"Rayquaza awakened","variable":16478,"values":[5,6],"maximum":6,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`

Scopes: CaveOfOrigin_B1F [24/42]: WALLACE, (unattributed).

- Writer `data/maps/CaveOfOrigin_B1F/scripts.inc:50`: `setflag FLAG_WALLACE_GOES_TO_SKY_PILLAR`
- Writer `data/maps/CaveOfOrigin_B1F/scripts.inc:51`: `setvar VAR_SOOTOPOLIS_CITY_STATE, 3`
- Writer `data/maps/SkyPillar_Top/scripts.inc:121`: `setvar VAR_SOOTOPOLIS_CITY_STATE, 5`

### sky-pillar-wallace

VAR_SOOTOPOLIS_CITY_STATE (include/constants/vars.h:114); VAR_SKY_PILLAR_STATE (include/constants/vars.h:222). Native reader predicates, not arrival or inferred dialogue completion.

- `RAYQUAZA_AWAKENED`: `{"name":"RAYQUAZA_AWAKENED","label":"Rayquaza awakened","variable":16478,"values":[5,6],"maximum":6,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`
- `SOOTOPOLIS_CRISIS_RESOLVED`: `{"name":"SOOTOPOLIS_CRISIS_RESOLVED","label":"Sootopolis crisis resolved","variable":16586,"values":[2,3],"maximum":3,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`

Scopes: SkyPillar_Outside [24/78]: WALLACE, (unattributed).

- Writer `data/maps/SkyPillar_Outside/scripts.inc:77`: `setvar VAR_SOOTOPOLIS_CITY_STATE, 4`
- Writer `data/maps/SkyPillar_Top/scripts.inc:121`: `setvar VAR_SOOTOPOLIS_CITY_STATE, 5`
- Writer `data/maps/SkyPillar_Top/scripts.inc:122`: `setvar VAR_SKY_PILLAR_STATE, 1`
- Writer `data/maps/SootopolisCity/scripts.inc:158`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:242`: `setvar VAR_SOOTOPOLIS_CITY_STATE, 2`
- Writer `data/maps/SootopolisCity/scripts.inc:340`: `setvar VAR_SOOTOPOLIS_CITY_STATE, 2`
- Writer `data/maps/SootopolisCity/scripts.inc:503`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:552`: `setvar VAR_SKY_PILLAR_STATE, 2`

### sootopolis-crisis

VAR_SKY_PILLAR_STATE (include/constants/vars.h:222), states 2 or 3 confirm the crisis resolved. No Steven/Wallace Waterfall, gym or optional Orb advice is scoped.

- `SOOTOPOLIS_CRISIS_RESOLVED`: `{"name":"SOOTOPOLIS_CRISIS_RESOLVED","label":"Sootopolis crisis resolved","variable":16586,"values":[2,3],"maximum":3,"anchor":"SOOTOPOLIS_GYM_ENTERED"}`

Scopes: SootopolisCity [0/7]: ARCHIE, MAXIE.

- Writer `data/maps/SootopolisCity/scripts.inc:158`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:503`: `setvar VAR_SKY_PILLAR_STATE, 3`
- Writer `data/maps/SootopolisCity/scripts.inc:552`: `setvar VAR_SKY_PILLAR_STATE, 2`

### juan-gym

FLAG_BADGE08_GET (include/constants/flags.h:1366). Native reader predicates, not arrival or inferred dialogue completion.

- `RAIN_BADGE`: `{"name":"RAIN_BADGE","label":"Rain Badge","flag":2158}`

Scopes: SootopolisCity_Gym_1F [15/0]: JUAN.

- Writer `data/maps/SootopolisCity_Gym_1F/scripts.inc:97`: `setflag FLAG_BADGE08_GET`

### victory-road-wally

FLAG_DEFEATED_WALLY_VICTORY_ROAD (include/constants/flags.h:148). Native reader predicates, not arrival or inferred dialogue completion.

- `VICTORY_ROAD_WALLY_DEFEATED`: `{"name":"VICTORY_ROAD_WALLY_DEFEATED","label":"Victory Road Wally defeated","flag":126,"anchor":null}`

Scopes: VictoryRoad_1F [24/43]: WALLY.

- Writer `data/maps/VictoryRoad_1F/scripts.inc:43`: `setflag FLAG_DEFEATED_WALLY_VICTORY_ROAD`

### elite-four-sidney

FLAG_DEFEATED_ELITE_4_SIDNEY (include/constants/flags.h:1332). Native reader predicates, not arrival or inferred dialogue completion.

- `ELITE_FOUR_SIDNEY_DEFEATED`: `{"name":"ELITE_FOUR_SIDNEY_DEFEATED","label":"Sidney defeated","flag":1275,"anchor":null}`

Scopes: EverGrandeCity_SidneysRoom [16/0]: SIDNEY.

- Writer `data/maps/EverGrandeCity_SidneysRoom/scripts.inc:61`: `setflag FLAG_DEFEATED_ELITE_4_SIDNEY`

### elite-four-phoebe

FLAG_DEFEATED_ELITE_4_PHOEBE (include/constants/flags.h:1333). Native reader predicates, not arrival or inferred dialogue completion.

- `ELITE_FOUR_PHOEBE_DEFEATED`: `{"name":"ELITE_FOUR_PHOEBE_DEFEATED","label":"Phoebe defeated","flag":1276,"anchor":null}`

Scopes: EverGrandeCity_PhoebesRoom [16/1]: PHOEBE.

- Writer `data/maps/EverGrandeCity_PhoebesRoom/scripts.inc:55`: `setflag FLAG_DEFEATED_ELITE_4_PHOEBE`

### elite-four-glacia

FLAG_DEFEATED_ELITE_4_GLACIA (include/constants/flags.h:1334). Native reader predicates, not arrival or inferred dialogue completion.

- `ELITE_FOUR_GLACIA_DEFEATED`: `{"name":"ELITE_FOUR_GLACIA_DEFEATED","label":"Glacia defeated","flag":1277,"anchor":null}`

Scopes: EverGrandeCity_GlaciasRoom [16/2]: GLACIA.

- Writer `data/maps/EverGrandeCity_GlaciasRoom/scripts.inc:55`: `setflag FLAG_DEFEATED_ELITE_4_GLACIA`

### elite-four-drake

FLAG_DEFEATED_ELITE_4_DRAKE (include/constants/flags.h:1335). Native reader predicates, not arrival or inferred dialogue completion.

- `ELITE_FOUR_DRAKE_DEFEATED`: `{"name":"ELITE_FOUR_DRAKE_DEFEATED","label":"Drake defeated","flag":1278,"anchor":null}`

Scopes: EverGrandeCity_DrakesRoom [16/3]: DRAKE.

- Writer `data/maps/EverGrandeCity_DrakesRoom/scripts.inc:58`: `setflag FLAG_DEFEATED_ELITE_4_DRAKE`

### champion-hall-of-fame

FLAG_SYS_GAME_CLEAR (include/constants/flags.h:1354). Native reader predicates, not arrival or inferred dialogue completion.

- `GAME_CLEAR_CONFIRMED`: `{"name":"GAME_CLEAR_CONFIRMED","label":"Game clear confirmed","flag":2148,"anchor":null}`

Scopes: EverGrandeCity_ChampionsRoom [16/4]: WALLACE; EverGrandeCity_HallOfFame [16/11]: WALLACE, (unattributed).

- Writer `src/post_battle_event_funcs.c:30`: `FlagSet(FLAG_SYS_GAME_CLEAR)`, reached through `special GameClear` in the Hall of Fame script. It is not a durable disk-save assertion.

### sky-pillar-optional-encounter

FLAG_DEFEATED_RAYQUAZA (include/constants/flags.h:486). Native reader predicates, not arrival or inferred dialogue completion.

- `RAYQUAZA_ENCOUNTER_RETIRED`: `{"name":"RAYQUAZA_ENCOUNTER_RETIRED","label":"Optional Rayquaza encounter retired","flag":448,"anchor":null,"optional":true}`

Scopes: SkyPillar_Top [24/85]: RAYQUAZA, RAYQUAZA_STILL, (unattributed).

- Writer `data/maps/SkyPillar_Top/scripts.inc:57`: `setflag FLAG_DEFEATED_RAYQUAZA`
- Writer `data/maps/SkyPillar_Top/scripts.inc:62`: `setflag FLAG_DEFEATED_RAYQUAZA`

## Lifetimes and proof limits

Existing campaign variable predicates are reused unchanged, including their allowed-value and maximum checks. See campaign-milestones.md for their complete writer/reset audit. Weather Institute states 1/2 persist. Space Center state 3 persists after the notification flag clears. Sootopolis City state 5/6 proves Rayquaza awakened; Sky Pillar state 2/3 proves the crisis resolved. Elite Four flags reset on whiteout/Hall of Fame; their first recorded earned event proves the earlier challenge scene was finished, not a single victorious League attempt. New later dialogue after that recorded turn is never closed by the old event.

The only new native reader is optional RAYQUAZA_ENCOUNTER_RETIRED, flag 0x1C0. SkyPillar_Top_EventScript_Rayquaza sets it on the non-flee completion paths; it is not a capture-specific predicate, and never implies awakening/crisis completion. The existing optional activity owner excludes it from frontier depth and campaign progress-clock credit. Unknown native data remains unknown.

The legacy Pokédex game_fact now names FLAG_RECEIVED_POKEDEX_FROM_BIRCH (flags.h:1507), matching story.py pokedex_received=0x8E4. Both it and FLAG_SYS_POKEDEX_GET are committed in the same lab script. This corrects documentation, not the legacy closing milestone/scope or OFF behavior. Legacy scope auditing retains the incumbent cross-scope printed-prefix rule (for example MR. BRINEY at RusturfTunnel). Every new scope instead requires its own map-local sprite or printed prefix. No new native attribution is claimed for the legacy allowance.

## Held scenes: unchanged map/speaker shape cannot separate reusable advice

Coordinator explicitly approved holding Route110/119 and directed retiring nothing ambiguous. These exclusions apply only to the added table; the legacy 15 and existing template/receipt retirement stay behaviorally unchanged. A retained episode remains eligible, not guaranteed to fit the 16,000-point cap. Spec(c) exercises the held advice in its current story step.

| Map / speaker held | pret text labels | Reason |
|---|---|---|
| AquaHideout_B2F AQUA_MEMBER_M/F | MattIntro, MattDefeat, OurBossGotThroughHisPreparations, MattPostBattle, Grunt4Intro/Defeat/PostBattle, Grunt6Intro/Defeat/PostBattle, Grunt8Intro/Defeat/PostBattle (all AquaHideout_B2F_Text_ prefixes) | MattPostBattle gives undersea-cave chase directions immediately before the escape flag is set (scripts43-44,103-111). Female Grunt6 gives an unresolved MASTER BALL clue (137-141; map object→Grunt6 script). Escape proves neither later cave progress nor optional item collection. Both shared sprites remain unscoped; no inferred later completion. |
| Route110 MAY/BRENDAN | Route110_Text_MayLetsBattle, MayDefeated, MayTakeThis, MayExplainItemfinder; matching BrendanLetsBattle, BrendanDefeated, BrendanTakeThis, BrendanExplainItemfinder | Battle completion cannot retire reusable Itemfinder instructions under the same key. |
| Route119 MAY/BRENDAN | Route119_Text_MayIntro, MayDefeat, MayPresentForYou, MayExplainFly; BrendanIntro, BrendanDefeat, BrendanIllGiveYouThis, BrendanExplainFly | Mixed Fly mechanic, Fortree badge and optional return-home instructions. |
| Route118 STEVEN | Route118_Text_StevenQuestions | General Pokémon/training advice has no provable scene-owned completion. |
| Route120 STEVEN | Route120_Text_StevenGreeting, StevenIllWaitHere, StevenReadyForBattle, StevenShowMeYourPower, StevenUsedDevonScope, StevenGiveDevonScope, StevenGoodbye | Same speaker explains reusable Devon Scope beyond the Fortree obstruction. |
| PetalburgCity_Gym DAD | PetalburgCity_Gym_Text_DadGoCollectBadges, DadGoingToKeepTraining, DadNoAmountOfTrainingIsEnough | DAD's postbattle return-home/training advice shares attribution with the original badge lesson. Only NORMAN sprite pages enter the new badge scope, so any mixed DAD episode stays eligible. |
| PetalburgCity_WallysHouse POKEFAN_M | PetalburgCity_WallysHouse_Text_PleaseExcuseUs, SurfGoAllSortsOfPlaces | Reusable Surf guidance shares the gift scene's speaker. |
| Route119_WeatherInstitute_2F SCIENTIST_1/MAN_4 | Route119_WeatherInstitute_2F_Text_ThanksPleaseTakePokemon, NoRoomForPokemon, PokemonChangesWithWeather, GroudonWeather, KyogreWeather | Castform receipt and late optional weather/legendary information must not close with Aqua withdrawal. Only Aqua sprites enter the new scope. |
| MtPyre_Summit EXPERT_F/OLD_MAN | MtPyre_Summit_Text_BothOrbsTakenMagmaLeftThis, OrbsHaveBeenTaken, GroudonKyogreAwakened, ThoseTwoMenReturnedOrbs, SuperAncientPokemonTaughtUs, WillYouHearOutMyTale, GroudonKyogreTale | Gift does not finish the crisis or optional Orb-return story. Only Aqua sprites close at the Emblem receipt. |
| MossdeepCity_StevensHouse STEVEN | MossdeepCity_StevensHouse_Text_YouveEarnedHMDive, ExplainDive, UnderwateCavernBetweenMossdeepSootopolis | Reusable Dive instructions share the next-step clue's key. The Space Center request to visit Steven closes only after Dive receipt, but the house explanation stays eligible. |
| SootopolisCity STEVEN/WALLACE | SootopolisCity_Text_MaxieArchieLeft, AquaMagmaDidntMeanHarm, ExplainWaterfallGoToGym, DazzledByMentor; Steven's guide-to-Wallace/Sky Pillar lines | Optional Orb return, listen-to-leaders, Waterfall mechanic and Juan badge instructions cannot all close at crisis resolution. Only ARCHIE/MAXIE speeches enter the added city scope. |

Other town/route chatter, signs, and unattributed gym badge/TM pages receive no new blanket scope. Later page-level attribution is a separate proposal, not included here.
