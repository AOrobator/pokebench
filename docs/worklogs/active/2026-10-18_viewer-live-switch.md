# Live viewer run switching

## Problem

Switching between runs already listed as live clears the game image while the selected run's event history catches up. The periodic render then walks through recorded frames from that history, making a live-to-live switch look like a replay even though the steady-state image eventually uses `/api/runs/:id/screen`.

## Invariant

A run that the owned `/api/runs` response already identifies as live must use its `/screen` endpoint from the moment it is selected, including while its event stream is catching up. Recorded-frame fallback remains available when the live image request fails, and ended or unresponsive runs retain replay behavior.

## Milestone

- [x] RED: regression test reproduces the live-to-live catch-up replay.
- [x] GREEN: select a known-live run through `/screen` during catch-up; retain failure fallback.
- [x] Verify focused viewer tests, full gates, isolated-browser switching, polling stability, and desktop/phone screenshots.
- [x] Complete cloud review and fast-forward landing; restart the shared 8790 viewer only after confirming its current workload is safe.

## Session log

- 2026-10-18: Reproduced in the operator's existing 8790 tab. Selecting GPU0 from GPU1 immediately changed the image href from the live `/screen` endpoint to an empty value and `LOADING`; source inspection showed periodic renders can then expose recorded frames as the event backlog arrives. Shared viewer PID 35584 serves detached build d4eff8deff7299bf3b9aeb0c8535462404e5049c, matching main at diagnosis time.
- RED: `pnpm exec vitest run src/app.test.ts` ran 67 tests; the new case failed because the selected known-live run's image href was `""` instead of `/api/runs/2026-10-11T23-05-00_second-live/screen?n=…`.
- GREEN: the screen source now treats an `/api/runs`-qualified live selection as live during event catch-up. This changes only image selection and image-error fallback; the viewer remains in `LOADING` until `caught_up`, so run state and controls are not claimed ready early.
- Focused GREEN: `pnpm exec vitest run src/app.test.ts` passed all 67 viewer app tests, including the new immediate and mid-backfill `/screen` assertions and the catch-up-time recorded-frame fallback after a live image error.
- Gates on candidate `29b019fb`: `just build` passed; configured sequential `just test` passed 2,507 agent, 1,181 viewer and 2,709 Python tests; `just lint` passed TypeScript, ESLint, Ruff, formatting and mypy; `just coverage` passed with agent 99.24% lines / 94.18% branches / 98.31% functions, viewer 97.64% / 91.47% / 93.83%, and Python 97.64% / 93.77% / 100%; `just verify-vendor` passed. The first parallel attempt was setup-invalid (missing worktree submodule/native binding) and made one unrelated 5-second agent test time out; dependency-correct sequential reruns are the receipts above.
- Browser proof used the branch build on owned port 8794, a scratch runs root with 10,000 real event lines per selected run, and owned fake live-screen servers on 8891/8892. Pointer switching changed GPU1 to GPU0 with `LOADING`, replay hidden, and `/api/runs/<gpu0>/screen?n=29`; after two polling cycles it was `RUNNING` with the same `/screen` source family and replay hidden. Native keyboard type-ahead changed GPU0 to GPU1 with `LOADING`, replay hidden, and `/api/runs/<gpu1>/screen?n=228`. The browser console had zero errors while the preview servers were live.
- Opened and inspected desktop 1280×900, desktop 1440×900 and phone 375×812 screenshots. The live game frame, `live` note, header and controls were visible without new overflow or clipping. Receipts are served at `/viewer-live-switch/shots/{desktop-1280.png,desktop-1440.png,phone-375.png}` on the existing 8791 pages server. Scratch servers were stopped and their temporary files moved to Trash; the shared 8790 viewer and measured runs were not restarted or mutated.
- Final-tip gates on `265d83e8`: configured sequential `just test` passed 2,507 agent, 1,181 viewer and 2,709 Python tests; `just lint`, `just build` (stamp `265d83e`), `just coverage`, and `just verify-vendor` all passed with the same coverage floors reported above. A detached listener-only mutation changed the image-error condition back to `mode === "live"`; the focused regression failed at the fallback assertion (expected the recorded frame, received `/screen?n=1`) and passed after restoration.
- Review synthesis: the external Grok 4.7 lane returned explicit `VERDICT: LGTM` with clean transport. External Claude CLI was not authenticated, Cursor Claude Opus/Sonnet and Cursor GPT 5.6/5.4 hit the account usage limit, so the contract's standing availability fallback replaced those unavailable lanes with fresh history-free Sol and Luna reviewers; both independently verified the same diff digest and returned explicit `VERDICT: LGTM`. No blocking findings. A non-blocking follow-up suggested adding explicit `live: true` to the new compatibility fixture; no scope or correctness change was required.
- Landed the frozen candidate by fast-forward from `d4eff8de` to `265d83e8` after rechecking clean unchanged `main`. Post-landing configured `just test` again passed 2,507 agent, 1,181 viewer and 2,709 Python tests.
