# Broadcast spectator mode

Coordinator brief 2026-11-07 for the operator: build the approved A2 "Broadcast" layout (`runs/reports/run-analysis/2026-11-06_spectator-mode-mockups/mock-A2.html`) into the viewer and land it in small pieces. The Mt. Pyre recorder is waiting on piece 1. Viewer-only and display-only, so no feature switch (feature-switch skill: viewer-only changes need none). No restart of 8790 without the operator's approval.

## Skills Loaded

execute-worklog, viewer-e2e, close-the-loop, talk-to-codex (landing board), steady-screen (page never scrolls; redraws only changed parts).

## Architecture

- `broadcast-feed.ts`: the feed's types and JSON guard, shared by server and page.
- `broadcast-reducer.ts`: server side; keeps only what the page needs from each event line and validates each through narrow schemas. A line it cannot read is skipped, so a run from a newer build still plays.
- `broadcast-store.ts`: server side; reads a run's log incrementally, a bounded chunk per event-loop turn, with disk injected. Answers `GET /api/runs/<id>/broadcast?after=<n>`. Reads `runs/broadcast/<id>/commentary.jsonl` and `runs/broadcast/pricing.json` when they exist.
- `broadcast-timeline.ts`: the page's model; answers "what is on screen at t".
- `broadcast-view.ts`: lane geometry and HTML. `broadcast-main.ts`, `broadcast-boot.ts`: page boot.
- `static/broadcast.html`, `static/broadcast.css`: fixed 1920x1080 stage, scaled to fit other windows.

API COST has no source in the event log and the repo had no API rates for local models. Rates come from the gitignored `runs/broadcast/pricing.json` (USD per million tokens, by model id; no SKU in code), filled from OrcaRouter's public catalog, local models included (the operator 2026-11-06: every model is priced at API rates). No entry shows a dash.

## Invariants

- INV-1: read-only. The page and endpoint write nothing and never touch `runs/<id>/`.
- INV-2: the game box and every panel keep fixed geometry, caption or not, so a compositor can rely on them.
- INV-3: chips never overlap: an older chip sits at least 30 px left of the next.
- INV-4: nothing shows a time limit or end time.
- INV-5: `broadcastSetTime(t)` resolves only after the frame for t is decoded.

## Security Review

GET only, behind the viewer's existing host check and CSP. Run ids go through `eventsPath`. All log text reaches the page through `esc`.

## Milestones

### Piece 1: `/broadcast` page
- [x] RED (8002bec3d)
- [x] GREEN: 68 focused tests
- [x] Browser proof on a separate port against a0b4, 1920x1080 screenshots viewed; follow mode on fake data
- [x] Gates, review, landing: 659795088; post-main `just test` passed

### Piece 2: `just broadcast-render`
- [x] Recorder format from the Mt. Pyre spec and `env/pokebench_env/recorder.py`: journal `at` is the same clock as event `t`; 240x160 at 59.7275 fps, one file frame per game frame; separate FLAC sound. Runs play near 80 fps, so sync marks retime both onto the wall clock.
- [x] Build, proof, review, landing: c6c0f004a; post-main `just test` passed

### Piece 3: `just broadcast-commentary`
- [x] Local model: none free (18020 serves e09e, LM Studio empty, 18100 paid). Coordinator put a temporary loopback Qwen3.6-35B-A3B to the operator; not started. Tool takes --endpoint.
- [x] RED (1800fd9ca), GREEN: 20 env tests and 32 render tests
- [x] Real lines (the operator approved via coordinator 2026-11-07): temporary loopback Qwen3.6-35B-A3B Q4, ctx 8k, 1 slot, nice 10, stopped after. a0b4 Winona fight, t=4279-4760: 16 of 17 turns. Peak 30.6 GB RSS, system memory free never under 78%. Prompt tuned against every turn's thinking; a jargon check refuses button names and KO/HP, retried up to 3 times.
- [x] Review, landing (with piece 2): c6c0f004a; post-main `just test` passed

