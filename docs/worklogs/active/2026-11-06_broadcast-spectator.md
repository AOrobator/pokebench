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
- [x] Landed aef93554a; post-main `just test` passed (3,051 env)

### Piece 6: live captions and sound on /broadcast
Follow mode only: new captions as they arrive, wavs queued one at a time, lines older than 30 s skipped, one click to turn sound on. The feed sends new lines on polls and a route serves the wavs. Replay and transparent stay silent. `?voice=0` turns sound off for a page: display-only, so no harness switch (feature-switch skill); anything else leaves it on, and a missing button, wav or speaker fails open to silent captions.
- [x] RED
- [x] GREEN: 128 focused tests
- [x] Rehearsal: fake live run replaying 37ca with fresh times, real follower, Qwen and Kokoro, this page headless on 8797: button shown, one click, nine wavs played in order with no overlap (206 from the route), captions arrived on their own, button gone after the click and absent at ?t and transparent=1, no page errors. 1920x1080 screenshot viewed.
- [x] Gates on 40947a3d5: lint, 2,684 agent, 1,218 viewer, 3,051 env, 38 gateway, verify-vendor
- [x] Review: Claude, GPT, fallback LGTM on the final delta
- [x] Landed b82990ae8; post-main `just test` passed

### Piece 7: real badge sprites on /broadcast
The operator 2026-11-07: "the broadcast view needs to use the actual sprites of the gym badges". The game's Trainer Card draws every badge grey (ROM palette at 0x56f4ec, one palette for all; the image-gen thread matched all 760 opaque pixels in a real game), so the files are grey. Read from the gitignored runs/sprites/rom-badges/, never in git; discs stay as the fallback when any file is missing.
- [x] RED
- [x] GREEN: 132 focused tests; 1920x1080 headless screenshot of a0b4 at t=4700 viewed: five earned full, Feather dimmed with an outline, two faint, pixels crisp at 2x; with no sprite files the same build drew eight discs and no errors.
- [x] Gates on 1cd94c4b5: lint, just test, verify-vendor
- [x] Review on 1b214d406: Claude, GPT, fallback LGTM
- [x] Landed 70b05014c; post-main `just test`: 2,684 agent, 1,221 viewer, 3,051 env, 38 gateway

### Piece 8: the live page stops flashing
The operator 2026-11-07: "why does the broadcast view flash? it looks bad". Measured on the served page: WebKit showed a black game box in 123 of 972 shots in 15 s, because live frames swapped the img src about 75 times a second and WebKit blanks between sources; Chromium did not show it, though 57 of 1,718 animation frames found the image incomplete. The caption box also vanished 15 s after each line and popped back, a white block about every turn.
- [x] RED
- [x] GREEN: 132 focused tests. Live frames draw on a canvas, newest frame wins; caption holds 120 s. WebKit against the live page, branch modules routed in: 0 black in 2,406 shots over 40 s, 35 distinct pictures, against 123 of 972 before. Shots viewed.
- [x] Gates: lint, 2,688 agent, 1,233 viewer, 3,051 env, 38 gateway, verify-vendor on the music branch that contains this head
- [x] Review: Claude, GPT, fallback LGTM on 0c4db75c7
- [x] Landed c127971b3; post-main `just test` passed

### Piece 9: game music on /broadcast
The operator 2026-11-07: "it'd be nice to also have game music playing". The game server's `/audio.wav?since=` is a bounded, non-consuming tape with a cursor per reader (`env/pokebench_env/audio.py`), so it is the recorder's own source and a second reader never touches the core. 20 s of cursors from 37ca: steady 1.33 of real time, never pausing, so sound follows game speed and is pitched up by a third, as `/view` says. The viewer proxies it and the page plays it under the commentary: same SOUND ON click, chunks laid end to end, dipping under each line, with level and mute. Replay and transparent stay silent.
- [x] RED
- [x] GREEN: 144 focused tests. 30 s headless on the live page, branch modules routed in and the audio route answered from the tape: 284 chunks at rate 1.338, 3 seams off and the worst by 24 ms, 171 ms lead, three voice lines, level dipping 0.5 to 0.15, no page errors.
- [x] Gates on ff020194c, then 146 focused tests on the two small fixes
- [x] Review: Claude, GPT, fallback LGTM through 52d3ebed1
- [x] Landed 6efad480a; post-main `just test`: 2,688 agent, 1,235 viewer, 3,051 env, 38 gateway

