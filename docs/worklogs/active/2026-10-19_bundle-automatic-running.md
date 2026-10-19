# Automatic running in the current bundle

## Operator decision

On 2026-10-19, the operator directed: turn `automatic-running-v1` on in the bundle and land the change on `main`.

This is an explicit bundle-composition decision, not a claim that the blocked standalone experiment established benefit. Standalone/default presets remain unchanged.

## Scope and invariants

- Add `automatic-running-v1` to the `bundle-v-control` bundle-only switch list.
- Keep `base.features["automatic-running-v1"]` false, so the control arm remains unchanged.
- Verify generated control and bundle presets differ on the switch: control false, bundle true.
- Do not alter the switch's runtime permission checks: automatic B is added only for ordinary directional travel when native running and controls are verified; `walking=true` still overrides it.
- Do not change any live run already in progress. New bundle presets generated after landing receive the setting.

## Verification

- [x] Focused fixed-design test proves control false and bundle true.
- [x] Branch-local definition parsing, control-base comparison, and arm generation pass (`control=false`, `bundle=true`, definition SHA-256 `dbe2112a…`). The `just fixed-run check` command intentionally resolves canonical `main`, so its output was not counted as candidate proof.
- [x] Full repository gates pass.
- [ ] Review completed and findings resolved.
- [ ] Landed on `main`; final commit recorded below.

## Session log

- 2026-10-19: Worktree branch created from clean `main` at `02abda0c`. Existing live Petalburg continuation receipts record `automatic-running-v1: false`; this change is intentionally prospective.
- 2026-10-19: RED: after the bundle definition changed, the arm-generation assertion still observed bundle `automatic-running-v1: false`; the full agent suite also caught the derived `open-goal-prompt` incumbent at false. GREEN: the fixed-design fixture now carries the promoted switch, the generated control/bundle presets assert false/true, and the pending open-goal incumbent follows the current bundle while still flipping only its own changed feature.
- 2026-10-19 gates: `just test` — agent 2527, viewer 1193, Python 2480 passed / 229 ROM-dependent skipped; `just lint` clean; `just build` clean; `just coverage` — agent 99.25% lines / 94.15% branches / 98.32% functions, viewer 97.65% / 91.50% / 93.85%, Python 97.47% / 93.37% / 99.43%; `just verify-vendor` clean at `bbab97ad…`. The first full coverage attempt hit the unchanged people-card whole-run rehearsal's 5 s timeout; its isolated coverage run passed all 8 tests, and one full rerun passed without code changes.

## Multi-model review log

- Round 1: pending on the frozen candidate packet.
