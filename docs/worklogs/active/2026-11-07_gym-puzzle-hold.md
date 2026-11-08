# Gym puzzle hold (hold-only landing)

The operator 2026-11-07 9:15 PM NY, relayed: "seems like we should only run the hold if thats the only thing that helped". This branch carries only `gym-puzzle-supervisor-hold-v1` from `claude/gym-puzzle-switches` (worklog `2026-11-07_gym-puzzle-switches.md`, probes `runs/probes/gym-puzzle-switches-20261107`). `rotating-gate-push-spots-v1` stays unlanded on that branch; `double-context-window-v1` stays off in the bundle.

- [x] Hold code, tests, registry, preset, configs and explainer copied byte-for-byte from e6bfed2bd where whole files; registry and config edits limited to the hold's own entries.
- [ ] Cheap checks, gates, GPT one-off review, Claude review carried (same hold code, LGTM on e6bfed2bd).
- [ ] Land on local main.
