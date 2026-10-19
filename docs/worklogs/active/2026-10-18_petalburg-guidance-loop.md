# Petalburg scripted-place guidance and trigger-loop detection

Branch `codex/petalburg-gym-trigger-loop`, rebased base main `6b4aaa71`. Local only. The operator asked on 2026-10-18 to put two harness fixes into the main bundle and rerun two 45-minute Petalburg checkpoint continuations: record the forced Gym introduction as the current place goal, and detect repeated coordinate-trigger scripts before the five-minute milestone-drought supervisor.

## Problem Statement

Runs `2026-10-18T22-22-00_qwen36-gpu1_petalburg-heal-probe-a` and `2026-10-18T22-22-00_qwen36-gpu0_petalburg-heal-probe-b` restored the same `PETALBURG_CITY` checkpoint with Torchic at 3/30 HP. Both healed immediately, then repeatedly crossed the active `VAR_PETALBURG_CITY_STATE == 0` coordinate triggers at x=8. The native `PetalburgCity_EventScript_ShowGymToPlayer` moved the player to the Gym and showed `See? This is PETALBURG CITY's GYM.` plus `This is the GYM's sign. Look for it whenever you're looking for a GYM.` The harness kept saying no story character had named a place. Probe A replayed the script on turns 14, 17, 22, 32, 38 and 45; probe B on turns 13, 17, 22, 26, 30, 34, 38 and 43. The existing generic supervisor first intervened only at the five-minute drought. Both later completed `DAD_FIRST_MEETING` and `WALLY_TUTORIAL_COMPLETE`, so this is a harness bug and efficiency/reliability defect, not proof the checkpoint lacks enough game state.

## Skills Loaded

pokebench-game-state, agent-observability, feature-switch, feature-explainer, experiment-queue, pokebench-patch-evaluation, close-the-loop, execute-worklog, multi-model-review.

## Source Grounding

- Reference checkout `/Users/user/dev/pokeemerald` at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`, clean.
- `data/maps/PetalburgCity/scripts.inc`: `PetalburgCity_EventScript_ShowGymToPlayer0..3` call `PetalburgCity_EventScript_ShowGymToPlayer`, which shows `PetalburgCity_Text_AreYouRookieTrainer`, leads the player to the Gym, then shows `PetalburgCity_Text_ThisIsPetalburgGym` and `PetalburgCity_Text_ThisIsGymSign`.
- `data/maps/PetalburgCity/map.json` binds the four x=8 triggers to `VAR_PETALBURG_CITY_STATE == 0`; `include/constants/vars.h` defines that variable as `0x4057`.

## Design

Two independent default-OFF switches, both enabled only in the rerun bundle:

1. `scripted-place-guidance-v1`: admit the exact source-proven forced Petalburg Gym guidance page into the existing `StoryDestinations` owner. Preserve the game's displayed sentence and resolve `PETALBURG CITY's GYM` to the map-table Gym door. Do not admit arbitrary unnamed NPC dialogue, signs, battle text or generic place mentions. OFF preserves the existing story-character-only destination stream.
2. `trigger-script-loop-v1`: extend the existing `LoopDetector` owner to recognize the same condition-matching coordinate-trigger script completing repeatedly without native progress, even when the action or ending tile varies. On the second recurrence, record the existing typed `loop_guard` event as `trigger_script` with bounded evidence and deliver a source-grounded recovery message before the next model decision. Reset on native progress, condition change or a different trigger/script. OFF preserves the current detector exactly.

No automatic movement, hidden walkthrough, new timeline mark, milestone change or grading change. Activity History and raw-event inspection reuse the existing `loop_guard` consumer.

## Invariants

- OFF for either switch is byte-for-byte current behavior at its production seam.
- The Gym goal quotes the game exactly and resolves only the source-proven Petalburg script; arbitrary unnamed dialogue never becomes a goal.
- Trigger identity is native and stable: map, condition variable/value and repeated dialogue. The four source-defined row wrappers may have different script pointers, so the pointer is retained as evidence but does not split one gate. Mere backtracking or a different condition/dialogue does not warn.
- The first trigger execution is ordinary play; the second same unresolved execution warns. Native story progress and a changed trigger condition clear the count.
- The warning records the relevant event sequences, reaches the model before its next decision, and appears through the existing Activity History/raw-event path without adding a timeline mark.
- Historical runs remain immutable. The rerun uses one clean merged main build, the same checkpoint SHA, endpoints, limits and all other switches as the superseded probes.

