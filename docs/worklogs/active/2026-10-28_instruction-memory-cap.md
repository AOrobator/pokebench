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

`story-checkpoints.ts` holds 15 checkpoints (16 at first; dad-sends-to-dewford was removed in review round 1), from the move-in through the DEVON GOODS delivery in Slateport. Each lists the milestones it closes after (existing readers in milestones.ts or story-progress.ts, backed by a pret flag or var), and its scope as pret map + speakers: an OBJ_EVENT_GFX_ sprite on that map, a "NAME:" prefix from the scene's scripts, or null narration. An episode counts as proven done when every listed milestone has been recorded, the episode was heard at or before the latest of them (by turn), and every page is in that checkpoint's scope. No a702 text is used.

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

## Synced to main 56a54f7ab; replays in both arms (reference `rule_a2.py` updated to the round-1 rules)

Every row is byte-identical between the built code and the reference. With the cap off, each control row also equals the recorded block.

| Arm | Turn | Before chars | After chars | Kept / episodes |
|---|---|---|---|---|
| control (dedup off) | a702 T450 (after WALLY, before STONE) | 16,640 | 10,585 | 14 / 25 |
| control | a702 T700 | 28,857 | 15,475 | 17 / 46 |
| control | a702 T1301 | 53,962 | 15,965 | 22 / 112 |
| control | 88ea T400 | 19,718 | 15,785 | 22 / 34 |
| control | 88ea T800 | 25,182 | 15,866 | 25 / 49 |
| bundle (dedup on) | a702 T450 | 18,881 | 12,061 | 14 / 25 |
| bundle | a702 T700 | 33,116 | 15,856 | 15 / 46 |
| bundle | a702 T1301 | 60,336 | 15,868 | 23 / 112 |

At T450, DAD's T312 advice is kept (it is the anchor) and WALLY's T311 is kept as a named target. At T1301, MR. STONE's T630 and MR. BRINEY's LETTER lines are kept. DAD's T312 is no longer marked done; it is left out under the budget only as a recency episode. Tests now cover dedup on/off × cap on/off: 18 cap tests, plus 48 across dedup and observed-instructions.

## Activation (the operator 9:08 AM NY, relayed: "yes cap on in both arms, its corrrectness")

- `experiments/feature-configs/current.json`: instruction-memory-cap-v1 added to `onInBoth` and set true in `features`. instruction-memory-yaml-v1 stays off and is not part of this approval.
- `just fixed-run check` definition sha256 is unchanged for the four `featureRecipe: "current"` definitions (bundle-v-control-2h e19bbcdf…, bundle-v-control e4db35e3…, glm53-flash-4h da141d94…, hyperqwen-control-3h b4800f6e…). The feature recipe file's sha256 changes (see the next line), so each of these launches needs the operator's `just fixed-run approve` against the new recipe.
- current.json sha256 c957d950b1e869f7… → 27d3b4d02db0546c…

## Full gate on e483e1a73 (CPU grant 9:08 AM NY): PASS

`just lint` ok. `just test`: agent 4,764, viewer 2,208, env 4,466, gateway 116, coverage ≥90. trainer-card-check first failed 3/3 with "Approved font/art did not load": the worktree has no gitignored runs/sprites. Re-run with POKEBENCH_CARD_ART set to the main checkout's art: 3/3.

## Review round 2 (frozen e483e1a73): Codex BLOCKING, Claude subagent BLOCKING (CLI login still expired), fallback pending

Accepted and fixed (tests and fix in one commit this round):
- Proven-done anchor was kept (Codex). Done is now checked before the anchor.
- observed_locations had no bound (Codex). Under the cap it keeps the newest 20 whole entries and adds `earlier_locations_left_out: N`, in both the older form and dedup's payload.
- Rusturf Tunnel scope (Claude). pret RusturfTunnel/scripts.inc plays BRINEY's ThankYouLetsGoHomePeeko ("find me in my cottage") before `setflag FLAG_RECOVERED_DEVON_GOODS`, so devon-goods-recovery closed an open pointer. Rusturf moved to briney-voyages (closes after both deliveries); devon-goods-recovery keeps Rustboro and Route 116 with `set_on: RusturfTunnel`.
- The registry test now pins absolute indexes (292 dedup, 293 cap). The description says 15 checkpoints and a test pins the count against `STORY_CHECKPOINTS`.
- The pret audit test caches reads (one read per unique file, asserted). It also checks that each checkpoint's flag or var is set by a script on its scope maps or its `set_on` maps.

