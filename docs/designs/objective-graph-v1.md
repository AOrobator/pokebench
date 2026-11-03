# objective-graph-v1 — a ranking topology over the existing campaign catalog

Draft design, 2026-11-02. Measurement-only. No model-facing change in this document's scope; the
supervisor change that consumes it is `objective-graph-supervisor-v1` (M3).

Reference: pret/pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` at `~/dev/pokeemerald`, US Emerald
ROM `f3ae088181bf583e55daf962a92bb46f4f1d07b7`. Same pins as `docs/findings/campaign-milestones.md`.

## 1. Why this exists

`docs/findings/campaign-milestones.md:7` already states the contract: **"Catalog order is a display
order, not a compulsory route."** The ranking layer does not honour it. `FRONTIER_MILESTONES`
(`packages/viewer/src/frontier.ts`) is an array whose index is the score, `furthestMilestone`
(`packages/viewer/src/workbench-view.ts:10`) takes the maximum reached index, and
`next-milestone-hint-v1` (`packages/agent/src/milestone-hint.ts`) asserts `MILESTONE_HINTS[furthest+1]`
as the next thing to do. Three consumers, one linear assumption, and it steers a correct run backwards
whenever the route defers an objective.

The recorded evidence is the record run's badge order `1 → 3 → 4 → 2 → 5 → 6 → 7 → 8`, and GLM `0d5d`
reaching Stone + Dynamo without Knuckle and concluding the supervisor was wrong for nagging Rustboro.
The supervisor was asserting display order.

## 2. Scope: measurement, so no switch

`feature-switch` lists what does **not** need one: "a measurement feature (`measured()`; it records
without changing model input); a viewer-only change". The topology and the depth function are exactly
that. They land once, apply to every run already recorded and every run after, and never enter a
`FeatureSet`. The behaviour change — what the model is told — is a separate switch with an OFF state
that reproduces current bytes (M3).

Consequence worth stating: the historical re-score is not a treatment. It is a corrected measurement
applied to runs that never had the switch on, which is why scoring cannot live behind the same id as
the nag.

## 3. Nodes already exist

`PROGRESS_CATALOG = campaignCatalog(BASE_PROGRESS_CATALOG)`: 62 base entries plus 103 campaign
additions, each with a source-grounded predicate (flag, map, variable) in
`docs/findings/campaign-milestones.md`. `REQUIRED_FRONTIER_MILESTONES` holds 200 ids — 49 written by
hand for the opening, 151 derived from that catalog — and overlaps it on 154, so the recordable universe
is **211 ids**, a number taken by importing the two modules rather than counting them by eye. The graph
adds **no nodes**. It adds edges and a depth function.

Depth counts non-optional nodes only, reusing `OPTIONAL_PROGRESS_NAMES` so HM Fly, the Bicycle, Castform
and the other optional acquisitions never pay for progress.

## 4. Edges are gates, not story beats

Direction: `from` is the prerequisite, `to` is the objective that becomes worth attempting.

A narrative beat is not an edge. Resolving Mt. Chimney is not required to enter Lavaridge's gym; the
gym is reachable with Rock Smash alone. Encoding story beats as prerequisites would reproduce the
linear array with more words. An edge earns its place only when the ROM refuses the action without it:
a breakable rock, a field-move item flag, a badge-count variable, a script guard.

Verified today (file:line read during this design):

| edge | kind | evidence |
|---|---|---|
| `HM_ROCK_SMASH_RECEIVED → HM_STRENGTH_RECEIVED` | physical | `data/maps/RusturfTunnel/map.json` object_events carry two `OBJ_EVENT_GFX_BREAKABLE_ROCK`; the Strength scene is `data/maps/RusturfTunnel/scripts.inc:47-58` |
| `HM_ROCK_SMASH_RECEIVED → ROUTE_111_NORTH` | physical | breakable rocks at (18,101)/(19,100), `docs/findings/campaign-milestones.md:19` |
| `DYNAMO_BADGE → ROUTE_111_NORTH` | field-move badge | Rock Smash is unusable without the third badge: `data/scripts/field_move_scripts.inc:62`. The HM alone does nothing |
| `DEVON_GOODS_RECOVERED → KNUCKLE_BADGE` | physical | `RusturfTunnel/scripts.inc:322-324` sets `VAR_BRINEY_HOUSE_STATE=1` with the goods flag; `Route104_MrBrineysHouse/scripts.inc:7` only seats Briney and Peeko in that state |
| `HM_STRENGTH_RECEIVED → MAGMA_HIDEOUT` | physical | `MagmaHideout_1F/map.json` carries three `OBJ_EVENT_GFX_PUSHABLE_BOULDER` |
| `HEAT_BADGE → MAGMA_HIDEOUT` | field-move badge | Strength is unusable without the fourth badge: `field_move_scripts.inc:124` |
| `FEATHER_BADGE → LEAGUE_ADMISSION_GRANTED` | gym guard | `EverGrandeCity_PokemonLeague_1F/scripts.inc:46-63`; the source comment: the door guards check only `FLAG_BADGE06_GET` because Winona's badge is the only one that can be skipped |
| `BALANCE_BADGE → HM_SURF_RECEIVED` | story var | `data/maps/PetalburgCity_WallysHouse/scripts.inc:15-17` gives Surf on `VAR_PETALBURG_CITY_STATE == 4` |
| `DEVON_SCOPE_RECEIVED → FORTREE_GYM_OBSTRUCTION_CLEARED` | item flag | flags 285/295, `docs/findings/campaign-milestones.md:74-75` |
| `MIND_BADGE → SPACE_CENTER_STORY_COMPLETE` | story var | `data/maps/MossdeepCity_Gym/scripts.inc:79` sets `VAR_MOSSDEEP_SPACE_CENTER_STATE=1` (and unhides the grunts) in Tate & Liza's post-battle script; completion is state 3 at `MossdeepCity_SpaceCenter_2F/scripts.inc:263` |
| `SPACE_CENTER_STORY_COMPLETE → HM_DIVE_RECEIVED` | story var | `data/maps/MossdeepCity_SpaceCenter_2F/scripts.inc:288` sets `VAR_STEVENS_HOUSE_STATE=1`; `data/maps/MossdeepCity_StevensHouse/scripts.inc:24-26` gives Dive on that value |
| `HM_DIVE_RECEIVED → SOOTOPOLIS_CITY` | physical | `data/maps/Route128/map.json` connection `MAP_UNDERWATER_ROUTE128` type `dive`; `Underwater_SootopolisCity` warps into the city |
| `FEATHER_BADGE → RAIN_BADGE` | gym guard | `data/maps/SootopolisCity_Gym_1F/scripts.inc:86` `goto_if_unset FLAG_BADGE06_GET, ..._EventScript_GoGetFortreeBadge` |
| `4 badges → NORMAN battle` | badge count | `include/constants/vars.h:153`: `VAR_PETALBURG_GYM_STATE 0x4085 // 0-1: Wally tutorial, 2-6: 0-4 badges, 7: Defeated Norman`; dispatch at `PetalburgCity_Gym/scripts.inc:104-108` |

