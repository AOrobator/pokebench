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

Adding a bundle switch changes the four `featureRecipe: "current"` definitions. Hashes are recorded after the rebase onto the current main.
