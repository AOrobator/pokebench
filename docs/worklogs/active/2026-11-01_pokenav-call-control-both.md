# PokéNav call auto-advance on in both arms

**Started:** 2026-11-01
**Status:** Source edits in progress
**Branch:** `cursor/pokenav-call-control-both`

Operator 2026-11-01: "control should have that switch." Promote `pokenav-call-auto-advance-v1` from current-bundle-only (`switches`) to `onInBoth`. Registered default stays OFF; historical frozen definitions and already-running runs keep their recorded settings. Future `featureRecipe: current` launches get ON in control and bundle. No measured benefit claim; no gameplay behavior change beyond arm activation.

## Skills Loaded
- feature-switch (activation only; no new switch)
- feature-explainer (status copy)

## Milestones

**M1 — Promote in current recipe**
- [x] Update `experiments/feature-configs/current.json`: remove from `switches`, add to `onInBoth`, set shared `features` true
- [x] Update registry description, explainer lead, README promotion note, and the viewer recipe pin that asserted bundle-only
- [x] Focused viewer recipe test GREEN (`pokenav-correctness-bundle.test.ts` 8/8)
- [ ] COMMIT when operator asks

## Closing the Loop
- Future control launch materializes ON; live DeepSeek control4h stays OFF until relaunched from the new pin.
- Viewer Harness Config for a new control run shows the card ON.

## Session Log
- Confirmed DeepSeek `control4h` recorded `pokenav-call-auto-advance-v1: false` under the old bundle-only recipe.
- Source ready on `cursor/pokenav-call-control-both` in `/private/tmp/pokebench-pokenav-call-control-both`. Not committed.
