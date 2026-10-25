# Milestone prerequisites

User authorization: "ok lets do the prereq fix and land it on main after review" (2026-10-25, this chat).

## Contract

One bounded correction: add declarative, all-of story prerequisites to the shared progress catalog and apply the first source-verified dependency to `SLATEPORT_HARBOR`: `MAGMA_HIDEOUT_STORY_COMPLETE`. A harbor visit without the persistent completion predicate cannot receive late-game credit. Resolve prerequisites from the same native snapshot, rather than requiring earlier milestone rows, so checkpoint baselines and sparse historical recordings remain supported. Missing evidence stays unknown. Keep catalog order, card design, optional trainer handling and original recordings unchanged.

Production paths: agent `story-progress.ts`, `campaign-catalog.ts`; viewer `model.ts` for historical replay compatibility if required. Shared evaluator already owns recorder and native qualification; browser imports the same implementation. Measurement correction, no new model tools/readouts or input policy. Existing campaign clock consumes corrected earned measurements; no arm/config changes or new runs.

Reference: clean pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. `MagmaHideout_4F_EventScript_Maxie` sets `VAR_SLATEPORT_CITY_STATE=1`, `FLAG_GROUDON_AWAKENED_MAGMA_HIDEOUT` (0x6f), and `VAR_SLATEPORT_HARBOR_STATE=1` together after its closing dialogue. `SlateportCity_EventScript_CaptStern` then brings the player into the harbor for the submarine scene. Existing US-ROM reader already captures this flag; no RAM-address changes.

Non-goals: percentage redesign, compulsory route ordering, gating all milestones on all preceding rows, new milestone names, trainer-card redesign, retroactive writes to logs, gameplay launches/restarts.

## Verification and delivery

- [x] RED: prerequisite failure, unknown evidence, valid unlocked visit, deduplication, resumed origin, native qualification, historical recovery and card frontier through real loader.
- [x] GREEN: shared evaluator, catalog dependency, historical replay qualification; adversarial removal proof.
- [x] Gates: test, lint, build, coverage >=90%, verify-vendor, trainer-card-check.
- [x] Read-only real recording before/after and isolated background browser evidence.
- [ ] Principles self-review and frozen Claude/Grok/GPT review; landing board; fast-forward main; tests and live viewer proof.

## Session log

- Read repo/global instructions, current worklog, story-milestones, game-state, execute-worklog, talk-to-claude, viewer-e2e, close-the-loop and multi-model-review skills. Work isolated from canonical main.

- RED: new agent prerequisite tests fail in four expected cases (early visit, premature once-only emission, unknown resumed baseline, native qualification). Initial broad test command also exposed unbuilt workspace exports; built dependencies before viewer tests.

- RED commit `196eb7ace`. GREEN: shared all-of predicate list, harbor dependency, replay rejection of old premature rows, narrowly scoped historical semantic recovery and native-receipt supersession. No new production module or configuration owner.
- Gates on restored candidate: `just test` 4395 agent + 1951 viewer + 4159 Python tests; approved-card protection tests and all three exact screenshot baselines passed. `just lint`, `just build`, `just coverage`, `just verify-vendor` passed. Coverage lines/branches/functions: agent 99.17/92.74/97.61%; viewer 98.20/91.80/95.37%; Python 97.40/93.43/100%. All >=90%.
- Setup failures were corrected before counting gates: initial tests ran before workspace exports were built; replacing a shared virtualenv link during an in-flight Python test invalidated its spawned pytest path. Restored canonical editable install, gave this worktree its own environment and native binding, and reran the complete test gate cleanly. An incorrectly rooted standalone pytest command collected vendor tests; that result is discarded. No retries or weakened tests added.
- Performed mutation checks, each failed and was restored: remove false prerequisite rejection; remove unknown prerequisite rejection; remove replay receipt guard; remove modern semantic recovery exception; remove native-receipt supersession. Receipts `/tmp/milestone-prereq-mutation-*.log`. Final complete tests and coverage use restored code.
- Read-only real-data comparison: GLM `6bbd` 93->92 qualified entries, catalog position 143->80, furthest Slateport Harbor->Route 110; only SLATEPORT_HARBOR removed. Human `1848` unchanged 48 entries/49 position; Qwen `9e33` unchanged 67/49; Qwen `d41e` unchanged 98/74. Original logs untouched; full table `/tmp/milestone-prereq-real-data.json`. Catalogue positions are still not percent completion.
- Real offending receipt: GLM milestone #88044 at turn 514, evidence state #88043, map [9,9], Stone Badge only, native 0x6f false; raw RAM sequence 14775 SHA256 `8ee7bed932b08fb53849ee6c2f3b26e965308a739c7805232c0841683e6b4716`. Source predicate uses the existing verified reader, no new offsets. Event receipt `/tmp/milestone-prereq-harbor-evidence.json`.
- Background Chromium proof on isolated port 18825 with an immutable copied GLM log prefix: comparisons card shows Route 110 / 80 of 203, pointer click reaches exact 6bbd live game frame, return and keyboard Enter work at 1280 and 1440; two polling intervals retain corrected card. Phone 375 comparisons card also shows 80/203, opens exact run and displays live frames. Phone hides the desktop RUNNING chip; initial test incorrectly waited for its visible text, then verified the actual mobile live label and advancing native frame counter. No application page errors. Six screenshots under canonical runs/mockups/milestone-prerequisites/shots were opened with image tools; no focus taken. No changed controls, no added timeline marks. Existing card layout preserved.
- `just experiments-audit` canonical root passed with no audit output. Claude relay confirms no competing viewer restart/launch check; protected run/process identities must survive the single post-landing restart.

