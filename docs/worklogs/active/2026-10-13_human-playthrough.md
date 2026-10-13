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
- Small top bar: elapsed time, recording status, sound toggle, Pause/Resume and Finish buttons. Finish ends and preserves the run; it does not discard it. Clear input/recording failures appear where needed.
- Compact key legend beneath the game, with “click game to enable controls” / “controls active” focus status.
- No model settings, thinking panel, feature switchboard, benchmark controls or extra statistics panels on Play. The existing viewer remains available for inspecting live/recorded human runs and comparisons.

Initial acceptance target: a recorded opening segment, followed by the operator's first-gym playthrough through STONE_BADGE. Support continued play beyond the first gym; do not automatically end a human run at the first badge unless the operator explicitly selected that target. One playthrough is an individual reference, not a population-level human performance claim.

## Skills Loaded

- `.claude/skills/feature-worklog/SKILL.md`: read for this planning turn.
- Implementation must load `execute-worklog`, `agent-observability` for input/state/event → live history → replay evidence, and the project's multi-model review contract before their respective work.
- Use `pokebench-game-state` when verifying emulator input/frame semantics. Use `pokebench-story-milestones` for any necessary milestone changes; reuse current measurement definitions by default.

## Architecture

1. **Human run lifecycle.** Add an explicit human controller/run identity rather than relabel a `manual-probe` as a benchmark run. Launch through the owned run lifecycle with its own run directory, server cwd, server port and start-state provenance. Record human identity, ROM hash, vendor pin, harness revision, measurement features, start state and input/timing policy. Human launch makes no model calls; human servers use a separate human lease and may coexist with an isolated model server under the operator's execution amendment. Coordinate with the existing launch queue and gameplay lease so a human server cannot accidentally drive a model server or collide with an active benchmark.
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
- [x] Write tests: explicit human kind/provenance, no model calls, isolated server, start-state identity, lease conflicts, terminal lifecycle and historical schema compatibility.
- [ ] COMMIT: `test(human): define isolated human run lifecycle` (RED).
- [x] Implement human launch and typed metadata/lifecycle, including orderly stop and failure cleanup.
- [ ] Gates: test counts, lint, build, coverage ≥90% per required metric in both stacks; vendor clean.
- [ ] COMMIT: `feat(human): launch recorded human game sessions` (GREEN).
- [ ] Isolated real-server launch/stop proof with no inference request.
- [ ] Performed guard-removal receipts; multi-model review until clean.

**M2 — Responsive keyboard input and safe release**
- [x] Write tests: exact mapping, combinations, repeat suppression, keyup, editable targets, focus loss, visibility/disconnect watchdog, stale sequence/session, input rejection, pause/stop, S/P/X shortcut conflicts.
- [ ] COMMIT: `test(human-input): require keyboard ownership and bounded releases` (RED).
- [x] Implement the separate minimal Play page, focused human controls, input transport, owned emulator adapter and server-side release watchdog. Keep splits beside the game and the timeline below; do not embed the viewer settings UI.
- [ ] Gates: test counts, lint, build, coverage ≥90%; vendor clean.
- [ ] COMMIT: `feat(human-input): wire keyboard controls to isolated gameplay` (GREEN).
- [ ] Real browser/emulator proof: held direction, O/P, Start/Select, L/R, simultaneous input, idle advancement and release after blur/disconnect. Show no S/P/X operator action.
- [ ] Performed guard-removal receipts; multi-model review until clean.

**M3 — Durable recording, milestone splits and replay**
- [x] Write tests: applied input/frame evidence, state polling without input, milestone deduplication/present-at-start, three clock semantics, pause gaps, failed state reads, recorder failure and terminal outcome, live/replay parity.
- [ ] COMMIT: `test(human-recording): require inputs clocks milestones and replay` (RED).
- [x] Implement recorder integration, frame/state cadence, compact adjacent splits and the existing always-visible agent timeline on Play, omitting thinking/tool calls/errors lanes; retain full human live/replay inspection in the separate viewer.
- [ ] Gates: test counts, lint, build, coverage ≥90%; vendor clean.
- [ ] COMMIT: `feat(human-recording): preserve human inputs and milestone splits` (GREEN).
- [ ] Short emulator smoke: save log/frames, stop server, replay matching inputs and milestone evidence. Smoke is labeled as validation, not the operator's baseline.
- [ ] Performed guard-removal receipts; agent-observability trace and multi-model review until clean.

