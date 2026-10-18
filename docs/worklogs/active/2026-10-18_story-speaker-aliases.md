# Story speaker aliases for destinations

## Problem Statement

The game prints Norman's Petalburg Gym instruction with the speaker prefix `DAD`, while `story-destinations-v1` admits only canonical story-character names and knows him as `NORMAN`. The conversation ledger therefore preserves the line, but destination selection rejects it before resolving `RUSTBORO CITY`. This is a harness identity bug, separate from stale-goal retirement or conversation retention.

## Skills Loaded

pokebench-game-state, feature-switch, feature-explainer, experiment-queue.

## Source Grounding

- Reference checkout: `/Users/user/dev/pokeemerald` at `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` (clean).
- `data/maps/PetalburgCity_Gym/scripts.inc`, `PetalburgCity_Gym_Text_DadGoCollectBadges`: `DAD: Now...` followed by `Head for RUSTBORO CITY beyond this town.`
- Every game string whose printed prefix begins `DAD:` refers to the player's father, Norman. Wally's father is a distinct object identity and is never emitted as this speaker prefix.

## Design

Resolve game-printed speaker labels to canonical story identities at the story-character eligibility boundary. Preserve the printed label and dialogue text in model-facing quotes. Begin with the source-proven alias `DAD -> NORMAN`; do not add fuzzy, generic or model-inferred kinship aliases.

The correction remains inside the existing default-off `story-destinations-v1` switch. OFF is unchanged. The feature's existing pending experiment remains the comparison owner; its explainer and notes will describe the corrected behavior.

## Invariants

- `DAD:` is eligible wherever `NORMAN` is eligible, but the displayed speaker remains `DAD`.
- Generic mentions of dad, Wally's father, faced targets and arbitrary non-story prefixes do not become Norman.
- Destination retention and stale-goal retirement are unchanged.
- With `story-destinations-v1` OFF, tool identity and bytes remain unchanged.

## Milestones

### M1 - Focused regression and identity boundary

- [x] RED: Norman's exact `DAD:` Rustboro instruction is rejected by the current destination selector.
- [x] GREEN: canonicalize only source-proven speaker aliases for eligibility while preserving printed output.
- [x] Update the existing feature explainer and pending experiment notes.
- [ ] Run focused tests, full gates, and multi-model review.

## Session Log

- 2026-10-18: Confirmed the feedback against production code and the pinned pret/pokeemerald source. Created isolated branch `codex/story-speaker-aliases` from main `1502cfbb`.
- 2026-10-18: RED adds the exact `DAD:` Rustboro instruction plus negative cases for a faced sprite and `WALLYS DAD`; current code returns no destination block.
- 2026-10-18: GREEN adds the exact source-proven alias `DAD -> NORMAN` at the shared story-character identity boundary. Destination output still quotes `DAD`; aliases apply only to game-printed name prefixes.
- 2026-10-18: Updated the existing story-destinations explainer and pending experiment notes; no new switch or experiment was created because OFF remains unchanged and the correction is inside the already default-off candidate.
- 2026-10-18: Replaced the combined synthetic instruction with the three-page shape recorded in live run `2026-10-18T07-32-23_qwen36-gpu1_4865`, `dialogue_auto_advance` seq 14855. The decisive page is speaker `DAD`, source `name_prefix`, text `Head for RUSTBORO CITY beyond this town.` Added direct exact-alias tests.
- 2026-10-18: Gates on GREEN `2da53ea7` before the evidence-only test refinement: `just test` agent 2426, viewer 1152, Python 2478 (229 ROM-dependent skips); `just lint` clean after copying the existing local mGBA binding into the isolated environment; `just build` clean; `just coverage` agent 97.99/94.23/98.31/99.22, viewer 95.40/91.43/93.84/97.64, Python 97.48/93.42/99.43, floor 90; `just verify-vendor` clean; explainer and experiment checks clean.
- 2026-10-18: Final-tip gates on `f1e29445`: `just test` agent 2427, viewer 1152, Python 2478 (229 pre-existing ROM-dependent skips); `just lint`, `just build`, and `just verify-vendor` clean. `just coverage`: agent statements/branches/functions/lines 98.00/94.24/98.31/99.22; viewer 95.40/91.43/93.84/97.64; Python lines/branches/functions 97.48/93.42/99.43; all above the independent 90% floors. Focused alias suites 45/45; explainer check and 110 experiment definitions clean.

## Multi-Model Review Log

Pending.
