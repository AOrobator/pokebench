# Game-knowledge curriculum for the custom model

> Status 2026-11-05: weight editing was tried and dropped (see lesson-just-in-time-knowledge.md). This curriculum is now delivered just-in-time by harness switches in the Rayquaza lane; the "into the weights" wording below is historical.

Draft, 2026-11-02, 10:40 PM New York. This applies only to the custom weight-edited model lane. Every run in that lane is labeled as having walkthrough knowledge and is never pooled with benchmark arms (the operator, 10:09 and 10:12 PM).

## The one design rule

**Every fact comes from a deterministic source, never from a model's memory.** The 27B's worst failure is confident wrong recall. In run `7da5`, 767 of 1,330 turns contain "I recall" or "recall now", rising to 94 to 97 of every 100 turns during the Route 104 drought. The recalled facts are wrong: "Route 104 is the lake", "you need Surf to reach Dewford", "Sootopolis gym, Lance, Dragon". Training on facts written by another LLM would reinforce exactly this failure. So every module below names its source: the ROM/RAM the harness already reads, the private notes walkthrough (`Emerald walkthrough/`, 19 parts, ~520 KB), or the keepingiticy commentary.

## How knowledge enters the weights

Facts go in as **decisions on recorded game states**, not as prose. The private notes plan already showed that prose makes up 0.06% of the corpus and leads to recitation inside `thinking`. Each fact becomes a template: (observation from a real state) → (short thinking that uses the fact) → (correct tool call). We also generate DPO pairs where the rejected side is the model's own confabulated version of that turn. The corpus has thousands of these.

## Modules

| # | Module | What the model must know | Source | Example decision |
|---|---|---|---|---|
| 1 | Run setup | Open OPTION first: text speed FAST, battle scene OFF, battle style SET. Use a one-letter name. | game menus (RAM menu state) | MAIN_MENU state → `press` into OPTION before NEW GAME |
| 2 | Controls and UI | Which scenes auto-advance and which need A, plus menus, bag pockets, shop, PC, and registering the bike to SELECT | harness scene readout + recorded turns | birch_speech, controls locked → wait, don't mash |
| 3 | World graph | Every map's edges and warps, and which edges are gated by an HM, item or story flag | **ROM map connection and warp tables**, exact, no LLM in the loop | Petalburg, goal Dewford → Route 104 south to Mr. Briney's boat, no Surf needed |
| 4 | Story graph | Each story milestone's trigger (who or where) and prerequisites, as a partial order | walkthrough + `objective-graph-v1` + recorded milestone names | next milestone DEVON_GOODS_RECOVERED → Rusturf Tunnel grunt |
| 5 | Gym and dungeon puzzles | The solved path and the rule for each puzzle: Mauville barriers, Petalburg rooms, Fortree rotating doors, Mossdeep switches, Sootopolis ice, Aqua Hideout warp pads, Magma Hideout and Seafloor Cavern boulders, Sky Pillar cracked floor on the bike, Victory Road | walkthrough parts 03, 06, 07, 09 to 13, plus tile data from the ROM | Sootopolis ice tile → the exact step sequence |
| 6 | Battle mechanics | Type chart, STAB, abilities (Intimidate, Levitate, Sturdy...), stat stages and X items, status, switching, accuracy and PP | walkthrough appendices 16 and 18 + a deterministic damage calc | Mud Shot vs Electric lead → super effective, use it |
| 7 | Rosters | Every leader, admin, rival, Elite Four member and Champion team, with levels and aces | walkthrough | before Flannery → know her team, check lead level against her ace |
| 8 | Starter strategies | A per-starter plan: which gyms are hard, what to catch and where, which TMs and HMs to teach. Mudkip (record route), Torchic (our default), Treecko | walkthrough + keepingiticy (Mudkip) + type chart | Torchic before Brawly → evolve, learn Double Kick, take it |
| 9 | Transport | Bike on pickup, Teleport/Fly/Escape Rope/Dig as taxis, Repel at every route edge | keepingiticy | bike in bag, outdoors, on foot → mount |
| 10 | Economy and prep | A closed shop list per stretch, held items, healing thresholds, a prep budget per boss | keepingiticy + `prep-readiness-v1` design | Mauville mart → buy the list, leave |
| 11 | Catching | Lower HP, inflict sleep or paralysis, which ball to use, party-full behavior. **The Master Ball** is in the Magma/Aqua hideout chapter (walkthrough part 09), so Rayquaza needs no RNG one-ball catch | walkthrough 09, 17 | Sky Pillar top, Master Ball in bag → throw it at Rayquaza |