### Piece 10: sound controls in the header
The operator 2026-11-07: "i'd rather the music /sound toggle not be overlayed on the video, we have so much space in the header". Controls sit outside the scaled stage, placed by the stage's scale: in the header's empty middle on wide screens, under the stage on a phone, where a scaled header would make them too small to tap. The page also now keeps phones from zooming out to fit the 1920 stage (minimum-scale=1), which had put it at 1560 wide.
- [x] RED
- [x] GREEN: 146 focused tests; 1920x1080 and 390x844 headless on the live page, branch modules routed in: controls clear of the game box in both, click works in both, shots viewed.
- [x] Gates on e114d4dac: lint, 2,734 agent, 1,235 viewer, 3,051 env, 38 gateway, verify-vendor; later delta is CSS only
- [x] Review: Claude, GPT, fallback LGTM on 5c6d20818

### Piece 11: Claude-written lines and voice flags
Coordinator brief 2026-11-11 for the operator: the 67d7 YouTube broadcast narrated by Claude Sonnet lines voiced with Kokoro bm_lewis (the operator's choices, 11/11). `--writer claude --claude-model <id>` calls headless `claude -p --output-format json` (no tools, no session, empty cwd, env allowlist as in scripts/claude-gateway) on batches of 25 consecutive assistant turns (thinking, the turn's own text, its tool call), with the last 4 lines for continuity; Sonnet may leave routine turns empty. A batch whose JSON does not parse or names turns outside it is retried 3 times then skipped; three call failures in a row stop the job with lines saved. Every line passes MAX_WORDS, the jargon check and a privacy scrub (paths, URLs, IPs, hostnames, e-mail, the operator's name from the login's full name). `claude-batches.jsonl` records each batch's turns, cost and tries, so a resume skips covered turns. `--voice/--lang/--speed` (defaults af_heart, en-us, 1.05, unchanged), `--lines-only`, `--voice-only`, `--out`. Default behaviour is unchanged. `claude-sonnet-5-5` checked with one live call; the default login is expired, `~/.claude-review` works (`--claude-config-dir`).
- [x] RED
- [x] GREEN: 106 focused tests under the no-I/O guard; module 99% (the two misses predate this piece); env ruff, format, mypy clean
- [x] RED (700fbd7fc), GREEN: 109 focused tests, module 99%: `--thinking-from <gateway bridge>`. 67d7's events.jsonl has no thinking on any of its 4,124 turns; the session gateway kept Opus's thinking in its bridge (`calls.jsonl` + `calls/call-<request>-<attempt>.jsonl`), 1,876 turns with thinking. A turn takes a call's thinking only when the request number is the turn and the call's reply text equals the event's text. First join found 3,402 of 4,124 replies: 723 records hold fenced JSON or prose around the JSON, so the reply is now read with the gateway's own candidate rules. GREEN: 114 focused tests, module 99%; on 67d7 all 4,124 turns join, 1,876 with thinking, 0 mismatched.
- [x] Gates on f330c9209 (main 0866461a2 merged in; README chart changes only, disjoint), relay START 5:29 PM: `just lint` pass; `just test` pass with floors (3,042 agent, 1,286 viewer, 3,446 env, 39 gateway); `just verify-vendor` OK after initializing the submodule in this worktree (pin bbab97ad unchanged)
- [x] Landed f52285423 (ff-only) on local main, not pushed; post-main `just test`: 3,042 agent, 1,286 viewer, 3,446 env, 39 gateway. Landing pieces 11 and 12 (the operator 11/11, to "If v2 looks right, tell me to land it": "v2 looks good"): main c213b0c51 merged in, then gates, Claude CLI + fallback lanes on the whole packet (GPT already LGTM per round), land-join, ff-only merge, post-main `just test`.
- [x] Trial: 67d7 turns 3420-3460 (t=52194.93-52658.04, Route 131 to Sky Pillar Top and the Master Ball catch), out of tree in runs/broadcast/67d7-trial/. Without thinking: 2 calls, $0.034, 12 lines. With `--thinking-from` (13 turns joined): 2 calls, $0.042, 0 retries, 0 refused, 0 skipped, 17 lines (one per 27 s), 24 s wall incl. bm_lewis voicing. Render t=52400-52668 (4:28) at 30 fps through `broadcast-render`'s CLI with POKEBENCH_RUNS on a scratch root (symlinks; no rebuild of main's dist), nice 10. No sound toggles on the page. Game sound does not dip per line: the render mixes the game at a constant 0.35 under the whole clip (per-second RMS ~-32 dB, lines peak ~-24 dB). API COST shows a dash: pricing.json has no Opus entry.
- [x] Review: Codex via `just tell-codex`
  - Round 1, GPT on 79704679f..0b3845392 (packet sha 52f4e855): BLOCKING, all three real and reproduced. (1) a skipped batch, or claude exiting nonzero with a well-formed result, still ended the job with success; (2) the scrub missed the machine's own single-label hostname; (3) argparse in tests stats gettext catalogs when LANG is set, so 11 tests fail the no-I/O guard (my shell has no LANG). Fix: validation moves to a pure `Options`/`options_problem`, argparse stays in the entrypoint; nonzero exit when a batch is skipped; the hostname joins the private words. RED 2b4aa99f2; GREEN: 118 focused tests pass with LANG=en_US.UTF-8 under the guard, module 99%, env lint clean.
  - Round 2, GPT on 79704679f..514f79c93 (packet sha 3905e519, delta sha 5e4a75d4): LGTM; fixes confirmed, 118 passed under LANG=en_US.UTF-8. Only the GPT lane ran (the brief asked for Codex review); not landed, per the brief.

