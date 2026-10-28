# Promote type-gap-team-v1 to control

The operator 2026-10-27 (relayed with the cited message): "seems like the type gap block should go on in both arms". Control-promotion change for type-gap-team-v1 only. The last-message copy is not built (a separate future switch, decision card pending). supplies-v1 and untalked-in-gym-v1 stay bundle-only.

Evidence (runs/probes/type-gap-team-20261027, GPU1 b10236, d41e/9e33 settings): held-out first results after a ROXANNE loss in four untouched Qwen runs (6abf t842, 82ad t440, 704c t449, 057c t590), 16 per arm per case. Plans to catch a type strong against ROCK: control 13/64, shipped block 40/64 (frozen scorer); post-hoc stricter scorer 21/64 vs 41/64; same direction in every case. Exploration on d41e t335: control 0/16, shipped block 6/16.

## Change

- [x] experiments/feature-configs/current.json: type-gap-team-v1 leaves `switches`, joins `onInBoth`, shared base `true` (as ff88c3a03 did for the report-recommended switches).
- [x] experiments/feature-configs/README.md: control-promotion note.
- [x] packages/agent/src/type-gap-registry.test.ts: pins the new placement.

## Fixed definitions whose hash changes (re-approval needed)

They use `featureRecipe: "current"`; every other definition under experiments/fixed/ keeps its hash. Hashes are against main 713bfa541 (after the gateway-current-turn-v1 pin, which also moved these four).

- `bundle-v-control-2h`: `3df4acd1f983662420ae88e7e17b6e2b7fad8a4082ce030ebedd52d9669769dd` → `816f792a222d4c619ecb8160d7588c4344b2a1e2f716ef99289cca217d2890ff`
- `bundle-v-control`: `54f42006ed068cc82fdaafe71bff7720b22ad63663f198defb0bcd9b83caaebc` → `76826447f1b5b41bc0ccc80a0079d2781a0857c70cd3ec302960e99cd10ac5bf`
- `glm53-flash-4h`: `b1cd99e026d6dcf009a3a8d36a48e6c5cf1d65136db0d831d7e34ed2250fb7fe` → `ab9cd7e3367a93237399b364d0a2d0913be3c23db49c372a374c96e36d4b68b9`
- `hyperqwen-control-3h`: `d9122bfb45a9c4590c97b16b5521e6e6de815b70395b68ca68df64662b0704cd` → `f11454f7ec25f717aee4ec770f866903d4d23185f8ef85591f3a8c1f48f25d0e`

Live run a702 runs from its pinned checkout and is not touched.

## Gates

At 248ce5d53 (CPU window 9:29 PM NY): `just test` exit 0 (agent 4643, viewer 2106, Python 4463 + 69, coverage floors, trainer cards 3/3 after `just trainer-card-art` built this fresh worktree's gitignored card art); `just lint` exit 0; schema fresh. Rebased cleanly onto main fd621a45d (branch diff unchanged: current.json, README, registry test, this worklog). Main's post-merge blocker, the live-human.test.ts 5 s timeout, passes alone on this tip (7/7); it is load timing, not this change.

## Reviews and rebases

- Round 1 (base fd621a45d): Claude LGTM, fallback LGTM, GPT BLOCKING on process only (probe evidence path; exact-head gates). Fixed with an evidence index (absolute paths, SHA-256) and exact-head gates.
- Round 2 (base bb32b94c4, head 4d2509af9, packet 86daa633…, byte-identical change): Claude LGTM, fallback LGTM, GPT LGTM after the exact-head gate receipts (`just test` exit 0, `just lint` exit 0 at 4d2509af9).
- At the land turn main had moved to d641b8dc9 (no-story-foreknowledge-v1 pin, which also edits current.json); slot released. Rebased: one conflict at the end of `onInBoth`, resolved keeping main's no-story-foreknowledge-v1 and adding type-gap-team-v1 after it. The change is still only type-gap-team-v1 moving to onInBoth (base true); needs new gates and a review round at the new head.
- Round 4 (base d641b8dc9, head 2c709683c): Claude LGTM, fallback LGTM, GPT LGTM (round4b, with exact-head gates: `just test` exit 0, agent 4663, viewer 2154, Python 4463 + 69, trainer cards 3/3; `just lint` exit 0).
- Main then moved to 713bfa541 (gateway-current-turn-v1 pin, which also appends to `onInBoth` and `features` in current.json). Rebased: the same one-line conflict at the end of `onInBoth`, resolved keeping gateway-current-turn-v1 and adding type-gap-team-v1 after it. Change unchanged in substance; needs gates and a review round at the new head.
- Round 5 (base 713bfa541, head f4b2257ea, packet 9fc93071e8a1575ba6bcf35906d7acbb4f01ca74bf7db781530bb7a6776e0819): Sonnet fallback LGTM; Claude BLOCKING only on missing exact-head gate receipts, then LGTM after them; GPT LGTM. Gates at f4b2257ea (CPU window 11:18 PM NY): `just test` exit 0 (agent 4685, viewer 2157, Python 4466 + 89, coverage floors, trainer cards 3/3), `just lint` exit 0. The gate summary above for 248ce5d53 is superseded by these.

## Landing

- LANDED 11:23 PM NY: `git merge --ff-only claude/type-gap-control` moved main from 713bfa541 to f4b2257ea92bb464ef0420bc074401544c3fa049, the reviewed head. Post-landing `just test` on main exit 0 in the same CPU window.
- Re-approval needed for the four definitions above, at the hashes listed.