## The operator's decisions (2026-11-02, 10:40 PM New York)

- **Into the weights:** HM logistics, whiteout rules, weather and terrain, "the readout beats memory", the single-carry back half, and story text it must not skip. All approved.
- **Full map switch is on** in this lane, so Flash is not needed.
- **Rayquaza:** catch it with the Master Ball.
- **Badge order: teach keepingiticy's 1 → 3 → 4 → 2 → 5 → 6 → 7 → 8.** This replaces the earlier "partial order only" advice. Caveat: the harness frontier (`FRONTIER_MILESTONES`) is linear, and its supervisor nagged GLM for a legal order. So `objective-graph-v1` must be on in this lane, or the harness will fight the trained order.
- **Out:** post-game and the Battle Frontier.

## Starter and team policy (proposed 2026-11-02, 11:10 PM New York; awaiting the operator)

**Proposal:** one plan per starter, never blended within a run.

- **Custom lane main line: Mudkip, following the keepingiticy route.** It is a single carry and fits the Rayquaza back half.
- **Torchic plan:** built from Astra 429f's team. At turn 2,741 with 4 badges it had Breloom 24 (Shroomish, Petalburg Woods), Sableye 28 (Granite Cave), Azumarill 24 (Route 112), Combusken 18, Skarmory 18 (Route 113), and Zigzagoon 10 as an HM slave with Cut and Rock Smash.
- **Shared skills from Astra:** HM-slave logistics, catching, and the states past badge 2.

## Gaps I'd add beyond your list

- **HM logistics.** An HM can't be forgotten without the Move Deleter in Lilycove, so it belongs on an HM slave and not the carry (walkthrough part 00 recommends this). Our traces show models stalling at move-learn prompts.
- **Whiteout rules.** What a whiteout costs (half your money, back to the last Center) and when to heal instead of pushing on.
- **Weather and terrain.** The rain after Kyogre, sandstorm on Route 111 (Go-Goggles), dark caves (Flash is optional once the full-map switch is on).
- **The meta-skill: the readout beats memory.** Whenever the harness readout and a recalled fact disagree, act on the readout. This is the DPO lane for the "doubting the harness" class (78 turns in `7da5` alone).
- **Single-carry strategy for the back half.** Deposit everyone but the carry before the League (the record route). Train it as a decision, not a rule, because it depends on the carry's level.
- **Story text it must not skip.** Lines that name the next place ("my cottage by the sea near Petalburg Woods") are clues. The `heard-line-route-note-v1` work showed that following them is learnable.

## What stays out

- RNG manipulation, including the one-ball Rayquaza catch.
- Post-game and the Battle Frontier (walkthrough 14 and 15). They are outside the Hall of Fame goal, so leave them out to avoid diluting it.

## Checks before any of this goes in

1. Build a held-out **fact quiz** from modules 3 to 7, written as decisions on states that were never trained on. Score the base 27B first. This also measures how wrong its priors really are.
2. The edited model's "I recall" rate during droughts should drop. Where recall still happens it must be correct, judged against the same deterministic sources.
3. The thinking-error regression checks from the subagent reports (`thinking-errors/`) all pass.
4. Screen grounding does not regress.

## More modules (proposed 2026-11-02, 11:00 PM New York)

