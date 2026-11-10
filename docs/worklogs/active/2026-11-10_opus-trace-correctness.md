# Opus trace correctness

The operator requested the four open defects from the Opus 5.5 audit be landed as correctness fixes in both current arms.

## Milestone

- Underwater Sootopolis door. Restore the native Dive path proven by run 69d8 states 31298 and 31327 and results 31328 and 31341.
- Credits and THE END. Identify the distinct native phases in b5a8 states 3024 and 3366. Preserve run termination policy and game-clear accounting.
- Warp and surfacing transitions. Identify callback 0x081371D5 and callback 0x081D67D1 while keeping field input locked.
- Party-menu field move refusal. Read the native message and acknowledgment owner in 69d8 states 20259 and 20266.

Use a registered switch with historical OFF behavior and activate in both current arms. Verify with checksum-validated raw RAM, production factories, focused regressions, full gates, independent review and the shared landing board.

## Status

Isolated worktree created at main 710665101. Implementation and landing in progress.

## Candidate evidence

- Current recipe explicitly enables `opus-trace-correctness-v1` in `onInBoth`. Older presets that omit it preserve OFF.
- Production warp verification replay on three hash-validated 69d8 observations from the underwater approach: OFF rejected all three, ON accepted all three. The expected native path is present in the original input trace.
- Production environment replay with the switch OFF and ON confirms the warp and surfacing handoffs, rolling credits, THE END and the ready party-menu refusal. Hall of Fame state 2932 remains Hall of Fame. See `runs/proofs/opus-trace-correctness/`.
- Focused agent suites 72 tests and environment suites 106 tests passed. Agent type checking and changed-file lint passed. Full gates, independent review and landing are pending.
- The Dive semantic-routing regression failed when its production switch wiring was removed, then passed after restoration.
- The existing structured state/tool events carry corrected screen and menu facts. No event schema, timeline, stop conditions, or historical traces change.

## Landing status

- Candidate commit `f289782c5`. Agent and viewer type checks and changed-file lint passed. The vendor pin check passed. Model-facing archived readout replay verified all three UI repairs with original run feature settings and the correction toggled on/off.
- Requested the required shared CPU window for full lint and coverage through `just tell-claude`. The mailbox reported that no Claude session was listening and saved the request. Full gates and independent review are pending. Main remains at `710665101`.

- The operator explicitly cleared full checks and reviews. The first full lint reached Python type checking and stopped because the isolated checkout lacked the mGBA binding. Installed the verified local mGBA package into the isolated environment and confirmed import. Synced with main at f1c175e8a before retrying.
- Full lint, build, coverage, no-I/O proof, and vendor verification passed on 13d782ff4. Subsequent main update 05b63718c contains only quota landing notes. The worklog-only sync preserves the tested executable tree.
- The archived Dive approach also replayed through both compiled production tool factories using recorded native states as press responses. OFF issued no presses. ON issued three checked UP inputs and returned the recorded destination map 24/5. Receipt: `runs/proofs/opus-trace-correctness/dive-execution.log`.
