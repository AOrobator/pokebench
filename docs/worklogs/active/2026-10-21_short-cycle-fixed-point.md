# short-cycle-fixed-point-v1: 2-4 turn cycles of the same calls and states count as a fixed point

(First built as `ping-pong-fixed-point-v1`; renamed before landing when the coordinator widened the scope to short cycles. Branch `claude/ping-pong-fixed-point` keeps its name.)

## Problem Statement

duplicate-turn-collapse-v1 (on in both arms) leaves out of each request a run of 3 or more identical turns: the same thinking, text and tool calls, each leaving the same `planState`. Two bundle runs looped without ever producing such a run (both read-only):

- `runs/2026-10-20T19-58-04_qwen36-gpu0_ef9f`, from turn 131 (8:06 PM New York): `press {buttons:["RIGHT","A"]}` every turn. Each result alternated between the clock confirmation (`clock_confirmation`, NO highlighted) and the clock adjustment (`clock_adjustment`). The loop guard's `cycle` note (turn 99, 8:03 PM), the `interface_dwell` stall briefing (turn 127, 8:06 PM) and the `milestone_drought` briefing (turn 139) were ignored.
- `runs/2026-10-20T20-26-22_qwen36-gpu1_97a0` (still being written when read), from turn 116 (8:35 PM New York): `navigate_to_target` warp (14,8) on LITTLEROOT TOWN into PROF. BIRCH'S HOUSE, then warp (2,8) back out, turns 116-122; then from turn 120 a 3-turn rotation through 132: in, the same call again (staying in the house), out. Map-cycle and cycle loop-guard notes fired and were ignored.

Why the existing collapse never acted (from `fixed-point-breaker.ts` and `same-plan.ts` `planState`):

1. Its run needs every turn to leave the same state; these repeat with period 2 or 3.
2. Its group key includes thinking and text; in ef9f the six bounce turns 131-136 have six different thinking texts, in 97a0 turns 116/118/120/122 have three and 117/119/121 two.
3. `planState` is null for any screen other than the overworld or a ready battle, so ef9f's `clock` screen never qualifies.
4. `planState` includes the interface's `value`; each ef9f cycle moved the clock 2 minutes (10:58, 11:00, 11:02 ...).

