# Worklog: bag-healing-items-v1 (heal-before-trainers names the BAG's healing items)

Branch `claude/potion-items`, base main 0ada6403. Local only: no push, no PR, no remote. Do not merge; do not edit `experiments/fixed/bundle-v-control.json`. The coordinator gives the merge slot.

## Problem Statement

Coordinator brief "Potions" (2026-10-17): check whether the model knows it has potions and can use them in and out of battle. Run e046 (`2026-10-17T13-15-36_qwen36-gpu1_e046`) went into LASS HALEY's battle on ROUTE104 at 14/38 HP with an unused POTION.

## Forensics (read-only, main checkout runs/)

- The readout lists the bag: `Bag: POTION ×1; POKé BALL ×5; GREAT BALL ×1; TM09 ×1` on every e046 tool result from seq 15989 (field and battle), decoded from SaveBlock1 bag pockets with quantities XOR SaveBlock2 encryptionKey (resources.py). Independent decode of raw-RAM archive 00008958 (state seq 16287): items pocket [(13 = ITEM_POTION, 1)], balls [(4, 5), (3, 1)]. Matches.
- In battle, battle-details-v2 says "BAG allowed — has a battle use (whether it does anything now is not checked): POTION ×1" (e046 seq 16212).
- The only heal advice delivered before the LASS battle was battle-triage-guidance-v1's line (seq 16289, 16362): "Your TORCHIC has 14/38 HP (below half). Talking to the nurse at a POKéMON CENTER heals your whole party; so does talking to MOM at home." No item named.
- heal-before-trainers-v1 (bundle) names only a POKéMON CENTER or MOM; its code comment and card say items are left out. low-hp-trainer-warning v1/v2 name BAG items, but only for the Route 103 rival and story battles.
- battle-move-tool-v1's bag option opens the BAG and stops ("choosing an item there is up to you").
- Model use, all 12 runs of 2026-10-17 (00:50 to 19:38 New York): zero real healing-item uses. Every POTION decrease is the Wally catch tutorial's lent bag (Party (tutorial), e.g. e046 seq 11843-11898). Field BAG opened in 0 runs outside battle; battle BAG screens were accidental (e0cc seq 13032-13149: "I accidentally opened the bag menu multiple times" while choosing EMBER). Weak (lead below half) trainer-battle starts with a POTION in the bag: e046 2 (seq 16138 17/38, 16400 14/38), e0cc 5 (seq 9839, 9885, 12816, 12970, 13032). Once the model considered it (e0cc seq 9609, reasoning: "I could use my single POTION") and battled anyway.
- Only b7d1 (19:38, still running) has heal-before-trainers-v1 and battle-move-tool-v1 on; 0 warnings so far.

## Scope

New switch `bag-healing-items-v1` (bundle-only, default off, needs heal-before-trainers-v1, agent-side only). When the heal-before-trainers paragraph fires, it also names the BAG items that answer the weakness it names, in bag order with their counts and the game's own item description (src/data/text/item_descriptions.h), and how the game uses them (gText_MenuBag "BAG", gMenuText_Use "USE", gText_UseOnWhichPokemon "Use on which POKéMON?"): HP items for a lead below half, REVIVE/MAX REVIVE/REVIVAL HERB for a fainted Pokémon, ETHER/MAX ETHER/ELIXIR/MAX ELIXIR/LEPPA BERRY for a lead out of PP. No item, no sentence. The event gains `items` only with the switch on.

Proposed second switch (not built here): `battle-item-choice-v1`, battle_action bag with an item name that drives the BAG cursor to it, USE and the party slot, refusing with the game's words.

## Invariants

- INV-1 OFF: heal-before-trainers-v1 paragraphs, events, prompt, tools byte-identical.
- INV-2 Names only items in the BAG now, from the result's own state.
- INV-3 Game words only; no walkthrough.
- INV-4 No truncation; INV-5 no timeline additions.

## Milestones

**M1 — RED**
- [x] Tests in `packages/agent/src/bag-healing-items.test.ts` on e046's recorded states (fixture heal-before-trainers-e046.json; its states carry the recorded bag).
- [x] RED run 8:14 PM: 15 failed, 3 passed (the 3 OFF byte-identity checks pass already, as they should).
- [x] COMMIT RED: `test(RED): bag-healing-items-v1 names the BAG's healing items …` (2759d6c5)

