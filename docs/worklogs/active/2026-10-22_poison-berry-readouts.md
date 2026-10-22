# Poison and berry readouts

User approved implementation on 2026-10-22: separate feature switches, game-grounded wording, current run untouched.

## Scope
One milestone: two independent default-OFF readouts, registry/preset/server wiring, tests, local explainers and pending experiment definitions. No actions, routes, healing automation, run restart or measured launch. Active GLM run 557c is read-only evidence only. Work in codex/poison-berry-readouts.

- poison-readout-v1: make PSN explicitly poisoned independently of status-names-v1; when a living player-owned Pokémon is poisoned on the field, faithfully quote the walking/HP/fainting sentence from PetalburgCity_Mart_Text_TakeSomeAntidotesWithYou, without introducing ANTIDOTES or other unobserved remedies.
- berry-readout-v1: for visible, loaded trees only, match the existing coherent tree resource snapshot to its native object tree id; distinguish ripe/growing without revealing type or yield before examining. The game still owns the harvest prompt. For medicinal berries already in the BAG, quote their item descriptions.
- OFF leaves previous text and state JSON unchanged. No tool, navigation or timeline changes.

## Grounding
pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881 (clean); US Emerald f3ae088181bf583e55daf962a92bb46f4f1d07b7. field_poison.c / field_control_avatar.c, party_menu.c GetAilmentFromStatus; data/maps/PetalburgCity_Mart/scripts.inc; data/scripts/berry_tree.inc; event_object_movement.c SetBerryTreeGraphics; resource reader's verified object +0x1D and tree table.

## Checks
- [x] RED test commit `f6a10ef9b` (missing production module)
- [x] GREEN implementation and exact OFF tests
- [x] Production wiring removed/restored, regression goes RED: berry factory argument and poison readout gate each deleted independently, intended test failed, both restored; 9 focused tests pass.
- [x] Archived native RAM replay, no active session inputs: raw 6781 / frame 1048077, SHA256 402c48b9...7940; state seq 26833 / result 26834, committed provenance and paired PNG. 10523-character OFF text byte-identical to unchanged main; all four combinations retain identical state JSON; 10 berry descriptions match exact ROM.
- [x] Build and full coverage: agent 4438 tests (99.23% lines / 93.30% branches / 97.98% functions), viewer 1669 tests before two explicit link tests (97.95% lines / 91.33% branches / 94.35% functions), Python 3898 tests (97.39% lines / 93.41% branches / 100% functions). Final lint and explicit card/route tests pass.
- [x] Explainers and pending experiment/readiness entries: separate independent switches default OFF; experiments unqueued and unapproved, RUSTBORO_CITY primary milestone. No measured benefit claim.
- [ ] Independent cloud review; report gate status accurately

## Session log
- Isolated worktree created from main; no current-run changes.

- Shared setup: worktree dependency install, existing native mGBA binding copied into isolated venv. Vendor root pinned bbab97ad; recursive initialization hit pre-existing missing pokered URL, required Emerald maps are present. No vendor source changed. First full Python check lacked POKEBENCH_ROM; corrected to the user's existing ROM path, all 3898 pass. Registry suffix/count and frozen historical-off fixtures updated for appended switches; no skips or lowered gates.
- Production scope: poison_berry_readout.py, game_state.py, rerender.py, readout.py plus existing registry/preset/viewer explainer mapping. No tools, prompt, navigation, action, benchmark control or timeline changes.

## Frozen review boundary
User outcome: two independent switches for poison and berry readouts, grounded in game-visible facts, current run untouched. Only text observations change. Native RAM decoding reuses the existing resource tree state and verified loaded-object tree id. No new tools, routes, harvesting/healing actions, memory writes, saved-state reloads, gameplay launches, timeline surfaces or controls. Registry/preset defaults, static explainers and their existing card links, pending definitions and historical registry expectations are in scope. Runtime owners are the existing coherent game-state reader and readout formatter. Review suggestions adding other gameplay or infrastructure are out of scope.

