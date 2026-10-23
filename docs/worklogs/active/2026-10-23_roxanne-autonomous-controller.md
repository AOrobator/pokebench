# Roxanne autonomous controller — offline implementation and qualification

## Problem Statement
The operator authorized implementation, native checkpoint/history qualification, scoring verification and a GPU-free rehearsal of the sixteen-GPU-hour Roxanne plan. No inference, measured gameplay, campaign launch, automatic compute reservation, shared-main edits or promotion is authorized. Offline emulator replay of recorded inputs is authorized qualification, not new model play.

## Skills Loaded
feature-worklog; execute-worklog; feature-switch; feature-explainer; pokebench-game-state; agent-observability; pokebench-decision-probes; close-the-loop; talk-to-claude; multi-model-review.

## Architecture
Reuse recorded event schemas/context construction and native mGBA save/load. Typed controller owns bounded frozen batches, revision lineage, protected reserve, blinded grade lock, nomination and terminal reports. Filesystem adapter writes atomic durable state; rehearsal adapter never imports gateway discovery or calls inference. Restore bundles bind checkpoint bytes, native observation, prior events, delivered model context and source hashes. CPU qualification replays recorded native button changes from the real initial save and verifies RAM against archived frames; failure remains an explicit not-qualified result, never a fabricated save. New model-facing reminder delivery is registered/default OFF and applied once through production continuation wiring.

## Invariants
- INV-1: offline commands cannot invoke GPU discovery/inference or execute a campaign; tests inject a rejecting transport.
- INV-2: spent + reserved + protected budget cannot exceed960aggregate endpoint minutes; batches complete before scoring/adaptation.
- INV-3: all declared episode outcomes remain in the denominator; restart cannot silently resample uncertain work.
- INV-4: recovery comes from ordered native events and coherent party snapshots, not narrated intent; reorder/HP-only/EXP-only do not qualify.
- INV-5: source-state/context digests and active input owner must match; missing state/history fails closed.
- INV-6: candidate delivery defaults OFF with exact OFF parity; one-shot insertion and retained-history receipt only.
- INV-7: protected families remain unavailable for prompt revision; deterministic qualification emits metadata/validity only.

## Security Review
No remote services or new dependencies. ROM stays external, read-only and untracked. Recorded state bundles and screenshots stay ignored. Native replay owns isolated CPU cores and scratch directories. No gateway calls. No shared listener/process/lease modifications.

## Milestones
**M1 — Controller and native trace scorer**
- [x] RED tests: controller/scorer modules absent; both new suites fail importing their production owners. Budget/concurrency, frozen batches, uncertain restart, grade locks, recovery and winner assertions committed before implementation.
- [ ] GREEN initial controller/scorer24focusedtests; remaining full rehearsal, adversarial mutations and review pending.
**M2 — Checkpoint and history qualification**
- [x] RED restore integrity/ownership/hash and native replay tests: missing production modules fail TS/Python collection. M1 first GREEN17tests; types checked after optional milestone evidence repair. RED commit45c544640.
- [ ] GREEN restore builder; CPU-only native replay/load receipts for actual development/control starts; protected qualification via sealed metadata-only path
- [ ] Record any genuinely unrecoverable starts explicitly
**M3 — Delivery, rehearsal and review**
- [ ] RED/GREEN registered default-OFF one-shot reminder and production wiring
- [ ] Full fake-clock campaign/restart/failure rehearsal, zero GPU calls
- [ ] Gates: tests, build, lint, >=90% coverage, vendor integrity
- [ ] Principles and independent reviews on frozen implementation packet
- [ ] Operator-facing report with qualified vs blocked starts and concrete remaining limitations

## Closing the Loop
No launch. Prove native load+context restoration independently from fake rehearsal. Record real receipts and link a local verified report. Do not mark campaign ready if qualification is missing. Leave implementation on the owned branch; no main merge is part of this offline request.

## Session Log
- 2026-10-23: authorization is the operator's explicit implementation/qualification/scoring/rehearsal request. Reusing isolated codex/roxanne-campaign-plan worktree at e3da528c2, with its existing planning document. Main pointer belongs to Birch and remains untouched.

- Native reconstruction: d548T488 and2e93T637 now reproduce all7native regions and CPU registers exactly and reload through the one-frame vendor load step. Both have zero mismatched decision checkpoints. Must preserve source RTC epoch; mGBA RTC_FIXED value is milliseconds (source interface.c). No GPU calls.

## Surprises
- Historical development/control runs checked have no native run-level checkpoints; vendor milestone ZIPs inspected contain metrics/maps/logs, not emulator saves. Complete native_input journals may permit deterministic CPU reconstruction; must prove matching RAM.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive this worklog