Hypotheses still open (each needs one read, not a judgement call):

- `HM_SURF_RECEIVED → ROUTE_118_EAST_BANK_REACHED` (the crossing) and `→ MOSSDEEP_CITY` (open sea):
  read the water metatiles, or keep them as `route` edges that never block.
- `HM_WATERFALL_RECEIVED → EVER_GRANDE_LANDING`: the item is the gate (Waterfall carries no badge
  check), the climb itself needs a layout read.
- Whether anything enforces badges 7 and 8 at all — see §9.

Dropped during the same pass, and worth keeping visible because a wrong edge is worse than a missing one:

- `STONE_BADGE → DEVON_GOODS_RECOVERED`: the theft scene is five street coordinate triggers
  (`RustboroCity/scripts.inc:229-268`) with no gym condition. Walking the street fires it before or
  after Roxanne.
- `RAIN_BADGE → CHAMPION_ROOM_REACHED`: the league door checks only badge six.

## 5. Depth

Let `R` be the set of catalog ids a run has reached, `A(v)` the transitive ancestors of `v` under the
edges, and `C` the non-optional campaign ids.

- **Closed set** `K(R) = { v ∈ R ∩ C : A(v) ⊆ R }`.
- **Depth** `= |K(R)|`. Monotone non-decreasing, and a function of the set `R`, never of arrival order.
  That is what makes deferral legal: collecting Knuckle at badge four does not reduce depth, and does
  not have to precede Dynamo to count.
- **Remaining** `= |{ v ∈ ancestors(GAME_CLEAR) ∪ {GAME_CLEAR} : v ∉ R, non-optional }|`, over
  `requires ∪ expects`. Counting the closure rather than a shortest path matters: a cleared game needs
  every branch — all eight badges, both HM chains, the league sequence — and a path metric would silently
  drop the siblings. Reported as "unmet prerequisite steps", never as a predicted turn count.

Both are computed at view time from the recorded splits, like `furthestMilestone` is today. No run
metadata, no event schema and no recorder change.

Note on why final ranks will barely move: `furthestMilestone` is a backwards scan for the highest
reached index, so `0d5d` sitting at `HM_ROCK_SMASH_RECEIVED` already outranks `KNUCKLE_BADGE` without
earning it. The measured damage is mid-run, in the nag, not in the final position. Expect small rank
deltas and large correction counts; the re-score (M2) is designed to show exactly that split.

## 6. Supervisor rule (M3)

An objective may be named as the next thing to do only when it is in `K(R) ∪ frontier(R)`, where
`frontier(R)` is the immediate unblocked successors of `K(R)`. When nothing is unblocked, name the
nearest unmet prerequisite with its observable fact. Never name an objective whose ancestors are
unmet, and never name an objective already reached.

OFF reproduces the current hint and briefing bytes exactly. ON changes only which objective is named.

