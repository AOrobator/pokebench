# Petalburg scripted-place guidance and trigger-loop detection

Branch `codex/petalburg-gym-trigger-loop`, base main `d4eff8de`. Local only. The operator asked on 2026-10-18 to put two harness fixes into the main bundle and rerun the two ten-minute Petalburg checkpoint probes: record the forced Gym introduction as the current place goal, and detect repeated coordinate-trigger scripts before the five-minute milestone-drought supervisor.

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
2. `trigger-script-loop-v1`: extend the existing `LoopDetector` owner to recognize the same condition-matching coordinate-trigger script completing repeatedly without native progress, even when the action or ending tile varies. On the second recurrence, record the existing typed `loop_guard` event as a `cycle` with bounded evidence and deliver a source-grounded recovery message before the next model decision. Reset on native progress, condition change or a different trigger/script. OFF preserves the current detector exactly.

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

- [ ] Implement and register both default-OFF switches, production wiring and OFF/ON tests.
- [ ] Reuse the existing typed loop-guard event and visible consumers; prove model delivery.
- [ ] Add both explainers, pending experiment entries and readiness rows.
- [ ] Perform deletion/restoration checks and full gates.
- [ ] Commit GREEN.

### M3 - Review and land

- [ ] Sync current main, rerun gates, freeze the packet and hold other landings.
- [ ] Complete principles self-review and the Claude, Grok and GPT cloud-family review lanes on one frozen packet.
- [ ] Fast-forward local main, run post-landing tests and restart/verify the 8790 viewer.

### M4 - Rerun

- [ ] Derive a fresh ten-minute two-lane preset from the landed main bundle with only these two switches added.
- [ ] Launch from the same qualified `PETALBURG_CITY` checkpoint, verify clean run-start receipts and raw-RAM capture.
- [ ] Report healing, trigger-loop count/intervention, Gym/Dad/Wally milestones, stop reason and checkpoints for both runs. Preserve the superseded probes.

## Readiness

READY (checkpoint): the shared `PETALBURG_CITY` save is pinned by SHA-1 and loaded successfully on current main in both superseded probes. Both reached the activation state immediately and completed the downstream Wally tutorial within ten minutes. These two authorized reruns are exploratory paired probes, not the eight-per-arm individual-switch screen and not promotion evidence.

## Session Log

- 2026-10-18 EDT: qualified both original probes, verified immediate healing, repeated native trigger scripts, delayed generic supervisor intervention, downstream Wally completion, per-milestone checkpoint files and raw-RAM archives.
- 2026-10-18 EDT: RED focused replay: 28 tests ran, 26 passed and the two intended assertions failed. The exact Gym page remained `null`; the second shared-condition trigger execution emitted no `trigger_script` notice. OFF and negative cases stayed green.

## Multi-Model Review Log

Pending.

## Principles Adherence

Pending final frozen tip.

## Archive Milestone

- [ ] ASK USER
