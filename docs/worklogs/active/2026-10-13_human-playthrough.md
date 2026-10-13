# Human playthrough: keyboard controls, recording and baseline splits

## Problem Statement

The operator wants to play Pokémon Emerald on his own isolated game server and record the human playthrough as a baseline for PokeBench. A useful record must preserve actual button inputs, game-state milestones, timing and replay evidence, and be selectable alongside comparable model runs.

Operator request (2026-10-13): “start a new worklog for this so we can get all the wiring done. i want to use wasd for directions z = select x = start, o = a button, p = b button. 1= L button, 2 = R button. the human playthrough”. The operator authorized execution on 2026-10-13 (“ok execute the worklog”); the implementation start gate is satisfied.

Exact keyboard mapping:

| Physical key | GBA button |
| --- | --- |
| W | Up |
| A | Left |
| S | Down |
| D | Right |
| Z | Select |
| X | Start |
| O | A |
| P | B |
| 1 | L |
| 2 | R |

Human mode must handle held keys and simultaneous buttons, rather than turn each browser repeat event into a separate press. Operator correction: “nobody asked for keyboard shortcuts on the viewer, u can get rid of those”. Remove viewer shortcuts globally, including S/P/X and B/Escape overlay dismissal; run controls and overlay dismissal remain available through explicit UI buttons. Human gameplay owns its mapped keys only while its game surface is focused. Text fields must continue accepting normal typing.

## Human Play Screen — Operator Design Decisions

The operator requested a human screen separate from the viewer with a minimal UI, retaining timeline and splits. After discussing the layout, the operator selected splits “beside the game”.

- Dedicated Play page/route, separate from the existing inspection viewer; reuse recording and measurement infrastructure behind it.
- Large game screen centered in the main play area, with compact splits always visible beside it on desktop. On narrow screens, preserve readability by placing splits immediately below the game.
- Splits show milestone and this run's time; show a baseline delta only when a comparable reference is selected. Baseline selection can remain in the inspection viewer rather than add a settings panel to Play.
- Reuse the existing agent timeline below the game, always visible. Omit the thinking, tool calls and errors lanes from the human Play screen. Retain the other applicable lanes and existing timeline behavior; do not build a separate simplified timeline. Errors still remain in durable recordings and actionable input/recording failures remain visible in the minimal status area.
- Small top bar: elapsed time, recording status, Pause/Resume and Finish buttons. Finish ends and preserves the run; it does not discard it. Clear input/recording failures appear where needed.
- Compact key legend beneath the game, with “click game to enable controls” / “controls active” focus status.
- No model settings, thinking panel, feature switchboard, benchmark controls or extra statistics panels on Play. The existing viewer remains available for inspecting live/recorded human runs and comparisons.

