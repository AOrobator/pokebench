# type-gap-team-last-message-v1 (placement switch)

Operator decision: The operator 2026-10-27, "Build the placement switch", after the type-gap probes (runs/probes/type-gap-team-20261027). Held-out probe A, four runs × 16 samples: control 13/64, block on the tool result 40/64, block in both places 55/64 (strict scorer 21, 41, 58). Probe D (untalked) also moved most with the last-message placement.

## Scope

- New switch `type-gap-team-last-message-v1`: bundle arm only, default off, `needs: "type-gap-team-v1"` (dependencyProblems rejects it alone).
- When ON and the newest tool results (after the last assistant reply) carry the GYM TYPE GAP block, the identical text is appended as a final user message, after scene-followup-prompt-v1's note. The block on the tool result is unchanged. No truncation, no rewording. Same shape as the probes' `production_and_last` variant (sample.mjs: appendToResult(block) then asLastUser(block)).
- Transient like scene-followup-prompt-v1. Recorded once per tool result as `ledger_context` with that result's seq as evidence.
- OFF: `typeGapLastMessage` returns the base transform itself; requests, tools and events are unchanged.
- supplies-v1 and untalked-in-gym-v1 are untouched.

## Checklist (feature-switch skill)

- [x] Registry: SWITCHABLE_FEATURES last, FEATURES entry (observation, needs type-gap-team-v1, Off copy), `...when()` last in playHarnessFeatures. Not a server feature.
- [x] Presets: FeatureSetSchema optional, excluded from the generic spread and its Exclude type, normalizeFeatures and flagFeatures default false.
- [x] Defaults: DEFAULT_NEXT_RUN false.
- [x] current.json: appended to `switches`, base false.
- [x] Wiring: `contextTools` wraps `sceneFollowupContext` with `typeGapLastMessage` (live and decision probes share it).
- [x] Tests: packages/agent/src/type-gap-last-message.test.ts (9). ON matches the probe's both-places request message for message; no copy without the block or after a reply; no copy when type-gap-team-v1 is off; OFF returns the base transform and the same bytes; validation. Coverage of the new file: 100% statements, lines and functions, 95% branches.
- [x] Wiring removal check: with the `typeGapLastMessage` wrap deleted from contextTools, 2 ON tests failed; restored, 9/9 pass.
- [x] Explainer: docs/explainers/type-gap-team-last-message-v1.html (theme applied, pages-check clean; headless 1280 and 375 screenshots, no horizontal overflow), FEATURE_EXPLAINERS, panels/server link tests, README entry.
- [ ] Gates (`just test`, `just lint`) under a coordinator CPU window.
- [ ] Review: Claude, GPT via Codex, Sonnet fallback.
- [ ] Land ff-only via the board; `just viewer-main`.
- [ ] Confirmation probe on GPU1 via the lock.

## Targeted runs (no CPU window used)

- agent: type-gap-last-message, type-gap-registry, scene-followup, feature-config-registry, features, play-preset: 85 passed; `tsc --noEmit` clean.
- viewer: next-run, panels, fixed-definition, fixed-design, feature-config-registry: 301 passed; panels + server: 352 passed.

## Fixed definitions whose hash changes

Adding a bundle switch changes the four `featureRecipe: "current"` definitions (re-approval needed). Against main 8de58a861 (after the gateway-tool-schemas and gateway-schema-hint pins):

- `bundle-v-control-2h`: `7827893c5fd38c263e384c859963c5de7df49c8ee8127e34b7152ec2f9d8a9e1` → `b796a57b6685deed590c7046c879b83cad48743e472f85e4b78728f478213dff`
- `bundle-v-control`: `06abe31b61320bd58d5b1c91e04796fde03de49f4d15c85e68b36b66fcf345d1` → `9328e17c7608045ed5934b71dac2d3db001f366bb7f0aaee064ae5a989dcd50d`
- `glm53-flash-4h`: `c6c27eaad12ad9f0e559198425a9372e5e38c52e50807994f7af847b4c4fd3f5` → `b1e2ce6851b7e251bdf57ef77799f01800ecfcffc3748396c6f073810f5a96fb`
- `hyperqwen-control-3h`: `3cf2fb32f1b3f0f553699922fa8228a068f7ae7730c1758d034d0802f77f1455` → `3f7e83ae16bc70bba68bb5c44902d796590884717e59c713e32835dee41be7f7`

## Rebases

- Rebased onto main 87cf6a8c7 (gateway-tool-schemas-v1 and gateway-schema-hint-v1, which also append to every registry list, presets, defaults and current.json). Conflicts in current.json, features.ts, play-preset.ts and next-run.ts, all "both appended": resolved by taking main's files and re-adding this switch after gateway-schema-hint-v1 (registry lists, FeatureSetSchema, the preset spread filter and Exclude type, normalizeFeatures, flagFeatures, DEFAULT_NEXT_RUN), last in `switches` and base false. Targeted tests rerun: agent 85, viewer 451, both `tsc --noEmit` clean. Then onto 8de58a861 (docs only), clean.