### Piece 12: 67d7 render fixes (ducking, thinking, API cost)
Coordinator brief 2026-11-11 for the operator: (1) `broadcast-render` plays the game at full level and ducks it about -12 dB under each spoken line (150 ms attack, 400 ms release) with a volume envelope built from the line times, instead of a flat 0.35; (2) THINKING for 67d7 from the bridge, via `runs/broadcast/<run>/thinking.jsonl` (`--side-only --thinking-from`, scrubbed like the lines), filling turns whose events have none; (3) API COST counts up per turn from the bridge's `session_cost_total_usd` via `runs/broadcast/<run>/cost.jsonl`, ending at $780.55. Never touches `runs/<run>/`.
- [x] RED (7c2ed0df0)
- [x] GREEN: env 122 focused tests under the no-I/O guard (LANG=en_US.UTF-8), module 99%, ruff/format/mypy clean; viewer 150 broadcast tests, broadcast modules 98.8% lines 91.1% branches, eslint and tsc clean on the changed files. `--side-only --thinking-from <bridge>` on 67d7: 1,876 turns of thinking (scrub blanked nothing), 4,124 cost rows, last $780.55. Duck: `volume='1-0.748811*max(...)':eval=frame` with one clipped attack/release ramp per line, balanced max. Store reads the side files once per run tail; event thinking wins over the side file; recorded dollars beat token pricing.
- [x] Ducking dropped (the operator 11/11: "i dont think we need to duck audio the video sounds fine"): broadcast-render.ts and its test restored to a6bec58b5, game flat at 0.35 as in v1. Measured before dropping it, on the first v2 render: game -22.9 dB between lines, -34.9 dB under them; voice about 9 dB over the ducked game; mix peak -3.7 dB.
- [x] THINKING scroll (the operator 11/11: "it should start from the top and scroll down if its long"): the panel shows the whole thought from its top; past a hold of 15% of the time until the next thought, it scrolls to the end by 85% of it (20 s assumed live), scrollTop a function of t so render frames repeat. RED c38d3f29d; GREEN: viewer broadcast 152 tests. Scrub fix: env 127 tests, module 99%, lint clean.
- [x] Trial v2 render t=52400-52668 at 30 fps from 6d512bcac to runs/broadcast/67d7-trial/67d7-sky-pillar-rayquaza-trial-v2.mp4 (4:28). Frames viewed at 0.5, 120 and 267.5 s: THINKING top-anchored (Opus thinking on turn 3461), API COST $649.47 → $651.28 → $654.09, matching cost.jsonl at turns 3433/3461; run total $780.55 at turn 4124. Audio identical to v1 (RMS -29.2 dB, peak -3.6 dB). The white game box at 0.5 s is a warp fade, also in v1.
- [x] Review: Codex via `just tell-codex`
  - Round 1, GPT on a6bec58b5..83af8282d (packet sha f91eb9b4): BLOCKING, real and reproduced: the scrub blanked only the first part of a path with spaces or parentheses. Fix: a path or URL is blanked from its start to the end of its line (fail closed).
  - Round 2, GPT on 83af8282d..14eb976be (packet sha b8d139bc): scrub fix confirmed; BLOCKING, real and reproduced in Chromium and WebKit: the bottom fade kept the end of a fully scrolled thought washed out. Fix: 48 px of room after the last line (CSS only).
  - Round 3, GPT on 14eb976be..5f41f6d91 (sha f41ed3fa): LGTM, rechecked in Chromium and WebKit at four widths.
  - Round 4, GPT on 5f41f6d91..6d512bcac, the ducking revert (sha 0cdcabae): LGTM; render files byte-identical to a6bec58b5, 151 tests. Not landed, per the brief.
  - Landing round on the whole packet main..971cded0d (sha 0acb16cb, main c213b0c51 merged in; boundary and principles in runs/reviews/broadcast-claude-lines/landing-*): Claude CLI (~/.claude-review, plan mode) LGTM; fallback subagent (Sonnet) LGTM; GPT LGTM per round above. Cursor/Grok out of usage until 11/17, so Claude + GPT + fallback per the operator's standing rule. Follow-ups, not in this branch: `--out` could point inside runs/<run> (refuse it in options_problem); `cost_rows` trusts request = turn with no text check and can go backwards if a request number repeats (clamp, or join like thinking); a run's own event thinking is shown unscrubbed (as before); the scrub has no token pattern and misses relative and UNC paths.

