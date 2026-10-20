# Context token budget backstop and the six-hour cook pair v2

## Operator decision

2026-10-20, 2:17–2:22 AM ET, the operator in the "no runs running" thread:

- Turn `tutorial-party-owner-v1` on in both arms.
- The context window cannot go past 65,536 tokens (two GPUs would be needed).
- Do not drop old thinking; ship only a token budget backstop that drops the oldest whole turns when a request would not fit.

## Why

`bundle-cook-6h` (launched 2026-10-19 11:16 PM ET from `f482b662`) ended with no valid trial, the same way `bundle-cook-4h` did:

- Control `2026-10-19T23-16-14_qwen36-gpu1_7ca0`: `GameStateError: malformed /pokebench/state at /party_owner` in Wally's tutorial scene (control has `tutorial-party-owner-v1` off), recorded as a crash at 12:18 AM.
- Bundle `2026-10-19T23-16-14_qwen36-gpu0_7346`: `400 request (67511 tokens) exceeds the available context size (65536 tokens)` at turn 771, 12:48 AM. The model was stuck on Route 101 and its last 20 kept replies held 73k chars of thinking and 60k chars of text.

The launch itself followed the fixed-run skill. Its run data stays where it is.

## Milestones

### M1 `context-token-budget-v1`

- [x] RED: budget trims oldest whole turns, keeps task and newest turn, calibrates from usage and from the overflow error, OFF is byte-identical, production factory honors the switch, `context_budget` event recorded and shown in Activity History
  - RED run: context-budget, harness and play-wiring test files fail (module and factory missing). The trim reuses the existing `compaction` event (from/to tokens), already in Activity History, so no schema or viewer change.
- [ ] GREEN
- [ ] Explainer, pending experiment entry, readiness row
- [ ] Gates: `just test`, `just coverage`, `just lint`
- [ ] Review: Claude, Grok, GPT lanes LGTM on the frozen packet
- [ ] Land ff-only on main

### M2 `bundle-cook-6h-v2`

- [ ] Definition: copy of `bundle-cook-6h` with `tutorial-party-owner-v1` and `context-token-budget-v1` in `onInBoth`
- [ ] `just fixed-run check`, launch via the fixed-run-launch skill, dropdown check
