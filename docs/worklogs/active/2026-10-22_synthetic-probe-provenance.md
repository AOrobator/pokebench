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
- [x] Principles and frozen amended review roster: Claude, GPT and distinct Astra fallback under relayed operator Grok outage exception.
- [ ] Landing board, ff-only merge, main tests and served proof.

## Evidence

Studydata and independent reviews: canonical runs/reports/double-kick-heldout-20261022. No study inference before this repair is delivered. Existing35Bmodel/build unchanged.

RED: focused probe API/display suite33tests,3expectedfailures,30pass. Log /tmp/synthetic-probe-red.log. COMMIT: test(viewer): distinguish synthetic probe provenance (this RED commit).

GREEN: API preserves explicitsyntheticprovenance and forcesnullhistory fields; decoder rejects syntheticforgeries; historicalmissing-sourceerrors preserved. Mixedheadercounts, syntheticlabels/no-frame/norecordedcall, and exclusionfromhistoricaldeparturepool/plots tested. Focused35pass. Fulltests4845agent/1809viewer/4013Pythonpass. justbuild/justlint/justverify-vendorpass. Coverageagent99.21%lines/93.41%branches/97.81%functions; viewer97.97%/91.51%/94.46%; Python97.41%/93.48%/100%, floor90 unchanged. Lint initially found5testnon-nullassertions, correctedwithoutproductionbehaviorchange; finallintpass.

Owned read-only preview8832 (noqueue/autorun/modelendpoint) served completedcandidatebuild. HeadlessChrome desktop1280 andphone375: actualvisible studyselector→historical704cT604 frame240×160→syntheticMudkipBide noframe, nofalsemissing-sourcewarning, plotexcludessynthetic. Screensopenedandinspected. BrowserdriverfirstfailedambiguousselectorandSVGinnerText; correcteddriverandfinalproofpassed, noapplicationworkaround. Receipts canonical runs/reports/double-kick-heldout-20261022/browser-proof/provenance-preview/receipt.json; zeroJSerrors. Operatorforegroundpreserved. Noactualprobeinference.

Experimentoverview: docs/experiments/double-kick-generalization-128-20261022.html, themed/self-contained/pages-checkpass; canonicalservedcopyunder runs/reports/double-kick-heldout-20261022/overview.html. No model or controlconfigsource changed. COMMIT: feat(viewer): identify synthetic probe cases (GREEN commit).

## Landing evidence

Reviewed tree fast-forwarded main to `074c21457e34e3bcc4d22543822ee07ab466e72b` while number 1 on the shared board, with exact Codex chat ID `00000000-0000-4000-8000-ba8b017cb1b7`. Frozen binary diff SHA256 `6cc7378dafefcdcf61b5416d3c674d532d2aff5cebd30a560623ebb657f37770`; clean source before/after all reviewers. Claude formal receipt and fresh isolated GPT (`gpt-5.6-sol`, xhigh) and distinct fallback (`gpt-6-astra`, high) each returned terminal LGTM. Both discovered Grok models exited with Cursor usage-limit error; no Grok approval claimed. Coordinator relayed operator blanket exception, message `[private message reference]`: Claude + GPT + distinct fallback sufficient during outage. The fallback disclosed accidental inventory exposure to prior GPT verdict only after independently reporting no production defect.

Eight isolated-copy mutations (decoder kind/time/frame/call, manifest propagation, synthetic lookup bypass, pooled tally exclusion, plot exclusion) each failed focused tests and passed all 35 after restoration. First temporary-copy setup lacked static fixtures, so baseline failed; corrected copy passed before mutation. Candidate was never mutated. Receipts: canonical `runs/reviews/synthetic-probe-provenance/`, including synthesis, exception, reviewer identities and mutation logs. No blockers, accepted code fixes or scope growth.

Post-merge `just test` on main passed: agent 4845, viewer 1809, Python 4013. Log `/tmp/synthetic-probe-main-test.log`. This commit is evidence-only under the worklog exception. Canonical viewer refresh and headless served proof are the next delivery steps; no held-out inference has started. GPU1 8091 is dedicated to decision probes; GPU0 8098 yielded to the separately owned two-hour run.