**M4 — Human baseline selection and trustworthy comparisons**
- [x] Write tests: finished valid same-start human reference, explicit identity, no probe/incomplete/start-mismatch eligibility, pause-aware splits, clock availability/uncertainty, no human contamination of model history or automatic incumbent choice.
- [ ] COMMIT: `test(human-baseline): require explicit comparable human references` (RED).
- [x] Implement human reference selection, labels and split deltas; unavailable metrics remain unavailable.
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

- Contract test commit16a50e0 captures the parallel RED/GREEN evidence; implementation source now frozen for cumulative gates and review. Human server supports validation-only tagging and start-paused operator delivery. Launch instructions are in `docs/human-play.md`.

- Parallel execution authorized by the operator (“if u can split this work into subagents to reduce clock time, do so”). Independent implementation owners: human_ui (Play/keyboard/timeline/audio), human_recording (applied journal/recorder/frame protection/replay), human_baselines (catalog/history/summary/patch-arm isolation). Root owns Python frame adapter, coherent observation/transport/audio proxy, launch wiring and integration.
- The operator added “i want to play at 1x with the sound on”. Implemented fixed59.7275 frame cadence including dialogue, shared audio capture/follower with fixed playbackRate1, trusted game-click audio unlock, and sound mute on pause/end/focus loss. Sound button allows re-enabling without extra settings panels.
- M2/M3/M4 implementation/tests prepared under the approved continue-wiring amendment. Focused evidence: UI63 tests plus AudioFollower17; recorder59 agent+21 model tests; baseline31 viewer+53 agent; Python38 focused tests; server-human7 and cumulative UI/timeline27 integration tests. Full frozen gates remain pending; no green review/landing claim.
- Native validation probe `2026-10-13T17-35-53_human_8302` used own game server8040 and preview8798 (8795 was occupied; no existing service replaced), with no model calls. Browser game click showed Controls active and Sound on1×; native Start/A and mapped direction inputs recorded. Desktop1280px layout has game x24..834, splits x936..1256, shared two-lane timeline below y726. Narrow layout inspected separately. Rapid matrix exposed pending16 saturation; raised bounded queue64 and tested all20 transitions, retaining overload release and stale-request dropping. Expected SSE close after Finish falsely showed connection error; terminal cleanup regression fixed. Probe ended with operator_stop, zero tokens, final frozen sample, 7764 applied frames and740 saved frames. This is validation, not the operator's baseline.
- Guard receipts `/tmp/pokebench-human-guards`: 10 initial performed guards went RED/restored; original06 timeline filter passed because fixture had no hidden markers, retained as insufficient evidence. Added production-shaped hidden-agent markers fixture and fresh06b RED/restored; input-burst and acknowledgment guards also performed. Literal receipts and final restore gates retained.
- External M1 source review transport: Claude CLI loggedIn:false; Cursor Claude Opus and GPT quota failures retained; Grok4.7high-fast timed out360s without a terminal verdict. None counted green. Local model lanes waived by the operator. Final cumulative roster must use available external reviewers plus standing-authorized fresh read-only Sol/Astra fallback for exhausted portions, with reduced vendor diversity stated.

- M1 source checkpoint: explicit human metadata, L/R schema support, covered idle/control driver, crash launch receipt, own canonical human lease and correct Python source isolation. Agent 662/viewer235 tests passed before M2; focused final M1 61 tests pass, build and vendor checks pass. Full Python run passed 497 tests but its final coverage scan included newly prepared M2 sources, so that coverage result is not a frozen M1 gate. M1 cumulative gates/review remain pending under the operator's continue-wiring amendment. Final source/gates/review will be frozen before landing; no milestone falsely marked complete.
- M2 RED: preserved missing-module failures for human-keyboard and human-controller tests. Initial route-test collection failed for an unavailable httpx2 testclient dependency; removed that dependency and retained the failure receipt. Will test owned HTTP routes via the existing ASGI test approach. M2 implementation is being prepared while proof/review of M1 remains pending, explicitly authorized above.

- Operator execution amendment: “continue wiring, if we have a different game server and dont use local models for review, i don't see a problem, but point one out if u do”. Local think_fast/think_swarm review lanes are waived for this work; retain external/fallback independent reviews. May advance wiring while live proofs wait. A separate isolated human server may run concurrently with the cohort; canonical `.human-gameplay.lock` prevents duplicate human launches without taking the model cohort's `.naming-gameplay.lock`. Inputs/game state remain separate. Shared frame eviction is a concrete remaining concern, addressed in M3 by protecting other active recordings. Report host contention as a timing confound if observed.

