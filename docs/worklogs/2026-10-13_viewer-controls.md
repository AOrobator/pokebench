# Viewer controls: run control, next-run switchboard and strict feature history

## Problem Statement

The operator approved a viewer control surface (2026-10-13, design rounds 2–5; final design `runs/mockups/controls-round5/22-final-candidate.html`, base style mockup 16, switchboard copy from mockup 11) and asked: "update the worklog, build it, then land it."

Today the viewer is watch-only. An operator cannot pause, stop or abort a live run from it (abort exists only as SIGINT to `live.js`), cannot configure or queue the next run, and cannot see per-feature evidence. Only four harness switches are real (`loopGuard`, `activeUi`, `interfaceDocs`, `objectives`, and `objectives` bundles three features); the other observation and guidance features are hard-wired in `live.ts` and `env/pokebench_env/readout.py`, so a switchboard over them would be a lie.

Operator decisions (precedence order, from the coordinator brief):

1. Base style = mockup 16 "milestone bars": live run on top (Glacier GBA + side panel), PokéNav switchboard below that edits the NEXT run. A live run keeps its features; switches that differ from the live run are flagged; the next run queues behind the live one (one local model).
2. Run controls in the sticky top bar next to the run picker: PAUSE (P), STOP (S), ABORT (hold X), plus CANCEL STOP while stopping. Never in the thinking panel.
3. Pressing a control puts an overlay on the GBA screen: PAUSED, STOPPING, RUN ENDED, ABORT? (hold-to-confirm, release cancels), ABORTED.
4. Side panel order: stats (turn/time/failures/context), SPLITS THIS RUN (vs best), agent THINKING at the bottom scrolling in place with FOLLOW LATEST. No expand button, no full-width thinking card.
5. Every harness feature that changes what the model sees or does is its own switch with a plain description (what it does, what changes when off) and its dependency ("needs X"): 10 observation, 5 guidance, 4 guards (19). Measurement-only features (story-milestones-v2, clock-milestone-v1, new-game-created-v1, native-target-stop-v1, deterministic-loop-diagnostics-v1) are shown with descriptions and stay on. Each description is verified against the code before it ships.
6. Per-feature history is STRICT: only past runs identical except for that one feature (same model, thinking, budget, every other feature). Inline paired on/off bars per milestone (runs that reached it), expandable to reach plus median split on vs off. Empty state "No matching runs yet". Real data only.
7. Model choices are local llama-server (Hermes router, 127.0.0.1) models only; no inference.example gateway lanes in this UI.
8. Pause = finish the current turn, then hold: emulator frozen, no model call; paused time excluded from the time cap and recorded as events so the timeline shows the gap. Stop = end after the current turn with run_end reason `operator_stop`, still scored. Abort = existing `operator_abort`, excluded.
9. Everything local: no network requests from the viewer (vendor the fonts it loads from Google Fonts); all servers on 127.0.0.1.

Approval basis: the operator approved the design and asked to build and land it; this worklog records the plan. Landing is additionally gated (see M6).

## Skills Loaded

- `feature-worklog`, `execute-worklog` (PokeBench)
- `agent-observability` (new operator-control events: producer → durable event → model-feedback N/A → timeline/Activity History/replay)
- `~/dev/local-inference-stack/.claude/skills/multi-model-review/SKILL.md` (review contract)
- `pokebench-game-state` as needed to verify observation descriptions against the reader

## Architecture

