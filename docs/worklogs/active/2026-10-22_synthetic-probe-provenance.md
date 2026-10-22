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
- [x] GREEN implementation, focused/full gates and coverage90%.
- [x] Background browser proof on owned preview, desktop+phone, historical/synthetic selection and samples.
- [ ] Principles and frozen Claude/Grok/GPT cloud review.
- [ ] Landing board, ff-only merge, main tests and served proof.

## Evidence

Studydata and independent reviews: canonical runs/reports/double-kick-heldout-20261022. No study inference before this repair is delivered. Existing35Bmodel/build unchanged.

RED: focused probe API/display suite33tests,3expectedfailures,30pass. Log /tmp/synthetic-probe-red.log. COMMIT: test(viewer): distinguish synthetic probe provenance (this RED commit).

GREEN: API preserves explicitsyntheticprovenance and forcesnullhistory fields; decoder rejects syntheticforgeries; historicalmissing-sourceerrors preserved. Mixedheadercounts, syntheticlabels/no-frame/norecordedcall, and exclusionfromhistoricaldeparturepool/plots tested. Focused35pass. Fulltests4845agent/1809viewer/4013Pythonpass. justbuild/justlint/justverify-vendorpass. Coverageagent99.21%lines/93.41%branches/97.81%functions; viewer97.97%/91.51%/94.46%; Python97.41%/93.48%/100%, floor90 unchanged. Lint initially found5testnon-nullassertions, correctedwithoutproductionbehaviorchange; finallintpass.

Owned read-only preview8832 (noqueue/autorun/modelendpoint) served completedcandidatebuild. HeadlessChrome desktop1280 andphone375: actualvisible studyselector→historical704cT604 frame240×160→syntheticMudkipBide noframe, nofalsemissing-sourcewarning, plotexcludessynthetic. Screensopenedandinspected. BrowserdriverfirstfailedambiguousselectorandSVGinnerText; correcteddriverandfinalproofpassed, noapplicationworkaround. Receipts canonical runs/reports/double-kick-heldout-20261022/browser-proof/provenance-preview/receipt.json; zeroJSerrors. Operatorforegroundpreserved. Noactualprobeinference.

Experimentoverview: docs/experiments/double-kick-generalization-128-20261022.html, themed/self-contained/pages-checkpass; canonicalservedcopyunder runs/reports/double-kick-heldout-20261022/overview.html. No model or controlconfigsource changed. COMMIT: feat(viewer): identify synthetic probe cases (GREEN commit).