| # | Module | What goes in | Evidence it's needed |
|---|---|---|---|
| 12 | **Harness fluency** | When to use `navigate_to_target` vs `navigate_to`; batching `press` (up to 8 buttons); calling `observe` only when the screen changed; how far `select_menu_option` reaches; how to read the ASCII legend, warp labels, "Not on this map", supervisor and drought briefings; what each refusal means and the right next move | 8,034 needless press-A plans; re-issues after refusals in every model; `select_menu_option` tried on the main menu; 572 "evidence first" acknowledgements followed by a false fact |
| 13 | **Stall response policy** | When a stall warning fires: re-read the objective, talk to the nearest story NPC, check the story graph and switch approach. Never retrieve from memory | recall jumps to 90% after a stall warning; walking away from the gate NPC costs 46% of 27B turns |
| 14 | **Calibrated "I don't know"** | Say "unknown, check the readout or the dialogue" instead of guessing | every confabulation class |
| 15 | **Move and evolution management** | Which moves to keep or skip per stretch, how to handle "Stop learning?", never cancel an evolution, when a TM is worth it | the Double Kick declines; the "Stop learning" loop |
| 16 | **Items in battle** | Potion thresholds, X items before a boss, status cures, run vs fight against wild encounters | the 27B used the bag 4 times in about 370 battle actions |
| 17 | **Wall-clock economics** | The score is time, so plan fewer, larger actions and don't re-derive facts already settled | 27B 40 s per decision; GLM re-derived the HM list in 12 turns |
| 18 | **Own notes and objective hygiene** | What to record in objective and ledger tools, and keeping notes short so the 65,536 window survives | context-floor overflow on 10/28; 1,490 rejected `review_goals` calls in one run |
| 19 | **Trainer sight lines and scripted scenes** | Recognize a trainer's line of sight and a locked cutscene; wait instead of mashing | DeepSeek observes during cutscenes (good); Qwen3.6 mashes |

**Coupling caveat for module 12.** Harness fluency in the weights ties the model to one harness version. Keep the system prompt and tool docs in context anyway. Pin the training data to a harness commit, and retrain or re-check when tools or the legend change (the audit found legend letters already change between readouts). The upside is that it can shrink how much tool explanation the model needs, which saves context.

**Keep out of the weights:** anything that changes per run, such as the current party, bag, position, flags and money. Those stay in the readout. Weights hold how the game and the tools work; the readout holds what is true right now.

## Additions from the keepingiticy video (the operator approved, 2026-11-03, 1:32 AM New York)

Sources: [findings.md](keepingiticy-video/findings.md), [splits.csv](keepingiticy-video/splits.csv), [curriculum-additions.md](keepingiticy-video/curriculum-additions.md). Every row there goes in as written. On top of it, the operator added these on 11/3:

- **Master Ball module (new, required for Rayquaza).** The Master Ball is in the **Aqua Hideout** (Lilycove), not the Magma Hideout. From the three-grunt room, take the bottom-left warp panel, then right → middle → left → left; the item room's two left balls are the Nugget and the Master Ball, and the two right balls are Electrode traps. Back out: right → middle → left → top. About 10 warps, 25–40 steps, ~40 s. keepingiticy skips it because he RNGs the catch. Details in [master-ball.md](keepingiticy-video/master-ball.md) (private notes walkthrough part 09 plus his Aqua Hideout frames). Decision template: in the Aqua Hideout three-grunt room with no Master Ball in the bag → bottom-left panel. At Sky Pillar top → Master Ball on Rayquaza, first throw.
- **Pick up every item he picked up.** That covers the field and hidden items (four or more Rare Candies, Elixirs, Max Elixir, Full Heal, Nugget, Escape Rope) and gifts (Soft Sand, Mystic Water, Itemfinder). The list with map, tile and hidden-or-visible goes in `keepingiticy-video/items.csv` (pending). Each one becomes a waypoint decision.
- **Literal paths, not just routes.** Gyms, hideouts and dungeons get step-level paths, (map, x, y) per step, extracted deterministically from his video (camera-scroll tracking, anchored to ROM warps). They are pending in `keepingiticy-video/paths/` and `paths.md`. These become training trajectories and puzzle move strings (Lavaridge vents, Mossdeep switches, Sootopolis ice, hideout warp pads, Seafloor boulders, Victory Road).
- **Bike.** The harness auto-selects the bike outdoors and registers it to Select. A separate harness thread owns that switch. The curriculum keeps the decision "outdoors with the bike → be on the bike" for the case where the switch is off.
- **RNG stays out:** the starter frame and the one-ball catch. See [rng-explained.md](keepingiticy-video/rng-explained.md).