- M1 verification correction: first Vitest startup stalled in macOS native dependency loading, so the initial RED receipt was not established before the RED commit. Preserved that failed startup and qualified a fresh guard-removal RED receipt `/tmp/pokebench-human-m1-red-verified.log`, then restored the implementation. Reused byte-identical canonical native dependency binaries through symlinks; no source/dependency-version changes or gate weakening. M1 human launch now takes the canonical Git common-dir human gameplay lease even from a worktree with separate output roots.

- M1 RED: human contract tests require explicit identity/policy, exclusive human lease and crash receipts on failed human launch; missing human module is the observed failure. Preliminary shortcut/planning commit 96e2067. Pinned emulator clears buttons after each frame and supports combinations; vendor default is 80 fps with 4x dialogue acceleration. Human adapter must fix nominal cadence at 59.7275 fps and disable dialogue acceleration for human servers only, while recording actual applied frame counts.

- 2026-10-13 execution started in isolated `codex/human-playthrough` checkout at `/Users/user/.codex/worktrees/human-playthrough/pokebench`, base 059cc7c. Carried only this worklog and the previously authorized shortcut correction. Loaded execution, observability, game-state and multi-model review contracts. Vendor frame loop continuously steps one frame, including idle; queued agent presses are sequential and unsuitable for simultaneous responsive human holds. Human adapter will override only the owned isolated human frame-loop inputs, at nominal GBA cadence; RAM observers/milestone definitions stay shared.

- 2026-10-13 timeline correction: The operator specified “the timeline shouldn't be collapsed we should reuse the same one we have for the agent, but we don't need the thinking, tool calls, or errors lanes”. This supersedes the earlier expandable/collapsed proposal. Updated the UI decisions, architecture, invariant and recording milestone: shared existing timeline, always visible, with only those three lanes omitted on Play; durable evidence and actionable status remain intact.

- 2026-10-13 design clarification: The operator wants a separate minimal human screen, retaining timeline and splits. Discussed a large game, adjacent splits, expandable timeline below, and a small status/control bar; The operator chose splits “beside the game”. Updated architecture, UI invariant and implementation milestones. Documentation-only change; human wiring remains pending.

- 2026-10-13 operator correction: remove viewer shortcuts, not retain them in model mode. Narrow implementation authorized directly by that correction: remove global key listeners/handler and shortcut labels; preserve pointer-based abort confirmation and on-screen run controls; add a CLOSE button for terminal overlays. Human gameplay wiring remains planned.

- 2026-10-13: Created this worklog from the operator's request and exact key mapping. Read repository rules, principles, feature-worklog skill, current viewer-control design and relevant input/recorder paths. Main was clean at discovery. No implementation edits, server launches, benchmark runs or baseline claims. Updated the root pointer from the naming-comparison worklog to this worklog; existing worklog bodies remain intact.

## Surprises

- Python copied-hook tests took several minutes in this worktree; initial coverage output was also invalidated by concurrent source preparation. Preserve receipts and run final gates on a frozen tree instead of treating partial counts as final proof.

- Existing S/P/X run shortcuts directly conflict with human Down/B/Start. Operator explicitly requested removing viewer shortcuts globally; this is a correction to the initial plan.
- `live.ts` manual probe is explicitly excluded from benchmark results; it cannot simply serve as the human baseline identity.
- Recorder currently stores press hold/release frames and before/after state; continuous human inputs need verified applied-frame evidence and idle milestone sampling.

## Multi-Model Review Log

Human wiring implementation and review remain pending; the preliminary viewer-shortcut correction has passed its recorded checks but has not been reviewed. Future review receipts must identify candidate revision, gates, findings/fixes and terminal verdicts; unavailable lanes are not green.

## Boy Scout Log

None.

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog after wiring and playthrough status are recorded.

### Cumulative review R1 and accepted fix batch

