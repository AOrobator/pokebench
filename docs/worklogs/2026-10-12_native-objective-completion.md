# Native objective completion

## Problem Statement
The model can label a clock-setting task complete merely by entering the bedroom. The user authorized independent implementation, review and landing of native milestone completion on 2026-10-12. Game evidence owns verified completion; local plans are provisional.

## Skills Loaded
Story milestones, game-state reference, feature-worklog and multi-model-review.

## Architecture
Extend the existing completion contract with harness-owned native milestone conditions. Reuse recorded native milestone events and supporting state evidence. Automatically complete selected native objectives; retain historical parsing. No new game actions, navigation, memory writes, or benchmark stopping policy.

## Invariants
- INV-1: Local scalar/visual claims cannot establish verified story completion. Test typed tools and tracker rejection.
- INV-2: Only native game-backed milestones with valid supporting evidence complete native objectives. Test absent, legacy, observed and present-at-start cases.
- INV-3: Harness fixes native task title and meaning; model selection cannot substitute a weaker condition. Test canonical catalog wording and completion.
- INV-4: Historical objective records remain readable; raw malformed scalar values remain rejected before pinned pi coercion.

## Security Review
Read-only game evidence; no game memory writes. Validate closed tool contracts, sequence provenance, run ownership and native evidence. No credentials or ROM contents enter artifacts.

## Milestones
**M1 — Contracts and verification**
- [x] RED tests and commit: a6075cf; fixture corrected in follow-up, three substantive assertion failures established.
- [x] GREEN implementation and commit (SHA recorded in review identity receipt after commit)
- [x] Full tests: 380 agent + 148 viewer + 378 Python = 906. Types/lint/build/ruff/mypy green; coverage agent 98.71/93.39/98.32/99.17, viewer 97.47/91.54/98.42/98.36 (statements/branches/functions/lines), Python 99.34 lines/96.77 branches/100 functions.
- [x] Real pinned pi native catalog acceptance and raw type regression tests; production recorder/native predicate subscription serialization/reparse; actual Qwen dfd2 native clock #1758/state #1757 replay, unchanged originals. Eight semantic deletion/replacement mutations produced AssertionError and restored green. Actual registered Qwen backend accepted native and scalar union via pinned pi, exactly one valid typed tool call each.
- [ ] Multi-model review until clean; root coordinates canonical landing

## Closing the Loop
Deliver reviewed commit and receipts to root. Existing experiment remains frozen and endpoints untouched until released. Root integrates and lands; only then exploratory runs.

## Session Log
- 2026-10-12: Read-only inspection completed; worklog created before implementation. User's explicit request authorizes start gate. Proposed local plans use reported_complete and native milestones use completed; root confirmed provisional reported_complete for local plans; completed only native catalog proof. Historical events retain their original semantics.

## Surprises
- Milestone event kinds are story/navigation/legacy, not native. Trust requires game-owned catalog semantics and state evidence, not a nonexistent native discriminator.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive after landing.

- RED fixture first lacked full StoryState fields; repaired using existing valid recorded fixture before accepting substantive RED proof.

- GREEN scope: local plans remain type/value/freshness checked but are provisional reported_complete; only existing native catalog predicates supply completed status and immutable origin/sequence proof. Canonical native titles override model prose. Gym arrival, victory and badge remain separate; objective completion never invokes run ending. Root integration adds named feature declaration under objectives ablation in live.ts (concurrent loop owner).
- Receipts: runs/launch-receipts/native-objective-completion; first Python attempt 376/378 failed because submodule was uninitialized in new worktree; pinned submodule initialized without changes, full 378 green.

- Parent requests before-review completion of PB4 producer metadata: native-objective-completion-v1 declared by actual play entrypoint only when objective layer enabled; probe/smoke have no objective layer so must not advertise. Existing live-objectives test exercises actual withRun→recorder→parsed run_start under all four objective/interface ablations. This producer wiring is now in branch scope; root resolves shared live.ts edits transparently.

- Metadata RED 90e4165: actual run_start flags missing in two enabled objective arms. GREEN literal flag added to play producer only; metadata deletion produced same two assertion failures, restored four passes. Full TS coverage/tests, lint/types/build rerun after restoration; Python unchanged previous 378 tests and coverage gates green. Frozen producer behavior now included in branch review packet.

## Archived

2026-10-16, about 6:20 AM EDT, on the operator's request to archive worklogs that are no longer active or are merged into main. Its work is merged into main (last touched 2026-10-12). Unchecked items left here are bookkeeping (merge or archive asks, viewer restarts) that later work already covered.
