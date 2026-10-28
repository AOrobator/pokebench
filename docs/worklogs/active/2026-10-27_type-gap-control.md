# Promote type-gap-team-v1 to control

The operator 2026-10-27 (relayed with the cited message): "seems like the type gap block should go on in both arms". Control-promotion change for type-gap-team-v1 only. The last-message copy is not built (a separate future switch, decision card pending). supplies-v1 and untalked-in-gym-v1 stay bundle-only.

Evidence (runs/probes/type-gap-team-20261027, GPU1 b10236, d41e/9e33 settings): held-out first results after a ROXANNE loss in four untouched Qwen runs (6abf t842, 82ad t440, 704c t449, 057c t590), 16 per arm per case. Plans to catch a type strong against ROCK: control 13/64, shipped block 40/64 (frozen scorer); post-hoc stricter scorer 21/64 vs 41/64; same direction in every case. Exploration on d41e t335: control 0/16, shipped block 6/16.

## Change

- [x] experiments/feature-configs/current.json: type-gap-team-v1 leaves `switches`, joins `onInBoth`, shared base `true` (as ff88c3a03 did for the report-recommended switches).
- [x] experiments/feature-configs/README.md: control-promotion note.
- [x] packages/agent/src/type-gap-registry.test.ts: pins the new placement.

## Fixed definitions whose hash changes (re-approval needed)

They use `featureRecipe: "current"`; every other definition under experiments/fixed/ keeps its hash.

- `bundle-v-control-2h`: `f939f403c8bb80ef6ccf9ddc348c8d1167cbc475d6d0c298f6164e07db498906` → `c4f745ef2338d680bcccb39161f4ae5fdf2af3c4e20cdf1def49354ffbe020bf`
- `bundle-v-control`: `6720e1fcdc16c1e4e5e67d8caad7fbb2b22c20128d126d7a623fea07aa36bf2b` → `3bd02b9afe7816fd24d886c032fba715362b987409293e702a584db9cc9c43a4`
- `glm53-flash-4h`: `87fe4cb976a9c93898cf20a63114a6eb9c6774c16b01d7645a07c7bc75a5131e` → `663dad47a588faabbe90066a1736bef57407445f2a570655c531df960d1ad9c4`
- `hyperqwen-control-3h`: `356847041a6d5ca3ccb4438270d29244dbee4c6d1727e140afb9585d7b266901` → `92b2231dd56320ed00cb45c2f87f8f5ed9d37edc4c3a7dc81fe941651921bd8d`

Live run a702 runs from its pinned checkout and is not touched.

## Gates

(pending a heavy-CPU window)