### Piece 13: dense lines sized to each turn
The operator 2026-11-11: "the video seems to go a long time in between thinking out loud when there are more agent traces to be read". 67d7 measured: turns every 11.0 s median (p10 4.3, p90 29.9); 1,222 lines over 4,124 turns, 9.7% of the run spoken. Kokoro bm_lewis at 0.95 speaks 2.77 words/s median (seconds = 0.77 + 0.306 x words). `--dense` (claude writer only; default unchanged): a second system prompt that voices every turn with thinking or a meaningful action and skips only true repeats, and each turn in the batch carries `seconds` (time until the next turn, 10 s for the last) and `max_words` = floor((seconds - 1.0) / 0.31), capped at MAX_WORDS. Rooms come from every turn, so a resume asks with the same budgets. The render needs no change: a line waits for the last one and is dropped if it would start more than 3 s late.
- [x] RED
- [x] GREEN: 133 focused tests under the no-I/O guard (LANG=en_US.UTF-8), module 99%, ruff/format/mypy clean
- [x] Trial on the Sky Pillar window (turns 3420-3461): 40 lines in 42 turns (was 13), one per 11.6 s (was 35.6), 38% of the window spoken (was 13%), 0 dropped in a schedule simulation, max lag 0.7 s; 2 calls, $0.06. Full rewrite approved via the coordinator at ~$6; it runs to runs/broadcast/67d7-dense/. Turns 476-500 were refused by Sonnet's safeguards (reasoning_extraction) 3 times and stopped the job; a resume passed them.
- [x] Review: Codex (resume-mode fix: 135 tests, module 99%, lint clean)
  - Round 2 on e0d6d4591..dbb41ec59: Claude CLI LGTM; GPT/Codex LGTM. Grok out until 11/17; fallback LGTM on round 1.
- [x] Landed 930b41982 (ff-only) on local main, not pushed; post-main `just test`: 3,053 agent, 1,310 viewer, 3,474 env, 39 gateway
- [x] Gates on dbb41ec59 (main 237d98e75): lint, `just test` (3,053 agent, 1,310 viewer, 3,474 env, 39 gateway), verify-vendor
  - GPT/Codex on main..e0d6d4591 (sha 302bf54c): LGTM. Fallback (Sonnet): LGTM. Claude CLI: BLOCKING, real: a resume ignored the writer mode, so --dense on a folder already written plain did nothing, and a mode switch mid-run mixed lines. Fix: batches record `dense`; a resume in the other mode is refused. Its PB6/PB8 wording notes accepted (per-turn max_words is advice; rooms are within the --start/--end window). The full rewrite writes to a new empty folder, so it is unaffected.

