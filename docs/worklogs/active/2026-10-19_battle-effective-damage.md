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
- [x] Commit RED tests and evidence (`489e24a2`).

### M2 - GREEN

- [x] Implement the calculator, readout switch and production wiring.
- [x] Add the switch to `bundle-v-control` and keep all other bundle bytes stable.
- [x] Add feature explainer, pending experiment registration and design overview.
- [x] Focused tests and full gates.

### M3 - Review and land

- [x] Sync current main without touching active runs.
- [ ] Complete the required Claude-, Grok-, and GPT-family cloud review lanes on one frozen packet; repair any blocking findings within the review cap.
- [ ] Fast-forward the corrective tip to local main, run the required post-merge test and live viewer check, and do not launch the pending experiment.

## Session Log

- 2026-10-19 EDT: created isolated managed worktree; app attachment registration failed with `thread not found`, so work continues at the returned managed path without creating a second worktree. Main was clean at `24232e63`.
- 2026-10-19 EDT: source review confirmed the existing battle state already carries level, HP, current battle stats, stages, types, ability, held item, moves, absent flags and controller-owned player inputs. Verified source-only context needed by the calculator: screens, battle weather and move target semantics.
- 2026-10-19 EDT: failure evidence from immutable run `2026-10-19T00-04-00_qwen36-gpu1_petalburg-rerun-a`: turns 108-111 explicitly selected SCRATCH four times against Bug Catcher Lyle's WURMPLE while the same readout showed EMBER. At state sequence 3215 the game-owned facts were Lv10 TORCHIC Atk 16 / SpA 19, FIRE, versus Lv3 WURMPLE Def 7 / SpD 5, BUG, HP 15/15. The RED contract computes SCRATCH 10-12 and EMBER 51-60 before Blaze, without ranking either move.
- 2026-10-19 EDT: Python RED failed during collection because `pokebench_env.battle_damage` does not exist. The TypeScript RED could not execute in the new worktree because dependencies were not yet linked (`vitest: command not found`); its registry, fixed-bundle and tracked-doc assertions are committed before implementation.
- 2026-10-19 EDT: implemented `battle-effective-damage-v1` as a default-off observation switch depending on `battle-details-v2`. It emits landed non-critical 85-100 damage rolls, HP percentages, normal-hit KO-roll counts, accuracy, STAB, type effectiveness and applied modifiers in move-menu order, without ranking. Double battles emit a nominal target matrix; Follow Me and turn-order Lightning Rod redirection remain explicitly outside the decoded state.
- 2026-10-19 EDT: added the switch to the fixed bundle treatment arm, left its fixed-bundle base and all historical/default presets OFF, added the feature explainer and design overview, and registered `battle-effective-damage` as pending and blocked. The experiment has no queue position or approval and cannot become ready until a landed commit/current-main build, exact checkpoint path and hash, useful-lift threshold and operator-approved budget are supplied.
- 2026-10-19 EDT: full validation passed: agent 2,529 tests; viewer 1,190 tests; Python 2,488 passed with 229 existing ROM-dependent skips; TypeScript/Python lint and strict typing; both builds; experiment registry (`118 experiments`); vendor integrity; and `git diff --check`. No viewer, run, queue or canonical checkout was touched.
- 2026-10-19 EDT: operator-requested self-review found four correctness gaps before landing: dual-type multipliers were collapsed instead of applied sequentially, Substitute could produce false real-HP KO claims, frozen Flash Fire targets were treated as immune, and 0-PP moves were still assigned damage without exposing automatic Struggle. Repaired all four with source-grounded regression tests. The review also tightened source parity for recorded-link badge suppression and Gen III's field-wide Plus/Minus, weather-negation, sport, Damp and alive-side-count behavior. PP availability is now exact; Disable, Encore, Taunt, Torment, Imprison and Choice-lock state remain explicitly undecoded.
- 2026-10-19 EDT: post-repair gates passed: agent 2,529 tests; viewer 1,190 tests; Python 2,492 passed with 229 existing ROM-dependent skips; lint and strict typing; builds; experiment registry (`118 experiments`); vendor integrity; both HTML pages; and `git diff --check`.
- 2026-10-19 EDT: synced current main `a7be38f6` into the branch as `cd596604`. The synced gates passed after one unrelated viewer coverage timeout passed on retry: agent 2,529 tests at 97.99% statements / 94.15% branches / 98.32% functions / 99.25% lines; viewer 1,196 tests at 95.43% / 91.49% / 93.88% / 97.65%; Python 2,492 passed with 229 ROM-dependent skips at 96.96% lines / 92.48% branches / 99.44% functions; lint, build, registry, vendor, page and diff checks passed.
- 2026-10-19 EDT: local main was fast-forwarded to `cd596604` before the repository's independent cloud review gate completed. The required post-merge test first exposed stale TypeScript build output, then after rebuilding exposed a real ROM-fixture integration gap: archives created before `battle-effective-damage-v1` did not list the new default-off switch, so their bounded RAM readers rejected the new reads. Added the switch to every affected historical fixture's later-switch set; the ROM-enabled focused regression is 347/347 green. Main therefore remains an incomplete landing until the corrective tip passes the required cloud lanes and is fast-forwarded.
- 2026-10-19 EDT: the operator assigned this session ownership to get the complete candidate reviewed and landed. The review boundary is the synced base `a7be38f6` through the corrective topic tip; the existing live probe processes remain out of scope and undisturbed.
- 2026-10-19 EDT: the commit hook normalized one long set literal in the archived-readout regression after the review-gate correction commit; recorded the formatter-only change before sealing the candidate.
- 2026-10-19 EDT: responsive browser QA at 1280, 1440 and 375 px found the experiment's long primary milestone escaping its phone-width fact card. Added local overflow wrapping; the feature explainer and experiment overview otherwise rendered cleanly with no external requests.

## Multi-Model Review Log

Operator-requested self-review round 1: CHANGES REQUIRED (four findings above). All four were repaired and covered by regressions. Self-review round 2: PASS for the reviewed source paths and fixed-bundle wiring; no remaining blocking self-review finding. This was not the repository's independent multi-model review gate. The required Claude-, Grok-, and GPT-family cloud lanes remain pending for the frozen corrective candidate.

## Principles Adherence

- PB1 PASS: facts come from pinned pret source and decoded game state; no policy or move ranking is embedded.
- PB2 N/A: no run was launched.
- PB3 PASS: the experiment remains pending, blocked and explicitly non-causal until measured.
- PB4 PASS: switch, dependency, explainer and design page are registered.
- PB5 PASS: the behavior is isolated behind one default-off switch; OFF preserves the prior text and memory-read boundary.
- PB6 PASS for implementation: output is decision-bound and bounded by four moves and live targets; GPU-hour value remains an experimental question.
- PB7 PASS: only immutable recorded run evidence was read; no live run was changed.
- PB8 N/A: there are no results to report.
- PB9 PASS: dynamic/script-derived damage, unsupported held-item facts and nominal double-target limitations are surfaced rather than guessed.
- PB10 PASS: no tests were suppressed; 229 ROM-dependent skips are pre-existing and reported.
- PB11 PASS: mechanics are pinned to pret/pokeemerald `731ad5bf`.
- PB12 PASS: no ROM or protected path was accessed.
- PB13 PENDING: implementation gates and the operator-requested self-review pass; the independent cloud review and corrective landing remain open.

## Archive Milestone

- [ ] ASK USER
