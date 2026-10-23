# Native story frontier through all gyms

## Problem Statement
GLM run 2026-10-22T20-40-54_glm53-mac_0d5d passed Roxanne and completed the Rusturf/Devon arc, but the runtime catalog omits that arc and the frontier ends at Rock Tomb. The operator explicitly authorized implementation and backfill, story steps through gyms two/three and at least every gym thereafter on 2026-10-23 ("Continue. Please fill in the gaps ... all the milestones for all the gyms, at least").

## Skills Loaded
Story milestones, game state, agent observability, feature switch (measurement exemption), close the loop, execute worklog, talk to Claude, viewer e2e and multi-model review.

## Architecture
Add measurement-only raw flag/variable fields beside existing story state under the same snapshot lock, with a source-grounded shared TS catalog and unchanged model readout. Register the measurement feature. Extend native detector, evidence qualification, human/agent replay and frontier. Historical backfill lives in derived sidecars attached only to exact raw archive references, never rewrites logs. Include required location splits and story completions through Mauville and leader victory/badge/TM/gym entry through Sootopolis. The ongoing run remains untouched and its new progress is recovered from retained RAM.

## Invariants
- INV-1: predicates reflect game-owned completion, never narration or proximity; separate leader victory, badge and TM.
- INV-2: missing/invalid/transition memory is unknown; resumed true-at-start never gains observed credit.
- INV-3: measurement does not change model readout, goals, guards, stop conditions or tools.
- INV-4: recovery binds source log prefix, state sequence, ROM and archive hashes; original events/frames stay unchanged; incremental live prefixes remain supported.
- INV-5: shared detector meanings reach recording/replay/splits/frontier; modern missing events are not silently repaired.

## Security Review
Read-only memory, bounded validated archives and plain sidecars under run directories. No game inputs, server restarts, inference batches, ROM copying or vendor edits. Browser checks remain headless and preserve desktop focus.

## Milestones
**M1 — Catalog, native recording, replay and historical backfill**
- [ ] RED tests and commit
- [ ] Implement source-backed catalog, native transport, replay/frontier and backfill
- [ ] Gates: test/lint/build/coverage >=90%, verify vendor
- [ ] GREEN commit
- [ ] Real retained RAM and current GLM backfill receipt, original hashes unchanged
- [ ] Principles and three-cloud-lane frozen review
- [ ] Land on board and verify live viewer while keeping gameplay processes alive

## Closing the Loop
Unit and source-contract tests; negative/unavailable/repeat/resume cases; recorder/replay qualification; before/after GLM splits; headless desktop/phone viewer proof. Distinguish future new-run recorder activation from ongoing historical projection.

## Session Log
- 2026-10-23: isolated worktree from main 74590b432. Latest GLM at T838 accepted passage and native map reached Route105 at 08:31 EDT. Active run untouched.

## Surprises
None yet.

## Multi-Model Review Log
Pending.

## Boy Scout Log
No adjacent cleanup.

## Archive Milestone
User-gated, pending explicit request.
- RED: new production reader and native detector tests cover missing rescue, independent later leader flags, unknown/transition, measurement isolation and resumed origins. Running before implementation.
- RED committed as `7c611a6c8` (native fields absent: Python 3 failures; TS missing module). Implemented 60 new measurement-only milestones plus reused Route116/Rusturf splits, extending the shared frontier to 111 checkpoints.
- GREEN gates: agent 3913 tests, viewer 1721 tests, Python 4024 tests pass. Coverage agent statements 97.30%, branches 93.41%, functions 97.78%, lines 99.20%; viewer 95.62/91.52/95.09/98.01; Python lines 97.38%, branches 93.37%, functions 100%. Build, lint (TS/eslint/ruff/mypy) and vendor verification pass. No threshold/exclusion changes.
- Old golden state fixtures now explicitly project away the declared measurement field, as they already do later Pokémon summary metadata; their model readouts remain byte-identical. Sparse historical readers reuse the existing full flag/variable read windows. Missing measurement fields fail the recorder claim guard; explicit null is supported.
- Removed production Python reader wiring: focused test fails; restored: passes. Removed recorder claim guard: integration test fails; restored: passes. Unique receipts in runs/reports/all-gym-story-20261023/wire-proof.json, with raw logs under /tmp/pokebench-progress-*-removed/restored.log.
- Native proof: eight exact-ROM archived snapshots run through the production game-state reader, state JSON and readout. Rusturf victory/rescue, letter, PokéNav and tutorial transitions match native predicates; readout text is identical with measurement field removed. Receipt: runs/reports/all-gym-story-20261023/native-proof.json (main runs root).
- Read-only inventory sampled latest retained state in 518 recordings, excluding probes/replays/synthetic starts; two non-probe recordings retain a badge and raw archives: GLM 0d5d and Qwen ea04. Backfilled both into atomic derived sidecars. GLM 8527 archived started states in initial prefix; Qwen 5100. GLM gains 11 qualified splits (64→75), Qwen stays 61. No original split times/evidence lost or changed; segment durations split around inserted events. Original source prefixes/hash receipts and before/after retained under main runs/reports/all-gym-story-20261023/. No original logs/frames rewritten.
- Added explicit recoveredFeatures metadata separate from recorded harness features: old builds remain honestly NOT RECORDED in Harness Config while recovered native coverage can show pending/missing gaps in the frontier. New native feature claims never receive historical missing-event repair. Backfilled older live runs continue projection from newly archived snapshots after the sidecar prefix.
- Current GLM broke through Briney's moving-NPC stall at T838 (08:31 EDT), reached Dewford T844 and Granite Cave T864. No run control changes, inputs, restarts or inference jobs.
- GREEN implementation committed `f2c42632a`. Final consumer audit found ProgressAwareCycles had its own historical progress exemption rather than reading the shared measurement set. Added a failing all-new-milestone regression, then isolated new measurement events in both that owner and LoopCoordinator. This keeps the existing progress-aware behavior for old milestones and prevents any new cycle retirement/hold. Focused RED/GREEN receipts: /tmp/pokebench-progress-cycle-{red,green}.log.
- Headless preview proof on immutable copied logs/raw hardlinks: frontier/full range and expanded coverage at 1280/1440/375, explainer closed/open at all widths. Opened every screenshot. The phone chart exposed overlapping forced gap labels with the longer axis; added spacing-based label thinning while retaining all 111 checkpoint points/details, with a regression. Desktop and phone screenshots are being refreshed on the final build. Browser-only accessible-name mismatch in the Watch verifier was corrected (actual aria-label is "Watch run ..."); second click opened the exact GLM run.
- Final gate rerun after cycle isolation and phone label repair: agent 3914 tests, viewer 1722 tests, Python 4024 tests pass. Lint/build/vendor pass. Coverage agent statements/branches/functions/lines 97.30/93.40/97.78/99.20%; viewer 95.63/91.51/95.09/98.01%; Python lines/branches/functions 97.38/93.37/100%.
- Final headless browser receipt (main runs/reports/all-gym-story-20261023/browser-proof.json): 1280/1440/375 frontier/full/evidence and explainer closed/open, no console errors or document overflow. Fixed mobile explainer provenance hash wrapping and made the native wiring diagram horizontally scrollable at readable size. Real Watch click selects 0d5d and shows RUNNING. Preview is isolated at 8897; source logs/raw snapshots copied or immutable hardlinked, no controls pressed.
- Exact source writer audit also checked Rustboro city state 8 in the Briney sailing script (beside the rival scenes); the normal Devon exit is forced through the state-6 scientist tutorial before sailing is available. The recorded run has the direct 6→7 tutorial completion witness, not just the later 8.
