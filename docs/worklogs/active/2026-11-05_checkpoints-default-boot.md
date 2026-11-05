# Checkpoints on by default for boot starts

Operator approval: The operator said yes on 2026-11-05 to making frontier checkpoints the default for boot starts. Run 274b saved none because `POKEBENCH_CHECKPOINT_FRONTIER` was unset.

## Scope

- `checkpointSelection` takes the run's start. A boot start with the variable unset captures every required frontier milestone.
- `POKEBENCH_CHECKPOINT_FRONTIER=0` is the OFF switch and restores the old no-capture behavior. `1` keeps its meaning. Save-state starts stay opt-in.
- Pause cost from run 5f0f: at most 145 ms a save, about 5.3 s over nearly 8 hours.
- Historical, fixed below. Model-visible effect (found by Claude review, verified in the events): a capture that overlaps a tool wait ends that wait early with reason `paused`. In 5f0f, 4 of about 120 saves did this: seq 1588 gave the model "the game is paused, so the battle did not advance", and seq 1070, 1390 and 30908 skipped a settle wait. Run 274b, with no capture, has none. Cause is inferred; pauses are not logged.
- Newly exposed paths: hand `just run-agent` boot runs, viewer-queue runs (`next-run.ts`), boot serial-comparison arms. `launch.sh` and boot fixed trials already had this. `run_start` does not record capture mode.
- No registered feature: the variable is the switch, `0` is OFF. With the pause removed, capture has no model-visible effect, so it is a measurement setting. Operator decision recorded below.

## Progress

- [x] RED: tests for the boot default and the OFF switch (3 failed, 15 passed). COMMIT: `test(checkpoints): pin the boot default and the off switch` (99f838c7c)
- [x] GREEN: selection, live.ts wiring, skill text. Focused: 18 passed; agent tsc and changed-file eslint clean. COMMIT: `feat(checkpoints): save frontier milestones by default on boot starts` (818e1a9d8)
- [x] Gates in a CPU window at 818e1a9d8 on base 3095abed7: just lint, build, test, verify-vendor all exit 0. Agent 2460, viewer 860, env 2901, gateway 38 passed; floors held. First lint try failed only because the clone venv lacked the mGBA binding, copied from the main venv.
- [x] Reviews: Claude, GPT through Codex, and a Sonnet fallback in place of Grok (Cursor out of usage)
- [x] Landed by fast-forward at c02e23e2c, then `just test` on main: agent 2455, viewer 869, env 2901, gateway 38 passed; no-I/O guards OK

## Frozen boundary

Included: `checkpointSelection` start-aware default, `0` as OFF, live.ts passing `start`, one sentence in the plain-run-launch skill. Non-goals: registered harness feature, viewer changes, `launch.sh` and `fixed-runner.ts` (they still set `1`, which stays valid), any live run. Built in a shared clone because this thread may not create a git worktree; lands by fast-forward.

## Operator decision and boundary amendment

The operator, 2026-11-05 12:45 AM on the save-pause question: "fix it first then land". Boundary now also covers removing the pause from capture.

Why that is safe: `/pokebench/checkpoint` saves under `memory_lock`, and `step_environment` runs the frame loop under the same lock, so a save lands between loop frames. Vendor `/load_state` and `/load_checkpoint` run a frame outside that lock, but no PokeBench run calls them, so concurrent state loads are out of this contract. A tool wait no longer sees a pause, so capture no longer reaches the model and is measurement again. `/pokebench/pause` stays for operator and continuation use.

- [x] RED: capture must never call `/pokebench/pause`; pause-only failure tests removed with the behavior
- [x] GREEN: `pause()` removed from `CheckpointCapture`; sidecar `capture.stability` is now `saved_under_frame_loop_lock`. Focused: 13 passed; agent tsc and changed-file eslint clean. COMMIT (RED): `test(checkpoints): capture must not pause the game` (ec3059746)
- [x] Real-server A/B on a scratch port from a copy of 5f0f's STARTER_CHOSEN state, firing during real `/pokebench/battle/wait` and `/pokebench/state` calls for 25 s each: pause and unpause 746 times gave 238 `paused` of 1475 battle waits; 848 saves gave 0 `paused` of 1250. Save round trip median 5.8 ms, max 25 ms. 12 no-pause states loaded and ran 120 frames.
- [x] Full gates at 961e5c5d7: just lint, build, test, verify-vendor all exit 0. Agent 2455, viewer 869, env 2901, gateway 38 passed; floors held. Agent count fell by 5 because pause-only tests went with the behavior. COMMIT: `fix(checkpoints): save without pausing the game` (961e5c5d7)

## Review log

Round 1 on 6a046bfb0: Claude BLOCKING and GPT (Codex, `gpt-5.6-sol`) BLOCKING, both only on the capture pause and the missing operator decision. Cursor Grok and Cursor GPT lanes failed on usage limit. Round 2 is on the fix: Claude, GPT through Codex, and a fresh read-only fallback reviewer in place of Grok (the operator's standing rule while Cursor is out of usage).

Round 2 on 4c5590aa9: Claude LGTM, fallback (Sonnet) LGTM, GPT BLOCKING only on the absolute "every frame" claim, because vendor load routes run a frame outside the lock. Fix: narrowed the comment, sidecar value and this worklog. Follow-ups, not in this branch: a test that pins the lock in `checkpoint()`, a client timeout on capture requests, `0` does not stop an explicit `POKEBENCH_CHECKPOINT_AT`.

Round 3 on c02e23e2c, base 560aaf991, packet SHA-256 027a66db6e2ea4f6: Claude LGTM, GPT LGTM, fallback LGTM. Full gates ran at 961e5c5d7; the later delta is one sidecar string changed in code and test, comments and this worklog, and post-merge `just test` passed at the landed head.

Not a live run yet: the first real run from this build is still to come. Run 5f0f keeps its older pin.

## Follow-up: every start saves by default

The operator, 2026-11-05 1:05 AM: "we should also make it save milestones when starting from a checkpoint by default". `checkpointSelection` no longer needs the start; `0` stays the OFF switch.

Saves stay apart from the source run: run files are under `runs/<id>/checkpoints/`, library copies under `runs/checkpoints/<milestone>/candidates/<id>/`, and every run has its own id. A continuation replays its source run's milestones through every observer, so capture ignores any event whose run is not its own; without that, replay wrote the start state over source candidates (all three reviewers, round 1 of this follow-up). Each sidecar names `source.start_state`. A checkpoint-started run can win `first-arrival.json` if it arrives first; only capture itself reads that index.

Boundary: selection, its live.ts caller, comments, skill sentence. `launch.sh` and `fixed-runner.ts` keep setting `1` because they can launch older pins.

- [x] RED: default on for any start; checkpoint-start saves stay under their own run
- [x] GREEN: default on for every start. COMMIT (RED): `test(checkpoints): every start saves by default` (47c8712a9)
- [x] Full gates on the every-start default: just lint, build, test, verify-vendor all exit 0; floors held.
- [x] Review round 1 on 0ec13791: Claude, GPT and fallback all BLOCKING on continuation replay. Fix: run filter in `observe`, test through real `RunRecorder.restoreHistory`. Note: fixed-run save-state launches cannot pass `0`, because the launcher strips the variable.
- [x] Replay test proven: removing the run filter fails it (1 failed, 13 passed); restored, 14 passed.
- [x] Full gates after the replay fix: just lint, build, test, verify-vendor all exit 0; floors held.
