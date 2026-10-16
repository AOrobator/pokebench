# Trainer heal guidance and low-HP rival warning

## Problem Statement

Round 2 bundle run `runs/2026-10-16T04-51-03_qwen36-gpu0_54a7`: on turn 363 Torchic had 3/21 HP. The readout's battle-triage line said "below half" on every field turn from T362 to T368, and the model wrote "Torchic has 3/21 HP, which is below half. I need to find May." It talked to MAY on Route 103 (T369, 5:27 AM EDT), fainted on the first Tackle (T371), blacked out to Littleroot (₽3000 → ₽1500), dropped the rival goal and looped at the Oldale Maniac (110+ turns and counting). The Oldale POKéMON CENTER was about 27 tiles away. Options page: `runs/reports/may-whiteout-options/index.html`.

Operator decision (the operator, 2026-10-16 5:43 AM EDT): "Let's do both A and B. And then put them in the bundle. And then you have my standing approval to merge. Once you have code review. And things are approved."

Coordinator process: the readiness thread adds the switches to `experiments/fixed/bundle-v-control.json` (this branch does not edit it); merges touching the switch registry are serialized (ask the coordinator for a slot); `loop-supervisor.ts` is being changed by another thread, so B does not touch it.

## Skills Loaded

feature-switch, feature-explainer, execute-worklog, agent-observability, pokebench-game-state (rival object and blackout facts), experiment-queue (pending entries).

## Architecture

Two default-OFF agent-side switches. OFF reproduces today byte for byte.

| Switch | Group | Side | Needs | ON |
|---|---|---|---|---|
| `trainer-heal-guidance-v1` (A) | guidance | agent (system prompt) | none | One prompt section: trainer and rival battles cannot be fled; a blackout costs half your money and sends you back to the last POKéMON CENTER you visited or home; your rival usually battles you when you talk; heal before talking to a trainer or the rival when below half HP. |
| `low-hp-trainer-warning-v1` (B) | guard | agent (game-tool result) | none | When a game tool's resulting state shows the field (overworld, not in battle), the player's lead Pokémon below half HP, the map ROUTE 103 with the Route 103 rival battle not won and the rival's object (RIVAL_MAY_* / RIVAL_BRENDAN_*) loaded on the map, the result gains one SUPERVISOR paragraph naming the HP, the rival and tile, the no-running rule, the blackout cost (half of the current money), and where healing happens; healing items in the bag are named when present. Fires once, re-arms when the lead is back to at least half HP, the player leaves the map or the battle is won. Recorded as a `low_hp_trainer_warning` event shown in Activity History (SUPERVISOR chip); no timeline mark. |

Game grounding (pret/pokeemerald 731ad5bf): Route 103 rival script `data/maps/Route103/scripts.inc` (talk → `trainerbattle_no_intro`, sets FLAG_DEFEATED_RIVAL_ROUTE103, our `story.rival_battle_won`); whiteout `DoWhiteOut` halves money and warps to the last heal location (`SetWarpDestinationToLastHealLocation`), which is home until a POKéMON CENTER sets it. Recorded run 54a7: ₽3000 → ₽1500, woke in BRENDANS HOUSE 2F.

## Invariants

- INV-1 OFF is byte-identical: system prompt, tool list, tool results.
- INV-2 B fires only from game state in the tool result (no timers, sleeps or polling).
- INV-3 B's paragraph is true when shown: every number comes from that state.
- INV-4 No model-facing text truncated.
- INV-5 No timeline additions (operator decision 2026-10-16).

## Milestones

**M1 — trainer-heal-guidance-v1 (A)**
- [x] RED: registry/presets/defaults, OFF prompt byte-identical (54a7 run_start), ON appends exactly the section after battle triage, factory path. 6/6 fail: unknown feature.
- [x] COMMIT RED: `test(RED): trainer-heal-guidance-v1 ...` (sha in git log; this line written before the commit)
- [x] GREEN + registry count updates (positional `.at(-N)`, preset lists, guidance count 33, switchboard rows 71). vitest agent 1561 passed, viewer 885 passed; pytest 2236 passed, 34 skipped (ROM unset in bare uv run; full gate later with .env).
- [x] COMMIT GREEN: `feat: trainer-heal-guidance-v1 ...` (sha in git log)

**M2 — low-hp-trainer-warning-v1 (B)**
- [ ] RED: wrapper fires on 54a7-shaped state (T363), not when HP ≥ half, not off Route 103, not after rival won, not in battle, not twice, re-arms after heal / map change; bag items; recorded event; viewer Activity History row and SUP chip, no timeline mark; factory path through playGameTools
- [ ] COMMIT RED
- [ ] GREEN, schema regenerated
- [ ] COMMIT GREEN; deletion receipts

**M3 — explainers, pending experiments, review, land**
- [ ] Explainers `docs/explainers/<id>.html` + FEATURE_EXPLAINERS + README
- [ ] `experiments/<id>.json` pending entries + readiness.md
- [ ] Gates on main-merged tip: test, lint, build, coverage ≥90, verify-vendor
- [ ] Cloud review lanes: Claude (subagent), Grok (Cursor), GPT (Cursor/Codex) all LGTM on one frozen packet
- [ ] Merge slot from coordinator, `git merge --ff-only`, `just test` on main, report SHA

## Multi-Model Review Log

(none yet)
