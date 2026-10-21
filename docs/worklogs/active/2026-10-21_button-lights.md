# Viewer running button lights

Outcome: show B together with direction while recorded automatic running holds it. Native input timestamps own actual combinations and releases; older/in-flight recordings retain requested timing with automatic-running B. Viewer only; no gameplay, recording, timeline or feature changes.

One repair milestone. Non-goals: changing emulator input, smoothing real release gaps, adding live telemetry, synchronizing video transport.

- [ ] RED regression for automatic B, actual native intervals/releases, delayed delivery, historical timing.
- [ ] GREEN implementation, app integration, required gates.
- [ ] Real browser candidate proof, cloud review, coordinated landing and served proof.

Termination: reviewed change shows running keys at recorded times; retain explicit gaps for telemetry received after execution. Split if new server telemetry is needed.
