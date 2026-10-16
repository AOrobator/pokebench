# people-id-cards-v1: an ID card for each person the model sees

Status: APPROVED by the operator 2026-10-16 4:47 PM EDT ("lgtm"), with the coordinator's recommendations as the operator decisions below. Implementation in progress.
Branch `claude/people-id-cards` in `/private/tmp/pokebench-id-cards`, cut from main bc2cb74b.

## Problem Statement

Run `runs/2026-10-16T12-42-29_qwen36-gpu0_4caa` (bundle arm of the bundle-v-control dry run): after Birch's lab (T143 "My kid, MAY, is also studying POKéMON while helping me out.") the model reached Route 103 and spent T199–T266 mostly on `navigate_to` toward the water-gated east side. The readout named "MAY at 10,3" in 55 of the 68 results (coordinator count), but in 47 of those she was the out-of-view template entry; by the existing on-screen rule (`script-line-presence.ts` `onScreen`, 7 columns, 5 rows) she was actually on screen in 8 results (T211, T239, T246, T262–T266). It talked to her only at T267. Across 67 runs the rival was on screen with the story task open in 141 results over 9 runs (receipt `docs/experiments/story-npc-on-screen-measurement.jsonl`, branch `claude/story-npc-on-screen`, 8fecd382).

Operator (the operator, 2026-10-16 4:20–4:27 PM EDT, in substance): no on-screen supervisor telling the model "this is your rival, interact with them". Instead an ID card for each person it sees: who they are and where they fit in the observed world and story, with no walkthroughs or hints. Everything comes from game state or from what the model has already been shown. Delivery is deterministic: when a person comes up on screen, the harness shows their card. Plus one short prompt line asking the model to consider the relationship between itself, the person and the story, naming no NPC and giving no instruction where to go or whom to talk to. Cards go in the bundle arm.

## Operator decisions (2026-10-16 4:47 PM EDT, the operator "lgtm" + coordinator recommendations)

- D1 Trainer facts from game memory (trainer type, sight range, beaten flag) never appear before a battle with that person is recorded. After one, the card quotes only the game's own battle text. The planned M1 RAM trainer reader is dropped: nothing else needs it, so there is no server change and no new state field.
- D2 Re-show: first sight, plus re-entry into view when the card has changed (38 cards on 4caa).
- D3 Placement: right after the people-ledger block.
- D4 A story name the readout shows before the game says it keeps its provenance line.
- D5 The last conversation is quoted whole.
- D6 The game's own directions inside quoted pages are quoted verbatim, unfiltered.
- D7 Pokémon and object sprites get no card.
- D8 bundle-v-control is not launched; no bundle membership in this branch (open question 8 withdrawn). The switch lands default off with a pending experiment entry.
- Process: RED → GREEN per milestone, gates (coverage ≥90), explainer, pending experiment entry; the three cloud review lanes (Claude `claude -p`, Codex `gpt-5.6-sol` read-only, Grok `cursor-grok-4.5-high` ask mode) each `VERDICT: LGTM` on the final packet after `git merge main`. No local reviewers. Do NOT merge; report to the coordinator.

