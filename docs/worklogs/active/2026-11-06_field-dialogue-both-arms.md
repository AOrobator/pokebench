# Field dialogue memory in both arms

The operator 2026-11-06: "the correctness fixes needs to be on in both arms." Turn `observed-field-dialogue-v1` and `instruction-memory-junk-filter-v1` on in both arms. Config only; registered defaults stay OFF and live runs keep their recorded features.

## Why

DeepSeek run ee2a (`2026-11-05T13-26-41_deepseek-deepseek-v4.1-flash_ee2a`) heard "Okay! We're to move out to MT. PYRE!" at turn 146 from unnamed Aqua grunts. With `observed-field-dialogue-v1` off, instruction memory keeps only episodes containing a story character's printed name (`observed-instructions.ts:158`). Turn 149 was the last delivery of that line, and the run never finished the Mt. Pyre summit story.

ee2a's recorded flags were observed instructions and the cap on, field dialogue, milestone memory and the junk filter off, so the control-arm combination is what this changes.

## Evidence

Offline replay of ee2a through `packages/agent/dist` `ObservedInstructions`, with the cap, junk filter and field dialogue on. Replay by the coordinator; not rerun here.

- At turn 590 the block is 10,504 characters, against 6,579 today.
- It now keeps the turn-146 Mt. Pyre line, the Mt. Pyre old woman, the grunt's "cave in the cove" and the Sailor's Wailmer line.
- 43 episodes are left out at turn 590: 22 by the junk filter (nurses, older Surf prompt copies, trainer taunts, PokéNav registrations) and 21 by the cap as finished.

## Change

- `experiments/feature-configs/current.json`: field dialogue moves from `switches` to onInBoth, junk filter added to onInBoth, both true in `features`.
- `experiments/presets/current-control-24h-8k.json`: explicit true keys.
- `experiments/feature-configs/README.md`: note.
- Not changed: `rayquaza-lane.json`, `rayquaza-lane-8h.json` (the live v3 lane) and Astra presets, which are copied per launch outside the repo.

## Gates

On 35a1c59ce: `just test` passed: 2,585 agent, 991 viewer, 2,965 env and 38 gateway tests, every coverage floor and `just no-io-proof`. Lint clean: `just lint` stopped at env mypy on the fresh worktree venv, which has no mGBA binding (4 `mgba._pylib` errors); env mypy with the main venv and the gateway ruff and mypy steps all passed. `just verify-vendor` clean. `git diff --check` clean.

## Review

Frozen packet 36826cea3..35a1c59ce, diff SHA-256 60ebdd5e…7695.

- GPT (Codex CLI, gpt-5.6-sol): LGTM, no findings. The configured default model was rejected with model_not_found, so the lane was rerun on this one.
- Claude (subagent): LGTM, no behavior bugs. It reproduced 6,579 and 10,504 characters. Fix: two doc errors in this file and the README, corrected here; the packet principles row PB7 cited the wrong evidence and was corrected (the block text and evidence refs are what is recorded).
- Grok: skipped, out until 11/17.
- Follow-up, not in this change: `features.ts:684` and the field dialogue explainer still say "bundle treatment only"; the control arm's memory header attributes junk-filter drops to the size cap; the junk filter's R5 has no gym-leader exemption (WINONA's turn-60 speech drops).
