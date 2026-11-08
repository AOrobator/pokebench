# Gym puzzle hold (hold-only landing)

The operator 2026-11-07 9:15 PM NY, relayed: "seems like we should only run the hold if thats the only thing that helped". This branch carries only `gym-puzzle-supervisor-hold-v1` from `claude/gym-puzzle-switches` (worklog `2026-11-07_gym-puzzle-switches.md`, probes `runs/probes/gym-puzzle-switches-20261107`). `rotating-gate-push-spots-v1` stays unlanded on that branch; `double-context-window-v1` stays off in the bundle.

- [x] Hold code, tests, registry, preset, configs and explainer copied byte-for-byte from e6bfed2bd where whole files; registry and config edits limited to the hold's own entries.
- [x] Cheap checks: tsc and eslint clean on changed files; 133 focused agent tests (stall-briefing, loop-supervisor, features, frozen-switches, play-preset); pages-check clean.
COMMIT: `feat(agent): an unfinished gym is not a map cycle, and its stall notes list no ways off it` (8c65aba43). Packet packet-hold-8c65aba43.diff, sha256 b72cb073…4e1f.
- [x] GPT one-off `codex exec` review (the operator: "u run it", then "run it" 9:15 PM NY): read-only, gpt-5.6-sol (default gpt-6.1-sol is not available on this ChatGPT account), packet-hold-8c65aba43 sha256 b72cb073…4e1f. VERDICT: LGTM, no findings. Verdict: runs/reviews/gym-puzzle-switches/gpt-verdict-hold-8c65aba43.md.
- [ ] Gates at final head. Claude review: LGTM on e6bfed2bd, whose hold code is byte-identical here.
- [ ] Land on local main.
