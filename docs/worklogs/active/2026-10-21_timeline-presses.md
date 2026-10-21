# Timeline press regression

User: restore individual button presses instead of overlapping long bars.
Scope: existing press lane rendering and regression tests only; no harness behavior, new lanes or event kinds.
Evidence: live run 2026-10-21T00-16-44_qwen36-gpu1_2e93, seq 14276 requests 224f; native seq 14277–14282 records three 1-frame RIGHT+B pulses. Existing renderer paints 232 frames and overlaps later requests.
Plan: prefer closed native input transitions within each recorded request, retain legacy/human rendering when unavailable; verify actual recording, responsive browser and gates before review/landing.
Original tab Chrome 1657055904; shared viewer PID 51664, served 772a4614. Preserve runs and shared service during candidate verification.

## Candidate evidence
- RED: native-pulse test failed (expected two marks, got one requested-budget bar). GREEN: 22 timeline tests pass. Initial whole-viewer invocation also found a missing built module in the new checkout; full build supplied it.
- Native transition rendering uses server timestamps and releases, with a 0.5-unit minimum to preserve short release gaps; primary native-key labels group pulse trains; full simultaneous keys remain in accessible tooltips. Legacy estimates and simultaneous human input retain their existing renderer. Unclosed/invalid native input is not extrapolated.
- Candidate browser replay at 0:56:35 has 44 separate marks, maximum width 2.8 SVG units; desktop 1440/1280 and phone 375 screenshots opened and inspected. Saved under canonical runs/mockups/timeline-presses/shots/. No application console errors; browser extension warnings observed.
- Preview uses a copied event log plus a synthetic operator_abort terminator, only in scratch runs/timeline-preview/. One final recorded screenshot copied for playback readiness. Original log untouched; earlier replay frame unavailable in the scratch copy and uses recorded fallback. Shared 8790 untouched.
- Initial broad Python gate ran before vendor initialization and .env installation, causing missing-vendor/ROM failures and skips; invalid as gate evidence. Vendor now initialized at pin; final gates rerunning with local environment.

## Principles Adherence
PB1 PASS: no scoring change; native input is source evidence.
PB2 N/A: no run accounting change.
PB3 N/A: no performance or benchmark benefit claim.
PB4 PASS: viewer-only, no harness advantage.
PB5 PASS: one rendering repair, no experiment.
PB6 N/A: no context or long-run behavior change.
PB7 PASS: existing native actions remain source; release gaps restored, originals preserved.
PB8 N/A: no model retry policy change.
PB9 PASS: user requested existing press-lane repair; no new lane/event kind.
PB10 PASS: gates unchanged; setup failures retained and not counted as passes.
PB11 PASS: native_action schema and actual run checked at current pin.
PB12 PASS: ROM remains at configured external path, no asset copied.
PB13 PASS: worklog/test/browser evidence retained; review and landing pending.

## Frozen boundary
Only timeline.ts and timeline.test.ts production/test paths plus this worklog. Outcome: display recorded input pulses rather than overlapping requested hold budgets, preserve old-log and human display. No harness events, policies, scheduling, dependencies or new UI controls. Split any adjacent subsystem request into follow-up. Completion requires gates, review, then same-source live verification; no experiment launch authorized.

## Review and final evidence
- Round 1 Grok approved; GPT/Astra/Sol found no production defect but required performed break/restore receipts. Strengthened invalid-key, cursor-boundary and sequential-key label assertions. Browser caught modifier churn crowding full-chord labels; native primary-key grouping preserves compact labels and leaves full chords in tooltips.
- 12 independent mutations in disposable /tmp/pokebench-timeline-mutations each fail: native routing, seq request boundary, minimum mark width, native clock, valid-key filter, array shape, closed transition, cursor clamp, positive span, expired span, hidden lane, key label change. Restored suite 28/28. Receipts/logs: runs/timeline-review/mutation-receipts.json and mutant-*.log. Future-start rejection is also implied by end=min(next,now) and end<=start; no claim of independent deletion proof for that redundant operand.
- Completed broad coverage: agent 3,246, viewer 1,541 before final test additions, Python 3,560, zero skips. Agent lines/branches/functions 99.20/93.08/97.70%; Python 97.25/92.95/100%. Final viewer coverage after labels/tests 97.85/91.16/94.29%. Full lint/build/vendor pass before label refinement; final viewer lint/build rerunning.
- Broad plain test attempts exposed existing load-sensitive failures outside this diff: experiment-cli git fixture exceeded 5s when coverage ran concurrently; serial-comparison child timeout produced empty stdout during build load. No test, retry policy, timeout or concurrency setting changed; final plain tests run separately after other root build/coverage work finishes.
- Claude standalone reviewer loggedIn=false. Cursor Opus and Sonnet both report usage limits; Cursor GPT also capped. Retained Grok and used independent GPT plus two model-distinct Astra/Sol fallback reviewers. Fallback is reduced vendor diversity and does not authorize self-merge under CLAUDE.md / execute-worklog. Explicit operator exception is required before local landing if Claude remains unavailable.
- Concurrent main advanced with BAG viewer work at f7b68e455; integrating before final packet and integrated gates. No timeline files changed upstream.
