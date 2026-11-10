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

## Review round 1

- Frozen base 05b63718c, head c1b8df824, binary diff SHA-256 `07f3af203f4e8c21b2e69cdc417c874483ee468628896c02424dd5f429c0e838`. Claude returned LGTM. The independent GPT review identified the post-THE-END reset mislabel and requested a built viewer click-through and served-route receipt.
- Both Grok 4.5 and Grok 4.7 attempts were rejected by the same Cursor account usage limit. Astra and Terra returned LGTM as read-only fallbacks. They do not substitute for a Grok verdict on the landing gate.
- Fixed the credits reset decoder within the frozen behavior. Native source `Task_CreditsTheEnd6` changes the task owner before the fade, and the matching ROM instruction pair at 0x08175C7A and 0x08175C7C installs 0x08175CC9. The decoder now reports restart with input unavailable. Only the verified rolling owner gets a rolling readout. Focused environment test 69 passed.
- The first post-review full lint found a local variable name colliding with a later list in the same function. Renamed it and passed targeted mypy and the 69 UI tests before rerunning the full checks.
- The isolated built viewer served the tracked explainer at HTTP 200 with matching SHA-256. Verified Harness Config → READ EXPLAINER with pointer and keyboard in headless Chrome at 1280, 1440 and 375 pixels. Inspected all six screenshots. The scratch viewer used an archived run copy and has been stopped. Receipts: `runs/proofs/opus-trace-correctness/viewer-click.log`, `viewer-route.log`.
- Updated archived re-render distinguishes intro, rolling credits, transition, and THE END with the original run features. The reset task is covered by a ROM-grounded in-memory fixture.

## Landing

- Round 2 frozen base `05b63718c`, head `520ab159f`, binary diff SHA-256 `4144d6818380c2761b9ccedc5f7bc6103d7a8d8c38821b3f635897fe2c43b8ab`. Claude and independent GPT both returned LGTM. Independent Astra and Terra fallbacks returned LGTM on the corrected packet.
- Cursor rejected Grok 4.5 and both tested Grok 4.7 tiers due to the account usage limit. Applied the operator's standing all-branch outage waiver, independently verified in the original October 21–22 coordinator transcript (f7406a93 lines 4145, 4964, 6309), also recorded in the November 10 quota landing worklog. Grok issued no verdict.
- Final full lint, build, test, no-I/O proof and vendor verification passed. Materialized every phase of the two current bundle-v-control definitions and verified the switch ON for all six arm presets.
- Fast-forwarded local main to `520ab159f` while holding landing slot 1. Post-main `just test` passed 2,999 agent, 1,252 viewer, 3,071 environment and 39 gateway tests plus coverage and no-I/O gates. Main's Dive and model-facing readout replay matched the reviewed receipts byte for byte.
- Scratch viewer click-through and the local explainer preview passed. Shared viewer refresh is separate from source landing and has not been coordinated. No gameplay runs were started.

## Dedicated Opus launch preset

The dedicated `experiments/presets/opus-rayquaza-lane.json` is independent of the current arm recipe. Its previously omitted switch normalized to OFF. Explicitly enable the landed four corrections for future launches using this preset. Preserve its existing sampling, limits, and other features.
