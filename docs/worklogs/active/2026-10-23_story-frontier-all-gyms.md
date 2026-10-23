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