- Frozen candidate 6ec3cb2, digest ffea84b8d1cf917e2173e5cd32e8283d6150ebe57e486ee80eade7faf5d8f23c. Independent Sol and Astra returned BLOCKING. Consensus defects: repeated pause during Finish timed out and resumed frames; Sound could not be toggled off. Sol additionally proved unconfirmed freeze could be logged as an excluded pause and old model writers could evict active human frames. All four accepted within existing lifecycle/audio/frame-storage/catalog owners. No new service, dependency or runtime owner. Physical human root is now runs/human, discovered by existing viewer and summary consumers. Restored model/probe eight-button schema; human-only schema carries L/R.
- Review synthesis: contract remains the original human wiring boundary. PB1–PB13 scored with no FAIL; remaining gates/live proofs explicitly pending. Both reviewers agree on paused Finish/audio. No contradictory blocking findings. Grok4.5 transport exited0 but prose followed its LGTM, so its verdict is invalid and retained; Claude CLI auth and Cursor Claude/GPT quota failures remain unavailable, never green. Re-review retains Grok plus fresh distinct Sol/Astra fallback; local endpoints waived by operator.
- Finding disposition: four in-contract blockers fixed; expanded model L/R reverted; unequal-length compare_digest claim falsified (returns false); retired-session growth and repeated usage scans retained as hardening/performance limitations, no full-game soak claim. No unsupported baseline/performance promotion. Need final gates, native paused Finish/sound/input/replay and literal clean cumulative review.
- Test-quality nine checks: real entrypoint/HTTP/recorder/viewer callers tested; performed guard deletions retained, including fresh pause-idempotency, strict-freeze and manual-sound-off RED/restored receipts in /tmp/pokebench-human-r1-guards. Globals use existing Vitest restore owners; temporary roots/test-owned identities isolate assertions. Frame/storage bounds use tiny injected caps; input burst is20 transitions below64, with64 overload test. No test retries/skips/threshold changes; thread latch tests use real concurrency plus bounded timeout and concurrent full build/coverage. Journal fixture validation stays bounded; no growing aggregate persistence loop added. Assertion failures retain received payloads. Full gate/live proof still needed; no quiet green streak claimed as soak evidence.
- Full coverage on original source failed16 existing entrypoint fixtures after new ROM provenance read. Fixed fixtures to own ROM identity and assert hash; no actual ROM access/gate changes. R1 fix tests:83 focused agent +22 replay +18 Play +33 catalog +16 CLI, with scoped lint/types. Native paused Finish failure probe retained separately from successful earlier probe. Source freezes after this batch for cumulative gates/review.

### Cumulative review R2 and final correction batch

- Candidate c16683a/digest b7809593d30403e2f39ab8753028528ded7e7803d21fda6dbebd3cf10010eecf passed frozen full coverage: agent693 tests (lines98.86/branches93.80/functions97.54), viewer282 (98.52/91.86/97.10), Python505 (99.24/96.71/100), lint/build/vendor clean. Coverage runs the full ordinary suites; no redundant separate-suite claim. These gates apply to c16683a, not later fixes.
- R2 Sol and Astra literal BLOCKING, Grok4.5 literal BLOCKING with exit0/final verdict contract valid. Grok Ask-mode shell verification was blocked; root verified packet identity and retained the limitation. Source stayed frozen during all reviews. Consensus blocker: appendControl retained flat path, so Resume/Pause/Finish failed ENOENT for nested human output; real browser independently reproduced it. Sol unique blocker: zero-frame boundary retained pre-pause Unix timestamp, falsely stretching first new button interval across pause. Grok unique blocker: offline patch-results scorer could count a spoofed human controller as a model trial. All three reproduced, accepted and fixed.
- Scope synthesis: unchanged human lifecycle/applied-input/INV-HP8 contracts. Control writer uses the existing run-directory resolver; journal uses its existing timestamp owner; offline scorer subtracts human eligibility inside existing assess. No new service/dependency/permission/persistence owner or public API. Offline scorer is an existing consumer explicitly covered by the original no-human-patch-arms invariant, not a stronger reviewer-generated requirement. No independent model baseline/benchmark run launched. Full-game retired-session growth/frame scan concerns remain hardening follow-ups; compare_digest unequal-length claim is false. Grok's observe-lock speculation has no demonstrated lock inversion; existing human→memory ordering retained.
- Test-quality synthesis: nested HTTP fixture now matches real human launch topology, verifies all numbered controls in the resolved file, then production human driver consumes them. Clock injection reproduces exact post-pause bounds and viewer fold duration. Each patch arm and all-human distributions tested with test-owned identities. Fresh control/timestamp and scorer guard RED/restored receipts retained. Assertions carry responses; bounds tiny/bounded; globals restored; no retries/skips/exclude changes. Concurrency mechanism retains real latch tests under concurrent gate/build load. No new growing persistence fixture loop.
- R1 was an incomplete selected-roster round (external Grok prose after verdict); R2 is the first contract-complete blocker-producing roster attempt, with Grok identity-verification limitation separately retained. R3 is the re-review of this bounded accepted batch; no new infrastructure scope. Final full gates, native proof and review remain pending until their receipts complete. Earlier native probe ebdb stays validation-only, paused; it is not the operator's baseline.
