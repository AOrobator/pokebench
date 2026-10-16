# Pre-launch harness fixes for bundle-v-control

## Problem Statement

The bundle-v-control qualification runs on main `be38752` (cook phase, main-menu FAST-text save, 12-min cap) both stalled after PLAYER_HOUSE_EXITED_AFTER_CLOCK. Forensics found harness bugs on the exact CLOCK_SET → RIVAL_MET path the confirmatory phase measures (`runs/reviews/2026-10-16-qualification-forensics/control-2919.md`, `bundle-3f21.md`). Launching 248 trials (about 47 h on two GPUs) with them would measure the bugs, not the bundle. Operator decisions (the operator, 2026-10-16 12:20–12:40 AM EDT): fix them before launch; the loop guard and the MAYS HOUSE sign are confirmed; the control arm's press-result wording stays as the treatment `transition-press-result-v1` measures; the blocked-direction batch wording ships as a new bundle switch (`blocked-batch-result-v1`, separate branch `claude/blocked-batch-result`); exploration memory is a separate experiment.

## Skills Loaded

feature-switch, feature-explainer, pokebench-game-state, agent-observability, pokebench-trace-forensics (read-only evidence), fixed-run-launch, pokebench-experiment-design.

## Architecture

Every behavior change is a registered switch whose OFF state reproduces today. Fixes F1–F4 change what both arms see, so their switches are ON in both arms and listed in the definition as `onInBoth`; the control-base check (`controlBaseProblems`) accepts exactly those flags as differing from the finals incumbent and nothing else. F5–F8 change bundle-only behavior inside existing bundle switches before the treatment is frozen (no new switch where the change is a bug fix inside a default-off switch that has never run in a measured cohort; recorded here).

| Fix | Arms | Where | Switch |
|---|---|---|---|
| F1 Door/stairs/warp animation: never report a mid-animation snapshot as "Field controls: locked (dialog, menu, or script)" and never hide a completed warp | both | post-press / post-navigate settle, readout text | `transition-settle-v1` (design pending the harness engineer view, `runs/reviews/2026-10-16-qualification-forensics/harness-engineer-animation.md`) |
| F2 Loop guard sees door/stairs bounces: a transient lock must not clear the cycle history; map-to-map ping-pong counts as a cycle | both | `packages/agent/src/loop-detection.ts` `semanticState` (~l.118–140), history reset (~l.381) | `transition-loop-detection-v1` |
| F3 Name signs and warp destinations by the text the game shows for this save (Littleroot (12,8) reads "PROF. BIRCH'S HOUSE" for a male player, pokeemerald `data/maps/LittlerootTown/scripts.inc` 402–412) | both (named-interactions) + bundle (named-warp-destinations) | `env/pokebench_env/interaction-names.json` script-symbol names, warp destination names | `displayed-place-names-v1` |
| F4 Story dialogue stays in context: collapsed tool results keep every dialogue page whole (no model-facing truncation) | both | `packages/agent/src/harness.ts` `collapsed`/`summary` | `dialogue-context-kept-v1` |
| F5 Stall briefing and loop supervisor cite the last story instruction (MOM's "next door"), not only the 3 newest pages, and list untried warps across known maps | bundle (briefing); both (supervisor pages rule) | stall-briefing, loop-supervisor | inside `stall-briefing-v1`; supervisor part under F4's switch |
| F6 navigate_to/press results never say "a message is waiting, press B" after auto-advance closed it | bundle | navigation result text after auto-advance | inside `dialogue-auto-advance-v1` |
| F7 A reachable warp-door target gets its real reason (approach tile, blocker) instead of "no supported local path" | bundle message on a both-arm planner limit | `navigation.ts` `targetReason` (l.126) | inside `navigation-refusal-reasons-v1` |
| F8 Auto-advance never sends a queued button after a message has appeared | bundle | `dialogue-auto-advance.ts` | inside `dialogue-auto-advance-v1` |

## Invariants

- INV-1 OFF reproduces today, byte for byte, for every new switch (tests compare the OFF text with recorded results).
- INV-2 Both arms differ only in the bundle switches; `onInBoth` flags are identical in both arms and checked at every load.
- INV-3 No model-facing text is truncated; dialogue pages are kept whole.
- INV-4 Timing comes from game state per emulated frame; no sleeps (F1 settle).
- INV-5 Readouts are grounded in game state or source; unknown is reported as unknown, never guessed.

## Security Review

Local only. No new network, file or subprocess surface beyond existing argv-only calls. No RAM writes or save edits.

## Milestones

**M1 — F2 loop guard sees door bounces** (both arms)
- [ ] RED: replay-style unit tests: lab door bounce from 2919 (seq 3097–4239) produces a cycle notice; stairs bounce; a real script lock still yields no false cycle
- [ ] GREEN, gates, review

**M2 — F3 displayed place names** (both arms)
- [ ] RED: Littleroot sign (12,8) and warp (14,8) read "PROF. BIRCH'S HOUSE" for a male save and whatever the script's own gender branch prints for a female save; OFF keeps "Mays House Sign"
- [ ] GREEN, gates, review; real-ROM probe readout from the FAST CLOCK_SET save

**M3 — F4 dialogue kept in context** (both arms)
- [ ] RED: a collapsed result that contained MOM's T98 pages still carries them whole; non-dialogue results collapse as today
- [ ] GREEN, gates, review

**M4 — F1 animation snapshots** (both arms; design gated on the harness engineer view and the operator's pick)
- [ ] ASK USER: settle-until-idle vs explicit "animation in progress" notice
- [ ] RED/GREEN, real-ROM proof on the 2919 door cases

**M5 — F5–F8 bundle fixes**
- [ ] RED/GREEN per fix, gates, review

**M6 — Definition and control base**
- [ ] `onInBoth` in the fixed-run schema; `controlBaseProblems` accepts exactly those; definition lists F1–F4 switches and `blocked-batch-result-v1` joins `switches` (operator decision); re-plan with the recorded seed
- [ ] RED/GREEN, gates, review, merge with the operator's OK

**M7 — Qualification and review**
- [ ] Qualification: one trial per arm per lane, both phases (confirmatory 15 min from the FAST CLOCK_SET save; cook 12 min from the main-menu save)
- [ ] Forensics on the qualification runs: none of F1–F8 recurs
- [ ] Full four-persona PokeBench review of the final design
- [ ] ASK USER: approval and launch (fixed-run-launch skill)

## Closing the Loop

Done when every milestone is merged, qualification shows none of F1–F8, the four-persona review is in, and the operator approves the launch.

## Session Log

- 2026-10-16 12:45 AM EDT: Worklog drafted from the two forensics reports; awaiting operator approval. Estimate: about a day of work for M1–M6, then qualification and review.

## Surprises

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- [ ] ASK USER: archive
