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

**OFF:** byte-identical to today. **ON with nothing left out:** also byte-identical (no extra line).

## Milestone M1: switch + rule A′

- [x] RED: `instruction-memory-cap.test.ts` (each step, budget fill, omission line, stale anchor, OFF and no-drop identity) and a factory test through `observedInstructions`. Fails: the module and switch do not exist yet.
- [ ] GREEN: `instruction-memory-cap.ts` plus wiring in `observed-instructions.ts`.
- [ ] Registry: SWITCHABLE_FEATURES last, FEATURES entry (guard/correctness category, `needs: "milestone-instruction-memory-v1"`, Off copy), `...when()` last. Presets: FeatureSetSchema optional, normalizeFeatures, flagFeatures and DEFAULT_NEXT_RUN false. current.json untouched.
- [ ] Wiring removal check.
- [ ] Replay: a702 T1301 through the built code equals `runs/analysis/bounded-input-20261028/rule_a2.py`'s AFTER byte for byte; same for T700.
- [ ] Explainer + FEATURE_EXPLAINERS.
- [ ] Gates: `just lint`, full `just test` (coordinator granted the CPU window in the 2026-10-28 brief).
- [ ] Review: personas (harness engineer, data scientist, ML engineer, evaluation integrity) across the Claude CLI, Codex CLI and fallback lanes.
- [ ] Stop: report to the coordinator. No landing.