## Principles adherence (PB1–PB13)
| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | HP/status/growth come from coherent native state; no model claim used as game evidence. |
| PB2 | N/A | No gameplay run launched, stopped or regraded. |
| PB3 | PASS | Correctness proof only; no gameplay-benefit claim. Both experiments remain pending. |
| PB4 | PASS | Two declared independent default-OFF switches, server metadata, exact OFF replay, no game writes. |
| PB5 | PASS | Each pending definition flips exactly one switch; all other registry flags explicit. |
| PB6 | N/A | No context retention, compaction or long-run scheduling changes. Added lines are bounded by 16 loaded objects and BAG capacity. |
| PB7 | PASS | Source events/RAM/paired image preserved; no rewritten historical observations. Offline replay is labelled offline. |
| PB8 | N/A | No retry, loop, model-error, stop or action boundary changed. |
| PB9 | PASS | User explicitly approved this bounded implementation; no additional autonomous action. |
| PB10 | PASS | No skips, exclusions, threshold reduction or hook bypass. Historical suffix assertions updated for append-only registry. |
| PB11 | PASS | Exact US ROM and clean source revision verified; native replay and ten ROM item descriptions checked. Vendor verified pristine. |
| PB12 | PASS | ROM read only via existing ~/.roms path and resolver; no ROM copied or tracked. |
| PB13 | PASS | RED committed; GREEN, gates, adversarial deletion, native replay and browser card checks recorded. Review/landing claims stay gated. |

## Test-quality checks
1. Production rerender.read_state → game_state → formatter exercised with raw RAM and exact observation text; TS serverFeatureEnv independently tested.
2. Berry factory operand and poison formatter operand deleted separately: each intended assertion failed; both restored, focused tests GREEN.
3. No process-global mutations in new tests; immutable fixtures and per-test memory.
4. New tests use explicit switch IDs and exact sets/output; no shared identity selection.
5. No concurrency behavior changed; no flake suppression.
6. No sleeps, retries, skips or serial test configuration added.
7. Assertions inspect actual text, exact fixture SHA and exact independently toggled states.
8. Native fixture work bounded: one archive read, four configurations, ten ROM item descriptions. Synthetic reader bounded to sixteen native object slots. No growing aggregate or repeated filesystem transaction loop.
9. No production-cap saturation tests; tiny object/party/BAG fixtures cover refusal/visibility paths.

## Browser proof
- Direct server factory on scratch runs only, with no game queue or experiment autorunner. New port allocated automatically after 8795 was occupied; the existing listener was left alone.
- Harness Config search → poison card → READ EXPLAINER → correct heading/text; same path for berry card. Historical settings remain NOT RECORDED. Each tracked document served byte for byte in server tests.
- Both explainers opened and screenshots inspected at actual 610px browser width. Browser viewport override did not change existing tabs (DOM still reported width 610), so screenshots named for requested 1280/1440/375 widths do NOT prove those widths. That initial override attempt did not establish responsive widths; override reset. Later DOM-verified iframe proofs below resolve the gap. No existing viewer restart.

## Gate notes
- experiments-check reads existing shared ledgers and reports malformed starter-decision-salience trials.jsonl rows 1–150; no ledger was edited. New definitions parse and flip only their own switch. This is not queue/launch approval.
- Final lint caught accidental duplicated test_game_state.py code from a registry-edit script. Restored that unrelated file byte for byte from HEAD; no production behavior was affected. Re-running lint and Python coverage after correction.

- Final lint passes (both TypeScript packages, ruff check/format, mypy 114 source files). Viewer coverage rerun after explicit card/route tests: 1671 tests, same coverage floors passed. Build passes; pages-check clean; both local page URLs return 200.

- GREEN commit: `ca12beec0`. Pending definitions use the schema-required main checkout and pin the verified implementation commit (main must contain it before any launch); they remain unqueued/unapproved and will need the landing pin if merged. Final corrected Python coverage: 3898 passed, 97.39% lines / 93.41% branches / 100% functions.

