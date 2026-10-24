# Citation evidence separated from rationale

## Authorized scope
The operator: "lets implement a fix, should be a separate switch, only on in the bundle". One milestone. Add `citation-evidence-v1`, default OFF, dependent on cited-destination-v1. ON uses `because: {quote, rationale?}`; checks only exact quote using existing normalization, never parses a matching substring from commentary. Found feedback verifies words only, never attribution, rationale or destination. Records quote in existing destination_citation.because, rationale in original tool_call args. Both stripped before navigation. OFF schema, prompt, feedback and execution unchanged. No event-schema changes, new tools, routing choices, gameplay launches or historical-log edits.

## Evidence
4f08 seq 27606 turn 314 contains the cottage quotation with a newline; seq 40301/40302 turn 389 supplies commentary around the exact quotation and receives not_found. Existing normalise collapses whitespace. Selected original envelopes are retained in test-support/citation-evidence-4f08.json.

## One milestone
- [x] RED: six regression/contract tests fail against incumbent (missing registry, structured schema, prompt, feedback, bundle activation), /private/tmp/citation-red.log.
- [ ] GREEN implementation, production wiring and pinned-pi delivery; adversarial wiring deletion/restoration.
- [ ] Default-OFF registry, presets, viewer draft; bundle-only fixed definitions.
- [ ] Explainer and existing Activity History/raw-event/replay consumers verified.
- [ ] Tests, coverage >=90%, lint, build, vendor checks.
- [ ] Principles self-review and independent cloud review.

## Evaluation and terminator
Correctness repair; factual evidence already reached at turn 314, therefore offline replay can test matching. Bundle eligibility is operator-authorized, not a measured gameplay-benefit claim. No GPU/inference experiment authorized. Stop after reviewed implementation; landing follows repo gates only if all required cloud lanes pass. Current active runs keep frozen pins.

## Session log
- Isolated branch codex/citation-evidence from 7133032cc. Claude notified. Loaded feature-switch, feature-explainer, agent-observability, tool-prompt-sync, viewer-e2e, close-the-loop, talk-to-claude, multi-model-review workflows.
