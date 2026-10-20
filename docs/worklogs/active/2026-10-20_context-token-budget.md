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
- [x] GREEN: `ContextBudget` in `context-budget.ts`, applied in `piLoop` after the slide window, anchored on usage or the overflow error; `contextBudget` factory in `play-wiring.ts`, wired in `live.ts`. Registry tests shifted by one for the appended switch.
  - Wiring deletions: removing `options.budget?.fit` fails the piLoop ON test; making the factory ignore the switch fails the factory test. Both restored.
- [x] Explainer `docs/explainers/context-token-budget-v1.html` (pages-check clean), pending `experiments/context-token-budget-v1.json`, readiness row
- [x] Gates: `just lint` clean; `just coverage` passes (agent 2698 tests, viewer 1307, env 2824; Python 96%)
- [x] Review: Claude, Grok, GPT lanes LGTM on the frozen packet
- [x] Land ff-only on main (c07b747c)

### M2 `bundle-cook-6h-v2`

- [x] Definition (validated with the branch build: no problems, control base clean, plan regenerated from seed `bf0f7a4b141ab632`, control B/GPU0, bundle A/GPU1): copy of `bundle-cook-6h` with `tutorial-party-owner-v1` and `context-token-budget-v1` in `onInBoth`
- [ ] `just fixed-run check`, launch via the fixed-run-launch skill, dropdown check
  - Pending entry pinned to implementation commit 9c452544e0ca1aaade988c1e696b582b82fafde1.

## Review and landing (M1)

- Frozen packet `f3842160..c07b747c`, diff SHA-256 `2c7a9f3498c0731a331792ceb4f2bc93e1c1b0b447b8dbb1b6cd3f7eec6b9db5`; artifacts in `runs/reviews/context-token-budget/`.
- Grok (Cursor `cursor-grok-4.5-high`): VERDICT: LGTM.
- Claude: CLI default login expired; read-only Claude subagent (standing operator word 2026-10-16): VERDICT: LGTM.
- GPT: Cursor `gpt-5.6-sol-xhigh` hit its usage limit; Codex CLI `gpt-5.6-sol` xhigh, read-only: VERDICT: LGTM.
- Non-blocking notes: image weight and post-fit transforms (battle decision image) are covered by the margin plus the overflow anchor; trims draw the existing compaction mark kind.
- Landed `git merge --ff-only c07b747c` on main. `just build` then `just test` on main: agent 2698, viewer 1307, env 2824 passed.
