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

**Budget.** The request must fit in 61,440 tokens (65,536 minus a 4,096 reply). Measured with the Qwen3.6 /tokenize, JSON runs at 2.55–2.62 chars per token, so 16,000 chars is about 6,100 tokens. At a702 T1301 the capped block is 15,965 chars and 6,101 tokens, down from 21,124. That would have brought the failing request to about 51,650 tokens. Below about 13,000 chars, T700's anchor and nearby episodes alone would not fit.

`just lint` clean (the worktree venv links the main checkout's mGBA binding for mypy).

**OFF:** byte-identical to today. **ON with nothing left out:** also byte-identical (no extra line).

## Story checkpoints (the operator 8:19 AM NY: "we can have deterministic game checkpoints that can mark things as done")

`story-checkpoints.ts` holds 16 checkpoints, from the move-in through the DEVON GOODS delivery in Slateport. Each lists the milestones it closes after (existing readers in milestones.ts or story-progress.ts, backed by a pret flag or var), and its scope as pret map + speakers: an OBJ_EVENT_GFX_ sprite on that map, a "NAME:" prefix from the scene's scripts, or null narration. An episode counts as proven done when every listed milestone has been recorded, the episode was heard at or before the latest of them (by turn), and every page is in that checkpoint's scope. No a702 text is used.

**Coverage ends at DEVON_GOODS_DELIVERED (Slateport museum).** No checkpoint yet for the Route 110 rival, Mauville or anything later, or for incidental chatter, which falls to nearby, named or recency.

- [x] `story-checkpoints.test.ts`: milestones exist in the harness readers; against pret 731ad5bfd (POKEEMERALD_DIR or ~/dev/pokeemerald, skipped when absent), each map id matches map_groups.json, each speaker is a sprite in that map.json or a `NAME:` prefix in the scene's scripts, each flag number matches flags.h and each FLAG_/VAR_ name exists. 2/2.
- [x] RED: checkpoint behaviour tests in `instruction-memory-cap.test.ts` (closes after the flag, not before; only episodes heard by then; any out-of-scope page keeps it; multi-milestone checkpoints need all).
- [ ] GREEN, prototype updated to match, a702 T1301 replay showing the POKéNAV tutorial and Devon goods episodes retire, report updated.

## Milestone M1: switch + rule A′

- [x] RED: `instruction-memory-cap.test.ts` (each step, budget fill, omission line, stale anchor, OFF and no-drop identity) and a factory test through `observedInstructions`. Fails: the module and switch do not exist yet.
- [x] GREEN: `instruction-memory-cap.ts` plus wiring in `observed-instructions.ts`; `pret-map-sections.ts` (189 names from pret). instruction-memory-cap 10/10 (481741962 went in with a timestamp flake in the factory test: it compared whole messages, including `Date.now()`. The next commit compares records and contents instead; 6/6 reruns pass); agent focused suites 85 passed; viewer panels, server and next-run 394 passed.
- [x] Registry: SWITCHABLE_FEATURES last, FEATURES entry (guard/correctness category, `needs: "milestone-instruction-memory-v1"`, Off copy), `...when()` last. Presets: FeatureSetSchema optional, normalizeFeatures, flagFeatures and DEFAULT_NEXT_RUN false. current.json untouched.
- [x] Wiring removal check: with the switch argument removed from `observedInstructions`, the factory test failed (1 failed, 9 passed); restored, 10/10.
- [x] Replay (`runs/analysis/bounded-input-20261028/replay-cap.mjs`): switch off equals the recorded block, switch on equals `rule_a2.py`'s AFTER byte for byte. a702 T700 15,956 and T1301 15,965 chars; 88ea T400 15,774 and T800 15,962.
- [x] Explainer `docs/explainers/instruction-memory-cap-v1.html` (themed, pages-check clean, headless 1280 and 375 with no overflow), README, FEATURE_EXPLAINERS, panels/server link tests.
- [ ] Gates: `just lint`, full `just test` (coordinator granted the CPU window in the 2026-10-28 brief).
- [ ] Review: personas (harness engineer, data scientist, ML engineer, evaluation integrity) across the Claude CLI, Codex CLI and fallback lanes.
- [ ] Stop: report to the coordinator. No landing.
