# Milestone prerequisites

User authorization: "ok lets do the prereq fix and land it on main after review" (2026-10-25, this chat).

## Contract

One bounded correction: add declarative, all-of story prerequisites to the shared progress catalog and apply the first source-verified dependency to `SLATEPORT_HARBOR`: `MAGMA_HIDEOUT_STORY_COMPLETE`. A harbor visit without the persistent completion predicate cannot receive late-game credit. Resolve prerequisites from the same native snapshot, rather than requiring earlier milestone rows, so checkpoint baselines and sparse historical recordings remain supported. Missing evidence stays unknown. Keep catalog order, card design, optional trainer handling and original recordings unchanged.

Production paths: agent `story-progress.ts`, `campaign-catalog.ts`; viewer `model.ts` for historical replay compatibility if required. Shared evaluator already owns recorder and native qualification; browser imports the same implementation. Measurement correction, no new model tools/readouts or input policy. Existing campaign clock consumes corrected earned measurements; no arm/config changes or new runs.

Reference: clean pokeemerald `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`. `MagmaHideout_4F_EventScript_Maxie` sets `VAR_SLATEPORT_CITY_STATE=1`, `FLAG_GROUDON_AWAKENED_MAGMA_HIDEOUT` (0x6f), and `VAR_SLATEPORT_HARBOR_STATE=1` together after its closing dialogue. `SlateportCity_EventScript_CaptStern` then brings the player into the harbor for the submarine scene. Existing US-ROM reader already captures this flag; no RAM-address changes.

Non-goals: percentage redesign, compulsory route ordering, gating all milestones on all preceding rows, new milestone names, trainer-card redesign, retroactive writes to logs, gameplay launches/restarts.

## Verification and delivery

- [ ] RED: prerequisite failure, unknown evidence, valid unlocked visit, deduplication, resumed origin, native qualification, historical recovery and card frontier through real loader.
- [ ] GREEN: shared evaluator, catalog dependency, historical replay qualification; adversarial removal proof.
- [ ] Gates: test, lint, build, coverage >=90%, verify-vendor, trainer-card-check.
- [ ] Read-only real recording before/after and isolated background browser evidence.
- [ ] Principles self-review and frozen Claude/Grok/GPT review; landing board; fast-forward main; tests and live viewer proof.

## Session log

- Read repo/global instructions, current worklog, story-milestones, game-state, execute-worklog, talk-to-claude, viewer-e2e, close-the-loop and multi-model-review skills. Work isolated from canonical main.

- RED: new agent prerequisite tests fail in four expected cases (early visit, premature once-only emission, unknown resumed baseline, native qualification). Initial broad test command also exposed unbuilt workspace exports; built dependencies before viewer tests.
