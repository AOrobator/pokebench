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
- [ ] Write tests: control file parsing; pause at turn boundary with no model call; resume; stop → `operator_stop` after current turn; cancel stop; abort immediate; paused time excluded from wall budget and rescheduled timer; game-server pause wrapper holds the frame loop; events schema regenerated
- [ ] COMMIT: `test(control): ...` (RED)
- [ ] Implement `RunControl`, governor pause accounting, `operator_stop`, `operator_control` events, env pause endpoints, `just schema`
- [ ] Gates
- [ ] COMMIT: `feat(control): ...` (GREEN)
- [ ] agent-observability trace: event → timeline/Activity History/replay
- [ ] Multi-model review loop until clean

**M3 — Viewer server: control API, models, strict history, next-run queue**
- [ ] Write tests: Origin/content-type/live-only control; local-only model listing (no gateway); strict pairing incl. near misses and empty state; draft persistence; queue waits for live run and lease, writes v2 preset, argv launch
- [ ] COMMIT: `test(viewer-server): ...` (RED)
- [ ] Implement
- [ ] Gates
- [ ] COMMIT: `feat(viewer-server): ...` (GREEN)
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

## Boy Scout Log

(none yet)

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog
