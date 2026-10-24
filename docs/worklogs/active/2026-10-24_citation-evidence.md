# Citation evidence separated from rationale

## Authorized scope
The operator: "lets implement a fix, should be a separate switch, only on in the bundle". One milestone. Add `citation-evidence-v1`, default OFF, dependent on cited-destination-v1. ON uses `because: {quote, rationale?}`; checks only exact quote using existing normalization, never parses a matching substring from commentary. Found feedback verifies words only, never attribution, rationale or destination. Records quote in existing destination_citation.because, rationale in original tool_call args. Both stripped before navigation. OFF schema, prompt, feedback and execution unchanged. No event-schema changes, new tools, routing choices, gameplay launches or historical-log edits.

## Evidence
4f08 seq 27606 turn 314 contains the cottage quotation with a newline; seq 40301/40302 turn 389 supplies commentary around the exact quotation and receives not_found. Existing normalise collapses whitespace. Selected original envelopes are retained in test-support/citation-evidence-4f08.json.

## One milestone
- [x] RED: six regression/contract tests fail against incumbent (missing registry, structured schema, prompt, feedback, bundle activation), /private/tmp/citation-red.log.
- [x] GREEN implementation and production pinned-pi delivery. Four performed mutations (production switch wiring, quote-vs-rationale ownership, malformed-object guard, feedback delivery) each failed the targeted test; restored 8/8 tests pass. Receipts: runs/citation-evidence/receipts/*.log.
- [x] Default-OFF registry, presets, viewer draft. Bundle-only activation in bundle-v-control, bundle-v-control-2h, bundle-cook-1h, whole-map-cook-1h, whole-map-pair-2h and glm53-flash-4h. Base/control OFF; historical definitions unchanged.
- [x] Tracked themed explainer, existing card allowlist and exact-route tests. Headless Chromium proof on isolated synthetic pinned-pi recording: ON card, actual link click, trace citation row and raw inspector. No page errors. Screenshots at 1280/1440/375 inspected; phone diagram scrolls within its card. Served HTML/app/CSS/explainer bytes match local artifacts. Receipts: runs/citation-evidence/browser-receipt.json, served-bytes.json; screenshots at canonical runs/mockups/citation-evidence/shots/. No native gameplay proof claimed.
- [ ] Tests, coverage >=90%, lint, build, vendor checks.
- [ ] Principles self-review and independent cloud review.

## Evaluation and terminator
Correctness repair; factual evidence already reached at turn 314, therefore offline replay can test matching. Bundle eligibility is operator-authorized, not a measured gameplay-benefit claim. No GPU/inference experiment authorized. Stop after reviewed implementation; landing follows repo gates only if all required cloud lanes pass. Current active runs keep frozen pins.

## Session log
- Isolated branch codex/citation-evidence from 7133032cc. Claude notified. Loaded feature-switch, feature-explainer, agent-observability, tool-prompt-sync, viewer-e2e, close-the-loop, talk-to-claude, multi-model-review workflows.

- RED commit cc260485c. Initial full gate exposed omitted optional-schema filter and legacy registry-list bookkeeping, corrected without changing old prompt hashes. Initial isolated Python environment lacked ROM configuration and native binding; independent environment now installed, main editable package path verified restored, native binding copied into the isolated environment, and canonical .env linked read-only. Original failed logs retained. One loaded full TS test run hit existing serial-comparison child-startup timing (empty stdout within its short cap); no timing, skip or retry policy changed. Subsequent full agent coverage run passed 4236 tests.
- Build passed; vendor pin/clean check passed. TypeScript coverage: agent lines 99.15%, branches 92.74%, functions 97.56%; viewer lines 98.04%, branches 91.68%, functions 95.18% (1840 tests). Final Python tests/coverage and complete lint finishing before review. Normal board order; coordinator declined landing hold, and citation-evidence is not a launch-gate item.

- Synced current main (gym-label both-arm promotion) in 4d0965dc; our switch remains bundle-only. Final isolated Python coverage: 4106 passed, lines 97.37%, branches 93.33%, functions 100%; floor gate passes. Final complete lint passed. Headless protected trainer-card check now passes all 3 widths using the documented POKEBENCH_CARD_ART path; original missing-art failure retained, no protected source/assertion/baseline changed. Current synced full gate/coverage reruns finish before packet seal. Principles self-review covers PB1–PB13 with zero FAIL, at runs/citation-evidence/review/principles.md; frozen scope at boundary.md.

- Latest sync adds no citation behavior. Normal full suites under host load ~50 hit existing 5s deadlines in queue-removal, panels, app-controls and server-stream; no limits, retries, fixtures or exclusions were weakened. Focused default viewer suite passes 317 tests (panels/server/trace plus production fixed-arm builder). Added effective-arm proof: six named definitions compile to citation-evidence ON only for bundle, cited-destination enabled there; control and next-run default OFF. Waiting for normal full gates on the same candidate; original timeout receipts retained.
