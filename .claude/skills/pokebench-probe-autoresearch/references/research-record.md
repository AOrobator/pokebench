# Durable research record

Use an ignored study directory under the canonical `runs/`, for example `runs/probe-research/<question-id>/`. These are record responsibilities, not a newly implemented file schema or CLI. Existing runner artifacts may satisfy them by immutable references; do not create duplicate sources of truth. The core probe skill's registry/study shape remains the viewer interface.

| Record | Minimum contents |
|---|---|
| Question/contract | Stable ID, requested outcome and authorization scope, estimand, incumbent, primary and regression rules, alpha/power, minimum useful effect, method/assumptions, family/cell counts, revision bounds and terminal states. |
| Sources/exposure | Source paths and pins, native save/context provenance, family/fork membership, development versus protected metadata, prior studies exposing each family, who accessed protected content and when. |
| Candidates | Immutable IDs/hashes, parent, template and rendered inputs, placement, deterministic eligibility and lifetime, changed mechanism, source evidence, predicted observation and disposition. |
| Batches | Stage, frozen arm/case/family matrix, sample count units, sampling/model/runtime/scorer hashes, balanced order, publication ID, planned total and bounded cost, start/terminal receipts. |
| Attempts/samples | Unique job/attempt ID, exact input reference, response plus exposed thinking, timestamps/status/error, immutable raw output, grade lock and scorer version. Preserve failed/uncertain attempts and denied starts. |
| Resource accounting | Physical device and lease identity, acquisition/release receipts, spent/uncertain/reserved GPU time, protected confirmation cost, remaining cap and current cleared window. Reconcile on every resume. |
| Decisions/result | Completed-batch evidence, revision rationale, provisional champion versus frozen finalist, effect intervals/per-family outcomes, each acceptance check, rejected/invalidated variants, final status and scope. |

Statuses should distinguish design infeasibility, waiting for compute, incomplete sampling, invalid comparison, grading/integrity blockage, supported improvement, rejection and inconclusive evidence. Do not collapse them into a gameplay failure or an invented winner. The remaining budget and reserve must be recoverable without relying on chat memory.

Before spending compute, a GPU-free forward rehearsal should demonstrate the relevant existing runner's behavior for budget exhaustion, failed acquisition, interrupted/uncertain requests, immutable resumption, failed grading and unavailable confirmation families. Fixture results establish workflow handling only; they never count as measured samples, power evidence or a registered real lane.
