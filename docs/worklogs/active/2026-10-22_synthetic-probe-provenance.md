# Synthetic probe provenance

User scope: broad ROM/harness-derived synthetic move-learning cases, independently checked for game accuracy. Existing viewer labels every case as a recorded turn and attempts historical source lookup, producing116false missing-source warnings for declared synthetic fixtures. This repair makes their provenance explicit before the authorized study launches.

Boundary: probes.ts manifest/API reader and probes-view.ts rendering/validation only. Existing historical manifests/readouts remain unchanged. No model prompts, tools, experiment outcomes, GPU services, automatic grading rubric, timeline, gameplay or scheduling changes. Synthetic cases never receive invented frames, times or recorded calls; historical missing-source errors remain errors. Synthetic cases are excluded from automatic historical departure pooling/plots; their raw sampled calls remain visible and require the study rubric.

## Invariants

- Legacy historical JSON/API rendering stays compatible.
- Explicit sourceKind=synthetic yields no historical lookup and no fabricated provenance; API still requires valid run-reference identity.
- API/UI reject synthetic payloads claiming recorded calls/frames/times.
- Mixed counts, case labels, empty frame and ungraded explanation identify synthetic fixtures.
- Native acquisition and story progress are never inferred from a synthetic choice.

## Milestone

- [x] RED tests: explicit synthetic source vs missing historical source, decoder fraud rejection, mixed display and exclusion from departure summaries.
- [ ] GREEN implementation, focused/full gates and coverage90%.
- [ ] Background browser proof on owned preview, desktop+phone, historical/synthetic selection and samples.
- [ ] Principles and frozen Claude/Grok/GPT cloud review.
- [ ] Landing board, ff-only merge, main tests and served proof.

## Evidence

Studydata and independent reviews: canonical runs/reports/double-kick-heldout-20261022. No study inference before this repair is delivered. Existing35Bmodel/build unchanged.

RED: focused probe API/display suite33tests,3expectedfailures,30pass. Log /tmp/synthetic-probe-red.log. COMMIT: test(viewer): distinguish synthetic probe provenance (this RED commit).