## Review round 1 synthesis
Frozen base a637f683c024f60e00455f68961ddec369602e6a, head 5095262feceb2d0e25cfdf1275db6ac286f1cbdb; diff SHA256 a66f5f9e23620a41771f4565ce5549843e5a642aaf52e5f1d44d958166847919.
- Claude CLI: VERDICT: LGTM. Source/status/wiring/OFF checks confirmed. Noted off-screen semantics as optional, a duplicated test assignment and a misplaced field comment.
- Independent GPT (gpt-6-astra, poison_berry_review): VERDICT: BLOCKING. Native ObjectEvent.offScreen (+1 bit 0x40) was not excluded. Reproducer flips that bit on a loaded ripe tree and production read_state→format_readout still reveals it.
- Adjudication: off-screen visibility is an in-contract defect, single-reviewer blocker with deterministic reproduction; the frozen scope explicitly says visible trees. Accepted minimal mask fix and regression. Not changing the contract to describe off-screen trees. No production domain/owner expansion.
- Optional duplicate test assignment and adjacent field comment cleaned in the same batch. BAG-none hardening and existing resource-table all-or-nothing validation deferred: neither asserts absence or creates a regression.
- Test-quality dimensions 1–9 remain as above, with dimension 2/7 gap caught by the missing offScreen operand. New helper-level offScreen regression goes RED on the frozen implementation, log /tmp/poison-berry-offscreen-red.log; will repeat full Python checks after fix.
- Grok primary CLI returned ActionRequiredError: out of usage, increase limits or switch to Auto. Retrying the listed Grok fast harness; no local model substitution and no self-merge without required cloud lanes.
- Responsive proof resolved without changing product code: self-authored same-origin QA iframe viewports, html.clientWidth verified at 1280, 1440 and 375, native screenshot clips saved/opened for both pages. Screenshots: main runs/mockups/poison-berry-readouts/{poison,berry}-{1280,1440,375}-frame.png. Earlier screenshots without -frame retain the failed override attempt and are not proof of width.

- Off-screen RED commit `0d455939b`. GREEN correction is a single visibility mask: 0x20 → 0x60, matching ObjectEvent.invisible and offScreen. Regression flips only offScreen, keeping all other fixture data and the production reader/formatter seam. The paired native GLM fixture's two actual berry objects have flags 0x10, so its example remains valid.
- Grok fast retry also returned the same out-of-usage ActionRequiredError. Both discovered Grok options exhausted. The repository explicitly requires operator approval before self-merging with a missing cloud lane; fallback reviews may be prepared read-only, but cannot silently waive that main-landing rule.

- Explainer diagram now has an explicit horizontal scroll container and 600px minimum width, keeping labels readable on phones. No model readout behavior changes.

- Round-2 full coverage passed: agent 4438, viewer 1671, Python 3898 tests; coverage unchanged at the prior passing floors. Native archive, four switch combinations and original OFF digest all pass with the offScreen mask.

- Correction GREEN commit `2bd5ce8b9`; both pending definitions repinned to it. Corrected packet retains original frozen scope and all PB1–PB13 scores with zero FAIL; accepted blocker now covered by the exact offScreen helper test and separate production-seam receipts. Responsive QA repeated after diagram change at all three verified widths.

