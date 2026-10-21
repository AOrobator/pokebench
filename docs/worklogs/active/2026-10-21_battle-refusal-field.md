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
- [ ] GREEN: smallest rule extension, negative controls, updated explainer/catalog; deletion/restoration proof; commit.
- [ ] Gates, frozen principles/boundary packet and Claude/Grok/GPT reviews.
- [ ] Land exact reviewed candidate, verify bundle resolution and served viewer/explainer.

## Session log

- Created isolated managed worktree codex/battle-refusal-field from main8f98367d1. Reusing existing switch already enabled in bundle; no preset/queue mutation needed.

- RED: focused regression 2 failed / 2 passed as intended: no warning/recovery events and no warning in production pi request3. Initial fixture parser retained event envelope; corrected before recording behavioral RED. /tmp/battle-refusal-red.log.
