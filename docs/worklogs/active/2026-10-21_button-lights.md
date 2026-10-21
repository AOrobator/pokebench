# Viewer running button lights

Outcome: show B together with direction while recorded automatic running holds it. Native input timestamps own actual combinations and releases; older/in-flight recordings retain requested timing with automatic-running B. Viewer only; no gameplay, recording, timeline or feature changes.

One repair milestone. Non-goals: changing emulator input, smoothing real release gaps, adding live telemetry, synchronizing video transport.

- [x] RED regression for automatic B, actual native intervals/releases, delayed delivery, historical timing.
- [ ] GREEN implementation, app integration, required gates.
- [ ] Real browser candidate proof, cloud review, coordinated landing and served proof.

Termination: reviewed change shows running keys at recorded times; retain explicit gaps for telemetry received after execution. Split if new server telemetry is needed.

RED commit `1e4276e5`: automatic B and native execution intervals fail as expected (2 failures). GREEN: 102 focused tests; full coverage run agent 3398/viewer 1639 passing, line/branch/function: agent 99.20/93.14/97.80, viewer 97.91/91.33/94.33. Type check caught an incomplete test-only run_end fixture; corrected using the existing schema. TS lint passes. Python gates running from env/ (initial root invocation used the wrong pytest/lint configuration; discarded and rerun correctly).

Native source check: travel.py adds B only for permitted frames; actual input histories contain one-frame holds and explicit release gaps. Do not smooth these into a false constant native hold. Requested automatic-running timing remains the historical/in-flight approximation; native receipts supersede it once available. Replay reads complete recorded native receipts by server execution timestamp, not delivery timestamp.

Browser original tab was already claimed by another session; preserved it. Diagnostic tab and candidate on 8811 use an isolated excerpt of run qwen36-gpu1_d548, original native sequence 7837 (LEFT+B), no experiment approvals/ledgers. Fixture copies timestamps/inputs and reindexes event sequence, with a synthetic excerpt start/end for precise seeking; originals untouched.
