# Battle effective damage readout

Branch `codex/battle-effective-damage`, based on main `24232e63`. Local isolated worktree only. The operator asked on 2026-10-19 for a default-off harness switch that presents each available move's deterministic effective damage against each legal current target, including double battles, and for that switch to be added to `bundle-v-control`. Active gameplay runs must not be disturbed.

## Problem Statement

The GPU1 frontier run repeatedly chose SCRATCH where EMBER's same listed base power receives FIRE STAB and, against BUG targets such as WURMPLE, super-effective type damage. The current battle readout exposes power, type, stats and targets separately, leaving the model to reproduce Emerald's integer damage pipeline. This is an observation defect, not authority for the harness to rank or choose a move.

## Source Grounding

- Reference checkout `/Users/user/dev/pokeemerald` at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`.
- `src/pokemon.c:CalculateBaseDamage`, `src/battle_script_commands.c:Cmd_damagecalc`, `Cmd_typecalc` and `ApplyRandomDmgMultiplier` define the Gen III integer pipeline, STAB/type modulation and the 85-100 normal-hit rolls.
- `include/battle.h` and `battle_controller_player.c` define selected, random, user, spread and side targets. Existing `battle-action.ts` already follows these target rules.
- Exact EWRAM symbols come from the matching pret symbols branch: `gSideStatuses` `0x0202428e`, `gBattleWeather` `0x020243cc`, and current battler state is already decoded by `battle_state.py`.

## Design

`battle-effective-damage-v1` is an observation switch depending on `battle-details-v2`, default OFF. At a player battle decision it appends one block per active player battler, preserving move-menu order. Damaging ordinary fixed-power moves show each legal target's non-critical 85-100 damage range, current HP percentage, normal-hit KO roll count, nominal accuracy, STAB and type effectiveness. Status moves say `no direct damage`. Double-battle selected moves list every legal selectable target; random targets are labeled game-selected; spread moves list every affected target and use Emerald's spread modifier. The harness never ranks moves or names a best move.

Moves whose final power/type or hit count depends on move-specific script state are explicitly `not deterministically computed`; the readout never substitutes base power as if it were final damage. The calculator includes current battle stats/stages, burn, screens, weather, spread, charge/sports, supported abilities, supported held-item effects and badge boosts. Effects that require an unmodeled future partner action or hidden dynamic script state remain unavailable with a reason.

## Invariants

- OFF reproduces the previous readout byte for byte.
- No button press, move selection, ranking, recommendation, milestone, score or event changes.
- Every displayed range is target-specific and derived from game-owned RAM/ROM facts.
- Damage means a landed, non-critical normal hit across Emerald's sixteen random rolls; accuracy remains separate.
- Absent or fainted battlers are never offered as targets.
- Unsupported cases are named, never guessed.
- The experiment entry remains pending and unapproved; no run is launched from this side conversation.

## Milestones

### M1 - RED

- [x] Record GPU1's SCRATCH-over-EMBER decision evidence.
- [x] Add failing source-formula, target-matrix, switch OFF/ON, registry and bundle tests.
- [ ] Commit RED tests and evidence.

### M2 - GREEN

- [ ] Implement the calculator, readout switch and production wiring.
- [ ] Add the switch to `bundle-v-control` and keep all other bundle bytes stable.
- [ ] Add feature explainer, pending experiment registration and design overview.
- [ ] Focused tests, deletion/restoration proof and full gates.

### M3 - Review and land

- [ ] Sync current main without touching active runs.
- [ ] Freeze and complete required review lanes; repair blocking findings within the review cap.
- [ ] Land only after reviews and gates; do not restart the viewer or launch an experiment here.

## Session Log

- 2026-10-19 EDT: created isolated managed worktree; app attachment registration failed with `thread not found`, so work continues at the returned managed path without creating a second worktree. Main was clean at `24232e63`.
- 2026-10-19 EDT: source review confirmed the existing battle state already carries level, HP, current battle stats, stages, types, ability, held item, moves, absent flags and controller-owned player inputs. Verified source-only context needed by the calculator: screens, battle weather and move target semantics.
- 2026-10-19 EDT: failure evidence from immutable run `2026-10-19T00-04-00_qwen36-gpu1_petalburg-rerun-a`: turns 108-111 explicitly selected SCRATCH four times against Bug Catcher Lyle's WURMPLE while the same readout showed EMBER. At state sequence 3215 the game-owned facts were Lv10 TORCHIC Atk 16 / SpA 19, FIRE, versus Lv3 WURMPLE Def 7 / SpD 5, BUG, HP 15/15. The RED contract computes SCRATCH 10-12 and EMBER 51-60 before Blaze, without ranking either move.
- 2026-10-19 EDT: Python RED failed during collection because `pokebench_env.battle_damage` does not exist. The TypeScript RED could not execute in the new worktree because dependencies were not yet linked (`vitest: command not found`); its registry, fixed-bundle and tracked-doc assertions are committed before implementation.

## Multi-Model Review Log

Pending.

## Principles Adherence

Pending implementation and frozen review.

## Archive Milestone

- [ ] ASK USER