### Piece 14: name pronunciations when voicing
The operator 2026-11-11: "could we do some special spelling or prompting so that pokemon names are proper nouns in the game are pronounced correctly?". espeak (en-gb) says Pokémon as "POCK-ay-mən", Manectric as "MAINK-trick", Kyogre and Sootopolis with the wrong stress. `--lexicon <tsv>` (voicing only; default unchanged): listed names are spoken from the file's phonemes (Kokoro's espeak-style IPA) and the rest of the line goes through espeak, then `create(..., is_phonemes=True)`. Captions and commentary text stay as written. The table lives in env/pokebench_env/data/pokemon-lexicon.tsv with a source per row (Bulbapedia, Wiktionary, or marked unsourced).
- [x] RED
- [x] GREEN (code): 139 focused tests under the no-I/O guard, module 99%, ruff/format/mypy clean
- [x] Lexicon sourced and checked against espeak: 175 names researched (pokemon-lexicon-research.tsv: respelling, US IPA, whether espeak already says it right, source). Bulbapedia refused fetches (403), so species come from Serebii's official pronunciation tables, others from Wiktionary/Wikipedia; 35 unsourced, mostly places. 60 names espeak gets wrong; 57 go in pokemon-lexicon.tsv as espeak-style en-gb phonemes (stress before the vowel, every symbol in Kokoro's vocab). Mauville, Fallarbor and Liza stay with espeak: unsourced and uncertain.
- [ ] A/B for the operator (without, then with) before voicing all lines
- [ ] Review: Codex

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
Piece 6, round 1 on 4ebeba1b7 (sha 33b85991): Claude, GPT and fallback all BLOCKING on one bug: a click with no line waiting never played inside the gesture, so strict browsers stayed locked. Fixed by playing through Web Audio with the context resumed in the click. Rehearsal again, clicking before any line existed: context running, five wavs played in order with no overlap. Rebutted: an open page misplacing a line a restarted follower sorted into the middle (restart only, within the last two turns; a reload heals it); the run's last line missed by a page that stopped polling at run_end; the 15 s caption hold measured from the thought's end (rehearsal shows lines a few seconds behind).

Piece 6, round 2 on f4b932af4: fallback BLOCKING on the new speaker: the stall limit began after the fetch, so a hung wav held the queue; a stalled line left its node running; stop missed a line in flight. Round 2 lanes: Claude LGTM; GPT BLOCKING on the same stall and stop bugs; GPT's third (a caption outliving its hold on a long turn) rebutted: it is still the current turn's line. All fixed with one limit over the whole line and a ticket. Rehearsal again: five lines, no overlap, button gone, replay and transparent silent.

Piece 6, round 3 on 293ad2bd7: Claude, GPT and fallback LGTM.

Piece 8, round 1 on 361eb7172: fallback BLOCKING on two real bugs: the canvas's `.live` class also matched the next badge (`bdg live`), pulling it out of the row; and when the socket closed after the run ended nothing redrew the img. Fixed by a `.feed` class and a redraw on close.

Piece 9, round 1 on ff020194c: Claude and fallback LGTM; GPT BLOCKING on one bug: music kept polling after the run ended. Fixed. Left: an operator pause drags the rate down for about 1.5 s after resume; it heals itself.

Piece 9, round 2 on cf0a05fe5: Claude and fallback LGTM; GPT BLOCKING on a click in the 100 ms after the run ended. Fixed. The test was committed red at 52d3ebed1 by a timing mistake in the test; fixed, and proven to fail with the guard removed.

Piece 10, round 1 on e114d4dac: fallback BLOCKING: a landscape phone under 700 px wide put the controls past the screen's bottom. The under-the-stage rule is now portrait only. Claude and GPT found the same bug. Controls also moved 60 px right, clear of the longest model and pill.

## Boy Scout Log

## Archive Milestone (user-gated)