## 7. Coupling to story-route-plan-v1

The plan's step list is a topological order of this graph, not a route list. This is not a stylistic
choice: the record run defers Dewford's gym by four badges, and a sequential plan would report the
world record as off-plan from Mauville through Lavaridge. `story-route-plan-v1` therefore lands after
M1 and consumes its order.

Waypoint granularity (operator decision 2026-11-02): **map level plus key interior points**. Three kinds:

| kind | fields | why |
|---|---|---|
| `map_entry` | `map_id`, `expected_flag`, `gate` | ~60-80 maps of the 617 in `data/maps/map_groups.json` |
| `interior` | `map_id`, anchor tile, `done_when` | ~25-35 anchors: Granite Cave dark run, gym mazes, Aqua Hideout pads, Sky Pillar floors, Victory Road |
| `target` | interaction / warp / NPC | the actual thing the step ends on |

Every step carries `done_when`. "The gym" is not a place, and an interior anchor without a completion
predicate marks correct play off-plan.

Advisory only: no plan state may cause a refusal, a block or a gate. The 0517 turn-73 defect — four
`navigate_to_target` refusals of a route that crossed a matching script trigger — is the class of harm
this rule exists to prevent. `navigate_to` stays authoritative; the plan only reports divergence.

Off-plan is three states, not one: on plan; off plan but progressing (new milestone or new map —
deferral, grinding, shopping); off plan and stationary. Collapsing them rebuilds `0d5d`'s 314 identical
`milestone_drought` alarms as a per-turn string.

## 8. Pre-registered reads

| metric | definition | arm |
|---|---|---|
| turns to badge | existing split receipt per badge | both |
| longest drought | longest inter-milestone gap in play minutes (the 658/172 measure) | both |
| `milestone_drought` events | per 1,000 turns | both |
| corrections suppressed | nags naming an objective with unmet ancestors | ON (retro-computed for both) |
| plan adherence | steps executed per 100 turns; off-plan stationary turns | ON only, descriptive |

Primary is turns to badge. The drought reads are the mechanism check. The correction count is
retro-computable from recorded logs and is the cheapest falsification of the whole design.

## 9. Corrections to the commentary note

Claims in `keepingiticy speedrun commentary (2026-11-02)` that do not survive the scripts, and the switch
must not encode them:

- **Sootopolis gym is not gated on the Feather Badge.** `SootopolisCity_Gym_1F/scripts.inc:80-86` gives the
  Rain Badge on beating Juan; the `FLAG_BADGE06_GET` branch there runs when the trainer is *talked to
  again*, and sends the player to Fortree after the badge is already in hand. The sixth badge is
  skippable, and the badge that notices is the league door, not the gym.
- **Waterfall is granted by Wallace before Juan, not after him.** `SootopolisCity/scripts.inc:1252-1261`
  gives HM07 once `FLAG_SOOTOPOLIS_ARCHIE_MAXIE_LEAVE` is set, and the same NPC then steps aside for the
  gym. Waterfall gates Ever Grande and Victory Road; it does not gate the Rain Badge.
- **Field moves are badge-gated, in two different places.** `data/scripts/field_move_scripts.inc` refuses
  Rock Smash without badge three (`:62`) and Strength without badge four (`:124`); Cut needs badge one
  (`:4`). The field-control path is separate and stricter: `src/field_control_avatar.c:450` refuses Surf
  without `FLAG_BADGE05_GET`, `:465` and `:475` refuse Dive without `FLAG_BADGE07_GET`, and `:455` refuses
  Waterfall without `FLAG_BADGE08_GET`. Reading only the script path is how the first draft concluded Surf,
  Dive and Waterfall needed nothing but their HMs; a review caught it.
- **The Rain Badge is mechanically required after all.** The Ever Grande climb is a Waterfall use, so
  badge eight gates it (`:455`), and badge five gates the Surf that gets a run to Ever Grande in the first
  place. The design question this document opened — whether the last two badges are optional — is
  answered: badge eight is required, badge six is not, and badge seven is required to reach Sootopolis.
- **The league door checks one badge.** `EverGrandeCity_PokemonLeague_1F/scripts.inc:46-63` guards on
  `FLAG_BADGE06_GET` only, and the source comment says why: Winona's badge is the only one that can be
  skipped. That is still true, and it is what makes the sixth badge the interesting one: skipping it costs
  a gym and buys a detour, and nothing else notices until the door.

These are cheap mistakes to inherit: three came from a summary, one from reading the scripted field-move path and calling it the whole gate. Every edge in the module now cites a `file:line` a reader can check.

## 10. Non-goals

- No new milestone nodes, no re-decoding of RAM beyond ids the catalog already has.
- No change to `CampaignProgress` prediction, drought clocks or map-cycle policy.
- No predicted turn counts, no pathfinding inside maps, no replacement of `navigate_to`.
- No re-ordering of `FRONTIER_MILESTONES`; the array stays as the display order the findings doc says
  it is, and depth is reported beside it.
