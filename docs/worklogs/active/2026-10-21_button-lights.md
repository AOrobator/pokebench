# Viewer running button lights

Outcome: show B together with direction while recorded automatic running holds it. Native input timestamps own actual combinations and releases; older/in-flight recordings retain requested timing with automatic-running B. Viewer only; no gameplay, recording, timeline or feature changes.

One repair milestone. Non-goals: changing emulator input, smoothing real release gaps, adding live telemetry, synchronizing video transport.

- [x] RED regression for automatic B, actual native intervals/releases, delayed delivery, historical timing.
- [x] GREEN implementation, app integration, required gates.
- [x] Real browser candidate proof, cloud review, coordinated landing and served proof.

Termination: reviewed change shows running keys at recorded times; retain explicit gaps for telemetry received after execution. Split if new server telemetry is needed.

RED commit `1e4276e5`: automatic B and native execution intervals fail as expected (2 failures). GREEN: 102 focused tests; full coverage run agent 3398/viewer 1639 passing, line/branch/function: agent 99.20/93.14/97.80, viewer 97.91/91.33/94.33. Type check caught an incomplete test-only run_end fixture; corrected using the existing schema. TS lint passes. Python gates running from env/ (initial root invocation used the wrong pytest/lint configuration; discarded and rerun correctly).

Native source check: travel.py adds B only for permitted frames; actual input histories contain one-frame holds and explicit release gaps. Do not smooth these into a false constant native hold. Requested automatic-running timing remains the historical/in-flight approximation; native receipts supersede it once available. Replay reads complete recorded native receipts by server execution timestamp, not delivery timestamp.

Browser original tab was already claimed by another session; preserved it. Diagnostic tab and candidate on 8811 use an isolated excerpt of run qwen36-gpu1_d548, original native sequence 7837 (LEFT+B), no experiment approvals/ledgers. Fixture copies timestamps/inputs and reindexes event sequence, with a synthetic excerpt start/end for precise seeking; originals untouched.

## Landing and completion receipt

- COMMIT: RED `1e4276e5`; implementation `04b7b443bcf64bd40c695db12ab2f61f8083961e`; synced/landed code `5c907ce629345ab1f81ccc08b18cb244b8db6b66` (fast-forward from main `289dd88584230d1637fea16dcdae0b9eda6100f6`).
- Required cloud review: Claude CLI, Grok via Cursor (`cursor-grok-4.5-high`), independent GPT review subagent `/root/review_button_lights`: each `VERDICT: LGTM` on original frozen base `d93a916a1e318d5ab2bd24f6e2034c73a93c8ce8` / head `04b7b443bcf64bd40c695db12ab2f61f8083961e`. Exact binary diff SHA256 `85707d10ada1bf15f2857ac2403abafdc3fa70d2b6b8fad6dcdd6dac1315857e` unchanged after syncing current main, so the existing review applies under the landing rule. Claude/Grok exits0, stderr empty. No blocker fixes. Nonblocking follow-ups: cache native-input filtering on large recordings and dedicated live partial-batch coverage; excluded from this repair.
- Synced gates: build, lint, vendor verification and full coverage pass. Agent3398 / viewer1656 / Python3806 tests. Coverage lines/branches/functions: agent99.20/93.14/97.80; viewer97.95/91.34/94.35; Python97.29/93.11/100. Main `just test` independently passes3398+1656+3806.
- Restart: initial `just viewer-main` reported5c907ce62 and3 gameplay processes retained, but its child exited after command completion without an application error. Recovery through detached `just viewer-main` succeeded. Sustained listener PID63137 on8790; clean served stamp5c907ce629345ab1f81ccc08b18cb244b8db6b66. All3 pre-restart gameplay PIDs alive afterward. Recovery verified at approximately15:29 New York on2026-10-21; exact check time in runs/reviews/button-lights/button-lights-workbench-proof.json.
- Served `/app/gba.js` contains automatic B/native execution timing. `/api/workbench` lists470 runs and no older-build errors. Existing user Chrome tab was claimed by another session; preserved it and used a diagnostic tab.
- Production browser proof on8790: live qwen0/qwen1 RUNNING with actual blob game frames; current qwen0 indoors and qwen1 field-blocked, so no new running movement was elicited or game control altered. Actual completed recording `2026-10-21T08-28-28_qwen36-gpu1_8892` gives exact native running evidence: slider625 (1:14:59; native seq16445) lights LEFT+B; keyboard ArrowRight to626 (1:15:07) clears both. Recorded game image `/api/runs/2026-10-21T08-28-28_qwen36-gpu1_8892/frames/016416_0.png` visible; no browser errors. Screenshots opened: runs/mockups/button-lights/shots/landed-real-replay-held.png and landed-real-replay-released.png. Candidate desktop1280/1440 and phone375 proof retained alongside them. Refresh an existing browser tab to load the updated display code.
- Durable review/gate receipts: runs/reviews/button-lights/. No gameplay, feature, recording, timeline or experiment configuration changed. No worklog archive requested; left active.