Initial acceptance target: a recorded opening segment, followed by the operator's first-gym playthrough through STONE_BADGE. Support continued play beyond the first gym; do not automatically end a human run at the first badge unless the operator explicitly selected that target. One playthrough is an individual reference, not a population-level human performance claim.

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md`: read for this planning turn.
- Implementation must load `execute-worklog`, `agent-observability` for input/state/event → live history → replay evidence, and the project's multi-model review contract before their respective work.
- Use `pokebench-game-state` when verifying emulator input/frame semantics. Use `pokebench-story-milestones` for any necessary milestone changes; reuse current measurement definitions by default.

## Architecture

1. **Human run lifecycle.** Add an explicit human controller/run identity rather than relabel a `manual-probe` as a benchmark run. Launch through the owned run lifecycle with its own run directory, server cwd, server port and start-state provenance. Record human identity, ROM hash, vendor pin, harness revision, measurement features, start state and input/timing policy. Human launch makes no model calls. Coordinate with the existing launch queue and gameplay lease so a human server cannot accidentally drive a model server or collide with an active benchmark.
2. **Keyboard surface.** Add a dedicated minimal Play page separate from the viewer, with a focusable game surface, compact mapping legend and input-focus status. Splits stay beside the game and the existing agent timeline stays visible below it, with thinking, tool calls and errors lanes omitted, per the operator design decisions above. Interpret physical keys consistently using browser key codes. Ignore repeat keydowns, serialize validated button-set transitions and support release independently of render/update cadence. Losing focus, hiding the page, disconnecting, pausing or ending releases all held buttons; reconnect never silently resumes an old hold. A new focus requires new input. Model-mode run controls remain on-screen buttons; no viewer keyboard shortcuts.
3. **Server-owned inputs.** The browser submits bounded, typed input transitions for the selected live human run. The server checks human ownership, input session and ordering, then applies them through a pokebench-owned emulator adapter. The applied emulator input and frame count are authoritative; browser key timing alone is not proof of application. A bounded heartbeat/watchdog releases buttons when a client disappears. A stale request from a former run/tab/session must never control a newer run.
4. **Continuous gameplay and recording.** Verify the pinned stepping server's behavior before choosing the adapter. Human play needs game advancement between inputs, including battles/dialogue and time while no button is held. The existing press API may require an owned stepping/input loop; do not assume long press requests permit prompt release. Preserve input order and actual applied durations without overlapping emulator writers. Record accepted/applied/rejected inputs, state observations, frames and terminal outcome through the durable event log. Keep vendor source unmodified.
5. **Milestones and clocks.** Reuse the authoritative state milestone tracker on a documented sampling cadence during human play, including periods without key presses. Maintain monotonic emulated frame counts and distinguish elapsed wall time, active time excluding operator pauses, and emulated time. Report sampling bounds on split timestamps; do not claim exact transition frames from polling. Capture start-of-run state so already-present milestones are not new achievements. A paused emulator must not advance gameplay frames; document RTC behavior separately.
6. **Play, viewer and comparison.** The dedicated Play page presents only the game, adjacent splits, the always-visible existing timeline with thinking/tool calls/errors lanes omitted, and minimal run controls/status. The separate inspection viewer can display live and recorded human runs. Live human runs show HUMAN / the operator, input history, milestone splits, timing and pause/stop status; replay reads saved events/frames without a live server. Allow finished, valid, same-start human runs as explicitly labeled split references. Preserve model-only feature-history statistics and model incumbent selection unless the operator deliberately selects a human reference. Human and model wall-time comparisons are contextual; emulated time and input behavior help distinguish decision delay from gameplay inefficiency. Do not mix human samples into model success rates or patch-evaluation arms.

Candidate owners: `packages/agent/src/live.ts`, run metadata/schema and lifecycle, `recorder.ts`, `milestones.ts`; `packages/viewer/src/app.ts`, `controls.ts`, server/run catalog/comparison/replay plus a dedicated Play page/entry point; `env/pokebench_env/` owned stepping/input adapter. Confirm exact boundaries during M1 before edits. Reuse existing producers and folds instead of building a separate human-only log format.

## Invariants

- **INV-HP1 Exact mapping.** All ten keys map as specified. Rationale: operator-defined controls. Test: physical-key mapping matrix, held combinations, release and repeat handling.
- **INV-HP2 Gameplay keys cannot stop or abort.** Focused human S/P/X affect only GBA input. Text editing and model-mode buttons still work. Test: human/model/focus matrices and a real browser demonstration of X held beyond the existing abort threshold.
- **INV-HP3 One controller, one isolated server.** Inputs only reach the selected live human-owned run; no model calls or cross-run writes. Test: run/session ownership rejection, concurrent launch/lease behavior, ended/probe/model-run rejection.
- **INV-HP4 Releases are bounded.** Focus loss, disconnect, pause, stop, crash and stale session release held inputs; held durations reflect applied emulator frames. Test: fake-clock watchdog/ordering tests and real emulator release proof.
- **INV-HP5 The game determines progress.** Same authoritative milestone definitions, sampled during idle and held-input periods, once per achievement; present-at-start and missing state remain explicit. Test: tracker fixtures and live/replay equivalence.
- **INV-HP6 Timing is attributable.** Wall, active and emulated time are distinct; pauses and timestamp uncertainty are recorded. Test: frame/clock monotonicity, pause exclusion, stalled recorder and sampling-bound cases.
- **INV-HP7 Every launched run has a durable outcome.** Inputs/state/frames/milestones are replayable; crashes and DNFs retain a terminal record or an explicit recovery diagnosis. Test: lifecycle failures, log validation, server-off replay and incomplete-run eligibility.
- **INV-HP8 Human references do not contaminate model scoring.** Explicit run kind; same-start comparison; human excluded from model feature-history/patch arms and automatic model-best selection. Test: mixed catalogs, start mismatch, probe, unfinished and malformed records.
- **INV-HP9 No hidden game assistance.** No memory edits, scripted route, undone mistakes or unrecorded reloads; ROM remains outside git and vendor remains pinned/clean. Test: vendor gate and provenance/event audit. Any future reload policy must be explicit in metadata and eligibility.

- **INV-HP10 Separate minimal Play UI.** Human gameplay uses a dedicated page, not the inspection viewer. Splits remain beside the game on desktop; the existing agent timeline is always visible below, with thinking, tool calls and errors lanes omitted; only the agreed minimal controls/status appear. Test: shared timeline rendering/interaction, exact lane filtering, route/DOM separation and desktop/narrow browser layout evidence, with no model/settings/thinking panels on Play. Lane filtering changes presentation only, not durable event capture or replay evidence.

## Security Review

All servers bind 127.0.0.1. New writes retain existing Host/Origin, JSON content-type, body-size and typed validation protections. Validate run IDs and session/input sequence; never accept arbitrary URLs, filesystem paths or emulator memory writes from keyboard requests. Bound request rate and queued work; surface rejected or failed input rather than claiming it was applied. Server/watchdog owns emergency release. Launch subprocesses with argv lists; ROM uses the existing external symlink resolver and never enters version control. Capture keys only within the explicit game surface, not globally across applications.

## Milestones

**Preliminary correction — Remove unrequested viewer shortcuts**
- [x] Operator directly authorized removal of all viewer keyboard shortcuts.
- [x] Updated existing control tests to use on-screen buttons; added a regression assertion that former shortcut keys cannot issue a control request even beyond the abort hold duration. RED: 4 failures (old shortcuts still active, no CLOSE button, old labels).
- [x] Removed key handler/listeners and keyboard hints; retained pointer-hold abort, added terminal-overlay CLOSE button, and retained blur/visibility cancellation.
- [x] GREEN: 235 viewer tests; viewer lint/build pass; coverage lines 98.40%, branches 91.73%, functions 96.92% (all above 90%).
- [ ] Commit, multi-model review and running-viewer/browser verification: pending. Changes remain in the working tree; no viewer process restarted.


**M1 — Human run contract and isolated launch**
- [ ] Verify pinned emulator stepping/input semantics and current schema, clocks, lease and queue owners; record adapter decision and measurement cadence.
- [ ] Write tests: explicit human kind/provenance, no model calls, isolated server, start-state identity, lease conflicts, terminal lifecycle and historical schema compatibility.
- [ ] COMMIT: `test(human): define isolated human run lifecycle` (RED).
- [ ] Implement human launch and typed metadata/lifecycle, including orderly stop and failure cleanup.
- [ ] Gates: test counts, lint, build, coverage ≥90% per required metric in both stacks; vendor clean.
- [ ] COMMIT: `feat(human): launch recorded human game sessions` (GREEN).
- [ ] Isolated real-server launch/stop proof with no inference request.
- [ ] Performed guard-removal receipts; multi-model review until clean.

**M2 — Responsive keyboard input and safe release**
- [ ] Write tests: exact mapping, combinations, repeat suppression, keyup, editable targets, focus loss, visibility/disconnect watchdog, stale sequence/session, input rejection, pause/stop, S/P/X shortcut conflicts.
- [ ] COMMIT: `test(human-input): require keyboard ownership and bounded releases` (RED).
- [ ] Implement the separate minimal Play page, focused human controls, input transport, owned emulator adapter and server-side release watchdog. Keep splits beside the game and the timeline below; do not embed the viewer settings UI.
- [ ] Gates: test counts, lint, build, coverage ≥90%; vendor clean.
- [ ] COMMIT: `feat(human-input): wire keyboard controls to isolated gameplay` (GREEN).
- [ ] Real browser/emulator proof: held direction, O/P, Start/Select, L/R, simultaneous input, idle advancement and release after blur/disconnect. Show no S/P/X operator action.
- [ ] Performed guard-removal receipts; multi-model review until clean.

**M3 — Durable recording, milestone splits and replay**
- [ ] Write tests: applied input/frame evidence, state polling without input, milestone deduplication/present-at-start, three clock semantics, pause gaps, failed state reads, recorder failure and terminal outcome, live/replay parity.
- [ ] COMMIT: `test(human-recording): require inputs clocks milestones and replay` (RED).
- [ ] Implement recorder integration, frame/state cadence, compact adjacent splits and the existing always-visible agent timeline on Play, omitting thinking/tool calls/errors lanes; retain full human live/replay inspection in the separate viewer.
- [ ] Gates: test counts, lint, build, coverage ≥90%; vendor clean.
- [ ] COMMIT: `feat(human-recording): preserve human inputs and milestone splits` (GREEN).
- [ ] Short emulator smoke: save log/frames, stop server, replay matching inputs and milestone evidence. Smoke is labeled as validation, not the operator's baseline.
- [ ] Performed guard-removal receipts; agent-observability trace and multi-model review until clean.

**M4 — Human baseline selection and trustworthy comparisons**
- [ ] Write tests: finished valid same-start human reference, explicit identity, no probe/incomplete/start-mismatch eligibility, pause-aware splits, clock availability/uncertainty, no human contamination of model history or automatic incumbent choice.
- [ ] COMMIT: `test(human-baseline): require explicit comparable human references` (RED).
- [ ] Implement human reference selection, labels and split deltas; unavailable metrics remain unavailable.
- [ ] Gates: test counts, lint, build, coverage ≥90%; vendor clean.
- [ ] COMMIT: `feat(human-baseline): compare model splits with human playthroughs` (GREEN).
- [ ] Real viewer proof against recorded human smoke and existing model logs; no new model benchmark run required.
- [ ] Performed guard-removal receipts; multi-model review until clean.

**M5 — Ready for the operator's playthrough and closeout**
- [ ] Final cumulative gates/review and real-browser keyboard/input/replay evidence on the final candidate.
- [ ] Record concrete launch instructions, viewer location, keys, focus/release behavior, pause/stop controls, start state and output locations.
- [ ] Record landing/rebuild/restart evidence separately from tests/review; preserve other active work and runs.
- [ ] the operator plays the acceptance run; verify its terminal receipt, milestone splits, replay and eligible human reference. This remains pending until the operator actually plays; do not invent a human baseline from automated input.
- [ ] Update worklog with limitations, sample count, observed outcome and receipts.

## Closing the Loop

Wiring is complete only when launch, keyboard inputs, safe releases, recording, milestones, clocks, replay and explicit human-reference selection work together with gates/review and live evidence. The human baseline is a separate completion state requiring the operator's actual recorded run. Keep smoke artifacts, tests, review, landing, viewer restart and operator playthrough distinct.

## Session Log

- 2026-10-13 execution started in isolated `codex/human-playthrough` checkout at `/Users/user/.codex/worktrees/human-playthrough/pokebench`, base 059cc7c. Carried only this worklog and the previously authorized shortcut correction. Loaded execution, observability, game-state and multi-model review contracts. Vendor frame loop continuously steps one frame, including idle; queued agent presses are sequential and unsuitable for simultaneous responsive human holds. Human adapter will override only the owned isolated human frame-loop inputs, at nominal GBA cadence; RAM observers/milestone definitions stay shared.

- 2026-10-13 timeline correction: The operator specified “the timeline shouldn't be collapsed we should reuse the same one we have for the agent, but we don't need the thinking, tool calls, or errors lanes”. This supersedes the earlier expandable/collapsed proposal. Updated the UI decisions, architecture, invariant and recording milestone: shared existing timeline, always visible, with only those three lanes omitted on Play; durable evidence and actionable status remain intact.

- 2026-10-13 design clarification: The operator wants a separate minimal human screen, retaining timeline and splits. Discussed a large game, adjacent splits, expandable timeline below, and a small status/control bar; The operator chose splits “beside the game”. Updated architecture, UI invariant and implementation milestones. Documentation-only change; human wiring remains pending.

- 2026-10-13 operator correction: remove viewer shortcuts, not retain them in model mode. Narrow implementation authorized directly by that correction: remove global key listeners/handler and shortcut labels; preserve pointer-based abort confirmation and on-screen run controls; add a CLOSE button for terminal overlays. Human gameplay wiring remains planned.

- 2026-10-13: Created this worklog from the operator's request and exact key mapping. Read repository rules, principles, feature-worklog skill, current viewer-control design and relevant input/recorder paths. Main was clean at discovery. No implementation edits, server launches, benchmark runs or baseline claims. Updated the root pointer from the naming-comparison worklog to this worklog; existing worklog bodies remain intact.

## Surprises

- Existing S/P/X run shortcuts directly conflict with human Down/B/Start. Operator explicitly requested removing viewer shortcuts globally; this is a correction to the initial plan.
- `live.ts` manual probe is explicitly excluded from benchmark results; it cannot simply serve as the human baseline identity.
- Recorder currently stores press hold/release frames and before/after state; continuous human inputs need verified applied-frame evidence and idle milestone sampling.

## Multi-Model Review Log

Human wiring implementation and review remain pending; the preliminary viewer-shortcut correction has passed its recorded checks but has not been reviewed. Future review receipts must identify candidate revision, gates, findings/fixes and terminal verdicts; unavailable lanes are not green.

## Boy Scout Log

None.

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog after wiring and playthrough status are recorded.
