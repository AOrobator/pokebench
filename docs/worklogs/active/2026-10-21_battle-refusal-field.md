# Battle-action refusal coverage on the field

User authorization (2026-10-21): "Implement that smallest fix, prove the warning reaches the model on the recorded 56-call sequence, and put it in the bundle after tests and review."

## Boundary

Extend existing battle-refusal-loop-v1 only for explicit no-battle refusals on a qualified readable field state. Preserve the existing initialized-battle path, OFF semantics, thresholds and recovery lifecycle. No new feature, generalized detector rewrite, automatic input, benchmark launch or changes to original recordings. Update the already-linked explainer and existing feature description to reflect the repaired coverage. Production owners: loop/rules/basic.ts; existing supervisor/context delivery remains unchanged unless a concrete delivery bug is proven. Terminator: tests, coverage/lint/build/vendor/config checks, three cloud reviews, local landing and served viewer proof. Any additional failure domain requires a separate proposal.

## Evidence

Original run 2026-10-20T20-26-22_qwen36-gpu1_97a0, clean ee11d5b83a54792598407a43fbf7cd1f431edb7f; events SHA256 820a26931cd81fbcb4628a81d417c165ed4a111ec58b12eaf56a7e03a8641775. Turns 637-692: 56 calls, 25 SCRATCH / 31 EMBER, results 28155-28883 all no battle in progress, no button inputs. Second result 28167 should warn before turn639. First/last raw archives reproduce overworld map11/3 at1,9 with dismiss_wait ready and battle=null. Pinned original detector replay gives no notices/context. Duplicate collapse alone records stage1 and adds no warning. B on turn693 starts Tommy battle. Historical source/frame/RAM preserved.

## Invariants

- INV1: OFF remains byte/behavior equivalent; bundle treatment true, control false; no other bit changes.
- INV2: repeated no-button explicit no-battle refusals at the same qualified field state warn after two, independent of move argument.
- INV3: unknown/unavailable field state, missing pairs, changed field state, another reason or actual input cannot falsely establish this repetition.
- INV4: recorded call2 warning reaches real pinned pi request3 through production supervisor and contextTools, with fixed-point note disabled; all56 recorded calls replay, no network inference.
- INV5: existing typed loop_guard event/history/recovery path retained; no new timeline marks or automatic input.

## Work

- [x] RED: fixture provenance, production attachment and pinned-pi model-delivery regression; commit.
- [x] GREEN: smallest rule extension, negative controls, updated explainer/catalog; deletion/restoration proof; commit.
- [x] Gates, frozen principles/boundary packet and Claude/Grok/GPT reviews.
- [x] Land exact reviewed candidate, verify bundle resolution and served viewer/explainer.

## Session log

- Created isolated managed worktree codex/battle-refusal-field from main8f98367d1. Reusing existing switch already enabled in bundle; no preset/queue mutation needed.

- RED: focused regression 2 failed / 2 passed as intended: no warning/recovery events and no warning in production pi request3. Initial fixture parser retained event envelope; corrected before recording behavioral RED. /tmp/battle-refusal-red.log.

- RED commit7e2a5338. GREEN extends only explicit no-battle refusals to semanticState(...,true) on in_battle=false and battle=null. Qualified field snapshots include input-ready message state. Existing status counting, events, supervisor, pi injection and bundle bits unchanged.
- Focused restored suites26/26 pass. Production pi scripted replay executes all56 recorded calls with existing supervisor and fixed-point note disabled. ON first warning after call2; outgoing request corresponding to original turn639 contains "SUPERVISOR: You are currently looping" and "the same rejected tool call" plus observed dialogue. OFF has no warning across56. The replay is synthetic delivery proof, not a model-benefit or gameplay trial.
- Unique deletion receipts: /tmp/battle-refusal-delete-field-1.log (field branch removed: intended detector and delivery regressions fail); /tmp/battle-refusal-delete-delivery-1.log (pi context injection removed: outgoing delivery assertion fails while detector test passes). Both restored. Retained ON/OFF outgoing JSON and schema-valid replay events under runs/battle-refusal-field/proof/.
- Build passed. Full lint caught a test callback shorthand returning void; changed to braces. Full gates follow after integrating current main (move-learn menu-line repair landed concurrently).

- First full coverage: agent3285 pass (97.27 statements/93.10 branches/97.74 functions/99.21 lines); viewer1600 pass and1 explainer-wording assertion failed because existing link test requires "paired native battle". Restored that accurate phrase as "paired native battle or field state" without changing tests. Full lint passes (TS, Ruff, mypy105). Re-running coverage with unique receipt. Main advanced only with menu-line landing evidence; integrating that docs-only commit before freeze.

- Integrated main4e6d5bb32 (menu-line evidence only) as a64bea166. Full coverage2 GREEN: agent3285, viewer1601, Python3589, zero skips. Agent97.27 statements/93.10 branches/97.74 functions/99.21 lines; viewer95.42/91.33/94.33/97.90; Python lines97.23/branches92.97/functions100. Lint2 and build pass; vendor pinned/clean; explainer offline check passes.
- Production parseFixedDefinition -> armPreset -> presetFeatures proves battle-refusal-loop-v1=true treatment / false control in confirmatory and cook. Bundle config unchanged.
- Stock experiments-check fails on150 historical starter-decision-salience ledger rows, identical on clean-main built checker; changed paths include no experiment parser or definitions. This is live-data validation failure, not a waived candidate test. Production queueSnapshot over candidate definitions and isolated empty history validates all definitions; receipt definition-check.json. No ledger edits, approval, readiness or launch claim.
- Review packet will freeze this candidate with exact base/head/diff digest, boundary and complete principles scores. Claude/Grok/GPT cloud lanes required. No local inference reviewers.

