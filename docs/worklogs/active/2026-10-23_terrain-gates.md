# Terrain gate audit and correction

## Problem Statement
GLM control run 2026-10-22T20-40-54_glm53-mac_0d5d sees Granite Cave muddy slopes as clear ground. Native archive 17231 confirms slopes at (9,9)/(9,10), while turns 889–891 repeat upward inputs and receive misleading window advice.

## Authorization
2026-10-23: operator agreed to the correction, requested improving field-move-gates-v1 and enabling it in both arms, auditing the whole map, and explicitly leaving the current run untouched. This authorizes implementation of the agreed correction; later unproven traversal solvers remain out of scope.

## Skills Loaded
Game-state, trace-forensics (read-only historical evidence), agent-observability, feature-switch, feature-explainer, feature-worklog, execute-worklog, close-the-loop, talk-to-claude.

## Architecture
Retain field-move-gates-v1 and its exact OFF path. Audit every ROM map and game-owned terrain/script handlers. ON maps and next-tile words identify special terrain; walking reachability and refusals cannot treat bike ownership as ordinary walking access. Closed terrain must remain visible even when it cuts no exit. Fix confirmed shared-rule defects and document unsupported mechanics honestly. Future fixed definitions move this switch into onInBoth, preserving pinned bases and historical recordings.

## Invariants
- INV-1: OFF map/readout/navigation is unchanged; regression tests compare existing paths.
- INV-2: no gameplay, RAM writes, current-run edits, scheduler changes, inference calls or shared service restarts during implementation.
- INV-3: item ownership is capability, not proof of riding/momentum or an executable walking route.
- INV-4: map glyph, adjacent words, obstacle state and navigation explanation agree; unknown native state stays unknown.
- INV-5: audit covers all map IDs; static ROM evidence is distinguished from runtime script mutations and observed native proof.

## Security Review
Read-only external ROM and archives; no game assets tracked, new network exposure or subprocess string execution.

## Milestones
- [x] M1: whole-ROM terrain inventory, source/guide cross-check and concrete defect register.
- [ ] M2: RED regression commit; GREEN shared gate/readout/navigation correction with OFF invariance and native archive readback.
- [ ] M3: both-arm future recipes, explainer, gates, frozen multi-model review and landing/live proof if all gates permit.

## Closing the Loop
Use archived native states for map/readout proof without disturbing the measured run. Build scratch viewer and verify page in background contexts. Distinguish implementation, checks, review, landing and future activation.

## Session Log
- Started isolated codex/terrain-gates from main. Existing main and current GLM run untouched. Claude coordination message saved (no listener).

## Surprises
- Prior gate audit names 81 early maps; whole-world claim tests exist, but terrain visibility remains absent.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog.

- RED: terrain visibility tests fail against no-op presentation and current owned-bike flood (16 failures, 1 pass); no current run changed. Full static ROM sweep: 518 maps read, zero failures.

- GREEN focused: 151 Python tests, 17 agent tests, 11 future-definition tests. Added 2 additional sandstorm/collision cases (18 visibility tests now pass). Native archive 17231 hash verified and reparsed through production reader: slope descriptions and upper-ladder foot→none labels confirmed. Deleted readout wiring once: factory test failed, then restored.
- Full TS coverage: agent 3909 tests, viewer 1728 tests pass; line/branch/function percentages agent 99.14/93.31/97.78, viewer 98.02/91.61/95.04. Full Python coverage run: 4028 pass and one old wording assertion fails; expectation corrected for the intentionally changed bike wording. Full Python gate rerun pending. Python coverage floor: lines 97.41, branches 93.47, functions 100. New terrain module has 100% statements/branches.
- TypeScript build/lint and Python ruff/mypy pass after isolated dependency install. Initial shared-node_modules symlinks resolved workspace types to main; replaced symlinks with an offline worktree-local install. No main source changed.
- Inventory script reads all 518 maps (zero unreadable), emits count metadata only. Detailed audit and updated existing linked explainer prepared. Remaining defects are explicitly retained in the report; no forced-movement solver or runtime-layout simulator was added.
- RED commit: 85779c569. Correction: that run had 16 failures, zero passes (earlier prose incorrectly said one pass).

- Gate correction: full Python now passes 4031 tests. Lines/branches/functions 97.41/93.45/100.00 (floor 90). Agent coverage passes 3909 tests, 99.14/93.30/97.78. Viewer coverage initially caught the removed Rusturf explainer example; restored the meaningful example rather than weakening its test. Rerun passes all 1728 viewer tests, 98.02/91.61/95.04. Build/lint pass; vendor remains clean at bbab97ad.
- One old mixed-needs wording assertion was still failing at implementation commit 54f195749; corrected it on the branch and reran the whole Python suite successfully. No production logic was changed to satisfy that old assertion.
- Background browser: both local pages return 200, no page errors or page-level overflow at 1280, 1440 and 375, closed and expanded. Fixed the mobile table and diagram after inspecting screenshots. Browser is standalone headless Chrome; no desktop focus taken. Shared viewer remains untouched.