These decisions supersede the matching parts of the design below (the Trainer rows, the Server field section, M1's RAM reader and open questions 1–8).

## Skills Loaded

feature-switch, feature-explainer, agent-observability, feature-worklog (PokeBench variant), pokebench-game-state (source checkout `~/dev/pokeemerald` at 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean). At execution: execute-worklog, experiment-queue, close-the-loop, multi-model-review.

## Architecture

### Switch

- id `people-id-cards-v1`, group `observation`, title `PEOPLE ID CARDS`, `needs: "people-ledger-v1"` (the compact form rides on the ledger row; the ledger needs `dialogue-auto-advance-v1`, whose page records are the card's dialogue source). Default OFF everywhere; `DEFAULT_NEXT_RUN` false; preset optional, normalizes to false.
- Server part: listed in `SERVER_FEATURES` (`packages/agent/src/features.ts:326`, `env/pokebench_env/readout.py:32`) and the Python default-off list, because the trainer facts are a new RAM read.
- Agent part: `packages/agent/src/people-id-cards.ts` (new), wrapped in `playGameTools` (`packages/agent/src/play-wiring.ts:82`) directly outside `withPeopleLedger`, and a system-prompt section in `play-config.ts` next to `EXPLORER_GUIDANCE_SECTION` (`play-config.ts:65`, appended at `:119`).
- Bundle: proposed for the bundle arm of `experiments/fixed/bundle-v-control.json` `switches` (ASK USER: the cohort is running).

### Grounded fields (what a card may contain)

| Field | Source | Spoiler-free? | Rule |
|---|---|---|---|
| On screen | `world_context.objects` (server `world_context.py:340-367`: active, not invisible, not the player, this map, within 7 tiles) cut to 7 columns × 5 rows by `onScreen` (`script-line-presence.ts:10-12, 40-48`) | yes, the model sees the frame | reuse `onScreen` unchanged |
| Person or thing | graphics id → `event-graphics.json` (`world_context.py:26-35`) | yes | fixed `PERSON_GRAPHICS` table: humans only. Excluded: ITEM_BALL, berry trees, CUTTABLE_TREE, BREAKABLE_ROCK, PUSHABLE_BOULDER, boats/trucks/cable car/SS_TIDAL/SUBMARINE_SHADOW, MOVING_BOX, BIRCHS_BAG, FOSSIL, dolls/cushions, statues/shadows, and Pokémon graphics (ZIGZAGOON_1/2, VIGOROTH_*, legendaries, …) |
| Sprite kind | same table; already in the readout | yes | shown verbatim with "a graphic, not a name" |
| Plain role ("nurse", "clerk", "heals") | none in game state; the sprite kind is the only appearance fact | "heals"/"sells" is NOT knowable before the game says it | EXCLUDED as harness words. What a person does appears only as their own quoted lines once the game showed them |
| Story character name | `storyCharacter(graphics, location)` (`script-line-presence.ts:20-36`, mirror of `env/pokebench_env/character_presence.py:72-129`) | the name can precede the game's own (4caa: readout names MAY at T105, game shows "Um… I'm MAY." at T107) | shown, with provenance: "the game first showed this name on turn N" or "from the harness's story-character table; the game has not shown this name in this run yet" (ASK USER Q3) |
| Identity | story character by name (across maps); everyone else by map id + map-local id (people-ledger key `people-ledger.ts:22-26`) | yes | — |
| Where seen | the tool results where the person was on screen; `location_display ?? location` + map id (`events.ts:432-434`) | yes | story characters list every map; others are one map |
| Last words to the model | delivered `dialogue_auto_advance` field pages (`events.ts:215-246`); a page belongs to a person when its `speaker_source` is `name_prefix` with that story name, or it is `faced_sprite`/no speaker and the object faced at the page's `state_seq` (people-ledger `facedObject` rule `people-ledger.ts:28-46`, extended to unscripted live objects) is that person | yes, already shown | the person's pages from the latest conversation that has any, every page whole, in order; only conversations from earlier tool results whose result was not an error |
| Pages that name them | delivered field pages whose text (minus a leading `NAME: ` speaker label) contains the story name as a whole upper-case word | yes, already shown | each distinct page once, chronological, whole; pages already in "last words" not repeated; named people only |
| Relation ("rival", "Birch's kid", "neighbour") | only inside quoted game pages | a harness-authored relation is a hint | EXCLUDED as harness words; INV-2 |
| Battles with them | battle text pages (`battle_message_id`, battle-text-auto-advance-v1) naming them: the game's own `"{CLASS} {NAME}\nwould like to battle!"` and `"Player defeated\n{CLASS} {NAME}!"` (pokeemerald `src/battle_message.c:385, 371`); outcome from `trainer_opponent` (`env/pokebench_env/trainer_opponent.py:59-73`, `events.ts:379`) as `BattleOutcomes` reads it (`battle-outcomes.ts:40`) | yes, already shown | story characters by name; object trainers by trainer id (below) |
| Trainer type, sight | NEW RAM read: `gObjectEvents` (0x02037350, `game_state.py:51`) slot +0x07 `trainerType`, +0x1D `trainerRange_berryTreeId`, +0x06 `movementType` (`include/global.fieldmap.h:226-247`); types `include/constants/trainer_types.h:4-7`; the game checks only NORMAL and BURIED (`src/trainer_see.c:202-205`), NORMAL sees only the facing direction (`trainer_see.c:308-311`) | game memory, not on screen; a mechanic, not a story hint (ASK USER Q4) | NORMAL: "watches N tiles in the direction it faces". BURIED (`TRAINER_TYPE_BURIED`) and disguised (`MOVEMENT_TYPE_TREE_DISGUISE` 0x39, `MOUNTAIN_DISGUISE` 0x3A, `include/constants/event_object_movement.h:61-62`) say nothing until a battle with that trainer is recorded: revealing a hidden trainer is a spoiler. SEE_ALL_DIRECTIONS is unused in Emerald maps (0 of map.json) and the game never checks it: no line |
| Trainer id, beaten | the object's template script (`gSaveBlock1Ptr->objectEventTemplates` for the current map, `src/event_object_movement.c:2426-2436`; template +0x10 script, `global.fieldmap.h:94-108`; save-block templates at +0xC70 as `character_presence.py:25`) starts with `trainerbattle` (0x5C); trainer id = u16 at script+2 exactly as `GetTrainerFlagFromScriptPointer` reads it (`src/battle_setup.c:1215-1219`); beaten = flag `TRAINER_FLAGS_START (0x500, route103_rival.py:14) + id` | game memory | "not beaten" / "beaten (its trainer flag is set)". Example check: Route 102 object 2 (`Route102_EventScript_Calvin`, `trainerbattle_single TRAINER_CALVIN_1` = 318) ↔ `story.py:72` flag 0x63E = 0x500 + 318 |
| Trainer name and class | shown by the game only at battle start | before the battle it is a spoiler | only as the quoted battle intro page; never from the ROM tables |
| Script contents, hide flags, what they will say, rematches, items, whether talking advances the story | ROM/RAM | hints | EXCLUDED |

### Trigger

- Evaluated on every `observe`, `press` and `navigate_to` result whose state is a started overworld readout, not in battle, with position and `world_context` (the ledger's own condition, `people-ledger.ts:107-109`).
- A full card for person P is shown when P is on screen now and either (a) no card for P was shown in this run, or (b) P was not on screen in the previous such result (P came back into view) and P's card fingerprint differs from the last card shown for P.
- Fingerprint: the name and its provenance turn, the set of maps seen on, the text of the last-words pages, the texts of the pages that name them, battle pages, trainer beaten flag. Turn numbers alone never change it (a nurse repeating the same lines does not re-trigger).
- Dialogue fields use only earlier delivered results; a conversation in this very result is not quoted again (it is in the result's own "Dialogue shown during this call" list); the card says "Also spoke to you during this call (see this result's dialogue list)." Game-memory fields (position, trainer flag) are read from this result's state.
- While P stays on screen no full card repeats; the compact form on P's people-ledger row carries the current facts at once (newly beaten, newly named, new last words).
- Several people entering together: one card each, in `onScreen` reading order.
- Measured on 4caa by a scratch prototype of these rules (not tracked): 38 full cards in 598 turns, median 6 lines, longest 38 lines (PROF. BIRCH at T505). Alternatives (ASK USER Q1): re-show on any change while on screen 48 cards; every re-entry 104 cards.

### Model-facing format

Placement: a block directly after the people-ledger block (which sits after Position, or after the untaken-exits line), so it is in the top lines the model quotes (ASK USER Q2: or at the end of the result).

Header line, once per result with cards:
```
ID cards for people who just came into view (only what the game has shown or stored in this run):
```
Card:
```
ID card: <NAME (sprite S) | sprite S>, map object <id>, at <x>,<y> on <place> (map <g>/<n>)
- Name: <NAME. The game first showed this name on turn N. | NAME, from the harness's story-character table; the game has not shown this name in this run yet. | none shown by the game (a sprite kind is a graphic, not a name).>
- Seen on: <place (map g/n) from turn N; …>            (story characters with 2+ maps; otherwise "First seen: turn N, here.")
- Trainer (from game memory): watches <N> tiles in the direction it faces; <not beaten | beaten (its trainer flag is set)>.   (NORMAL trainers only)
- Last spoke to you: turn N, <k> pages, whole:        | - Has not spoken to you in this run.
  turn N · <place> · at x,y · <speaker label>: "<page text>"
- Other pages that name them (each once, in order, whole):   | - Other pages that name them: none.   (named people only)
  turn N · <place> · at x,y · <speaker label>: "<page text>"
- Battles with you (the game's own battle text):       | - Battles with you: none recorded in this run.
  turn N: "<battle page text>"
- Also spoke to you during this call (see this result's dialogue list).   (only when true)
```
Page lines reuse `place()`/`who()` from `dialogue-auto-advance.ts:308-318` so a page reads exactly as it did when shown. Nothing is clipped.

Compact form, appended to the person's people-ledger row once a card for them has been shown:
```
- object 2, MAY (sprite RIVAL_MAY_NORMAL), at (10,3): not talked to this run; ID card: name shown by the game on turn 107; last spoke to you on turn 107; battles: none
- object 2, sprite YOUNGSTER, at (33,14): not talked to this run; ID card: no name shown; trainer, watches 3 tiles, not beaten; has not spoken to you; battles: none
```

Prompt section (system prompt, after the explorer guidance section when that is on):
```
ID cards: when a person comes into view for the first time, or comes back into view after something about them has changed, the result shows their ID card. A card holds only what the game itself has shown or stored about that person in this run: the name the game used, where you have seen them, their last words to you, other lines that name them, and any battles with you. When you read a card, consider who this person is to you and where they fit in the story so far.
```

### Recorded event (agent-observability)

`people_id_card {tool_call_id, key, reason: "first" | "changed", text}` per card, recorded when the result is delivered; `schemas/events.v1.json` regenerated with `just schema`. Viewer: Activity History row and raw-event inspector. Never the timeline (closed, operator decision 2026-10-16).

### Server field

`object_trainers: [{local_id, map_id, trainer_type, sight, movement_type, trainer_id | null, defeated | null}]` for every live object slot on the current map, top-level in the state body, present only with the switch ON. OFF: the server's state JSON has no such key.

## Invariants

- **INV-1 OFF is byte-identical.** Readout text, tool list and descriptions, system prompt, state JSON and recorded events are today's with the switch off. Test: replay the 4caa fixture with OFF and compare bytes with main; Python state JSON golden with the feature off.
- **INV-2 Facts only, no harness relation words.** The card template contains no relation, role or direction words. Test: render every card in the fixture, strip quoted game pages, assert none of `rival, friend, neighbo, daughter, son, kid, dad, mom, mother, father, heal, shop, sell, go, talk, visit, should, need, must, next` appears (case-insensitive) outside quotes and outside the person's NAME.
- **INV-3 Only what was delivered.** Quoted pages come only from earlier tool results that reached the model without error; pages of the current call are never quoted. Test: an errored result's pages never appear; the T56 MOM card says "Has not spoken to you" plus the "during this call" line.
- **INV-4 Never clipped.** Every quoted page is whole. Test: a 600-character page and a 13-page conversation (4caa T107) round-trip exactly.
- **INV-5 One definition of on screen.** Cards use `onScreen` from `script-line-presence.ts`; no second window. Test: an object at dy = 6 gets no card, at dy = 5 it does.
- **INV-6 Identity.** Story characters by name (character-presence table); others by map id and local id. Test: MAY at MAYS HOUSE 1F #7, ROUTE103 #2, OLDALE #4 is one card history; two YOUNGSTERs on Route 102 are two.
- **INV-7 Deterministic.** Cards are a pure function of recorded events; a replay of the run's events reproduces the same `people_id_card` events. Test: replay 4caa twice, equal.
- **INV-8 Hidden trainers stay hidden.** BURIED and disguised trainers get no trainer line until a battle with that trainer id is recorded; trainer names only from battle pages. Tests with synthetic slots.
- **INV-9 No spoiler from RAM.** Only fields in the table above are read; template scripts are read for the `trainerbattle` header only. Test: the reader returns no text from scripts.
- **INV-10 Needs the ledger.** Validation rejects the switch ON with `people-ledger-v1` OFF.

## Security Review

No new network surface: the server field rides the existing state endpoint on 127.0.0.1. RAM reads are bounds-checked like `character_presence.py:174` (save-block pointer range) and script pointers validated as ROM pointers (`world_context.py:38-39`) before reading 4 bytes. No subprocesses. No ROM data copied into the repo; the 4caa fixture holds recorded events only.

## Milestones

(Revised per D1: no server milestone. Battle attribution without a RAM reader: a battle page `"<LABEL>\nwould like to battle!"` belongs to the person the latest field page before it in the same `dialogue_auto_advance` call is attributed to; that person's battle pages are every later delivered battle page containing LABEL, and for a story character every battle page naming them. Recorded shape: run f551 T529 YOUNGSTER faced_sprite pages, then "YOUNGSTER CALVIN\nwould like to battle!".)

**M1 — Card model and switch registration**
- [ ] Write tests (`people-id-cards.test.ts`) on fixtures cut from recorded runs (4caa whole run, f551 T500–T560, trimmed state fields): exact cards at T105 (MAY, name from the table), T211 (MAY on Route 103), T285 (MAY in Oldale, battle text), T56 (MOM, "during this call"), T510 (MOM), T184 and T297 (NURSE), T551 (YOUNGSTER, no trainer facts); f551 Calvin after the battle (battle text only); 38 cards over 4caa; fingerprint ignores turn-only changes; INV-2..INV-8; registry entry, needs, presets, defaults
- [ ] COMMIT: `test(people-id-cards): RED ...`
- [ ] Implement `packages/agent/src/people-id-cards.ts` (card model); registry (`SWITCHABLE_FEATURES`, `FEATURES` with ` Off: `, `...when()` last), presets + `flagFeatures`, `DEFAULT_NEXT_RUN` false; registry counts and end-relative tests shifted
- [ ] Gates: `just test` (TS + Python counts), `just lint`, `just build`, `just coverage` (≥90 lines/branches/functions, both stacks), `just verify-vendor`
- [ ] COMMIT: `feat(people-id-cards): ...` (GREEN)

**M2 — Delivery: readout block, ledger row, prompt, event, viewer**
- [ ] Write tests: factory test through `playGameTools` (block after the ledger block, compact suffix on the row, composition with untaken-exits and the navigate-first reminder part); prompt section ON/absent OFF; `people_id_card` event per card; viewer Activity History text and trace label; OFF byte-identity (INV-1)
- [ ] COMMIT: RED
- [ ] Implement wrapper, prompt section, event + `just schema`, recorder, tail, viewer model/panels/trace
- [ ] Wiring-removal check: drop the wrapper from `playGameTools`, factory test red, restore; receipt recorded
- [ ] Gates as M1
- [ ] COMMIT: GREEN

**M3 — Explainer, pending experiment, review**
- [ ] Explainer `docs/explainers/people-id-cards-v1.html`, README index, `FEATURE_EXPLAINERS` mapping (+ panels/server tests); `just pages-check` silent
- [ ] `experiments/people-id-cards.json` pending (no `queuePosition`), readiness line
- [ ] Fake-data rehearsal: replay 4caa through the production wrapper, 38 `people_id_card` events
- [ ] `git merge main`, gates, frozen packet; Claude, Codex, Grok `VERDICT: LGTM`
- [ ] Report to the coordinator; no merge

## Closing the Loop

- Tests for code (above).
- Fake-data rehearsal: replay 4caa events through the production wrapper with the switch ON and diff the produced cards against the fixture expectations; confirm 38 `people_id_card` events.
- Viewer: real-browser click on a replayed run's Activity History card row and raw inspector, desktop and phone screenshots opened.
- After merge: `just viewer-main`, then a live check that a new run with the switch ON records `people_id_card` events (only when the operator launches one).

## Open questions (operator only)

1. Re-show rule: first sight plus re-entry when changed (38 cards on 4caa), on any change while on screen (48), or every re-entry (104)?
2. Placement: right after the people ledger (top), or at the end of the result?
3. Story-character names before the game shows them (character-presence's rule): show with provenance (default), or withhold until the game shows the name?
4. Trainer sight range: include "watches N tiles" (default), or only "trainer, not beaten"?
5. Quoted pages can carry the game's own directions (T143 Birch: "don't you think it might be a good idea to go see MAY?"). Default: quote verbatim, no filtering. OK?
6. Pokémon objects (ZIGZAGOON chasing Birch, VIGOROTH movers): no card by default. OK?
7. "Last spoke": the whole last conversation (default, 13 pages for MAY at T211) or only its final page?
8. bundle-v-control is a running cohort: joining its bundle arm means a new launch from the new pin. When?

## Session Log

- 2026-10-16 (EDT): discovery and design only; worklog drafted in the worktree, not committed. Card prototype run over 4caa in the session scratchpad (not tracked).

## Surprises

- In 4caa, "MAY at 10,3" was on screen in only 8 of the T199–T266 results; the other 47 mentions were the out-of-view template entry (offscreen-objects-v1 / character-presence).
- The readout names MAY at T105, two turns before the game shows "Um… I'm MAY." (T107).
- `TRAINER_TYPE_SEE_ALL_DIRECTIONS` is never used in Emerald maps and the game never checks it (`trainer_see.c:204`).
- Nurse pages have no speaker (counter talk); the ledger's faced-object rule across the counter is what attributes them.

## Multi-Model Review Log

(empty)

## Boy Scout Log

(empty)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog.