### Piece 4: `just broadcast-commentary --follow`
Coordinator brief 2026-11-07 for the operator ("whats stopping us from generating these live?"). Follower tails a live run read-only, writes each finished thought's wav then its line, skips a turn on any model or voice failure, drops turns more than 2 behind the newest, exits on run_end or after 30 minutes of silence.
- [x] RED
- [x] GREEN: 43 focused tests under the no-I/O guard
- [x] Rehearsal: real Qwen and Kokoro tailing a replayed 37ca log at one turn per 4 s: 58 backlog turns dropped, 14 lines kept pace, exit 0 on run_end, nothing written beside the fake events.jsonl
- [x] Gates on a9f440d1e: lint (mypy through main's venv; this worktree has no mgba binding), 2,684 agent, 1,200 viewer, 3,048 env, 38 gateway, verify-vendor
- [x] Review: Claude, GPT, fallback LGTM
- [x] Landed 10eba171d; post-main `just test`: 2,684 agent, 1,200 viewer, 3,051 env, 38 gateway
- [x] Live: loopback Qwen3.6-35B-A3B Q4 on 18135 (nice 10, 8k, 1 slot) and follower on 37ca, detached under runs/broadcast/live-model/ with a memory watcher that stops both under 50% free. First lines from turn 158; a caption showed on the served page on a reload.

### Piece 5: Broadcast link in the viewer
Coordinator brief 2026-11-07: no link existed. A BROADCAST link in the top bar follows the run being watched, moves into the phone sheet with RUNS & COMPARISONS, and each run's RUN DETAILS panel on Runs & Comparisons opens the same page. `/broadcast` with no run opens the newest live one.
- [x] RED
- [x] GREEN: 234 focused tests; headless proof on port 8797: desktop click, phone sheet click and RUN DETAILS click each landed on /broadcast?run=a0b4 with no page errors; screenshots viewed.
- [x] Gates on 7bdb2a62d: lint, 3 suites and floors via just test, verify-vendor
- [x] Review: Claude, GPT, fallback LGTM (sha cb02e865)

### Piece 6: live captions and sound on /broadcast
Follow mode only: new captions as they arrive, wavs queued, lines older than 30 s skipped, one-click sound on. Needs the feed to send new lines on polls and a route for the wavs. Replay and transparent stay silent.
- [ ] Build, review, landing

## Closing the Loop

Per piece: tests, real headless browser screenshots at 1920x1080, then landing and the post-main `just test`. Serving on 8790 waits for the operator's OK.

## Session Log

Piece 1 browser proof, headless on port 8797 from a scratch runs root symlinking finished runs (the 8790 viewer and e09e untouched): a0b4 at t=4656.3 and 4700 matches the mock with real data (`FIGHT → ROCK TOMB`, 24/159, vs WINONA, $0.83 at OrcaRouter's public rates). 5f0f boot run at 2:10:50 shows FROM BOOT and a full lane with no overlap. transparent=1 clears the page and game box and keeps the caption. Fake live run (log replayed from a0b4 with fresh times, fake game server with health and frame socket): the default run picked it, clock ticked, 15 chips arrived, frames came through the socket as blobs, and the clock held once run_end landed; no console errors. Cold read: 1.8 s for a0b4's 516 MB, 7.3 s for 5f0f's 2.3 GB, in bounded steps; feed 5.8 MB and 7.1 MB.

Piece 2 proof on 80af, t=225-265, across the recorder's kill and restart at t=246.8: 1920x1080 at 60 fps, 40.00 s, sound at -23.8 dB mean. The composite frame viewed. Saved game frames at t=226, 231 and 246 match the render's game box within 0.22 s. A session's last stretch has no sync mark, so it runs on at its last pace. Own-frames path: a0b4 t=4650-4656 rendered in 6 s.

Full 80af render to mp4 (10:11, 1080p60, H.264 yuv420p, AAC, 91 MB). Report folder `2026-11-07_broadcast-80af-test` embeds it, so the reports route now serves .mp4 with byte ranges (Safari needs them) and report pages allow media from their own folder. Caption rehearsal showed a line timed at the end of a thought could vanish in half a second when the tool was quick, so lines now start with their turn.

## Surprises

## Multi-Model Review Log

Round 1, frozen 0bc415075..5eff8420d (sha 0e4069bc). Cursor out of usage until 11/17, so Claude CLI, Codex GPT (gpt-5.6-sol) and a fresh fallback subagent per the operator's standing rule. All BLOCKING on one real bug: setTime on a page already following live frames neither stopped them nor loaded the recorded frame (Claude reproduced it). Claude and GPT also: a frame that failed to load still resolved setTime. Both fixed, with tests; a held moment also re-reads a live log and clears the picture before the first frame. Rebutted: GPT's superlinear copying in the store test fake and in partial lines: lines stay far under the 1 MiB chunk, and the fake's copying is a few KB; no failure shown.

Round 2 on 79d6d2637: Claude and fallback BLOCKING, both reproduced: setTime's new read overlapping a poll added the same items twice (cost and thinking wrong for the page's life). Fixed by one read at a time, with a test holding a poll open. Round 1 fixes confirmed.

Round 3 on d38ee902f: GPT LGTM. Claude and fallback BLOCKING on one regression from the round 1 fix: a cancelled decode skipped revoking the old blob, so a long follow page could leak under load (Claude measured it in real Chromium under CPU throttling). Fixed by retiring on both outcomes, with a test. Past the round cap, so reported to the coordinator: the fix covers only that listed bug.

Round 4 on d7b7d1f16, the blob fix alone: Claude, GPT and fallback LGTM. Coordinator accepted the narrow round past the cap.

Pieces 2 and 3, round 1 on 08069ac80 (sha 81c9d25c), Claude, GPT and fallback all BLOCKING. Fixed: a clip past its file's end dropped out of the concat and shifted later picture (every clip now plays over black of its own length); joined stretches averaged away a small lasting pace change (marks must stay within 6 frames of the joined line); a failed step left ffmpeg running and the command hung (Encoder.abort); `content: null` crashed the job; a session too short for a sync mark rendered black; page-only renders now carry a silent AAC track; `--fps Infinity`; report video reader closed on a dropped request; just recipes pass paths as arguments; commentary saves every 25 lines. Rebutted: GPT's missing report route (it was committed after the frozen head by a hook refusal; now reviewed). Left: `frames_lost` stretching frames across a hole longer than 10 minutes.

Pieces 2 and 3, round 2 on 6377340ad: all BLOCKING. Fixed: abort left ffmpeg blocked on stdin (close it, then kill); sound past a file's end collapsed the rest of the track to 0.2 s (`asetpts=N/SR/TB`; real 80af stretch at 246.6 now 12.000 s of sound, -23.7 dB); the black-base overlay dropped colour to 4:2:0 before the upscale (`format=yuv444`); a stretch shorter than a frame rendered nothing; `--fps 1e308`. Rebutted: GPT's quadratic pace merge at 80,000 marks: that is 41 days of run, and a 24 h run has about 1,900.

Round 3 on b282100f1: Claude, GPT and fallback LGTM. Left as is: a range under 0.5 ms writes an empty file; an aborted render leaves a partial mp4.

Prompt patch 53144b2d3: Claude and fallback LGTM, GPT BLOCKING on `OHKOs` passing the jargon check. Inflections added.

Commentary prompt landed at 2ab63c135: GPT LGTM on the inflection fix, Claude and fallback LGTM before it. Post-main `just test`: 2,684 agent, 1,200 viewer, 3,032 env, 38 gateway.

Piece 4, round 1 on 724bd5a1d (sha 7e359be9): fallback LGTM, GPT BLOCKING, Claude CLI default login expired (retried with ~/.claude-review). Fixed: a failed last save exited with success and lost the line (now retried, and a repeat failure stops loudly); turns recovered on a restart were appended after later ones (sorted by time). Rebutted: a follower started before the run log exists fails at once, which is the right answer.

Piece 4, round 2 on a9f440d1e: Claude and fallback LGTM; GPT BLOCKING only on a wav write failure exiting 0 after a logged skip. Rebutted (incomplete commentary is the designed outcome; the brief says skip and carry on); GPT re-judged with the rebuttal: LGTM.

## Boy Scout Log

## Archive Milestone (user-gated)