## Review round 2 synthesis and completion receipt
Frozen head `9243dcb9829cf1b98337675748d35108279029e3`, base `a637f683c024f60e00455f68961ddec369602e6a`, diff SHA256 `00d1630c5b2202de001764bf0e43a39d99f4a28d7e1efc20d7687267ffa8ec57`.
- Claude CLI: VERDICT: LGTM, zero stderr; confirmed corrected visibility, native fixture, descriptors, exact OFF path, flags, source and tests.
- Original independent GPT reviewer, gpt-6-astra (`/root/poison_berry_review`): VERDICT: LGTM; independently checked production read_state→format_readout with visible/invisible/offScreen/combined flags; 9 Python and 5 TypeScript tests passed.
- Prepared Grok fallback, fresh gpt-6.1-sol (`/root/poison_berry_fallback_sol`): VERDICT: LGTM; packet digest verified; 9 Python tests independently passed. Reduced vendor diversity explicitly reported.
- Prepared Grok fallback, fresh gpt-6-astra (`/root/poison_berry_fallback_astra`): VERDICT: LGTM; 9 Python and 5 TypeScript tests passed; independently reproduced production visible/invisible/offScreen behavior.
- Evidence wording correction: committed offScreen regression is in the visibility helper matrix. Production integration is separately checked by the existing factory test, both Astra reviewers and a root-run four-case receipt at runs/poison-berry-proof/offscreen-production-seam.txt. Do not describe the helper assertion itself as the production-seam check.
- Accepted blocker closed with 0x60 mask and exact offScreen regression. No further in-contract, security, principles or evidence blockers. Optional BAG-none reporting and coarse resource-table failures remain out-of-scope follow-ups. No production-path growth from review; only the original visibility operand, adjacent comment/test cleanup, and explainer diagram legibility changed.
- PB1–PB13 remain PASS/N/A with zero FAIL; all nine test-quality checks re-evaluated. No flakes suppressed, gates weakened, global mutations, or growing-fixture work introduced.
- Final gates: 4438 agent + 1671 viewer + 3898 Python = 10007 tests. Coverage: agent lines99.23/branches93.30/functions97.98%; viewer97.95/91.33/94.35%; Python97.39/93.41/100%. Lint, build and pristine vendor checks pass. Native OFF digest, four independent combinations, exact ten ROM berry descriptions, cards/allowlisted serving and responsive iframe screenshots verified.
- Isolated scratch viewer stopped after browser proof. Main viewer and all original game processes/run files were left alone. Main remains `a637f683c`; branch implementation is committed. No measured cohort, approval, queue position or main merge.
- Remaining landing blocker: both Grok cloud options unavailable due account usage. CLAUDE.md line83 explicitly requires operator decision before self-merge with a missing cloud lane. Prepared fallback reviews do not waive it. Ask operator to accept Claude + independent Sol/Astra reviews for this frozen packet before joining the landing board.
- Global experiments-check still reports existing malformed starter-decision-salience trial rows. New entries independently parse, share an explicit incumbent and flip one switch each; no shared ledger touched.

## Operator landing and bundle amendment — 2026-10-22
Operator: "yeah land it, make sure the changes go in the bundle". This approves landing with the completed fallback reviews despite the unavailable Grok lane. Existing no-current-run-change constraint persists. Add both flags to current reusable bundle recipes: bundle-v-control, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, bundle-v-control-2h, glm53-flash-4h. Preserve global/default/control OFF, append switch lists, and verify normalized armPreset output for every phase plus pinned control-base invariance. Older versioned/historical recipes and every active run stay unchanged. Both pending single-switch definitions use the resulting bundle feature map with only their tested flag OFF in incumbent.
- Joined landing board as number3 with verified chat ID 00000000-0000-4000-8000-064280bd618b. Coordinator informed. Main remains a637f683c; owned-branch work continues without moving main.
- Added six real-definition/arm-normalization regression tests before changing configuration.

- Bundle RED: six effective-arm tests failed on the original definitions as intended. Added base=false and appended both IDs to the switches list of each of the six named recipes; no plan, start state, limits, lanes, control-base pins or approvals changed.

- Bundle amendment GREEN: all six recipes pass normalized arm tests (bundle ON/control OFF), pinned control-base comparisons, and exported CLI check with worktree root and read-only canonical start-save hashing. The normal CLI auto-selects canonical main, so its earlier output was not treated as branch validation. Receipt: runs/poison-berry-review/bundle/fixed-checks.txt.
- Full TypeScript suite: 4438 agent + 1677 viewer tests pass. Full lint and build pass; explainer pages-check clean. Python implementation unchanged from reviewed 3898-test/coverage pass. Historical experiments and run settings remain unchanged. Existing historical comparison tests explicitly exclude the two newly added switches while retaining all prior expectations.
- Bundle amendment principles: PB1 PASS native facts only; PB2/PB3 N/A no measured runs or benefit claims; PB4 PASS independent registered default-OFF switches, declared bundle arm; PB5 PASS independent pending ablations remain unqueued; PB6 N/A no context lifecycle change; PB7 PASS existing recording path; PB8 N/A no model retries/actions; PB9 PASS explicit operator amendment; PB10 PASS RED then GREEN and unchanged coverage gates; PB11 PASS same pinned parser and normalizer; PB12 PASS no ROM path change; PB13 PASS final frozen review pending.
- Bundle test-quality 1–9: real recipe→armPreset→parsePlayPreset→presetFeatures caller seam; six absent-switch RED failures before config edit; no globals or shared mutable fixtures; exact feature values per recipe/phase; no concurrency or suppression; value-bearing matcher failures; six bounded recipes with two file reads each and bounded phase loops, no growing aggregate; no production-cap fixture. Earlier native visibility and wiring adversarial evidence remains applicable.