- **Feature registry (agent, `features.ts`)**: one typed table of every harness feature id, group (observation / guidance / guard / measurement), title, verified description, `needs` dependency, and whether it is switchable. `live.ts` builds `harness_features`, prompt text, tools and server env from a resolved feature set instead of literals. Default (all on) reproduces today's `harness_features`, prompt and readout byte for byte.
- **Play preset v2**: `{version:2, id, model, target, limits, sampling, features:{<id>:bool}}`, dependency-validated. v1 presets (four flags) keep parsing for existing comparison artifacts and normalize to the same feature set.
- **Server-side observation switches (env)**: the launcher passes `POKEBENCH_FEATURES_OFF` (validated id list) to the game server; `format_readout` omits the disabled lines/sections. `state_json` (measurement, milestones) is unchanged.
- **Run control channel**: the viewer appends typed requests to `runs/<id>/control.jsonl`; the running agent's `RunControl` polls it, applies requests at the turn boundary (pause/resume/stop/cancel-stop) or immediately (abort), and records `operator_control` events. Pause calls new `/pokebench/pause|resume` endpoints on the game server, which hold the vendor frame loop via a pokebench-owned wrapper (vendor untouched). Governor wall time subtracts paused time. New run_end reason `operator_stop`.
- **Viewer server**: `POST /api/runs/<id>/control` (Origin + JSON content-type checked, live runs only); `GET /api/features` (registry); `GET /api/features/history` (strict pairs from every run's `run_start` + milestones); `GET /api/models` (local router only, via the endpoint file, key never sent to the browser); `GET/PUT /api/next-run` (draft) and `POST /api/next-run/queue` → a launcher that waits for no live run and no gameplay lease, takes `runs/.naming-gameplay.lock` for the launch, writes a v2 preset and spawns `live.js play` (argv only).
- **Viewer UI**: top-bar controls and keys, GBA overlays, reordered side panel, PokéNav ★ NEXT RUN page with the switchboard and inline history, fonts vendored under `static/fonts/` with CSP `font-src 'self'`.

## Invariants

- **INV-VC1 Default parity**: with every feature on, `harness_features`, system prompt, tools and readout text are identical to `0632fc0`. Test: golden comparisons against literals captured from the current code.
- **INV-VC2 A switch is real**: each switchable feature, turned off, removes exactly its own model-visible output and its id from `harness_features`. Test: per-feature readout/prompt/tool tests plus a registry↔`harness_features` round trip.
- **INV-VC3 Dependencies hold**: a preset enabling a feature whose `needs` is off is rejected (agent and viewer). Test: parse rejections.
- **INV-VC4 Pause never calls the model and never counts against the time cap**: Test: governor/RunControl fake-clock tests; recorded `operator_control` events bound the gap.
- **INV-VC5 Stop is scored, abort excluded**: `operator_stop` is a terminal, counted reason; `operator_abort` stays excluded. Test: summary/history tests.
- **INV-VC6 Strict history**: a past run contributes to feature F only when model, thinking, max tokens, budgets, target, start state and every other feature equal the draft; no sample numbers. Test: pairing tests including near-miss exclusions.
- **INV-VC7 Local only**: viewer pages make no off-host requests (CSP with no external origins, fonts vendored); every server binds 127.0.0.1; model list comes only from the local router. Test: CSP/server tests and a browser network check.
- **INV-VC8 Control is same-origin and bounded**: non-GET routes reject foreign Origin/Host and non-JSON bodies; control applies only to live runs; queue launch respects the gameplay lease and one-live-run rule. Test: server tests.
- **INV-VC9 Frozen benchmark untouched**: no edits to naming-comparison manifests, presets, adapter, receipts, runs, model services or leases; no gameplay run while a cohort holds the lease.

## Security Review

- New write surface: control/queue POSTs on the viewer. Mitigations: 127.0.0.1 bind, Host allowlist (existing), Origin must equal the viewer origin, `content-type: application/json` required (no simple cross-site form posts), typed body validation, run id regex.
- Subprocess: queue launches `node live.js play` with argv list and an explicit env; preset written by the server, not taken from the browser verbatim (validated).
- Secrets: the router API key is read server-side only and never serialized to the browser or logs.
- Fonts: OFL fonts copied from the approved mockup bytes into the repo with their license; no CDN.

## Milestones

**M1 — Feature registry and real per-feature switches (agent + env)**
- [x] Verify each of the 19 + 5 descriptions against the code (readout lines, prompt, tools, guards); record corrections here
  - Corrections vs mockup 11/22 copy: NPCS + OBJECTS needs ram-state (world_context is independent of the grid), not live-map; DIALOGUE AS TEXT is the field-message buffer (can include undisplayed pages) and the separate short `Dialog:` line stays; PLAYER POSITION off drops only the Position line (map still marks @); STORY FLAGS lists completed story steps, not raw flags; WORLD TARGETS are map event candidates (objects, warps, signs, step triggers); LOOP GUARD also covers repeated tool rejections and ends the run as `stuck`; REPEAT-ATTEMPT GUARD blocks the third identical no-change press and warns on position cycles; ACTIVE UI off also degrades the Menu line; RAM readout off also rewrites the observe/press lines of the system prompt; PRESS RESULTS declared `needs ram-state-v1`.
  - Off semantics: observation switches remove only their own readout text on the game server (`POKEBENCH_FEATURES_OFF`); `state_json` (measurement, milestones, viewer) is unchanged. Prompt golden hashes at 0632fc0: all-on 9acbcc60…, all-on+PLAYER_NAME_CONFIRMED f2f0dd35…, docs-off c9ea0a80…, objectives-off 5ea89164…, OBJECTIVE_PROMPT 33c0b2a9….
- [x] Write tests: registry completeness vs `live.ts` ids; v2 preset parse + dependency rejection; v1 normalization; default parity goldens (INV-VC1); per-feature off removes only its output (readout, prompt, tools, harness_features); env `POKEBENCH_FEATURES_OFF` validation
- [x] COMMIT: `test(features): require real per-feature switches with default parity (RED)` (d4f573f): agent 4 failing tests + 3 failing files (594 run), python collection error, implementation hidden
- [x] Implement registry (`features.ts`), prompt/tools (`play-config.ts`, constants moved byte for byte from live.ts), preset v2 (+`parsePlayPresetV1` for frozen comparison manifests, `presetFlags` keeps the run_start evaluation contract), objective/press switches, env readout switches (`POKEBENCH_FEATURES_OFF`, `GameState.nearby` for re-rendering)
- [x] Gates: tests agent 618 / viewer 170 / python 437 pass; lint, build, verify-vendor OK; coverage agent 98.97L/94.18B/98.44F, viewer 98.55/91.24/98.59, python 99.40/97.27/100
- [x] COMMIT: `feat(features): make every harness feature a real switch with default parity` (9f4303f) (GREEN)
- [x] Guard deletion/restoration receipts: 17/17 mutated red, restored green (`runs/launch-receipts/viewer-controls/m1-guards/01..17`)
- [ ] Multi-model review loop until clean

**M2 — Run control in the agent and game server (pause / stop / cancel / abort)**
- [x] Write tests: control file parsing; pause at turn boundary with no model call; resume; stop → `operator_stop` after current turn; cancel stop; abort immediate; paused time excluded from wall budget and rescheduled timer; game-server pause wrapper holds the frame loop; viewer fold (control state, paused gap on timeline, Activity History rows)
- [x] COMMIT: `test(control): require pause, stop and abort through the control file (RED)` — RED observed: agent harness/run-control test files fail to import, viewer control-view 3 failing, python collection error
- [x] Implement `RunControl` (control file poller, state machine, gate, `BudgetTimer`), governor `takeStop`/`pausedMs`, `piLoop` gate plus no-model-call guard once the run has ended, `operator_stop`, `operator_control` events (`just schema`), env `/pokebench/pause` latch wrapping the vendor `step_environment` (vendor untouched), live.ts wiring, viewer fold (`ControlView`, paused gap on the timeline, Activity History rows, splits/time cap excluding paused time), `just tail-run` rows
- [x] Gates: agent 638, viewer 174, python 441 pass; lint/build OK; coverage agent 98.89/93.81/98.35, viewer 98.6/91.13/98.19, python 99.41/97.30/100
- [x] Guard receipts `m2-guards/01..14`: 13 of 14 red then green; 13 unexpectedly passed (the stop event already closed the pause) and is retained; a crash-while-paused test was added and fresh attempt 13b went red then green
- [x] COMMIT: `feat(control): pause, stop and abort live runs from the control file` (GREEN)
- [ ] agent-observability trace: event → timeline/Activity History/replay
- [ ] Multi-model review loop until clean

Plan amendment (2026-10-13, implementer): M3 and M4 land as one milestone, **M3 — Viewer server and UI**, because the control API, queue and switchboard share `server.ts`, `app.ts` and `style.css`; splitting them into separate RED/GREEN pairs would require committing half-wired files. Scope is unchanged. Work for M2–M3 was built in a second worktree (`../viewer-controls-m2`, branch `viewer-controls-next` from 3fd8b80) while M1 round 3 waits for the operator's confirmation, so the M1 review packet stays frozen.

**M3 — Viewer server: control API, models, strict history, next-run queue**
- [x] Write tests (server + UI, per the plan amendment): Origin/content-type/size/live-only control; local-only model listing (no gateway, key never sent to the page); strict pairing incl. near misses, aborted/live/saved-start exclusions, paused time and empty state; draft persistence and dependency rejection; queue waits for live run and lease, writes a v2 preset, argv launch, lease released on every outcome; top-bar controls and keys (P, S, hold X, release cancels, B closes); overlays; side panel; switchboard (groups, descriptions, needs, differs-from-live, bars, expandable table, empty state, locked measurement rows); page and stylesheet carry no off-host URL
- [x] COMMIT: `test(viewer): require run controls, strict history and the next-run switchboard (RED)` — RED observed: 8 viewer test files fail to import, 2 app tests fail
- [x] Implement: `history.ts` (strict pairs from run_start configs; operator_abort/live/saved-start/probe/unmatched-feature-list runs excluded; operator_stop counted; splits exclude paused time), `models.ts` (local router via `~/.hermes/runtimes/llamacpp/server.json` or `--endpoint-file`/`POKEBENCH_ENDPOINT_FILE`; key stays server-side), `next-run.ts` (draft in `runs/.viewer/next-run.json`, control-file append for live runs, `RunQueue`: waits for no live run and no `runs/.naming-gameplay.lock`, takes that lease with owner.json, writes `runs/.viewer/presets/<id>.json` v2, spawns `node live.js play` argv-only on game port 8076, logs to `runs/launch-receipts/viewer-queue/`, releases the lease on every outcome), server routes (same-origin JSON writes, 64 KiB bound), CLI, `controls.ts` + `nextpanel.ts` UI (top-bar PAUSE/STOP/ABORT/CANCEL STOP, P/S/hold-X/B, SVG overlays in the GBA screen, stats/splits/thinking side panel, ★ NEXT RUN switchboard with dependency cascades), vendored fonts (`static/fonts`, OFL notice) with CSP `font-src 'self'` and no external origins
- [x] Gates: agent 638, viewer 223, python 441 pass; lint/build OK; coverage agent 98.89/93.81/98.35, viewer ≥98.3/91.4/97.1, python 99.41/97.30/100. Added after RED: font-route/CSP server test, focus-guard test
- [x] Guard receipts `m3-guards/01..18`: 17 of 18 red then green; 14 unexpectedly passed (the run was stop-pending, so P did nothing anyway) and is retained; a running-state focus test was added and fresh attempt 14b went red then green
- [x] COMMIT: `feat(viewer): run controls, strict feature history and the next-run switchboard` (GREEN)
- [ ] Multi-model review loop until clean

**M4 — Viewer UI: top-bar controls, overlays, side panel, ★ NEXT RUN switchboard, local fonts**
- [ ] Write tests: keys P/S/hold-X and release-cancel; overlay states; side panel order and no expand; switchboard renders registry, needs, differs-from-live, inline bars, expandable table, empty state; no external URLs in served HTML/CSS
- [ ] COMMIT: `test(viewer-ui): ...` (RED)
- [ ] Implement, vendor fonts
- [ ] Gates
- [ ] COMMIT: `feat(viewer-ui): ...` (GREEN)
- [ ] Multi-model review loop until clean

**M5 — End-to-end proof**
- [ ] Built viewer on a spare 127.0.0.1 port over canonical runs: screenshots of top bar, overlays, side panel, NEXT RUN with real history; browser network log shows only 127.0.0.1
- [ ] Real game server pause/resume proof via the probe path (no model); a short real model run exercising pause/stop only if no cohort holds the lease and the operator allows it
- [ ] Replay of a recorded control run shows the pause gap and `operator_stop`
- [ ] Final cumulative multi-model review

**M6 — Landing (operator-gated)**
- [ ] Confirm no cohort executing and lease absent
- [ ] Operator decision: fast-forwarding main moves HEAD off `0632fc0`, which the frozen naming manifests (original and prospective corrected) bind with a clean-tree check. Land now (cohort must then be re-frozen on the new HEAD) or hold.
- [ ] Fast-forward `viewer-controls` onto local main (no push; no remote)
- [ ] Recoverable worktree removal per the cleanup audit convention (preserve ignored receipts first)

## Closing the Loop

Done when: all milestones green with reviews LGTM, landed on local main (if the operator chooses), viewer rebuilt from main proves the surfaces, and the worklog records commit hashes, test/coverage numbers and review outcomes. Archive only with operator approval.

## Session Log

- 2026-10-13: two complete M1 review rounds produced new blockers; operator scope confirmation requested via the coordinator before round 3 (fix prepared as 3fd8b80). M2/M3 continue on `viewer-controls-next`.

- 2026-10-13 14:40Z: discovery. No cohort process running; `runs/.naming-gameplay.lock` absent; the cohort ledger stopped after `_02` (launcher_error). Both naming manifests bind `sourceCommit 0632fc0` with repoRoot = canonical checkout. Worktree `../pokebench-worktrees/viewer-controls` on branch `viewer-controls` from `0632fc0`.

## Surprises

- Only 4 of the 19 switches existed; the rest are hard-wired. M1 makes them real before any UI shows them.
- Landing on main invalidates the frozen naming manifests' HEAD binding (operator decision, M6).

## Multi-Model Review Log

**M1 round 1** (packet 86804d6..9f4303f, diff sha256 60d3acb3…795bd; receipts `runs/launch-receipts/viewer-controls/m1-review/`)
- Roster availability: Claude CLI `~/.claude-review` not logged in (operator login needed); Cursor Claude Opus 5 and Sonnet 5 quota-exhausted until 2026-10-17 (receipts `claude-opus-quota.*`, `claude_sonnet.*`); Cursor GPT-5.6 Sol quota-exhausted → GPT lane via isolated Codex CLI `gpt-5.6-sol` (standing harness switch). Claude-family lane replaced by the standing subagent fallback: two fresh read-only subagents (opus, sonnet). Reduced vendor diversity recorded: the Claude family is served only by in-session subagents this round.
- Verdicts: Claude-fallback A BLOCKING, Claude-fallback B BLOCKING, Codex GPT BLOCKING, Grok 4.5 LGTM, think_fast BLOCKING (invalid format: bold verdict), think_swarm incomplete (finish_reason length, no verdict).
- Accepted (fixed in one batch): (1) objective record repeated RAM facts past observation switches (A, B): `objective-tracking-v1` now needs `ram-state-v1`; position/facing, naming and field-lock facts are hidden from the record when their switch is off; press-result copy now says objective attempts still label moved/turned/no change. (2) native-completion-off copy left in `set_objective` description, `supports_goal` and the completed-claim error (Codex, A, B, Grok). (3) active-UI description now states the pre-existing server behaviour (off also removes interface state from recorded state and the loop guard; kept for comparability with earlier runs under the same id) (Codex). (4) measurement test could not fail → now compares observation `state` with all 12 server switches off vs none (A, Grok). (5) duplicated server feature list → cross-stack test pins Python to `features.ts` (think_fast, Grok, B). (6) live-map copy notes the prompt still mentions a map (A, B).
- Rejected: think_fast "superlinear fixture" (fixtures are tiny in-memory maps built once per test) and "`LocalMap.text()` signature is scope expansion" (the switch must render the map differently; boundary includes readout switches).
- Fix-batch guard receipts 18–24 red then green. COMMIT: `fix(features): keep the objective record and copy true to each switch` (811fb45).

**M1 round 2** (packet 9f4303f..811fb45, sha256 df170d5e…6d60; `m1-review-r2/`)
- Verdicts: Claude-fallback B LGTM, Grok LGTM, Claude-fallback A BLOCKING, Codex GPT BLOCKING, think_fast BLOCKING, think_swarm incomplete (finish_reason length, degenerate repetition, no verdict).
- Accepted (same leak class as round 1, new channels): press-result line still printed coordinates/facing and the locked label with position or field lock off (A, Codex, think_fast); RAM-off left observe/press tool descriptions promising memory state (Codex); attempt-label copy omitted progress/unavailable (B, A).
- Rejected: think_swarm `objectiveSwitches` "hides facts when the switch is on" (false: each entry is `features[x] ? [] : [...]`; `objectiveSwitches(ALL_ON)` test pins `hiddenFacts: []`).
- Process: two complete rounds with new blockers → operator scope confirmation requested from the coordinator before round 3 (2026-10-13). Fix prepared inside the original M1 path set: `ToolSwitches` (readout, pressResult, position, fieldLock) forwarded to observe/press and the objective harness; press results say `moved` / `turned` without coordinates when position is off and `no movement or turn observed (cause not reported)` when field lock is off; screenshot-only tool descriptions when RAM is off; copy updated. Gates: agent 623, viewer 170, python 438; coverage agent 98.97/94.26/98.46. Guard receipts 25–29 red then green.

**M2+M3 round 1** (packet 3fd8b80..528528f, sha256 8c0eea19…f15; `m23-review/`)
- Roster: Codex GPT (`gpt-5.6-sol`), Grok 4.5, Claude-family fallback subagents A (opus) and B (sonnet). think_fast/think_swarm BLOCKED (not waived): a benchmark cohort holds the gameplay lease and think-swarm is one of its lanes; they run once the lease is free.
- Verdicts: all four BLOCKING.
- Accepted (one batch): liveness by log mtime made silent model calls and long pauses look dead (controls 409, queue could launch beside them) → a run is live while unended and its own game server answers `/health` (B, Codex); unhandled write errors could crash the viewer and orphan the lease → catch-all 500, client disconnects survived (B); STOP during PAUSING ignored by the agent → a stop replaces a pending pause (A, Grok); Ctrl-C/governor abort while paused hung the run → the gate is released by the run's abort signal (A); resume recorded before unfreeze succeeded → resume applied only after the emulator unfreezes, else `failed` and the run stays paused (Codex; new `failed` status, schema regenerated); agent and viewer pause clocks differed by freeze latency → paused time starts when the freeze is answered (Codex, A); strict history ignored the failure limit (B, Codex); Origin accepted `localhost` for a `127.0.0.1` host → Origin must equal `http://<Host>` (Codex); abort hold survived window blur (B); launch log fds left open (B); `paused_ms` on non-paused aborts (A); pause docstring claimed the RTC freezes — it does not (A).
- Deferred (hardening, recorded): an ended-from-pause run records one aborted assistant turn for the call it never made (labelled truthfully); agent-side scoring outside the viewer still counts paused time in stopped runs' wall clock (frozen comparison code is out of scope).
- Fix gates: agent 645, viewer 229, python 441 pass; coverage agent 98.89/93.94/98.36, viewer 98.38/91.6/97.13, python 99.41/97.30/100. Guard receipts `m23-fix1-guards/01..11` red then green.

- COMMIT: `fix(control): keep paused and silent runs controllable and the viewer resilient` (a719d19).

**M2+M3 round 2** (packet 528528f..a719d19, sha256 48a82fe6…5171; `m23-review-r2/`)
- Verdicts: Claude-fallback A BLOCKING, B BLOCKING, Grok BLOCKING, Codex BLOCKING. think_fast/think_swarm still BLOCKED by the cohort lease.
- Accepted: the round-1 liveness fix made `RunQueue.tick` await probes, so an overlapping timer tick or a cancel during a probe could dereference a null entry and crash the viewer with the lease held (A, B, Grok — a regression of round 1) → single-flight tick, entry re-read after probes, `.catch` on the timer; resume during an in-flight freeze could leave the emulator frozen while the agent ran (Codex, A) → the resume is held and applied right after the freeze is answered; the queue accepted models the router did not serve (Codex) → only vision models the local router lists can be queued; dead unended runs still showed enabled controls (Codex) → `/api/runs` reports `live` from the game-server health probe and the page shows NOT RESPONDING with controls off; hardening (A): the pause's abort listener is detached on release, and an abort during the freeze ends the control state.
- Rejected: concurrent control requests sharing a sequence number (Codex) — within one viewer process the count read and the append run in one synchronous block after the await, so they cannot interleave; separate viewer processes appending to one run are outside the design.
- Deferred to M5 (not waived): end-to-end pause on the real emulator and a recorded replay gap (Codex) — needs the gameplay lease, held by the running cohort.
- Fix gates: agent 648, viewer 233, python 441 pass; coverage agent 98.9/93.91/98.37, viewer 98.4/91.66/96.93, python 99.41/97.30/100. Guard receipts `m23-fix2-guards/01..08`: 7 red then green; 02 unexpectedly passed (the operand was redundant because cancel always clears the entry) — retained, and the redundant operand was removed instead of adding a contrived test.
- Process: two complete M2+M3 rounds with new blockers → operator scope confirmation needed before round 3 (requested together with M1 round 3).

- COMMIT: `fix(viewer): single-flight queue, router-only models and unresponsive runs` (ec5ca80).

**Operator decisions (2026-10-13T16:17Z):** "go round 3, take the lease, dont use local reviews cuz they're noisy, then land your work". think_fast/think_swarm are waived by the operator for the remaining rounds (not a self-issued waiver). The roster for rounds 3+ is Codex GPT, Grok and the two Claude-family fallback subagents.

**M5 real-emulator proof** (under the gameplay lease, no model calls; lease released after each): `runs/launch-receipts/viewer-controls/pause-proof/proof.json` (ec5ca80 tree) and `proof-r4.json` (round-4 tree with the park barrier). Both report: running frames change; frames frozen while paused; a START pressed while paused stays queued; it drains after resume and frames change again; a malformed pause body gets 422.

**Landing preparation:** main had advanced to 5300d02 (story fixes landed by another session). The branch was rebased in a separate worktree (`../viewer-controls-land`, branch `viewer-controls-land`) with a plain `git rebase 5300d02` (no conflicts; an earlier attempt that passed a hooks override was discarded and redone plainly; rebase does not run commit hooks). Gates on the rebased tree initially failed `tsc --noEmit` in the viewer: after the round-3 guard run I removed a redundant queue-state check, which broke the type narrowing of the waiting status; I had run eslint and tests but not the full lint recipe, so the round-3 proof's "gates green" claim was wrong for ec5ca80. Fixed in the round-4 batch.

**M1 round 3** (811fb45..3fd8b80, sha256 6c6847af…f2152; `m1-review-r3/`): Grok LGTM, Codex LGTM, Claude-fallback A BLOCKING (field lock still distinguishable through objective attempt labels), Claude-fallback B BLOCKING (RAM-off description false while interface docs mention readouts). Both reviewers offered copy fixes; accepted as copy: the ram-state, field-control-lock and position descriptions now state the remaining channels (interface docs mention readouts; attempts while locked are labelled unavailable; the prompt's tool summary mentions coordinates; the repeat guard warns on returning to a tile).

**M2+M3 round 3** (a719d19..ec5ca80, sha256 d6b6890c…ebd6d; `m23-review-r3/`): Claude-fallback A LGTM, Claude-fallback B LGTM, Grok BLOCKING, Codex BLOCKING. Accepted: a resume held during the freeze vanished from the log if the run ended first (Grok) → recorded as ignored; the pause was confirmed before the in-flight frame finished (Codex) → the endpoint confirms only once the frame loop is parked (503 if it does not park); a control could be accepted for a run that ended during the probe (Codex) → re-checked after the probe; editing the draft after queueing did not change the queued run (Codex) → settings and switches are locked while a run is queued (cancel to edit); the queue accepted unloaded or context-less router models the play run rejects (Codex) → only loaded vision models with a context size.

**Round-4 batch** (on `viewer-controls-land`): the fixes above plus the tsc fix. Gates: agent 649, viewer 235, python 483 pass; lint, build, verify-vendor OK; coverage agent 98.9/93.96/98.37, viewer 98.4/91.7/96.93, python 99.41/97.33/100. Guard receipts `r4-guards/01..06` red then green. Round 4 review waits for operator confirmation (requested).

- COMMIT: `fix(control): record held resumes, confirm parked pauses and lock queued settings` (bc8b891).

**Round 4** (operator "go" 2026-10-13T16:34Z; packet 4b9d42f..bc8b891, sha256 b995a53d…59cd; `r4-review/`): Claude-fallback A LGTM, Claude-fallback B LGTM, Grok BLOCKING, Codex BLOCKING.
- Accepted: the park barrier could confirm on a stale `parked` signal after resume and left the loop latched after a 503 (Grok, Codex; A as hardening) → one condition-variable latch: each pause request resets the park flag and needs a fresh park, an unconfirmed pause is rolled back before the 503, a woken frame re-checks; control requests appended just before a turn boundary could miss the 250 ms poll and allow one more model call (Codex) → `RunControl` polls the control file synchronously at every gate and every turn-end stop check (`poll` dep, live.ts wires the same `ControlFile`); the pause test's frame loop busy-spun and grew a list (Codex) → paced, bounded counter fixture with daemon threads; the queue lock existed only in the page (Codex) → the server refuses draft edits and re-queueing while a run is queued or launching; hardening: max tokens checked against the chosen model's context at queue time; the run picker labels dead unended runs NOT RESPONDING and no longer lists them as live.
- Fixture correction: `live-objectives.test.ts` mocked `readFileSync` throwing a plain Error for unknown files; the real API throws `ENOENT`, which `ControlFile` treats as no requests yet. The mock now sets `code: "ENOENT"` (it surfaced because the gate now reads the control file synchronously).
- Gates: agent 652, viewer 235, python 484 pass; lint, build OK; coverage agent 98.91/93.97/98.37, viewer 98.41/91.8/96.93, python 99.42/97.33/100.
- Guard receipts `r5-guards`: 01 red then green; 02 lost (the mutated run hung on a non-daemon thread and was killed; receipt incomplete — the runner now has a 240 s timeout and the test threads are daemons) → fresh attempt 02b red then green; 03 unexpectedly passed (with fresh-park confirmation a woken frame can only run before the new pause is confirmed; the `while` is kept as the standard condition-variable guard against spurious wakeups); 04 unexpectedly passed (the turn-end stop check already polls before later gates) → added a test for a pause appended before the first model call, fresh attempt 04b red then green; 05–09 red then green.
- COMMIT: `fix(control): fresh-park pause latch, boundary polling and server-owned queue lock` (619d96a).
- **Operator decision (2026-10-13T17:28Z): "just land it".** The round-5 review of the 619d96a fix batch was not run; the operator waived it. That batch is landed with gates and guard receipts only (recorded here, not presented as reviewed). Review state at landing: M1 LGTM from Grok and Codex in round 3 (Claude-fallback copy findings fixed in round 4 and approved by both Claude-fallback reviewers in round 4); M2+M3 LGTM from both Claude-fallback reviewers in rounds 3 and 4; Grok and Codex round-4 blockers fixed in 619d96a without re-review.

## Boy Scout Log

(none yet)

## Landing

- [x] Confirmed no cohort executing and `runs/.naming-gameplay.lock` absent (2026-10-13T17:29Z); main clean at 5300d02.
- [x] Operator decision on the frozen naming manifests' HEAD binding: the corrected cohort had stopped after _05 (launcher_error); operator directed landing ("then land your work", "just land it").
- [x] Fast-forward `viewer-controls-land` onto local main (no push; no remote). Rebuilt from main.
- [x] Worktrees removed recoverably: branches `viewer-controls`, `viewer-controls-next` and `viewer-controls-land` retained; all receipts were written to canonical `runs/launch-receipts/viewer-controls/`; submodules deinitialised (clean) before removal.

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
