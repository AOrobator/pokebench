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
- [x] RED regression tests, commit 7dcfd12ea; 11 expected failures before implementation
- [x] GREEN implementation
- [ ] Tests, lint, build and coverage
- [x] Read-only real-log before/after evidence: all seven missing-party samples recovered
- [x] Background browser verification at desktop and phone widths
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

- GREEN verification: 18 party-health tests included in 1779 viewer coverage tests; 4053 agent coverage tests. Coverage agent 99.13% lines / 92.93% branches / 97.61% functions; viewer 98.04% / 91.61% / 95.18%. TypeScript lint and build pass; Python ruff/format and mypy pass. Vendor remains clean at its pinned SHA.
- Fresh worktree initially lacked ROM environment and the built mGBA module, causing native suite failures; configured the established external ROM path and linked the existing read-only native binding into the owned venv. Initial agent suite hit the existing tiny hung-child deadline under parallel load; the complete agent suite and subsequent coverage suite both passed without test changes. Python rerun with native dependencies is pending at this receipt.
- Wiring-deletion proof: removing updatePartyHealth(event) causes four health-propagation/replay tests to fail; restored the production call.
- Read-only full-log before/after HP: 18041 39→39; 18175 and 18177 39→22; 18255 and 18257 22→6; 19346 and 19348 39→39. All seven now carry same-sample battle health source, with zero original event mutation.
- Headless Chrome preview at 127.0.0.1:8798 against a scratch recording prefix proves party list and summary show 22/39. Profile and Stats screenshots inspected at 1280×900, 1440×900 and 375×812; no new layout overflow. Real event-tail streaming in a separate scratch run updates an already-open Stats panel 39→22→6 and preserves the selected tab, with no page errors, across multiple poll cycles. Screenshots: canonical runs/mockups/party-health-live/shots; before-after.json retains table. Scratch metadata uses an unused server port and a synthetic terminal event; no real game is controlled.
- Limits: this repairs recorded-sample presentation, not 60 FPS health capture. The existing video stream has a separate cadence. Reserve members without fresh data stay explicitly labeled; unknown identity never becomes a guessed match.
