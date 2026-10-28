# instruction-memory-cap-v1 (bounded OBSERVED INSTRUCTION MEMORY)

Operator decisions, relayed from the project thread:

- The operator 2026-10-28 7:44 AM NY: "we def need to have a hard cap on instruction memory. nothing we give to the model should be able to grow unbounded".
- The operator 7:53 AM picked rule A (game-state relevance). The coordinator set variant A′ at 7:58 AM: proven-done is checked before nearby, the story anchor is always kept, and a stale anchor doesn't count. The done-checks come from game flags and pret-audited templates, not a hand table. Raising ctx-size or lowering context_window is ruled out.
- Do not land. Do not edit experiments/feature-configs/current.json. Do not build the other caps (tool-result map grid, supervisor note, place evidence, refusal ledger, ID cards) until the operator approves each one.

## Why

Run a702 (`runs/2026-10-27T17-35-16_qwen36-gpu0_a702`) ended `model_error` at T1303. Its request was 66,676 tokens against a 65,536 window. The trimmer drops whole old turns, but the per-turn ledger messages cannot be dropped. The instruction-memory block grew about linearly, to 53,962 chars (21,124 Qwen3.6 tokens) at T1301. The cause is that `milestone-instruction-memory-v1` only retires episodes that match one of 25 pret templates, and its chapter list ends at ROCK_TOMB_RECEIVED. Everything heard after T578 is kept for good. Audit: `runs/analysis/bounded-input-20261028/audit.md`. Report: `runs/reports/run-analysis/2026-10-28_instruction-memory-rule-a/`.

## Rule A′ (whole episodes only; no text is cut)

Applied to the episodes `milestone-instruction-memory-v1` keeps, in this order:

1. **Story anchor.** The episode the latest observation readout's `Story line heard (SPEAKER, turn N): "quote"` came from (same turn, contains the quote). It is kept unless its goal is proven done: the readout marks the line `Done:`, or the quote names a gym leader whose badge flag is set (pret `data/maps/*_Gym*/scripts.inc`: ROXANNE STONE, BRAWLY KNUCKLE, WATTSON DYNAMO, FLANNERY HEAT, NORMAN BALANCE, WINONA FEATHER, TATE/LIZA MIND, JUAN RAIN).
2. **Proven done → dropped.** Either a `milestone-memory-rules.ts` template (pret-audited) matches exactly and every milestone it requires has been recorded; or every page is finished and at least one page is a completion. A finished page is one of:
   - a pret receipt string: `gText_PutItemInPocket` and `gText_PlayerPutItemInBag` (obtain_item.inc), `gText_ObtainedTheItem`, `gText_PlayerFoundOneItem`, `*_Gym_Text_Received*Badge`, `Registered … in the POKéNAV.` (match_call.inc and gym scripts), or berry_tree.inc's picked, found and question pages (the found and question pages are not completions);
   - a `faced_sprite` page whose recorded state shows the player facing a trainer template (heal_before_trainers) on that map, and the latest recorded trainer flag for it is set.