- Review round1 Claude completed BLOCKING on packet6299cb4f/base03e5d5615 (digest91140d83b6d7327db624daa6fefd3fcf4040d4e7b771cae1691936dea0b2d0ba): main advanced during capture and BASE was not an ancestor. Fix accepted: integrate current main52b086acc and rerun full gates; no candidate logic blockers. All normal review receipts retained under review-r1; invalid packet does not authorize landing. Extra suggestions (constant extraction/positional constructor cleanup) are out-of-scope hardening and will not expand this four-line repair. Fresh packet capture must assert BASE ancestry and stable main identity.

- Integrated52b086acc gate pass: lint, build, vendor, agent3285/viewer1602/Python3589 coverage, zero skips. Main subsequently landed gym-door-label5534f2850 (separate reviewed change); integrating it before final packet, with no refusal-domain changes. Existing feature description is the only shared file touched by both branches.

- Final integrated main5534f2850 -> candidatee8b8efc75 gates GREEN: build, lint, coverage (agent3286, viewer1604, Python3600; zero skips), vendor. Python branches92.98%, other coverage remains above90. Candidate explainer loaded and card-clicked in actual browser on owned8806; no shared viewer/gameplay restart. Frozen round2 must include only our six changed paths relative to ancestor5534f2850.

- Round2 Claude LGTM (exit0, success result, empty stderr; packet98bcb5a4/bb2a2204). Its interaction-off recovery suggestion is reproducible in-contract: on unchanged free-field observe, the new field anchor uses interactions=true but existing fallback used false, emitting recovered without native change. Promoted from hypothetical hardening to a concrete recovery defect under INV3; regression fails as intended. Fix stays entirely in BasicRules.refusal: return the same qualified field snapshot for recovery observations while limiting field refusal classification to the exact no-battle status. No new production owner/domain; reviewed packet superseded by this narrowly justified correction.

- GREEN recovery qualifier: the same field fingerprint is now available to observation-driven recovery, but only the exact no-battle tool status qualifies as a field refusal. All production changes remain in BasicRules.refusal. Unique deletion receipt delete-recovery-qualifier-1.log: restricting snapshots back to battle_action makes the unchanged-observation regression fail; restored. Fresh recorded ON/OFF outgoing proof retained. Full cumulative gates and fresh full-roster review follow.


## Final review and landing receipt

- Frozen final BASE54640622b017e79b7bcd59987988fb966b137907, HEAD0349ae26bdae4982718c5ee56c59d202809019a7, canonical binary diff SHA25683d1e22ade5a344c5df1d09a175e636d99611ebf6b537bc27c865519a0b09d4b. Claude CLI, Cursor Grok4.7-high, and fresh isolated cloud GPT `/root/gpt_final_review` (fork_turns=none) each returned VERDICT: LGTM on that packet. GPT independently recomputed identity and ran34 focused tests. Grok inspected source and retained receipts; shell execution was unavailable, so its digest was read from packet metadata. Primary independently recomputed digest and clean pre/post status. No blockers; optional constants/constructor refactors and hypothetical alternate screens/status ordering remain outside this boundary. Prior packets superseded by main integration are retained and do not authorize landing.
- Latest prelanding build/lint/vendor/coverage GREEN: agent3290, viewer1607, Python3638, zero skips. Coverage agent97.27/93.11/97.74/99.21, viewer95.42/91.33/94.33/97.90, Python lines97.27/branches93.04/functions100. Offline explainer check passed.175 experiment definitions validate in isolated history. Historical150-row ledger audit failure remains pre-existing on clean main; no ledger was changed.
- Local main fast-forwarded exactly to reviewed0349ae26b. Postmerge build passed. First postmerge test under competing build load failed unchanged100ms watchdog test because child stdout was empty; no source change. Clean rerun `just test` passed3290 agent,1607 viewer,3638 Python. Fresh final-head pinned-pi replay5/5 passed and regenerated outgoing proof: warning after result28167, before original turn639; all56 scripted calls execute; OFF no warning. This proves delivery, not model recovery/performance.
- Another chat subsequently landed caught-dex work on main4cfce22ec540c397e2d801a500e1a6680614f6b5, a descendant containing reviewed0349ae26b. We did not modify or take credit for that work. Served stamp4cfce22ec, dirty=false. Viewer startup initially timed out on first scan; final detached `just viewer-main` succeeded, one8790 listener, zero active gameplay processes at restart. Verified2026-10-21 10:40 EDT: production workbench HTTP200 with no older-viewer-build problems, original97a0 selected in replay, BATTLE ACTION REFUSALS card clicked to updated explanation, console errors empty. Original recordings unchanged; synthetic replay remains isolated from real run catalog.
- Durable receipts: runs/reviews/battle-refusal-field-2026-10-21/{review-final,proof,proof-receipt.json,postmerge-test2.log,viewer-main3.log}. Existing Activity History warning and Raw event JSON were inspected in isolated replay; no new timeline mark. Default1280 layout inspected; viewport override reported success but DOM stayed1280, so exact375/1440 screenshot proof is not claimed. No responsive layout code changed.
- Bundle production resolution remains guard=true in treatment and false in control for confirmatory/cook; no new switch or bundle config edit. No benchmark launch, approval, active-run restart, performance claim or worklog archival.
