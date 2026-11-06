# Field dialogue memory in both arms

The operator 2026-11-06: "the correctness fixes needs to be on in both arms." Turn `observed-field-dialogue-v1` and `instruction-memory-junk-filter-v1` on in both arms. Config only; registered defaults stay OFF and live runs keep their recorded features.

## Why

DeepSeek run ee2a (`2026-11-05T13-26-41_deepseek-deepseek-v4.1-flash_ee2a`) heard "Okay! We're to move out to MT. PYRE!" at turn 146 from unnamed Aqua grunts. With `observed-field-dialogue-v1` off, instruction memory keeps only episodes containing a story character's printed name (`observed-instructions.ts:158`). The line was gone by turn 149, and the run never finished the Mt. Pyre summit story.

ee2a's recorded flags were observed instructions and the cap on, field dialogue, milestone memory and the junk filter off, so the control-arm combination is what this changes.

## Evidence

Offline replay of ee2a through `packages/agent/dist` `ObservedInstructions`, with the cap, junk filter and field dialogue on. Replay by the coordinator; not rerun here.

- At turn 590 the block is 10,504 characters, against 6,579 today.
- It now keeps the turn-146 Mt. Pyre line, the Mt. Pyre old woman, the grunt's "cave in the cove" and the Sailor's Wailmer line.
- The junk filter already drops nurses, Surf prompts, trainer taunts and PokéNav registrations (43 episodes left out).

## Change

- `experiments/feature-configs/current.json`: field dialogue moves from `switches` to onInBoth, junk filter added to onInBoth, both true in `features`.
- `experiments/presets/current-control-24h-8k.json`: explicit true keys.
- `experiments/feature-configs/README.md`: note.
- Not changed: `rayquaza-lane.json`, `rayquaza-lane-8h.json` (the live v3 lane) and Astra presets, which are copied per launch outside the repo.

## Gates

Pending.

## Review

Pending.
