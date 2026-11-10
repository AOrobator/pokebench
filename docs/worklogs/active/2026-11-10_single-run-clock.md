# Use one gameplay clock for pinned checkpoint launches

5a70's launch receipt carried a separate 4,200-second wall clock. It continued counting
during pause and could stop play even after a viewer extension. Keep that historical
launcher and its live processes untouched. Move future pinned launches to a detached
entry point with the agent as sole owner of turn and elapsed-time limits.

The authorized game-clear stop needs a native preset boundary that leaves the existing
model goal intact. Keep the measurement-only goal restriction and require observed
native evidence for completion.

The pinned launcher detaches the agent directly. Provisioning and releasing the
model gateway remain separate operations. The launcher rejects the distinct
history-restoration campaign path, which has an intentional absolute deadline.
The only new native preset stop is GAME_CLEAR_CONFIRMED.

5a70 ended on turn 286 at 13:42:19.680 ET with `operator_stop`; its launch
receipt attributes the stop to `supervisor_time_bound`. The Drake save was
captured at the paused turn before the stop and reload verified independently.

The preset regression was RED before the code change. Focused GREEN: 21 tests,
changed-source ESLint, agent typecheck, zsh syntax and diff check. The detached
fake-agent rehearsal used the unchanged production viewer journal writer and
agent control reader, with accelerated time and simulated game health. The
viewer extension changed 500,000 ms to 2,300,000 ms, gameplay remained active
past 500,000 ms, and the agent ended for budget at 2,300,698 ms. No model calls,
game server, shared viewer changes or live-run controls were used.

Independent GPT review caught two launch preflight gaps: a stale ignored build
could pass the Git check, and a privileged port could normalize to automatic
allocation. The revised launcher checks the existing fixed-tree build stamp
and requires a clean detached checkout. It validates the same unprivileged
port range as the game server. The saved rehearsal driver rejects a stale
stamp and port 80, then passes the extension and terminal-budget assertions.

## Landing evidence

Round 2 frozen base 0767261cb and head 2c46d5920. Diff SHA-256
78ae123333ad01a26495c38ad5eaf59b0380a990cca0623319715e609316b6c3.
Claude and independent GPT returned LGTM on that packet. Grok waived under
The operator's standing 2026-10-22 waiver, confirmed by the Claude relay for this patch.

Prelanding lint, test/build, vendor verification and the detached build
preparation smoke passed. Main advanced through 004df3b40 with compatible
stop-policy documentation only. The integrated feature diff stayed
byte-identical. Fast-forwarded main to f8341057f and passed post-main
`just test` and the same viewer-to-agent rehearsal using main's built modules.
The new budget was applied, and the harness exited for budget at 2,300,367 ms
on the accelerated clock. Proof is under `runs/proofs/single-run-clock/round-2/`.
The current run and served viewer were left alone. The paused Drake checkpoint
and its reload receipt are under `runs/launch-receipts/opus-drake-paused-20261110/`.