Rebutted: "prove every line in every scope is finished" (Codex). That is an unbounded semantic audit. The structural audit now links flag setters to scenes, and the found cases (Wally/DAD, Rusturf/BRINEY, Briney/Stern) are pinned by tests. No run can prove the absence of every such case; it stays a review responsibility each round.

Replays after the fixes, all byte-identical to the reference. Control: a702 T450 10,585, T700 15,716 (T621 Rusturf kept), T1301 15,884; 88ea T400 15,785, T800 15,866. Bundle: T450 12,061, T700 15,940, T1301 15,868. Focused: 109 agent tests.

## Full gate on 13784940b (CPU grant, 9:24–9:28 AM NY): PASS

lint ok. Agent 4,767, viewer 2,208, env 4,466, gateway 116, trainer-card 3/3 (POKEBENCH_CARD_ART set to the main checkout's art).

## Review round 3 (frozen 13784940b): fallback LGTM, Claude BLOCKING, Codex BLOCKING; all correctness, all fixed (tests and fix in one commit)

- rival-first-meeting listed MOM (Claude). pret players_house.inc keeps MOM's "Did you introduce yourself to PROF. BIRCH?" until FLAG_RESCUED_BIRCH, and the repo's own tv-birch-introduction template needs BIRCH_STARTER_HANDOFF_COMPLETE. MOM is removed; mom-home-instructions still covers her and closes later.
- Gym reward pages (Codex). a702 T578 holds the STONE BADGE receipt plus ROXANNE's CUT and TM39 explanation. Gym scopes now cover only the leader's own lines (no null), and the faced-trainer rule skips gym leaders (their lines close only through the badge checkpoints). T578 is now kept; T401 (intro) still closes at STONE_BADGE.
- Fixed part over the cap (Codex). observed_locations now keeps the newest whole entries whose JSON fits 2,000 characters, plus the count. Tested with twenty 1,000-character locations. The rest of the fixed part is the header, the left-out line and `current` (one Location and the Story checklist).
- Equal-turn ties (Codex) now break on result event, newest first.
- Copy (both lanes). The feature card no longer says steps 1 and 3 always stay. The explainer's step labels, header example and status match the code and current.json.

Replays, all byte-identical. Control: a702 T450 10,585, T700 15,977, T1301 15,964; 88ea T400 15,785, T800 15,942. Bundle: T450 12,061, T700 15,944, T1301 15,916. Control-arm older form (replay-legacy.mjs): a702 T450/T700/T1301 15,722/15,764/15,824; d41e T4663/T7229 15,481/15,997, all under 16,000. Focused: 112 agent tests.

Non-blocking items recorded for follow-up (fallback lane): precompile the cap's RegExps (per-turn constant); ledger_context retention/evidence still list episodes the cap left out; the older form's "are retained" clause; DAD's long-horizon advice can lose to newer chatter on budget late in a run (watch in the A/B).

## Full gate on ba17cc740 (CPU grant 9:39 AM NY): PASS

9:42–9:46. Lint ok. Agent 4,770, viewer 2,208, env 4,466, gateway 116, trainer-card 3/3.

## Review round 4 (frozen ba17cc740): fallback LGTM, Claude LGTM, Codex BLOCKING. Delta fixes:

- Fill cost (Codex): every candidate render re-serialized the visited list (O(E×V)). The fixed part (current + locations) is now computed once per request (`fixed()`) and passed into the renderers.
- Oversized current (Codex): under the cap, `current` is left out whole with `current_left_out: true` if its JSON passes 4,000 characters (test: a 20,000-char Location in all three forms, at most 16,000).
- Omission wording (Codex): "N other episodes are left out…", because rank and nearness decide, not age.
- Header wording (Claude): "Finished episodes, and less relevant ones over the size cap, are left out." It is true when only finished episodes were dropped.
- Post-battle advice (Claude, latent): the faced-trainer rule now retires only lines heard while the trainer was unbeaten, using the page's own recorded state. Post-battle advice (e.g. the Petalburg Gym room directions) stays.
- Explainer numbers and the byte-for-byte caption refreshed (fallback).

Replays, byte-identical to the reference. Control: a702 T450 10,589, T700 15,981, T1301 15,965; 88ea T400 15,789, T800 15,999. Bundle: 12,065 / 15,948 / 15,977. Older form: a702 15,768 / 15,828; d41e T4663 15,485, T7229 14,828. Focused: 114 agent tests. The coordinator ordered a delta review (Codex and Claude on the fix diff), then a gate.