Approval: The operator, 2026-10-21 00:08 UTC (8:08 PM ET): "lets do those fixes and put them in the bundle" (relayed by the coordinator), for the two-state ping-pong. Scope widened by the coordinator on the 97a0 evidence (extending the operator's approval): cycles of period 2-4 over (tool call, resulting state) pairs; thinking need not match when calls and states repeat exactly; fire once the cycle has repeated as many times as today's rule needs; keep the ef9f case; rename if the name no longer fits.

## Skills Loaded

feature-switch, agent-observability, feature-explainer, feature-worklog, experiment-queue (pending entry), close-the-loop (gates), multi-model-review (cloud lanes only).

## Architecture

- Owner: `FixedPointBreaker` (`packages/agent/src/fixed-point-breaker.ts`), constructed by `fixedPointBreaker()` only while duplicate-turn-collapse-v1 or fixed-point-breaker-v1 is on. The switch is read once in its constructor from the FeatureSet.
- Turn item: the turn's tool calls (names and arguments, JSON) plus the `cycleState` each result left, in call order. `cycleState` = `planState`'s fields plus the money, without the clock's time (other interface values stay), qualifying overworld and ready battle as `planState` does, plus any other started screen whose readout shows a ready, non-diagnostic interface. Null where the readout cannot qualify the state; a reply with no tool call is null too. Null items never join a cycle.
- `cycleRuns(items)`: maximal runs where every item equals the one `period` items before it, period 2, 3 or 4, whose first block is primitive (A,B,A,B counts as period 2; all-identical blocks are left to the identical-turn rule), with at least `CYCLE_COPIES` = 3 copies (3 × period turns). Documented equivalent of today's rule: identical turns need 3 copies of a 1-turn block; a cycle needs 3 copies of its block.
- Stage 1 (collapse): each run keeps its newest copy (the last `period` turns); earlier turns join the drop set after today's identical-turn pass. Recorded as `loop_breaker` stage 1, trigger `short_cycle`, `repeats` = longest run's length, `collapsed` = every group the cycle pass left out of that request (as today's `collapsed` counts all runs), new optional `period`.
- Stage 2 (note, fixed-point-breaker-v1 only): from recorded events the breaker keeps the latest 4 turn items and, for each period, the length of the run ending at the newest turn (as `cycleRuns` counts it, so a long cycle is counted whole); a turn whose results never all arrived counts as a break (as stage 1's null item does); when the newest turns are in a run longer than 3 copies (3 × period + 1 turns) the request ends with `cycleNote` ("... Your last N turns repeated the same P turns of <tools> calls, and each time round the game came back to the same P screens, positions and highlighted choices." — round 1 replaced "the game state came back to the same P states", which was false when the clock's time moved). Recorded as stage 2, `short_cycle`, with `period`.
- Stage 3 (auto-talk) reads `fixedPoint()`, unchanged: it acts only on the free field and its message says the state "stayed the same", which would be false for a cycle.
- fresh-retry-v1 concerns replies with no tool call; cycle turns all call a tool, so it is unaffected.
- Viewer: Activity History label for `short_cycle` (with the period); loop_breaker never reaches the timeline. Schema regenerated (`short_cycle`, `period`).

### Decision: thinking and text need not match

From the evidence: ef9f's thinking differs every bounce turn (six texts for 131-136); 97a0's walk has three texts over four "in" turns and two over three "out" turns. With identical thinking required, neither run would ever fire. The coordinator also directed that identical thinking not be required when calls and states repeat exactly. The calls (names and arguments) and the resulting states must repeat exactly.

### Decision: keep the newest copy of the cycle, not only the newest turn

The identical-turn rule keeps one copy of the repeated unit (one turn). For a cycle the unit is `period` turns; keeping only the newest turn would hide the cycle's other calls, so the request keeps the newest copy (2-4 turns). For ef9f's single call this keeps the confirmation turn and the adjustment turn.

### Decision: the cycle state leaves out the clock's time and qualifies interface screens

Without both, ef9f could never fire (null fingerprint on the clock screen; the clock value moves each cycle). Phase and highlighted choice stay, so a real change of interface or selection breaks a cycle. After review round 1 only the clock phases (`clock_adjustment`, `clock_confirmation`) drop their value: every other interface keeps it (a name being typed on the naming screen, a PC or mart quantity), and the money is added (planState has none), so typing a name or buying one item at a time is progress, not a cycle. Known remaining merge: progress the fingerprint does not read at all, such as bag contents alone (the money and party are read).

## Invariants

- INV-1 OFF is byte-identical: no cycle state, history, collapse, note or event. Tests: OFF rigs equal the input messages; OFF equals today's output for identical turns; ef9f and 97a0 replays OFF record nothing.
- INV-2 Fires at 3 copies (2-turn cycles at 6 turns, 3-turn at 9, 4-turn at 12); the note one turn later.
- INV-3 A different call, a real state change (position, phase, selection, party, story), a null state or a reply with no tool call breaks a cycle; a cycle is counted by its shortest period; identical turns stay today's rule.
- INV-4 Timeline closed: no new mark, lane, label or color.

## Security Review

No new inputs, subprocesses, network or file access. The note is harness-authored text about recorded calls and states.

## Milestones

**M1 — short-cycle-fixed-point-v1**
- [x] Ping-pong design: RED `test: ping-pong-fixed-point-v1 detector, stage 2 and ef9f replay (RED)` (65b6d182). Implemented (uncommitted) and gated, then superseded by the coordinator's scope change before any GREEN commit.
- [x] Short-cycle tests: agent `src/short-cycle-fixed-point.test.ts` (33 tests after review of coverage: fingerprint, `cycleRuns`, stage 1, OFF, stage 2, auto-talk unchanged, ef9f replay and probe, 97a0 replay and probe, registry, experiment); viewer `src/short-cycle-fixed-point.test.ts` (1). Fixtures `short-cycle-ef9f.jsonl.gz` (ef9f turns 125-140) and `short-cycle-97a0.jsonl.gz` (97a0 turns 104-136).
- [x] COMMIT (RED): `test: short-cycle-fixed-point-v1 cycle detector, stage 2, ef9f and 97a0 replays (RED; renames the ping-pong tests)` (36f14ee6). Red at this commit: the switch, `cycleRuns`, `cycleState` and `cycleNote` do not exist.
- [x] Implement: `cycleState`, `cycleRuns`, cycle pass in `collapse`, stage 2 `cycleNote`; schema (`short_cycle`, `period`); registry last (guard, needs null), presets, flagFeatures, legacy fixture, DEFAULT_NEXT_RUN off; Activity History label; FEATURE_EXPLAINERS; registry index churn across ~50 agent tests and two viewer tests.
- [x] Deletion checks (receipts in the worktree's ignored `runs/receipts/short-cycle-fixed-point/`, each restored to green): s1 cycle pass removed → 10 red; s2 switch not read → 12 red; s3 value kept in the state → 4 red (ef9f evidence among them); s4 stage 2 removed → 2 red; s5 primitive-block check removed → 2 red; s6 interface screens unqualified → 7 red; s7 two copies instead of three → 7 red; after the stage 2 counter rewrite (incremental run lengths instead of a 36-turn window, which undercounted cycles longer than 36 turns): s4b stage 2 removed → 3 red; s8 run length not carried → 3 red (46/46 restored). Earlier ping-pong receipts r1-r6 are in `runs/receipts/ping-pong-fixed-point/` (superseded code).
- [x] Gates (`runs/receipts/short-cycle-fixed-point/gates.log`): build and lint clean; agent 3045/3045, viewer 1441/1441, pytest 3015 passed; coverage agent 97.28/93.11/97.66/99.21 (stmts/branches/funcs/lines; `fixed-point-breaker.ts` 96.89/91.18/98.14/99.39 under its own tests, remaining misses are the pre-existing 64/512-entry map caps and `?? -1` fallbacks), viewer 95.09/91.09/93.85/97.7, Python lines 97.11 branches 92.67 functions 100. One earlier full run hit a 5 s timeout in viewer `experiment-cli.test.ts` (git-heavy, machine under load); it passed alone and in every later full run.
- [x] COMMIT (GREEN): `feat: short-cycle-fixed-point-v1 collapses 2-4 turn cycles of the same calls and states like identical turns (default off, bundle arm)` (2a561989)
- [x] Explainer `docs/explainers/short-cycle-fixed-point-v1.html` (`just pages-check` prints nothing), README line, FEATURE_EXPLAINERS + server test; pending `experiments/short-cycle-fixed-point-v1.json` (incumbent = same-target's with duplicate-turn-collapse-v1 on, this switch off); readiness row; bundle arm (switches, base false) of bundle-v-control, bundle-cook-1h and whole-map-cook-1h. `fixed-cli check` passes for all three against this worktree's files (the installed CLI reads the main checkout, so it was run through its `main` with `root` set to the worktree; start saves read from the main checkout's runs/).
- [ ] Multi-model review loop (principles, Claude, Grok, GPT/Codex)

## Closing the Loop

Tests for code (production context wiring and the decision probe over recorded events of both runs); the explainer checked with `just pages-check`; viewer behavior by mounted tests. No runs launched.

Viewer rehearsal (fake data, agent-observability): 97a0 turns 104-136 copied from the read-only run into the worktree's ignored `runs/rehearsal-runs/2026-10-20T20-26-22_rehearsal-shortcycle_97a0/` (renumbered seqs, frames symlinked to the original run), with the 7 `loop_breaker` events the built production wiring records with the switch on inserted after their turn_start. Served by this worktree's built viewer on 127.0.0.1:8796 (never 8790) and opened in the browser pane: the agent trace lists "Loop breaker" rows at T122 onward with the Activity History text "Loop breaker stage 1 · 4 duplicate turns left out of the request (a cycle of 2 turns (the same tool calls and game states) repeated over 6 turns)" and the period-3 rows ("... 10 duplicate turns ... a cycle of 3 turns ... repeated over 9 turns"); clicking the T122 row shows the raw event JSON (`trigger: "short_cycle"`, `repeats: 6`, `collapsed: 4`, `period: 2`); the timeline has no `k-loop` mark. Viewer stopped afterwards.

## Session Log

- 2026-10-20 ~8:20 PM ET: discovery on ef9f; ping-pong design.
- 2026-10-20 ~8:42 PM ET: coordinator scope change (97a0, short cycles); redesign and rename.

## Surprises

- The decision probe cannot build battle-text-auto-advance-v1's press tool or gym-heal-warning-v1's recorder from its inert ports (existing probe limit); the probe tests turn both off in both arms. Neither changes a recorded call or state.
- 97a0 turns 122-132 hold a 3-turn rotation (in, in again, out) overlapping the 2-turn walk (116-122); both collapse.
- Not covered (1-turn cycles with varied thinking): ef9f turns 102-126 (25 `press RIGHT,A,DOWN,A`, byte-identical thinking but a moving clock value on the clock screen) and 97a0 turns 131-136 (the same call six times, four thinking texts; the identical-turn collapse acted only at turn 140). Also not covered: wandering that never repeats exactly (97a0 turns 106-115).
- The shared scratchpad is written by other sessions (a `fix3.py` for `yes-no-answer-readout-v1` replaced mine); scripts for this branch are named `pp_*`. Another switch is being added in parallel, so the merge with main will need the usual registry re-append.

## Multi-Model Review Log

Local inference reviewers are never used (operator decision 2026-10-16).

**Round 1** — packet1 = `git diff main HEAD`, base main 5ab3f577, head 13f4d6bf, `runs/reviews/short-cycle-fixed-point/packet1.diff`, sha256 7cdd6a83…bdf311e (2387 lines, 75 files). Prompt `runs/reviews/short-cycle-fixed-point/prompt.md`.

Principles self-review (docs/agent-principles.md), 0 FAIL:
- PB1 PASS: only model context changes; grading and milestones untouched.
- PB2 N/A: no run accounting changes.
- PB3 PASS: no improvement claimed; the experiment is pending, not queued.
- PB4 PASS: a named, default-off switch recorded in run_start harness_features; the collapse is recorded per request as loop_breaker events.
- PB5 PASS: the pending experiment flips only this switch.
- PB6 PASS: it only removes repeated turns; its own memory is bounded (4 history items, 512-entry state map).
- PB7 PASS: every collapse and note is a loop_breaker event; Activity History, trace and raw inspector show it (mounted test and the 8796 rehearsal).
- PB8 N/A: no tool schema change.
- PB9 PASS: the spec gaps (fingerprint widening, keep-newest-copy, 1-turn cycles with varied thinking not covered, auto-talk excluded) are written down and reported, not silently chosen.
- PB10 PASS: no threshold, exclude or hook change.
- PB11 PASS: pi message shapes exercised through the real contextTools wiring and the decision probe.
- PB12 N/A: the ROM is never read; fixtures hold recorded events only.
- PB13 in progress (this loop).

Lanes:
- Claude: `claude -p --permission-mode plan` failed ("OAuth session expired and could not be refreshed"); run as a fresh read-only Claude subagent per the operator's 2026-10-16 word. VERDICT: BLOCKING — B1 the stage-2 note says the state repeated exactly while `cycleState` leaves out the value the model sees (ef9f clock time, naming text). NB: stage 1/stage 2 can disagree on a turn whose results never arrive and on errored replies, and on multi-call arrival order; the looser fingerprint can merge naming typing and buy-one-at-a-time loops (money/bag not read) and the limits are not written down; explainer says the 97a0 fixture is 104-124 and "both" fixed experiments; viewer label repeats the value caveat; no stage-2 test with a changing value.
- Grok (`cursor-agent -p --mode ask --model cursor-grok-4.5-high`): VERDICT: LGTM. NB: naming value merge risk; explainer fixture range; multi-call result order.
- GPT (`codex exec -m gpt-5.6-sol -c model_reasoning_effort="xhigh" --ephemeral --sandbox read-only`): VERDICT: BLOCKING — B1 dropping `value` for every interface treats real progress (naming text, PC quantity) as a cycle; B2 the stage-2 note is false for the clock case. NB: no multi-call, overlap-of-periods or period-4 stage 1/2 tests; the `doors` comment says "two calls in turn"; explainer fixture range. (Codex could not run vitest: read-only filesystem.)

Fix batch 1 (all accepted except where noted):
- Codex B1 / Claude NB: the value is dropped only for the two clock phases; money added to the fingerprint. Tests: a growing name and a falling money balance never collapse or get a note; the fingerprint test checks clock-only dropping. Receipts f1 (value dropped everywhere → 2 red) and f2 (money removed → 2 red), restored green.
- Claude B1 / Codex B2: the note now says "each time round the game came back to the same P screens, positions and highlighted choices", true whether or not the clock's time moved; FEATURES copy, explainer, viewer label ("the same tool calls, screens, positions and highlighted choices") and tests updated. New test: ef9f's bounce with a moving clock under the breaker, asserting the note text and that it claims no repeated "state".
- Claude NB (incomplete turn): a turn whose results never all arrived now breaks stage 2, as it breaks stage 1 (receipt f3, 1 red). Claude/Grok NB (multi-call order): stage 2 orders states by call, as stage 1 does; new two-call test with results arriving in different orders (receipt f4, 1 red). Errored/aborted replies are left as they are (stage 2 skips them, as today's identical-turn streak does); recorded here.
- Codex NB: new period-4 test (collapse at 12 turns, note at 13); overlap of different periods is already covered by the 97a0 turn-129 replay and the "longest of two cycles" unit test.
- Explainer: 97a0 fixture range 104-136, "all three fixed experiments", the clock-only value rule; `doors` comment and explainer label "two different calls taking turns".
- Gates after fix batch 1 (`runs/receipts/short-cycle-fixed-point/gates-fix1.log`): build and lint clean; agent 3067/3067, viewer 1443/1443, pytest 3015 passed; coverage agent 97.3/93.16/97.66/99.21. The viewer coverage step hit the known 5 s timeout in `experiment-cli.test.ts` (it passed in the same run's `just test`); viewer coverage rerun alone: 1443 pass, 95.1/91.1/93.85/97.7; Python gate rerun: lines 96.92 branches 92.22 functions 99.55 (floor 90).
- COMMIT: `fix: short-cycle-fixed-point-v1 review batch 1 (clock-only value drop, money in the state, true stage-2 note, call-order and unfinished-turn agreement)` (4ecc5c8b)
- main moved to 24648e12 (yes-no-answer-readout-v1, probes viewer, lane leases). Merged it the same way as before: main's side of every conflicted file and of every re-indexed test file, then this switch re-appended after yes-no-answer-readout-v1 and the index assertions re-bumped.
- Gates after this merge (`runs/receipts/short-cycle-fixed-point/gates-merge2.log`): build and lint clean; agent 3068/3068, viewer 1498/1498, pytest 3166 passed; coverage agent 97.3/93.15/97.66/99.21, viewer 95.22/91.07/94.14/97.8, Python lines 97.11 branches 92.69 functions 100; `just pages-check` prints nothing; `fixed-cli check` exit 0 for all three (worktree root).
- COMMIT: `merge: main (yes-no-answer-readout-v1, probes viewer) into short-cycle-fixed-point-v1` (b1abc978)

**Round 2** — packet2 = `git diff main HEAD`, base main 24648e12, head b1abc978, `runs/reviews/short-cycle-fixed-point/packet2.diff`, sha256 ff085fd1…2e06e99 (2502 lines); fix delta fix1.diff (`git diff 13f4d6bf 4ecc5c8b`, sha256 6a118763…a87edf1). Prompt `prompt2.md`. Principles self-review unchanged (0 FAIL).
- Claude (fresh read-only Claude subagent; CLI login still expired): VERDICT: LGTM. NB: errored/aborted replies skipped by stage 2; overlapping runs of different periods can thin an earlier run's kept copy (no test); the turn-129 label reads "10 duplicate turns ... repeated over 9 turns"; explainer says 97a0 turns 131-136 each stayed in the house (131 entered it).
- Grok (`cursor-grok-4.5-high`): VERDICT: LGTM. NB: bag contents not in the state (documented); a test title still says "ignores the interface's value"; FEATURES copy wording "leaving the same game state".
- GPT (Codex `gpt-5.6-sol`, xhigh, read-only; could not run vitest: EPERM on `.vite-temp`): VERDICT: BLOCKING, new blockers:
  - B1 `cycleState` still merges inventory progress: it reads neither `resources` nor `active_ui.details`, so withdrawing one item at a time from the PC (quantity `value` stays 1, `details.maximum`, `resources.pc_items` and the bag change) could form a 2-turn cycle and collapse real withdrawals.
  - B2 the stage-2 note is still not exactly true: it turns the period (turns) into a count of "screens, positions and highlighted choices", but a turn can hold several calls (several result states), and the clock cycle is one screen with one highlighted choice. Suggested: "the same sequence of screens, positions and highlighted choices".
  - NB: the identical-turn pass can thin a cycle's newest copy (A,A,A,B ×3 keeps A,B), unlike the copy's "keeps its last 2-4 turns".
- Stopped here: two complete rounds each raised new blockers (round 1 Claude and Codex, round 2 Codex), so per the review skill and the brief, round 3 waits for the operator's scope confirmation. Not fixed on the branch (the packet stays frozen). Proposed fix batch 2 if approved: add `resources` and `active_ui.details` to `cycleState` (the clock's details carry no progress; check they do not move per cycle) with a PC-withdrawal test; note wording "…and each time round the game came back to the same sequence of screens, positions and highlighted choices" with a two-call note test; copy says the newest copy is kept "apart from identical turns the identical-turn rule already left out"; the NB wording items.

### Sync with main (before review)

- main moved to 5ab3f577 (story-progress-clock-v1, fixed-run Mac lane, whole-map pair v6). Merged main into the branch. Conflicts were registry appends, index churn and the three fixed experiments: took main's side of every conflicted file and of every test file this branch had only re-indexed, then re-applied this switch after story-progress-clock-v1 (registry, presets, flagFeatures, legacy fixture, DEFAULT_NEXT_RUN, FEATURE_EXPLAINERS, Activity History label, readiness row, bundle arm and base of bundle-v-control, bundle-cook-1h and whole-map-cook-1h) and re-bumped the index assertions (one more each; story-progress-clock's own "last" test now builds with this switch off).
- whole-map-pair-1h-v6 (the definition 97a0 runs under) is not changed; the brief names only the three fixed experiments above.
- Gates after the merge (`runs/receipts/short-cycle-fixed-point/gates-merge.log`): build and lint clean; agent 3062/3062, viewer 1443/1443, pytest 3015 passed; coverage agent 97.29/93.15/97.66/99.21, viewer 95.09/91.09/93.85/97.7, Python lines 97.11 branches 92.67 functions 100; `just pages-check` on the explainer prints nothing; `fixed-cli check` exit 0 for all three (worktree root).
- COMMIT: `merge: main (story-progress-clock-v1, Mac lane) into short-cycle-fixed-point-v1` (sha in the review log)

Fix batch 2 (coordinator, 9:3x PM ET: "Apply your proposed fix batch 2 now"; The operator approved round 3 at 9:42 PM ET, "yes and yes"):
- Codex B1 accepted: `cycleState` now also reads the open interface's `details` and the inventory (`resources.bag`, `pc_items`, `storage`, `daycare`, `planted_berries`). Berry growth timers (`berry_trees`) and script registers (`script_pc`, `script_mode`, `script_status`, `diagnostics`, `selected_tree_id`, `berry_script_owner`) are left out because they move on their own; in ef9f turns 129-140 and 97a0 turns 114-124 the whole `resources` hash and `details` (null) were constant, so both evidence replays are unchanged. Tests: a quantity box's `details.maximum` changes the state; taking one POTION at a time out of the PC (same screens, same quantity box, only the bag and PC items change) never collapses; the same screens with nothing taken out, while berry timers and `script_pc` tick, do collapse. Receipts: g1b inventory removed → 1 red; g2 details removed → 1 red; g3b whole `resources` (timers and registers included) → 1 red; all restored green. (g1 and g3, first attempts, passed unexpectedly because that test's quantity maximum and registers also moved; the test was tightened and the receipts re-run as g1b/g3b.)
- Codex B2 accepted: the note now says "...repeated the same P turns of <tools> calls, and each time round the game came back to the same sequence of screens, positions and highlighted choices." — no count of screens, so it holds for multi-call turns and for the one-screen clock cycle. Tests: the clock note checked against the states the cycle left (each turn's screen, position and highlighted choice equals the one 2 turns before, the clock's time took 7 different values, one screen), and the two-call turn's note. Receipt g4 (counted wording restored) → 4 red, restored green. FEATURES copy, explainer and viewer test updated.
- Codex NB accepted: the copy says the newest copy is kept "less any identical turns the identical-turn rule already left out". Claude/Grok NB wording: test title "ignores the clock's time"; explainer "131 entered the house, 132-136 stayed in it".
- Gates after fix batch 2 (`runs/receipts/short-cycle-fixed-point/gates-fix2.log`): build and lint clean; agent 3069/3069 (ef9f and 97a0 evidence replays and probes unchanged and green), viewer 1498/1498, pytest 3166 passed; coverage agent 97.3/93.16/97.66/99.21, viewer 95.23/91.09/94.14/97.8, Python lines 97.11 branches 92.69 functions 100; `just pages-check` prints nothing; `fixed-cli check` exit 0 for all three.
- COMMIT: `fix: short-cycle-fixed-point-v1 review batch 2 (inventory and interface details in the cycle state, sequence wording in the note)` (sha in round 3)

## Boy Scout Log

## Archive Milestone (user-gated)

- [ ] ASK USER: archive this worklog.
