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
- [x] COMMIT RED

**M2 — GREEN**
- [ ] Implementation, registry, presets, defaults, event schema.
- [ ] Gates (lint, test, coverage ≥90).
- [ ] COMMIT GREEN

**M3 — explainer, pending experiment, review**
- [ ] Explainer + FEATURE_EXPLAINERS + pending experiment + readiness row.
- [ ] Review (Claude, Grok, GPT), at most 2 rounds.

## Multi-Model Review Log
