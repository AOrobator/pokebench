# Promote type-gap-team-v1 to control

The operator 2026-10-27 (relayed with the cited message): "seems like the type gap block should go on in both arms". Control-promotion change for type-gap-team-v1 only. The last-message copy is not built (a separate future switch, decision card pending). supplies-v1 and untalked-in-gym-v1 stay bundle-only.

Evidence (runs/probes/type-gap-team-20261027, GPU1 b10236, d41e/9e33 settings): held-out first results after a ROXANNE loss in four untouched Qwen runs (6abf t842, 82ad t440, 704c t449, 057c t590), 16 per arm per case. Plans to catch a type strong against ROCK: control 13/64, shipped block 40/64 (frozen scorer); post-hoc stricter scorer 21/64 vs 41/64; same direction in every case. Exploration on d41e t335: control 0/16, shipped block 6/16.

## Change

- [x] experiments/feature-configs/current.json: type-gap-team-v1 leaves `switches`, joins `onInBoth`, shared base `true` (as ff88c3a03 did for the report-recommended switches).
- [x] experiments/feature-configs/README.md: control-promotion note.
- [x] packages/agent/src/type-gap-registry.test.ts: pins the new placement.

## Fixed definitions whose hash changes (re-approval needed)

They use `featureRecipe: "current"`; every other definition under experiments/fixed/ keeps its hash. Hashes are against main d641b8dc9 (after the no-story-foreknowledge-v1 pin, which also moved these four).

- `bundle-v-control-2h`: `e0376bed8603637eae6e51d5ac77a52866a59b73fa1b47b8d7206dcee93445c5` → `d29d147be10dbd8b4df30c73ed8ee618c28cab0dce5f4a3d1c03519d17b1f00e`
- `bundle-v-control`: `33ae2aafebd1c3ecca18e9753f811c7309ada0ee3919708394ecd01717e5f55b` → `f4fbefb43df4bed4f0200cd8cf3c6d7d8eea82d41c24101ef0b631597b112493`
- `glm53-flash-4h`: `ce63c4f7de17d2c4bfce6f7a3efc8af254313dca26e92443c259d615b9af9893` → `4edb8f0cd88bc616c1e49aede00dade92b8cf74c7c829d5d5a52df231531b56a`
- `hyperqwen-control-3h`: `e046349acf0c63685acabd2ff742bdd5dec82a85399b5a6f953a5a32f07b5937` → `6cca17fbce273b26b1d9ead3fb34f03bcb0c8660070fdf8bb82c4cba871a24de`

Live run a702 runs from its pinned checkout and is not touched.

## Gates

At 248ce5d53 (CPU window 9:29 PM NY): `just test` exit 0 (agent 4643, viewer 2106, Python 4463 + 69, coverage floors, trainer cards 3/3 after `just trainer-card-art` built this fresh worktree's gitignored card art); `just lint` exit 0; schema fresh. Rebased cleanly onto main fd621a45d (branch diff unchanged: current.json, README, registry test, this worklog). Main's post-merge blocker, the live-human.test.ts 5 s timeout, passes alone on this tip (7/7); it is load timing, not this change.

## Reviews and rebases

- Round 1 (base fd621a45d): Claude LGTM, fallback LGTM, GPT BLOCKING on process only (probe evidence path; exact-head gates). Fixed with an evidence index (absolute paths, SHA-256) and exact-head gates.
- Round 2 (base bb32b94c4, head 4d2509af9, packet 86daa633…, byte-identical change): Claude LGTM, fallback LGTM, GPT LGTM after the exact-head gate receipts (`just test` exit 0, `just lint` exit 0 at 4d2509af9).
- At the land turn main had moved to d641b8dc9 (no-story-foreknowledge-v1 pin, which also edits current.json); slot released. Rebased: one conflict at the end of `onInBoth`, resolved keeping main's no-story-foreknowledge-v1 and adding type-gap-team-v1 after it. The change is still only type-gap-team-v1 moving to onInBoth (base true); needs new gates and a review round at the new head.
