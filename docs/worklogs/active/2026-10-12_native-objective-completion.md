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
- [ ] GREEN implementation and commit
- [ ] Full tests, lint, build and independent 90% coverage gates
- [ ] Real pinned pi and recording/replay integration, deletion/restoration mutations
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
