# Live viewer run switching

## Problem

Switching between runs already listed as live clears the game image while the selected run's event history catches up. The periodic render then walks through recorded frames from that history, making a live-to-live switch look like a replay even though the steady-state image eventually uses `/api/runs/:id/screen`.

## Invariant

A run that the owned `/api/runs` response already identifies as live must use its `/screen` endpoint from the moment it is selected, including while its event stream is catching up. Recorded-frame fallback remains available when the live image request fails, and ended or unresponsive runs retain replay behavior.

## Milestone

- [x] RED: regression test reproduces the live-to-live catch-up replay.
- [x] GREEN: select a known-live run through `/screen` during catch-up; retain failure fallback.
- [ ] Verify focused viewer tests, full gates, isolated-browser switching, polling stability, and desktop/phone screenshots.
- [ ] Complete cloud review before landing; do not restart the shared 8790 viewer without coordinating its owner.

## Session log

- 2026-10-18: Reproduced in the operator's existing 8790 tab. Selecting GPU0 from GPU1 immediately changed the image href from the live `/screen` endpoint to an empty value and `LOADING`; source inspection showed periodic renders can then expose recorded frames as the event backlog arrives. Shared viewer PID 35584 serves detached build d4eff8deff7299bf3b9aeb0c8535462404e5049c, matching main at diagnosis time.
- RED: `pnpm exec vitest run src/app.test.ts` ran 67 tests; the new case failed because the selected known-live run's image href was `""` instead of `/api/runs/2026-10-11T23-05-00_second-live/screen?n=…`.
- GREEN: the screen source now treats an `/api/runs`-qualified live selection as live during event catch-up. This changes only image selection and image-error fallback; the viewer remains in `LOADING` until `caught_up`, so run state and controls are not claimed ready early.
- Focused GREEN: `pnpm exec vitest run src/app.test.ts` passed all 67 viewer app tests, including the new immediate and mid-backfill `/screen` assertions.
