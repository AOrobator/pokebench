# Field call text box waits for A

Run 2026-11-05T17-17-57_rayquaza-lane-qwen_7442 (read-only, live) sat on Dad's scripted call on Briney's boat from turn 439 to 474. The readout said `Interface: field_match_call_...; input not ready; ...; text printing: YES`, so the model observed and waited. Run 5f0f cleared the same call in about 4 turns (319-323) with batched A presses.

## Plan

- [x] RED tests for the reader, state wiring, registry and field call advance.
- [ ] GREEN: `field-call-input-v1`, default off, OFF byte-identical, on in both arms of the current and Rayquaza recipes and true in both plain presets.
- [ ] Decide whether PokéNav call auto-advance covers the field call.
- [ ] Explainer linked from the feature card.
- [ ] Replay 7442's stall turns and 5f0f's turns 319-323 from raw RAM.
- [ ] Read-only GPT review of the merge-base diff.

Not landing here. Focused tests, tsc and eslint only; full suites wait for a coordinator CPU window.

## Commits

- RED: `test(readout): RED for field-call-input-v1`. Python collection error on the missing names; 16 of 17 agent tests failed.