**M2 — GREEN**
- [x] Implementation (`low-hp-trainer-warning.ts`): BAG_ITEM_DESCRIPTIONS (22 items, item_descriptions.h), bagHealingItems(state, weak), HealBeforeTrainers option `items`, one sentence after the healing place; facts gain `items` only with the switch on. Event `heal_before_trainers_warning` gains optional `items` (+ `just schema`), RunRecorder writes it only when present, tail line adds ` · BAG POTION ×1` only when non-empty.
- [x] Registry: SWITCHABLE_FEATURES / FEATURES / playHarnessFeatures appended last (guard, needs heal-before-trainers-v1, agent side, not a server feature); presets optional + default false; flagFeatures and DEFAULT_NEXT_RUN false; FEATURE_EXPLAINERS mapped. Mechanical test updates only: positional `.at(-N)`/`.slice` +1, feature literals that turn off no-exit-here-v1 or heal-before-trainers-v1 also turn this off, guard count 22, switchboard rows 112.
- [x] Deletion receipt: dropping `items:features["bag-healing-items-v1"]` in withLowHpTrainerWarning turned 2 tests red (ON delivery, production playGameTools); restored, 18/18 green.
- [x] Gates 8:40 PM: `just lint` clean (after linking the main venv's mgba binding into this worktree's venv); `just test` agent 2356, viewer 1135, pytest 2707; `just coverage` agent 98.04/94.17/98.27/99.23, viewer 95.36/91.38/93.79/97.62, Python lines 97.66 branches 93.82 functions 100 (gate OK); low-hp-trainer-warning.ts 99.18 stmts / 92.72 branches / 100 funcs; experiments-check ok 102; verify-vendor OK.
- [x] COMMIT GREEN

**M3 — explainer, pending experiment, review**
- [x] Explainer `docs/explainers/bag-healing-items-v1.html` (pages-check prints nothing; README; panels/server link tests) + pending `experiments/bag-healing-items.json` (not queued) + readiness row. In the GREEN commit.
- [x] COMMIT GREEN: `feat(bag-healing-items): …` (719a07d7)
- [x] Live proof 8:50 PM (isolated built viewer on 127.0.0.1:8797, scratch runs root in the session scratchpad, stopped after): a scratch copy of `test-support/live-heal-before-trainers.ts` with this switch on (kept in the session scratchpad, not in the branch since review round 1; its run_start is the shared test fixture's generic metadata, so the scratch run proves the event, delivery and viewer surfaces only) recorded a run through production playGameTools + RunRecorder + pinned pi loop over e046's states: 2 `heal_before_trainers_warning` events (#8 RICH_BOY, #21 LASS), each with items [POTION ×1, "Restores the HP of a POKéMON by 20 points."], and tool_results #10 and #23 (what the next model request carries) end with the BAG sentence. The Agent Trace SUP row for #21 expanded to the whole paragraph with the sentence; Harness Config lists HEAL BEFORE TRAINERS: BAG ITEMS, and clicking its Read explainer opened `/explainers/bag-healing-items-v1.html` (h1 "Heal before trainers: BAG items"). No timeline change (no new event kind).
- [x] Explainer at http://127.0.0.1:8791/bag-healing-items-v1/bag-healing-items-v1.html (200), viewed at 1280, 1440 and 375 (dark scheme); two figures had text running past their boxes at 1280 and were widened; no page-level horizontal scroll at any width; pages-check prints nothing.
- [x] 9:25 PM: synced with main e4648982 (docs-only worklog archive) in merge 728c13ae. Gates on that tip: lint clean; coverage agent 2356 98.04/94.17/98.27/99.23, viewer 1135 95.36/91.38/93.79/97.62, pytest 2707, Python 97.66/93.82/100; experiments-check ok 102; verify-vendor OK. One `just coverage` run showed 2 viewer failures that did not reproduce in four reruns (plain vitest, vitest --coverage twice, full `just coverage`); the failing names were not captured.
- [x] Principles self-review PB1–PB13: 0 FAIL (PB2, PB8, PB12 N/A). Packet files in the session scratchpad `review/` (principles.md, boundary.md).
- **Round 1** (9:35–9:55 PM; packet `git diff --binary e4648982 6d2e8f41`, SHA-256 4010f6de…48d2, unchanged after, HEAD and clean status unchanged): Claude CLI (default login; `~/.claude-review` loggedIn false) **VERDICT: LGTM** (exit 0, empty stderr); Grok `cursor-grok-4.5-high` **VERDICT: LGTM** (exit 0, empty stderr); GPT `gpt-5.6-sol` xhigh via codex exec **VERDICT: BLOCKING**: (1) the live proof helper's scratch-root guard is a substring check (`../../../runs` passes); (2) its run_start metadata does not describe the fixture run. Triage: both are about the non-production proof helper copied from the landed heal-before-trainers helper; fixed by subtraction: the helper is removed from the branch (scratch copy only), and the worklog says what the scratch run proves. Grok follow-up fixed: the experiment notes said source.commit is the branch head while it pins the base; now says base. Follow-ups, not done: PP items' second prompt (which move) not quoted; SACRED ASH not named (different field-use function).
- [ ] Round 2 on the cumulative packet.

## Multi-Model Review Log
