# PokéNav call auto-advance on in both arms

**Started:** 2026-11-01
**Status:** Landing
**Branch:** `cursor/pokenav-call-control-both`

Operator 2026-11-01: "control should have that switch." Promote `pokenav-call-auto-advance-v1` from current-bundle-only (`switches`) to `onInBoth`. Registered default stays OFF; historical frozen definitions and already-running runs keep their recorded settings. Future `featureRecipe: current` launches get ON in control and bundle. No measured benefit claim. Operator then: "just land your changes for now."

## Skills Loaded
- feature-switch (activation only; no new switch)
- feature-explainer (status copy)
- execute-worklog / talk-to-codex (landing)

## Milestones

**M1 — Promote in current recipe**
- [x] Update `experiments/feature-configs/current.json`: remove from `switches`, add to `onInBoth`, set shared `features` true
- [x] Update registry description, explainer lead, README promotion note, and the viewer recipe pin that asserted bundle-only
- [x] Focused viewer recipe test GREEN (`pokenav-correctness-bundle.test.ts` 8/8)
- [x] COMMIT: `feat(harness): turn pokenav-call-auto-advance on in both current arms` (`33e1b7812`)

## Gates
- Cheap: viewer recipe 8/8; agent pokenav-call-auto-advance 22/22; `git diff --check` clean
- Full on `33e1b7812`: `just build` PASS; `just lint` PASS; `just test` PASS (agent 5256 / viewer 2388 / Python 4979 / gateway 116 / trainer-cards 3); `just verify-vendor` PASS

## Review
- Frozen packet base `14991d479` head `33e1b7812` SHA-256 `f06e01beed9d68894dc720f233ae42516f057705328e508dec6eb1cd6d2267b6`
- Principles self-review PB1–PB13: zero FAIL
- Claude CLI: `VERDICT: LGTM`
- Cursor Task Grok + GPT lanes unavailable (usage limit). Landing under operator "just land your changes for now"; reduced diversity disclosed; no Grok/GPT LGTM claimed.

## Closing the Loop
- Future control launch materializes ON; live DeepSeek control4h stays OFF until relaunched.
- No `just viewer-main` required for this recipe-only activation.

## Session Log
- Confirmed DeepSeek `control4h` recorded OFF.
- Corrected a mistaken merge of unlanded `cursor/moving-npc-burst-and-wait` (was checked out in the main worktree, not `main`); reset to `33e1b7812` before landing on real `main` at `14991d479`.