## Milestones

### M1 - RED

- [x] Reproduce the exact Gym guidance rejection at the production story-goal seam.
- [x] Reproduce the six/eight-fire pattern at the production loop-detector seam and show no early warning today.
- [x] Commit RED tests and evidence.

### M2 - GREEN

- [x] Implement and register both default-OFF switches, production wiring and OFF/ON tests.
- [x] Reuse the existing typed loop-guard event and visible consumers; prove model delivery.
- [x] Add both explainers, pending experiment entries and readiness rows.
- [x] Perform focused RED/GREEN, deletion/restoration coverage and full gates.
- [x] Commit GREEN.

### M3 - Review and land

- [ ] Sync current main, rerun gates, freeze the packet and hold other landings.
- [ ] Complete principles self-review and the Claude, Grok and GPT cloud-family review lanes on one frozen packet.
- [ ] Fast-forward local main, run post-landing tests and restart/verify the 8790 viewer.

### M4 - Rerun

- [ ] Derive a fresh 45-minute two-lane preset from the landed main bundle with the two fixes enabled.
- [ ] Launch from the same qualified `PETALBURG_CITY` checkpoint, verify clean run-start receipts and raw-RAM capture.
- [ ] Report healing, trigger-loop count/intervention, Gym/Dad/Wally milestones, stop reason and checkpoints for both runs. Preserve the superseded probes.

## Readiness

READY (checkpoint): the shared `PETALBURG_CITY` save is pinned by SHA-1 and loaded successfully on current main in both superseded probes. Both reached the activation state immediately and completed the downstream Wally tutorial within ten minutes. These two authorized reruns are exploratory paired probes, not the eight-per-arm individual-switch screen and not promotion evidence.

## Session Log

- 2026-10-18 EDT: qualified both original probes, verified immediate healing, repeated native trigger scripts, delayed generic supervisor intervention, downstream Wally completion, per-milestone checkpoint files and raw-RAM archives.
- 2026-10-18 EDT: RED focused replay: 28 tests ran, 26 passed and the two intended assertions failed. The exact Gym page remained `null`; the second shared-condition trigger execution emitted no `trigger_script` notice. OFF and negative cases stayed green.
- 2026-10-18 EDT: GREEN gates: agent 160 files / 2,516 tests; viewer 84 files / 1,183 tests; Python 2,480 passed / 229 ROM-dependent skipped; TypeScript, ESLint, builds, schema, 114 experiment definitions, both self-contained explainer checks and vendor verification passed. ROM verification was unavailable in this worktree because `POKEBENCH_ROM` was not exported; the same local ROM is required at launch.
- 2026-10-18 EDT: first frozen review was BLOCKING. Independent reproductions showed the real probe pages identify the speaker as `BOY_2`/`faced_sprite`, repeated observations of one open script could be counted as separate executions, a live condition change did not retire old recurrence history, and recovery/supervisor evidence could exceed the event schema's two-item limit. The repair now accepts the actual page attribution, requires a physical entry from an unlocked starting state, clears matching history on condition change, bounds every notice to two evidence IDs, validates notices through the production event schema, and adds focused regressions.

## Multi-Model Review Log

First packet `6b4aaa71..6a923c62`, SHA-256 `e4bf1df761af3c02f4f816ba5bf72c054b2098cc3d7c0a7af043a040f7e1fe44`: Claude CLI authentication was unavailable and Cursor Claude exhausted its account quota. The approved two-reviewer availability fallback (Sol and Astra) both returned `VERDICT: BLOCKING` with the reproduced defects recorded above. Grok and GPT Cursor attempts on that packet were discarded after the tree changed; GPT Cursor was also quota-blocked. A new frozen packet and full review are required after the repairs.

## Principles Adherence

PB1 PASS; PB2 N/A; PB3 PASS; PB4 PASS; PB5 PASS; PB6 N/A; PB7 PASS after schema-valid bounded evidence repair; PB8 PASS after physical-entry and condition-reset repair; PB9 PASS; PB10 PASS; PB11 PASS; PB12 N/A; PB13 PASS pending final frozen review and landing.

## Archive Milestone

- [ ] ASK USER
