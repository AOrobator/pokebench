# Shop/mart readouts on in both arms

**Started:** 2026-11-01
**Status:** In progress
**Branch:** `cursor/shop-mart-control-both`

Operator 2026-11-01: "promote both into control and land ur changes, reviews are waived." Promote `mart-stock-readout-v1` and `shop-interface-v1` from current-bundle-only (`switches`) to `onInBoth`. Registered defaults stay OFF; historical frozen definitions and already-running runs keep their recorded settings. Future `featureRecipe: current` launches get ON in control and bundle. No measured benefit claim. Reviews waived.

## Skills Loaded
- feature-switch (activation only; no new switch)
- feature-explainer (status copy)
- execute-worklog / talk-to-codex (landing)

## Milestones

**M1 — Promote in current recipe**
- [x] Update `experiments/feature-configs/current.json`: remove both from `switches`, add to `onInBoth`, set shared `features` true
- [x] Update registry descriptions, explainer leads, README notes, and viewer/agent recipe pins that asserted bundle-only
- [x] Focused viewer recipe tests GREEN (`shop-mart-control-both` 4/4; fixed-runner mart/shop/movement pins)
- [x] Focused agent pins GREEN (`mart-stock-readout`, `shop-interface`, `heal-first` control baseline)
- [x] COMMIT

## Gates
- Cheap: focused viewer + agent recipe pins; `git diff --check` clean
- Full before land: `just build`, `just lint`, `just test`, `just verify-vendor`

## Review
- Waived by operator 2026-11-01 ("reviews are waived")

## Closing the Loop
- Future control launch materializes both ON; live runs keep recorded OFF until relaunched.
- No `just viewer-main` required for this recipe-only activation (same as pokenav promotion).
