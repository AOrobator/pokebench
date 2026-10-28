# Promote type-gap-team-last-message-v1 to control

The operator 2026-10-28 8:58 AM NY (relayed by the coordinator): "yes type gap on in both arms". Control-promotion change for type-gap-team-last-message-v1 only, done like the type-gap-team-v1 promotion (docs/worklogs/active/2026-10-27_type-gap-control.md). type-gap-team-v1, which this switch needs, is already onInBoth (f4b2257ea). supplies-v1 and untalked-in-gym-v1 stay bundle-only.

Evidence (runs/probes/type-gap-team-20261027, held-out probe A, four runs × 16 samples): plans to catch a type strong against ROCK, control 13/64, block on the tool result 40/64, block also as the last message 55/64 (strict scorer 21, 41, 58).

## Change

- [x] experiments/feature-configs/current.json: type-gap-team-last-message-v1 leaves `switches`, joins `onInBoth` (after retire-reached-story-line-v1), shared base `true`.
- [x] experiments/feature-configs/README.md: control-promotion note.
- [x] packages/agent/src/type-gap-last-message.test.ts: the current.json test pins the new placement (onInBoth, base true, beside type-gap-team-v1, not in switches or offInBoth).
- [x] docs/explainers/type-gap-team-last-message-v1.html: "Bundle arm only, default off" → on in both arms, registered default off. `just pages-check` clean.
- The features.ts description is unchanged, as in the type-gap-team-v1 promotion: the registered default stays off.

## Targeted runs (no CPU window used)

- agent: type-gap-last-message, type-gap-registry, features, play-preset (and feature-config-registry where present): 73 passed; `tsc --noEmit` clean.
- viewer: feature-config-registry, fixed-definition, fixed-design, next-run: 97 passed.

## Fixed definitions whose hash changes (re-approval needed)

They use `featureRecipe: "current"`; no other definition under experiments/fixed/ uses a recipe. Against main 56a54f7ab, unchanged after the rebase onto 06dbd752e:

- `bundle-v-control-2h`: `e19bbcdf14a6fa1052d29245b93c70f831e97515973ba28cc861b4a6276a35c5` → `e3f40bfe71980aa1945a74d0a7801e7b9f5601c7ad1fe3ccbcdf32f4689bb3b5`
- `bundle-v-control`: `e4db35e34b27bea941945f87220a7c7be1551647b3cbc19599f89e909feb1106` → `94597352f90f20100d656d4968ea969f3180ddf91870e982d74e83b1a1b70ac4`
- `glm53-flash-4h`: `da141d9461e7cd372464af8a454d025707a75d2082fe142c39c8be028514bd7a` → `2f325bb699af0e992ab4f7aacb601941aa0e8bcddfe605665ae8e61514b20ebe`
- `hyperqwen-control-3h`: `b4800f6ed5c18941d136e2ed12eebf4e4fb327aa1ae9a5473ff17f66b8a3ff6a` → `05224e16bd417735ed158f81f4dbcaa0cf19b659acd9d29622275891ea42c6b2`

Live runs run from their pinned checkouts and are not touched.

## Gates

(pending the coordinator's CPU window: `just test`, `just lint`)

## Reviews

- Round 1 (base 56a54f7ab, head 7d116ea66, diff eada0047…afc9): Claude LGTM (hardening note: the features.ts descriptions of both type-gap switches still say "Bundle arm only", left as in the type-gap-team-v1 promotion), Sonnet fallback LGTM (recomputed the four hashes).
- Rebased onto main 06dbd752e (test: switch registration as unordered membership, which also edits type-gap-last-message.test.ts outside this hunk): clean, change unchanged in substance, targeted test 13/13. Diff digest changed, so round 2 reruns Claude and Sonnet.

- [ ] Claude
- [ ] Sonnet fallback
- [ ] GPT (with exact-head gate receipts)

## Landing

- [ ] ff-only via the landing board, post-landing `just test` (separate grant), evidence commit, `just land-done`, `just viewer-main`.
