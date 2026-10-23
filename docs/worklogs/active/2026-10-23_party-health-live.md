# Party health from battle RAM

## Problem Statement
The operator requested repair of stale/missing party health. In real run `roxanne-autonomous-16gpuh-20261023_gpu0_explore-1`, seven state events omit party while retaining initialized battle RAM. State 18175 has player HP 22 while the retained party from 18174 has HP 39; 18255 has HP 6 while retained party has HP 22. Viewer ignores battle health. Discovery is read-only; no game process or recording modified.

## Skills Loaded
- pokebench-game-state
- viewer-e2e
- close-the-loop

## Architecture
Viewer-only health overlay, matched by party slot and persistent identity, with source-state provenance. Preserve roster/profile/moves from the latest readable party; overlay only HP/max HP/status from validated player-side battle RAM. Never mutate original events or change agent observations. Retain fresh health through missing samples, reset on a new readable roster. Replay applies only events at/before its cursor. No new timeline marks.

## Invariants
- INV-1: opposing, absent, uninitialized, mismatched identity/owner and invalid HP cannot update a player party slot.
- INV-2: party samples supersede overlays, and replay never sees future samples.
- INV-3: partial recovery never claims current health for inactive party members.

## Security Review
Pure recorded-data presentation. No network additions, emulator inputs, RAM writes, or benchmark policy changes.

## Milestones
**M1 — Repair and verify party health**
- [ ] RED regression tests
- [ ] GREEN implementation
- [ ] Tests, lint, build and coverage
- [ ] Read-only real-log before/after evidence
- [ ] Background browser verification at desktop and phone widths
- [ ] Independent cloud review and coordinated landing

## Closing the Loop
Isolated candidate preview against scratch recordings. Preserve desktop focus. No active runs restarted or launched. Shared viewer remains unchanged until reviewed landing and coordinated restart.

## Session Log
- 2026-10-23: Isolated branch codex/party-health-live from main 24d71e151. Source reference pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, clean. PlayerHandleSetMonData updates gPlayerParty HP/status from controller buffers; battle health is independently recorded in gBattleMons. Coherence guard deliberately omits save-backed world readout mid-callback and must not be disabled.

## Surprises
- Missing party and valid initialized battle HP coexist in the same state event.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone
- [ ] ASK USER: archive worklog