## Principles Adherence

Current repo CLAUDE.md explicitly selects PB1-PB13; the old draft header in the principles file is superseded by that rule. No principles file edited.

| ID | Score | Evidence |
|---|---|---|
| PB1 | PASS | Native 0x6f prerequisite plus own map; source script and recorded #88043 ground the rejection. |
| PB2 | PASS | No run hidden or discarded; only unqualified harbor credit removed; misses and original logs retained. |
| PB3 | N/A | Measurement correctness; no performance or model-ability improvement claimed, no new cohort. |
| PB4 | PASS | No new readout, tool, privileged reader or action; vendor clean. Existing native measurement corrected. |
| PB5 | PASS | Single harbor prerequisite defect; no arm/config changes or gameplay launch. |
| PB6 | N/A | Context/compaction unchanged; production long-log read exercised for historical grading. |
| PB7 | PASS | Original logs and raw RAM remain immutable; replay and strict loader tested. |
| PB8 | N/A | Tool validation, retries and action bounds unchanged. |
| PB9 | PASS | User explicitly approved prerequisite implementation and reviewed landing; source settles prerequisite. |
| PB10 | PASS | Complete gates and 90% coverage pass; no skips, excludes, baseline updates or bypasses. |
| PB11 | PASS | Existing reader/flag and clean source revision verified; no dependency API change. |
| PB12 | PASS | ROM remains external; no TCC path or ROM copy. |
| PB13 | PASS | RED/GREEN, complete gates, real data and browser proof recorded; independent review and landing tracked below. |

## Review boundary and terminator

All behavior maps to the user-approved prerequisite fix. Frozen production paths: shared progress evaluator/catalog and replay model only. Docs/tests demonstrate the exact change. Resolve prerequisites using persistent predicates in the same snapshot, preserve unknown and checkpoint semantics, block premature historical rows, and allow labeled later recovery for newly gated definitions. No redesign, new percentage policy, new owner or universal prerequisite chain. Test fixtures: at most four events per malformed receipt and five for migration; two isolated small on-disk logs exercise real reader/consumer. Static catalog integrity traversal uses the finite catalog, no filesystem/network/process work inside it. No shared global mutation, suppression or production-cap filling. Terminator: deterministic gates, source and real-data evidence, selected approved roster LGTM on identical packet (normal Claude/GPT and distinct fallbacks under the verified Grok outage exception), then serialized fast-forward landing and live proof. Any new owner/configuration surface is a separate follow-up.


## Round 1 review and bounded evidence repair

Frozen R1 `71ce64055`..`8cfbe3ebe`, digest7707e24fa2eee6d063036d2e8145dfd95286c1cf79bacbe1510c0f09858448d2. Claude CLI and distinct fallback Sol6.1/Astra6 each LGTM; normal GPT5.6Sol BLOCKING only on missing two-operand list and catalog-guard mutation evidence. Accepted as an in-contract evidence gap. No behavior bug found, no new production path/API/real dependency accepted. Added isolated Vitest module-catalog fixtures to exercise the real evaluator with flag+variable prerequisites in both orders (A only, B only, both, neither, later unknown, false plus unknown). Test-only definitions do not mutate shared catalog objects. Original source-owner set unchanged.

Grok unavailable: Cursor4.5 exit1 ActionRequiredError out of usage. Standing operator exception independently verified from server-copied verbatim user messages in original Claude project f7406a93 JSONL lines4145/4964/6309: "yes dont wait for grok" and "land without grok". General scope confirmed by project coordinator; Claude+GPT+distinct fallback qualify. Original provenance/outage receipts and R1 synthesis retained canonical runs/reviews/milestone-prerequisites. Reduced vendor diversity, never Grok LGTM.

- R2 evidence: 12 real-evaluator list tests pass with isolated test-only flag+variable definitions in both orders. First-only and second-only mutations each cause four specific tri-state/operand failures. Catalog invalid reference, optional dependency and location dependency mutations fail their respective assertions. The first self-cycle mutation was caught by the location guard; a second two-node persistent-flag cycle isolates the cycle assertion (`cycle at MAGMA_HIDEOUT_STORY_COMPLETE`) and fails correctly. Restored catalog hash713b332529911c700a8e5d2c84fb6befdb84b3b06d6d6b8d78e6c4e2089e5a62; restored18 focused agent tests pass.
- R2 also removes each replay receipt guard operand separately: missing state, mismatched evidence, and false/unknown native predicate each fail the relevant isolated test. Restored10 viewer tests pass. All mutation logs retained canonical runs/reviews/milestone-prerequisites/round2-mutations/; no production change survives the mutations.
- R2 full final gates PASS: just test4407 agent/1951 viewer/4159 Python plus3 exact protected-card screenshots; just coverage all same >=90% floors (agent99.17/92.74/97.61, viewer98.20/91.80/95.37, Python97.40/93.43/100 L/B/F); lint/build/vendor PASS. Runtime source is byte-identical to R1; only an isolated test file and this evidence log changed. Main still71ce64055 before the final review packet.
- Browser receipt retention: desktop pointer/return/keyboard and advancing-frame proof in browser-receipt.json; phone card80/203, exactrun click and native-frame progression5->455 in browser-mobile.json. Mobile deliberately hides desktop status/return controls; the broad script's attempts to wait/click those hidden desktop controls were test-selector mistakes, not application regressions. No UI change requested or made.
