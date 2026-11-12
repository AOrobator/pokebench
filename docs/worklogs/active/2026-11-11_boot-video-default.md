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
