# Automatic video for boot runs

## Problem Statement
The operator explicitly asked to restart Astra with commentary and ensure all runs from boot save video. Existing recorder is manual only. Source scope: automatically attach existing read-only picture/audio recorder in shared Python game launcher, excluding checkpoint starts. Preserve current run-stop rules.

## Skills Loaded
plain-run-launch, run-coordination, detached-long-lived-processes, execute-worklog, close-the-loop, talk-to-claude, multi-model-review. Measurement only; no model-visible feature switch required.

## Architecture
Existing launcher boot paths (exec for ordinary/human/fixed/probe and launch for smoke) start existing recorder supervised, before first agent action, under each run’s recording directory. An owner PID watch seals recording on server exit so it cannot follow later port reuse. Recorder independent and detached; no model/API/tools/prompt change. Checkpoint starts remain unchanged; manual recorder remains usable without owner option.

## Invariants
- INV-1 Every central launcher boot start attaches exactly one existing recorder; checkpoint start attaches none. Injected production factory tests and real-ROM launch proof.
- INV-2 Recorder reads only and cannot end gameplay. Startup errors are loud before run starts; subsequent failures journaled/restarted by existing supervisor. No new game stop or timers.
- INV-3 Detached recorder stops and seals on owner exit; process/error behavior tested with injected alive/wait/stop functions; real proof validates video/audio files and clean shutdown.
- INV-4 Existing manual recording argv/default path unchanged without owner option; no historical video fabricated.

## Security Review
Argv lists only; each recorder writes inside its own run dir. Uses existing loopback streams and encoders. Owner monitor never signals game.

## Milestones
M1 Source readiness: launcher.py, recorder.py, small injected tests, existing recorder explainer/twins and launch skill wording. Terminator: actual boot saved playable video, injected lifecycle tests, gates/reviews PASS. Non-goals: GUI video playback redesign, recording backfill, pruning/backup changes, model behavior or new capture service. Split triggers: new persistence/store/provider, encoder redesign, gameplay retry/stop.
M2 Landing: serialize FF, post-main test; retain unaffected evidence on upstream movement.
M3 Activation: authorized Astra restart+shared viewer refresh with all current source pinned. Same24h/operator,20000turns/preset; preserve transcripts/reasoning; video verified before calling launch complete.

## Closing the Loop
Pure tests RED/GREEN and operand mutations; actual launcher fake/real rehearsal with recording finalized and ffprobe; full gates/reviews; new run own run_start and advancing video/archives; viewer live frame/commentary proof. Evidence runs/boot-video-20261111.

## Session Log
- Authorized: “yes you should restart it, and please make sure that all runs from boot save video”. Old ef7d clean operator_abort at turn222; transcript/checkpoints preserved, lease released. Coordinator cleared replacement subscription lane, up to3 model-only checks, one viewer refresh and CPU gates. 540GiB available; no storage stop added.

## Surprises
None.

## Multi-Model Review Log
Pending.

## Boy Scout Log
None.

## Archive Milestone (user-gated)
- [ ] Operator approval to archive.

- Focused43 tests PASS, changed-file Ruff/Mypy PASS, full test/build/lint/vendor PASS on237d98e75+candidate:3053 agent/1310 viewer/3469 env/39 gateway, floors/no-I/O guards unchanged. Two real guard mutations (boot-only-2, owner-exit-2) failed with specific assertions and restored; initial boot-only mutation targeted unrelated server argv branch, unexpectedly green and excluded, receipt retained.
- Real-ROM launchers both PASS: native-proof.json (exec) and native-nonexec-proof.json (normal launch) show automatic240x160 H.264 and48kHz FLAC, 3.08/3.18s videos readable by ffprobe, owner-exit supervisor_done and clean server exit. Actual2s video frame shows Emerald copyright, inspected pixels. First cold-start rehearsal used22.5s health bound and timed out before server startup, retained; second uses production-like120s bound and succeeds. A very short standard smoke also attached recorder and stopped cleanly but ended before receiving a video frame, so it is not counted as video proof; both longer launcher proofs above produced files. Past runs are not retroactively recorded.
- Existing recorder explainer updated, twins regenerated, pages-check PASS and1280/1440/375 browser screenshots inspected with no page overflow/errors. Its existing wide diagram scrolls within the figure on phone. No new feature switch: observation-independent measurement only, explicitly requested automatic for every boot.

- Main advanced237d98e75→78c588916 during gates: only independent broadcast-commentary writer, its tests and worklog changed; no launcher/recorder/schema/dependency/build/consumer contract overlap (writer does not import recorder or launcher). Merged main into owned branch; unchanged feature bytes and full gates retained, combined178 focused tests PASS. Required post-main combined just test remains before activation. No hold on other landings.
- M1 source frozen for Claude/fresh GPT reviews. No model-visible code or new recording store/encoder; existing recorder path extended only with optional owner watcher. Broader capture guarantee remains operational: encoder/storage errors are journaled, never terminate gameplay; very short startup crashes may contain no encoded frames. Future ordinary boot launches attach automatically; existing recordings unchanged.

- M1 source complete: frozen59194b6b3/base78c588916/diff1deebefeae68da0c5e72e235b25bcfb8bdd6dba6ce135922f17fa43b8b58fb13. Claude CLI and fresh no-history GPT boot_video_review both VERDICT: LGTM, exact identities/clean tree verified before/after. All13 principles and9 test-quality checks supported; Grok standing all-branch waiver disclosed. No review-driven code changes; synthesis records nonblocking pre-existing prose/cleanup-probe suggestions and speculation without scope expansion.
- Cleared3 model-only Astra commentary checks complete under exclusive lease, now released:2909/4520/6757ms (median4520), all3 return nonempty commentary+tool; third includes25-char exposed summary and1804-char opaque continuation record. Exact raw SSE hashes complete, all text/thinking match ordinary assistant events. Tools were not executed. Not a controlled latency/gameplay comparison.
- M2 landing/post-main combined test next; M3 authorized refresh/restart with same24h and preset20000turns pending. Source introduces no additional stop condition.
