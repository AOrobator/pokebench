# Gym puzzle hold (hold-only landing)

The operator 2026-11-07 9:15 PM NY, relayed: "seems like we should only run the hold if thats the only thing that helped". This branch carries only `gym-puzzle-supervisor-hold-v1` from `claude/gym-puzzle-switches` (worklog `2026-11-07_gym-puzzle-switches.md`, probes `runs/probes/gym-puzzle-switches-20261107`). `rotating-gate-push-spots-v1` stays unlanded on that branch; `double-context-window-v1` stays off in the bundle.

- [x] Hold code, tests, registry, preset, configs and explainer copied byte-for-byte from e6bfed2bd where whole files; registry and config edits limited to the hold's own entries.
- [x] Cheap checks: tsc and eslint clean on changed files; 133 focused agent tests (stall-briefing, loop-supervisor, features, frozen-switches, play-preset); pages-check clean.
COMMIT: `feat(agent): an unfinished gym is not a map cycle, and its stall notes list no ways off it` (8c65aba43). Packet packet-hold-8c65aba43.diff, sha256 b72cb073…4e1f.
- [x] GPT one-off `codex exec` review (the operator: "u run it", then "run it" 9:15 PM NY): read-only, gpt-5.6-sol (default gpt-6.1-sol is not available on this ChatGPT account), packet-hold-8c65aba43 sha256 b72cb073…4e1f. VERDICT: LGTM, no findings. Verdict: runs/reviews/gym-puzzle-switches/gpt-verdict-hold-8c65aba43.md.
- [x] Gates at c926e745e (main c8bfb9d1e, no drift; CPU window 9:23 PM): just test agent 2,961 (lines 68.68, branches 59.51, functions 62.83, statements 63.33), viewer 1,240, env 3,061 (lines 80.89), gateway 38; no-I/O guards OK; just lint pass. Claude review: LGTM on e6bfed2bd, whose hold code is byte-identical here.
- [x] Landed on local main by fast-forward to ff9e480a6 (9:26 PM NY). Post-merge just test on main: agent 2,961, viewer 1,240, env 3,061, gateway 38, no-I/O guards OK. Next launch needs `just viewer-main` (the operator's call); 37ca keeps its own frozen pin.