## Landing-slot reconciliation — 2026-10-22
Operator renewed instruction: check turn, finish landing, both in bundle, leave current run alone. Received exact board turn notification. Sync main d14390a48 (move-learn-early-comparison-v1) into branch; preserve its production logic, insert its registry entries before the two newly appended readouts, combine default-OFF sets and presets, adjust additive suffix/count expectations and historical OFF fixtures. Both readouts remain last and default OFF; five already-expanded reusable bundles retain early-comparison ON alongside the two new switches, GLM recipe preserves its existing early-comparison setting. Pending readout incumbents align the newly normalized canonical bundle with early-comparison ON. No run modifications or launch.
All PB1–PB13 scores and nine test-quality dimensions from the frozen packet rechecked: unchanged runtime owners and native readout logic, additive existing registry integration only. No new concurrency/globals/fixtures/caps; existing seam/deletion evidence remains valid, normalized six-recipe tests cover integration. Full gates and final reconciliation review required before main moves. Initial overlapping early-comparison last-position assertions go RED as expected; changed to -3 preserving append order, with both new switches last.

## Landed receipt — 2026-10-22
- Main fast-forwarded from d14390a486554ae5657b0d1de054cd0acb2aa4b0 to frozen reviewed 7a85828b02002c6c44ae8c11d57e8f8a8e03e851 while board number1. Final diffSHA2562ff7bd1253a3360e8f7ea5f61f360fd05d6de918e9ee8ba7426d2f75171b9146. Claude CLI exit0/zero stderr VERDICT: LGTM; independent Sol and Astra VERDICT: LGTM. Operator explicitly approved missing-Grok fallback. Reduced vendor diversity, no skipped gate. Optional literal-arrow serialization note is semantically unchanged; no blockers or review-driven runtime growth.
- Reconciled gates:4445agent+1677viewer+3956Python=10078tests. Coverage agent99.23lines/93.30branches/97.98functions, viewer97.95/91.34/94.35, Python97.39/93.43/100%; unchanged90floor. Full lint/build/vendor/pages pass. Initial sync and initial main tests read stale package dist; rebuilding then full runs pass without source/test suppression. Missing-ROM invocation earlier was repaired using configured ~/.roms path, all3956Python tests pass. Final just test on main passes after build.
- Both flags independently default OFF. Six current recipes verified through armPreset→parsePlayPreset→presetFeatures for every phase: bundle-v-control, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h, bundle-v-control-2h, glm53-flash-4h; both ON in bundle, OFF in control. Pinned control-base and real start-save hashes pass. Pending single-switch experiments remain unqueued/unapproved; no launch or gameplay-benefit claim.
- Coordinated viewer-only refresh: viewer-main built clean7a85828b0 and reported all3live gameplay processes preserved. Its background child failed to survive shell cleanup; restarted same viewer CLI detached with start_new_session=True, persistent listener8912 on8790, HTTP200. Buildstamp clean reviewedSHA, both served explainers byte-identical to landed main. Real browser HarnessConfig search→each card→ReadExplainer opened correct page, both BundleON badges visible. Existing GLM correctly says NOT RECORDED for new flags. Browser console errors/warnings empty.
- Current GLM run2026-10-22T08-36-44_glm53-mac_d51d left on originala637f683c runtime; same run_start SHA2564f774ec740ce8058c4c41dffe3ae579b728416ba639c74c5ebd33af28ea9e225. All9captured game/runner PID+commands preserved, including GLM launcher33873 and server33876. Browser RUNNING advancedT175→178. No run controls, game inputs, restarts, settings edits, or model requests issued.
- Durable local receipts: runs/poison-berry-review-landing/{packet.json,patch.diff,claude.txt,claude.stderr,sol.txt,astra.txt,synthesis.md}; runs/poison-berry-proof-landing/{normalized-arms.json,fixed-checks.txt,processes-before.json,post-restart.json,current-run-start-before.json}. Main test log/tmp/poison-berry-main-test2.log; coverage/tmp/poison-berry-sync-coverage2.log.
