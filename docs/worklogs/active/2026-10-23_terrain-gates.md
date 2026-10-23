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
- [ ] M1: whole-ROM terrain inventory, source/guide cross-check and concrete defect register.
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