3. **Nearby → kept.** Heard on the current map, a connected map (topology), or a map a listed warp leads to (the readout's Exits, Warps and Unavailable lines).
4. **Named target**, newest first: names an unvisited pret map section (`src/data/region_map/region_map_sections.json`), a story character or gym leader not yet heard from, or a key item still in the bag.
5. **Recency**, newest first.

Steps 4 and 5 fill the room left while the whole rendered block stays at or under 16,000 chars. Steps 1 and 3 are always kept. When anything is left out, one line follows the header: `N earlier episodes are left out and remain in the run recording.`

**Budget.** The request must fit in 61,440 tokens (65,536 minus a 4,096 reply). Measured with the Qwen3.6 /tokenize, JSON runs at 2.55–2.62 chars per token, so 16,000 chars is about 6,100 tokens. At a702 T1301 the capped block is 15,923 chars and 6,088 tokens, down from 21,124. That would have brought the failing request to about 51,640 tokens. Below about 13,000 chars, T700's anchor and nearby episodes alone would not fit.

`just lint` clean (the worktree venv links the main checkout's mGBA binding for mypy).

**OFF:** byte-identical to today. **ON with nothing left out:** also byte-identical (no extra line).

## Story checkpoints (the operator 8:19 AM NY: "we can have deterministic game checkpoints that can mark things as done")

`story-checkpoints.ts` holds 16 checkpoints, from the move-in through the DEVON GOODS delivery in Slateport. Each lists the milestones it closes after (existing readers in milestones.ts or story-progress.ts, backed by a pret flag or var), and its scope as pret map + speakers: an OBJ_EVENT_GFX_ sprite on that map, a "NAME:" prefix from the scene's scripts, or null narration. An episode counts as proven done when every listed milestone has been recorded, the episode was heard at or before the latest of them (by turn), and every page is in that checkpoint's scope. No a702 text is used.

**Coverage ends at DEVON_GOODS_DELIVERED (Slateport museum).** No checkpoint yet for the Route 110 rival, Mauville or anything later, or for incidental chatter, which falls to nearby, named or recency.

- [x] `story-checkpoints.test.ts`: milestones exist in the harness readers; against pret 731ad5bfd (POKEEMERALD_DIR or ~/dev/pokeemerald, skipped when absent), each map id matches map_groups.json, each speaker is a sprite in that map.json or a `NAME:` prefix in the scene's scripts, each flag number matches flags.h and each FLAG_/VAR_ name exists. 2/2.
- [x] RED: checkpoint behaviour tests in `instruction-memory-cap.test.ts` (closes after the flag, not before; only episodes heard by then; any out-of-scope page keeps it; multi-milestone checkpoints need all).
- [x] GREEN: `checkpointDone` (template, then checkpoint, then receipts and trainers). 13/13 plus 2/2. `rule_a2.py` reads the same table with its own logic. The replay is byte-identical again: a702 T700 12,976, T1301 15,923 (6,088 tokens); 88ea T400 13,307, T800 15,873. At a702 T1301 the checkpoints retire the POKéNAV tutorial (T634, T635, T663 by pokenav-match-call), the Devon goods theft and recovery (T580, T582, T614, T618, T620, T621 by devon-goods-recovery), WALLY's tutorial (T311, T312), the woods scene (T362) and DAD's stale BRAWLY line (T871 by dad-sends-to-dewford). MR. STONE's errand (T630) and MR. BRINEY's LETTER lines stay. 21 episodes closed by checkpoint; 31 of 112 kept.

## Full-suite finding (first `just test`): 3 failures, all from registering this switch

- `type-gap-last-message.test.ts` pinned its switch as `SWITCHABLE_FEATURES.at(-1)`, against the feature-switch rule to assert absolute position. Changed to "registered after gateway-schema-hint-v1".
- `semantic-navigation-v2.test.ts` and `gym-evidence.test.ts` build all-on fixtures with milestone-instruction-memory-v1 OFF, so `needs: "milestone-instruction-memory-v1"` raised a dependency problem. Rather than edit other switches' fixtures, the cap now has `needs: null` and also bounds the unselected memory form (milestone-instruction-memory-v1 OFF) with the same whole-episode rule. That closes the other unbounded path as well.
- [x] RED: legacy-form cap test and registry test (518587451).
- [x] GREEN: `needs: null`. `ObservedInstructions.text()` caps both forms through one `row()` mapping, and the older form's left-out line follows its first line. 98 passed across cap, checkpoints, type-gap, semantic-navigation-v2, gym-evidence, observed-instructions (+wire) and features. The replay is still byte-identical on all four turns.

## Milestone M1: switch + rule A′

- [x] RED: `instruction-memory-cap.test.ts` (each step, budget fill, omission line, stale anchor, OFF and no-drop identity) and a factory test through `observedInstructions`. Fails: the module and switch do not exist yet.
- [x] GREEN: `instruction-memory-cap.ts` plus wiring in `observed-instructions.ts`; `pret-map-sections.ts` (189 names from pret). instruction-memory-cap 10/10 (481741962 went in with a timestamp flake in the factory test: it compared whole messages, including `Date.now()`. The next commit compares records and contents instead; 6/6 reruns pass); agent focused suites 85 passed; viewer panels, server and next-run 394 passed.
- [x] Registry: SWITCHABLE_FEATURES last, FEATURES entry (guard category, `needs: null` after the first full-suite run, Off copy), `...when()` last. Presets: FeatureSetSchema optional, normalizeFeatures, flagFeatures and DEFAULT_NEXT_RUN false. current.json untouched.
- [x] Wiring removal check: with the switch argument removed from `observedInstructions`, the factory test failed (1 failed, 9 passed); restored, 10/10.
- [x] Replay (`runs/analysis/bounded-input-20261028/replay-cap.mjs`): switch off equals the recorded block, switch on equals `rule_a2.py`'s AFTER byte for byte. a702 T700 15,956 and T1301 15,965 chars; 88ea T400 15,774 and T800 15,962.
- [x] Explainer `docs/explainers/instruction-memory-cap-v1.html` (themed, pages-check clean, headless 1280 and 375 with no overflow), README, FEATURE_EXPLAINERS, panels/server link tests.
- [ ] Gates: `just lint`, full `just test` (coordinator granted the CPU window in the 2026-10-28 brief).
- [ ] Review: personas (harness engineer, data scientist, ML engineer, evaluation integrity) across the Claude CLI, Codex CLI and fallback lanes.
- [ ] Stop: report to the coordinator. No landing.

## Main sync (ca754cfff: instruction-memory-dedup-v1 and three story readout switches)

- Merged, not rebased. The registry, presets and next-run take main's entries and re-append instruction-memory-cap-v1 after instruction-memory-dedup-v1. The type-gap index test takes main's pinned index.
- `observed-instructions.ts`: the cap runs after dedup's merge (dedup first, then selection under the budget). Rows carry dedup's two source-map columns when dedup is on (`CapRow` gains a rest element; the cap reads only the first six), and the payload keeps dedup's keys (`current` only with base episodes, `observed_locations` when dedup has no retention). With the cap off, the render is main's string.
- Focused: 137 agent and 247 viewer tests after the registry test moved its anchor to instruction-memory-dedup-v1.

## Review round 1 (frozen 9716b71b5): Claude subagent (CLI login expired), Codex gpt-5.6-sol, fallback subagent, all BLOCKING

Accepted:
- **Checkpoint retires a live instruction (all three lanes).** `wally-catch-tutorial` covered DAD in the Petalburg Gym. pret `PetalburgCity_Gym/scripts.inc` shows DadGoCollectBadges ("Head for RUSTBORO CITY… ROXANNE… Collect BADGES") before `setvar VAR_PETALBURG_GYM_STATE, 2`, so T312 retired at once. `dad-sends-to-dewford` had the same flaw: NormanGoToRustboro's four-badge battle is still open at KNUCKLE. `briney-voyages` closed the "package for CAPT. STERN" lines at Slateport entry, before DEVON_GOODS_DELIVERED. Fix: drop DAD/NORMAN from the Wally scope, remove dad-sends-to-dewford, make briney-voyages close after DEVON_GOODS_DELIVERED, and make mom-home-instructions also need DAD_FIRST_MEETING (MOM's "your DAD at the PETALBURG GYM").
- **Not a hard cap (Codex).** Anchor and nearby were always kept. Now every group is under the budget, in priority order anchor, nearby, named, recency, newest first. An episode that cannot fit is left out, never cut.
- **Quadratic fill (Codex).** Each candidate re-rendered the whole block. Now each episode is measured once (single-episode render minus the empty render, plus a measured separator, plus the left-out line by digit count), with one final render check.
- **Stale anchor marked Done under the block (Claude, fallback).** The "Latest story line naming a place" form prints `Done:` on a later line; that is now read.
- **Header truthfulness (Claude, fallback).** When episodes are left out, "Unknown, mixed, future and reusable dialogue stays." and the older form's "none retires a quote" are replaced so the header does not contradict the cap.

Rebutted or deferred:
- Full-gate evidence (Codex): waiting for the coordinator's CPU window, which can't be self-granted. Recorded as pending, not waived.
- Legacy-form scope (Codex, fallback): the operator asked for "nothing we give to the model should be able to grow unbounded", so the boundary is amended to include it.
- The replay reference shares the checkpoint table (all lanes): true. The semantic check is now the pret-grounded unit tests for each risky scope, plus a pre-STONE replay turn.

- [x] RED round-1 tests (5 failing).
- [x] GREEN round-1 fixes: hard cap with one-pass measured fill, checkpoint scopes, `Done:` anchors, header wording under the cap. 48 focused passed (cap 18, checkpoints 2, dedup, observed-instructions + wire).
