# Rival-house push: game evidence over priors

Requested by the operator in the "What to prioritize next" thread (2026-10-14). He approved
experiments 1 to 5 from `runs/reports/pareto-frontier/pareto-frontier.html`, with his feedback
applied to all of them. Branch `claude/rival-house-push`, worktree `/private/tmp/pokebench-rival-push`.

## Problem

Recent Think Fast runs leave home after setting the clock in 24 of 32 runs. Only 2 of those 24
enter the rival's house, which is next door. 56% of recent wall time is spent after leaving
home with no progress. 11 of 24 runs walk into Birch's lab because the model follows what it
remembers about Pokémon ("go to the professor") instead of what Mom told it ("go next door").
`navigate_to` is about 1% of tool calls. The loop guard's stop ended all 20 "stuck" runs in
E3–E6, 9 of them after the agent left home.

## Stop condition (the operator)

Stop once the agent meets the rival regularly. "Regularly" means the readiness bar: at least
3 of the last 4 runs of the stacked configuration reach `RIVAL_MET` from boot within 30
minutes, confirmed by a fresh, predeclared batch. Do not push on toward the starter or later
milestones after that.

## Changes (each its own switch, default OFF, OFF is byte-identical to today)

1. `game-evidence-priority-v1` (guidance). A system-prompt section: this game is the source
   of truth. NPC instructions, object and room labels, and native story state outrank what you
   remember about Pokémon. When memory and the game disagree, follow the game and say so. Also
   explicit `navigate_to` guidance: use it for any multi-tile walk on the current map,
   including to doors and warps listed in the readout. On failure, read the reason and fix the
   target instead of switching back to single presses. No route or story answer is given.
2. `dialogue-log-v1` (guidance). The harness records every distinct dialogue page actually
   shown to the model, with the run's turn, the event sequence, the room, the coordinates and
   the speaker when a named interaction identifies it. The log is complete for the run, not
   bounded, and is deterministic from recorded events. A `recall_dialogue` tool returns entries
   filtered by text, room or most recent N, so the model can look things up when it forgets or
   wants to check. It is built from the same delivered-state path `navigation-evidence-memory-v1`
   uses, so no new game decoder is needed.
3. `instruction-ledger-v1` (guidance). A short pinned block before each decision with:
   received instructions (the latest NPC dialogue, verbatim, with speaker and room), the rooms
   already visited with what was said there, and contradictions the model recorded with a
   `note_contradiction` tool. A contradiction must cite logged evidence, for example "expected
   Birch at the lab; the object at 10,8 is SCIENTIST_1 and said the professor is out". Facts
   come only from recorded events. The harness never states the next story goal.
   This overlaps `navigation-evidence-memory-v1`, whose 8-run cohort is running now. Its
   result decides whether the ledger extends that switch or replaces it; the decision is
   recorded here before M3 starts.
4. `loop-guard-supervisor-v1` (guard, needs `deterministic-loop-guard-v1`). The guard keeps
   detecting and warning, but where it would stop the run it posts a supervisor message and the
   run continues to its budget. The message helps the model regain its bearings: current room
   and coordinates, the latest received instruction, the last distinct targets tried with their
   outcomes, and listed world targets in this room not yet tried. It tells the model to check
   `recall_dialogue` and try something it has not tried yet. Repeat supervisor messages back
   off so they cannot flood the context.

## Answer to "should we remove the loop guard?"

No, but remove its stop. In E3–E6: 76 warnings, 56 of them followed by "recovered" (the loop
pattern broke), and 20 terminal stops, which account for every stuck ending. No Think Fast run
has ever had the guard off, so its net effect on progress is unmeasured. The supervisor switch
keeps detection and warnings, drops termination, and the experiment measures the difference.

## Milestones

- [~] M1 `game-evidence-priority-v1`: RED tests (prompt text present only when ON; OFF
  byte-identical; navigate_to guidance wording), GREEN, explainer, gates, review.
- [ ] M2 `dialogue-log-v1` + `recall_dialogue`: RED tests over recorded event fixtures (dedupe
  of repeated pages, speaker attribution, room, filters, limits on returned size, recorder and
  viewer visibility of every tool result), GREEN, explainer, gates, review.
- [ ] M3 `instruction-ledger-v1` + `note_contradiction`: decide extend-vs-replace from the
  navigation memory result, RED, GREEN, explainer, gates, review.
- [ ] M4 `loop-guard-supervisor-v1`: RED tests (no stop when ON; stop unchanged when OFF;
  message contents; backoff), GREEN, explainer, gates, review.
- [ ] M5a Checkpoint starts: an agent run can save a native state when a named native milestone is
  first observed (POKEBENCH_CHECKPOINT_AT, pause → POST /pokebench/checkpoint → unpause, file plus
  provenance JSON under runs/<id>/checkpoints/), and a v2 preset can start from that state with
  its SHA-1 verified before launch. Present-at-start milestones are already excluded.
- [x] M5 Operator review, then local merge into main (the operator approved 21:43 UTC: "no more review, merge it").
- [ ] M6 Experiments, serial, Think Fast, from boot, 30 minutes, stop at `RIVAL_MET`.
  Each step compares the current stack with the stack plus one switch, 8 runs per arm
  (the operator, 2026-10-14) in a predeclared counterbalanced order. Test: one-sided Fisher exact on
  rival-house entry, alpha 0.05. 8 per arm detects a jump from about 6% to 75% with about 82%
  power (6/8 vs 1/8 gives p = 0.02); 4 per arm cannot reach p < 0.05 unless one arm is 4/4
  and the other 0/4. The 32 historical runs (2/32) are shown as unrandomized context only. A switch joins the stack when rival-house conversion
  (among runs that leave home) improves with no drop in leaving-home rate:
  - Exp 1 (approved): primary metric is left home → rival house → rival met conversion, plus
    minutes after leaving home. Baseline 2/24 from existing runs. No new runs.
  - Step 0 (the operator, 2026-10-14): + `full-map-navigation-v1` on its own, before anything else.
  - Exp 2 (approved): + `game-evidence-priority-v1`, then + `dialogue-log-v1`, then
    + `instruction-ledger-v1`.
  - Exp 3 (approved): + `loop-guard-supervisor-v1`.
  - Exp 4 (approved): medium vs high thinking on the winning stack.
  - Exp 5 (approved): fresh confirmation batch of the final stack, 4 runs from boot. Stop
    if at least 3 of 4 meet the rival; otherwise report what still blocks it.
  Runs start only when no other cohort holds the gateway (the navigation memory cohort runs
  first). They are registered in the experiment queue if it has landed by then.

## Constraints

- Local only: no push, no PR, no remote. Landing is a local merge the operator approves.
- No walkthrough text, no hardcoded route, no hardcoded model SKUs; model ids come from config.
- Concrete types; every injected text is recorded and visible in the timeline, Activity History
  and replay (agent-observability skill).
- Coverage stays at or above 90% for lines, branches and functions.
- Every switch gets an explainer linked from its feature card (feature-explainer skill).
- Checkpoint starts (the operator asked, 2026-10-14 20:49/21:01 UTC): steps 0–4 start from a recorded
  save state taken right after CLOCK_SET (so Mom's rival instruction happens inside every run),
  present-at-start milestones excluded. Budget: The operator objected to the
  15-minute cap I proposed (the best run needed 16:21 after the clock); offered 25 or 30
  minutes. The operator chose 30 minutes from the checkpoint (2026-10-14 21:17 UTC). Runs do not stop at
  RIVAL_MET: the target milestone is recorded, and runs continue to budget so we see how far they
  get. The confirmation batch
  (Exp 5) starts from boot with the 30-minute budget and is the stop decision.

## Session log

- 2026-10-14: Plan drafted from the Pareto report and the operator's feedback.
- 2026-10-14 20:47Z: The operator approved ("lgtm"). Whole-map navigation is tested as its own step
  first. 8 runs per arm. Starting M1.
- M1 RED: 4 failing tests (prompt ON/OFF, navigate_to guidance only with navigation, preset
  default OFF, registry entry). 44 existing tests in those files still pass.
COMMIT: `test(agent): RED for game-evidence-priority-v1 prompt guidance` (15dbf7c)
- M1 GREEN: switch registered (guidance, needs none, recorded last), OFF in v1 flags, v2
  presets that omit it and the viewer next-run draft. Prompt sections GAME_EVIDENCE_SECTION and
  NAVIGATE_TO_USAGE (navigation only). Directional exits: the tool does not activate them after
  arriving, so the text says to press the direction. Explainer
  docs/explainers/game-evidence-priority-v1.html linked from FEATURE_EXPLAINERS; new test checks
  every mapped explainer file exists. Gates: agent 950/950, viewer 494/494, coverage agent
  97.2/93.41/97.92 (stmts/branches/funcs), viewer 95.67/90.53/95.34, tsc and eslint clean. No
  Python touched.
COMMIT: `feat(agent): add game-evidence-priority-v1 prompt guidance switch` (9bda476)
- M1 review r1 dispatched (Claude CLI, Cursor Grok, GPT lane; local endpoint lanes skipped per
  operator). Artifacts: runs/rival-push-review/m1-r1/ in the main checkout.
- M2 RED: dialogue-log.test.ts (9 tests: delivered-only capture, repeats, filters, bounds,
  faced-character honesty, argument validation, switch/tool/prompt wiring).
COMMIT: `test(agent): RED for dialogue-log-v1 and recall_dialogue` (6b1b5c4)
- M2 GREEN: DialogueLog logs delivered pages only (tool_result state_seq match), collapses
  consecutive identical page+room, keeps later repeats. recall_dialogue filters contains/room/last
  (1–20, default 8), 650 chars per page, reply under 6000 with matched/shown/omitted counts.
  Faced character only with named interactions + position. Switch needs
  active-field-message-buffer-v1; OFF in v1 flags, omitted-v2 and next-run. Viewer tool
  reference + explainer docs/explainers/dialogue-log-v1.html linked. Gates: agent 960/960,
  viewer 495/495, dialogue-log.ts 100/98.66/100/100, agent all files 97.2/93.45/97.81, tsc and
  eslint clean.
COMMIT: `feat(agent): add dialogue-log-v1 with recall_dialogue` (cb8d87c)
- M3 deferred until the navigation memory cohort reports (extend-vs-replace decision).
- M4 RED: loop-supervisor.test.ts (9 tests: briefing replaces stop, backoff 4/8/16/32 calls
  capped at 32, recovery clears it, plain and diagnostic modes unchanged, schema-valid event,
  governor never aborted, briefing contents and honest fallbacks, 2500-char bound, wiring).
COMMIT: `test(agent): RED for loop-guard-supervisor-v1` (8a67399)
- M4 GREEN: LoopDetector takes an optional supervisor briefing; in enforced mode the would-stop
  threshold posts phase `supervisor` (schema enum extended, events.v1.json regenerated), resets
  the recovery count and doubles the window up to 16× policy.recovery (live 6 → 12 → … → 96).
  Context shows the briefing until recovery. SupervisorBriefing builds where/told/tried/untried
  from delivered states only, bounded to 2500 chars. Switch is a guard needing
  deterministic-loop-guard-v1; prompt line added; live.ts wires it. Explainer
  docs/explainers/loop-guard-supervisor-v1.html linked. Gates: agent 969/969, viewer 495/495,
  loop-supervisor.ts 98.27/91.17/100/100, agent all files 97/92.93/98.01, tsc/eslint clean.
- M1 review r1 (diff 8109d52f…): Claude-family LGTM (Claude CLI logged out, Cursor Claude at
  usage limit, fresh read-only Claude subagents used), Grok LGTM, GPT lane (Codex gpt-5.6-sol)
  BLOCKING: state-only inert treatment, "few tiles" vs "multi-tile" wording, weak no-destination
  proof, explainer test does not render the card or fetch the URL. Fixing in M1 r2.
COMMIT: `feat(agent): add loop-guard-supervisor-v1` (6e7c61d)
- M1 r1 fixes: state-only mode now rejects game-evidence-priority-v1 and dialogue-log-v1 ON
  (supervisor is already excluded through its loop-guard dependency); wording is "any walk of
  two or more tiles" to match the worklog; exact prompt-seam equality plus SHA-256 pins for both
  sections and a broad case-insensitive name/place/story-step regex; Harness Config card-link
  test and served-URL test for all three new explainers. The existsSync check over
  FEATURE_EXPLAINERS is kept deliberately: it is a handful of stat calls and catches a mapped
  explainer that was never committed.
COMMIT: `fix(agent): close M1 review findings for game-evidence-priority-v1` (7e1ce7a)
- Review r2 dispatched: packet 9bda476..7e1ce7a (M1 fixes + M2 + M4), artifacts
  runs/rival-push-review/r2/.
- M3 decision (17:05 EDT): the navigation memory cohort is on an infrastructure hold after 5/8
  trials (trial 6 game-server SIGSEGV, owned by that thread). No arm reached RIVAL_MET. Build
  instruction-ledger-v1 as its own switch so each experiment step differs by one flag; it reuses
  the DialogueLog capture and does not modify navigation-evidence-memory-v1.
- M3 RED: instruction-ledger.test.ts (instructions, rooms, contradictions with evidence, bounds,
  context delivery + ledger_context event, registry/prompt/tool/state-only).
COMMIT: `test(agent): RED for instruction-ledger-v1 and note_contradiction` (15f0d64)
- Answered the operator's checkpoint question (21:07 UTC): checkpoint right after CLOCK_SET, 15-minute
  budget, confirmation from boot. Constraint updated above.
- M3 GREEN: InstructionLedger (reuses DialogueLog capture) pins last 3 pages, last 8 rooms with
  first turn and last line heard, newest 8 model contradictions (1–4 known event numbers), header
  says it is not a walkthrough, bounded to 4000 chars. New ledger_context event (schema
  regenerated), recorder method, tail, viewer action row, inspector, timeline marker, Harness
  Config tool reference for note_contradiction, explainer docs/explainers/instruction-ledger-v1.html.
  Composes after navigation memory in live.ts; rejected in state-only mode. Gates: agent 975/975,
  viewer 499/499, instruction-ledger.ts 100/97.95/100/100, agent all files 97.17/93.36/97.79,
  viewer 95.67/90.54/95.34, tsc/eslint clean.
COMMIT: `feat(agent): add instruction-ledger-v1 with note_contradiction` (c87f309)
- M5a RED: env/tests/env/test_checkpoint.py (2 tests) and checkpoint-capture.test.ts (5 tests).
COMMIT: `test: RED for milestone checkpoint capture and checkpoint starts` (1c344fd)
- M5a GREEN: env pokebench_env/checkpoint.py adds POST /pokebench/checkpoint for agent (non-human)
  servers via serve.run(agent_checkpoint=...); returns state + sha1 + sha256, 503 when unavailable.
  Agent CheckpointCapture (POKEBENCH_CHECKPOINT_AT, native milestones only) pauses, fetches,
  verifies both digests, writes <MILESTONE>.state + .json provenance under runs/<id>/checkpoints/,
  always unpauses; live.ts awaits it before the run closes. v2 presets accept
  start {kind:save_state,path,sha1}; presetStart verifies SHA-1 before launch and live.ts loads the
  state through the launcher's existing --load-state and records start_state. Gates: agent
  980/980, viewer 499/499, env 1850 passed, Python coverage 96.72/91.92/100, TS agent
  97.3/93.5/97.95, ruff/mypy/tsc/eslint clean. Worktree venv got the built mgba package copied from
  the main checkout (setup gap only).
COMMIT: `feat: save a checkpoint at a native milestone and start play runs from it` (35d43c9)
- Review r2 (diff 126efcc3…, artifacts runs/rival-push-review/r2/): all four M1 r1 blockers
  resolved by every lane. Grok LGTM, Claude fallback B (sonnet) LGTM; Claude fallback A (opus) and
  GPT (Codex) BLOCKING: (1) supervisor feature text gave the unit-test backoff (4/8/16/32) instead
  of the live 6/12/24/48/96; (2) rooms keyed on the location label collide across maps; (3) no test
  of the live wiring or of old v2 presets reading the new switches OFF. Claude CLI logged out and
  Cursor Claude/GPT at usage limit again; standing fallbacks used.
- r2 fixes: roomOf() = location + map id, used by the dialogue log, supervisor and ledger, with
  collision tests; feature text gives the live backoff and "two or more tiles"; switch wiring moved
  into play-wiring.ts (contextTools, loopSupervisor) and tested ON/OFF, tool order matches
  playTools, both pinned contexts chain; old v2 presets read all four switches OFF; supervisor
  leak regex broadened. Gates: agent 985/985, viewer 499/499, play-wiring.ts 100% funcs after the
  callback test, agent all files 97.29/93.63/97.83, tsc/eslint clean.
COMMIT: `fix(agent): close review round 2 findings` (402d002)
- The operator (21:17 UTC): 30 minutes from the checkpoint; I proposed no stop at RIVAL_MET so runs
  show how far they get (stated in thread, open to change).
- Review r3 (diff db862836…, artifacts runs/rival-push-review/r3/): Grok LGTM; Claude fallback A
  (opus), fallback B (sonnet) and GPT (Codex) BLOCKING. Real defects fixed:
  - ledger_context evidence could reach 51 > schema max 48 → schema max 64, full-ledger test;
  - roomOf showed map ids the model's readout does not show when bounded-navigation-v1 is off →
    roomKey (identity: location|map) separate from roomOf (display: map only with navigation);
  - relative preset start path was checked from the agent cwd but loaded from the launcher cwd →
    presetStart resolves one absolute path for both;
  - failed pause was ignored → capture aborts before requesting a state;
  - capture could start during the final snapshot while the server stops → close() before stop;
  - non-atomic .state/.json writes → both written as .partial then renamed, provenance first;
  - ledger rooms lookup is now a Map;
  - backoff copy now tested against LOOP_POLICY.
  Deferred with justification: deletion tests for the live.ts call sites. live.ts is the process
  entrypoint; the wiring sits behind tested helpers (contextTools, loopSupervisor, presetStart,
  CheckpointCapture) and the first M6 step (creating the CLOCK_SET checkpoint from a real run,
  then starting a run from it) exercises the live path end to end with recorded evidence.
  Gates: agent 990/990, viewer 499/499, agent all files 97.35/93.68/97.97, tsc/eslint clean.
- The review skill requires operator scope confirmation before a fourth round; asking the operator.
COMMIT: `fix: close review round 3 findings` (b21a718)
- The operator (21:43 UTC): "no more review, merge it". Wants a combined experiment: whole-map alone,
  navigation memory alone, and both together. Proposed a 2×2 (neither / map / memory / both,
  8 per arm) before stacking the four new switches; waiting on his OK.
- Merged main (fe84704: experiment queue, elevation and walkable-floor switches) into the branch.
  Conflicts in features/play-preset and their tests resolved by keeping main's switches and adding
  the four new ones after them (guidance 19, guard 7, switchboard rows 40). Agent 1015/1015,
  viewer 549/549, tsc/eslint clean.
COMMIT: `merge: integrate main (experiment queue, elevation, walkable floor) into rival-house push` (beee4e6)
- Registered the four switches as pending experiments (experiments/{game-evidence-priority,
  dialogue-log,loop-guard-supervisor,instruction-ledger}.json), sharing the queue's incumbent with
  the new switches explicit OFF, 8 per arm, think-fast lane, primary RIVAL_HOUSE_ENTERED.
COMMIT: `merge: rival-house push …` into main (44913ac), operator-approved.
- `just experiments` on main: all four new entries pending and "ready to queue" (3 of the last 4
  runs reached NEW_GAME_CREATED / FIRST_TRUCK_EXIT). Verdicts recorded in readiness.md.
- 2×2 presets (runs/launch-receipts/navigation-factorial-think-fast-n4/): one-way tiles and ledge
  hops turned ON in all four arms (the operator, 21:47 UTC), new switches explicit OFF, elevation ON;
  originals kept in original/. All four parse. Launch waits on the model-server question.
- The operator (21:50–21:53 UTC): run both models, sequentially. Corrected my contention claim: Think
  Fast runs on the separate GPU server behind inference.example (local-inference-stack
  deploy/prometheus.yml, dependency-manifest gpu.think-fast-model), Qwen 3.8 on the Mac via Hermes.
  He asked that the running experiment always be clear in the viewer.
- Checkpoint run started: 2026-10-14T17-51-38_think-fast_5521 (preset checkpoint-clock-set, target
  CLOCK_SET, POKEBENCH_CHECKPOINT_AT=CLOCK_SET), receipts runs/launch-receipts/rival-push-checkpoint/.
- RED: run_start evaluation.experiment {id, arm, trial, of} from POKEBENCH_EXPERIMENT, shown in the
  viewer run header (falls back to PRESET <id>).
COMMIT: `test: RED for an always-visible experiment, arm and trial in the run header` (b5766ef)
- GREEN: play-experiment.ts parses POKEBENCH_EXPERIMENT; live.ts records evaluation.experiment;
  schema regenerated; viewer brand shows EXPERIMENT · ARM · TRIAL n/N, else PRESET <id>. Agent
  1017/1017, viewer 550/550, tsc/eslint clean. Measurement/UI only (nothing the model sees), so no
  switch. Merged without an external review round per the operator's "no more review" for this push.
COMMIT: `feat: show the experiment, arm and trial of every run in the viewer header` (c1a442f)
- Checkpoint saved: runs/launch-receipts/rival-push-checkpoint/CLOCK_SET.state (sha1 51007c05…,
  from run 5521, CLOCK_SET at turn 118). Start check run 2126 (4 turns): start_state save_state
  recorded, CLOCK_SET and earlier milestones present_at_start, location player 2F, experiment label
  recorded.
- Think Fast 2×2 launched (manifest/driver in runs/launch-receipts/navigation-factorial-think-fast-n4/,
  source c1a442f). First launch failed before gameplay (driver .env parser kept single quotes on
  POKEBENCH_ROM; no run dir) and is recorded in aborted-launch-1/; relaunch running from trial 01.
- The 8793 viewer was stale since the experiment queue merge (queue-view.js 404, app never loaded);
  restarted on the current build. Header verified in the browser for trial 01.
- Live-run chip and run list now carry the experiment label too (RunSummary.experiment).
- The operator (22:09 UTC) saw trial 1 (neither arm) loop with no guard events. Cause: the guard only
  tracks multi-button presses when interaction-loop-detection-v1 is on, and it was off in all arms.
  Replaying trial 1 with it on: warning at call 79, supervisor briefings from 139, three loops caught
  about 6 calls in. Batch held; trial 1 left to finish.
- The operator (22:14 UTC): restart with loop detection on, 30-minute trials, supervisor messages sent to
  the model, never end the run; show him the message first. Winner marking routed by the
  coordinator to the Experiment queue thread.
- Supervisor text rewritten in his wording ("You are currently looping … what you have been trying
  is not working … make a new plan that is different"); regression test reproduces trial 1's
  two-button loop (warning + repeated briefings, never a stop); viewer labels supervisor events
  "supervisor message sent to the model"; explainer sample replaced with a real replay of trial 1.
  Agent 1018/1018 (+1), viewer 562/562, tsc/eslint clean.
COMMIT: `feat: supervisor message in the operator's wording, labelled as sent to the model` (565a110)
- Restart prepared: trial 1 stopped (operator_abort, turn 435) and archived in
  aborted-run-1-loop-detection-off/; all four arms now have interaction-loop-detection-v1 and
  loop-guard-supervisor-v1 ON; manifest re-frozen on 565a110.
- The operator (22:20 UTC): give the supervisor more on its tracked objectives without a walkthrough.
  Objective tracking is off in these arms, so the briefing now quotes the model's own latest plan,
  lists the characters the readout names here and the story steps the game confirms done, and says
  to believe the readout when the plan names someone it does not show. Agent 1019/1019.
- The operator (22:21 UTC): no backoff, find loops as fast as possible (speedrun). Supervisor now briefs at
  detection (alongside the warning) and repeats every policy.recovery (6) looping calls with fresh
  facts; doubling removed. Detection thresholds (LOOP_POLICY) unchanged. Agent 1019/1019.
- The operator (22:22–22:23 UTC): quoting the model's own plan feeds its mistakes back; use deterministic
  facts (suggested recent dialogue or next milestone). Plan line removed. Briefing now has the last
  three dialogue pages and the last earned story milestone with turns since; closing says to believe
  the game over its own beliefs. Replay shows Mom's turn-27 line ("PROF. BIRCH ... lives right next
  door") resurfacing. "Next milestone to achieve" not added: it names the destination, so it is
  offered as its own hint switch, not part of this batch. Agent 1019/1019.
COMMIT: `feat: supervisor gives only deterministic facts: recent dialogue and last story progress` (014f185)
- 2×2 restarted (22:29 UTC) from a frozen detached worktree /private/tmp/pokebench-2x2-frozen at
  014f185 (runs symlinked to main), so main can move without changing trials. Trial 1 run
  2026-10-14T18-29-33_think-fast_0dda header verified (experiment label, save_state start, batch
  detection + supervisor on, map/memory off for the neither arm).
- The operator (22:28 UTC): next-milestone hint as its own switch, tested separately: get_next_milestone
  tool always available and named in the system prompt, plus a harness message on each milestone
  earned saying what is next. RED: milestone-hint.test.ts (ladder order from the human run, next
  computation incl. present-at-start, one message per new milestone, delivery + milestone_hint
  event, registry/prompt/tool/state-only).
COMMIT: `test(agent): RED for next-milestone-hint-v1` (3701b26)
- GREEN: milestone-hint.ts (28-step main-path ladder in human-run order, NextMilestoneHint, tool
  get_next_milestone, pinned MILESTONE REACHED message recorded as milestone_hint), switch
  next-milestone-hint-v1 (guidance, HINT ARM, default OFF, rejected in state-only), prompt line,
  play-wiring, viewer action row / timeline / tool reference, explainer
  docs/explainers/next-milestone-hint-v1.html. Agent 1025/1025, viewer 563/563, tsc/eslint clean.
  Merging to main does not affect the running 2×2 (frozen worktree build).
COMMIT: `feat: next-milestone-hint-v1, a separate hint arm with get_next_milestone` (19d7ce5)
- Registered experiments/next-milestone-hint.json as pending (hint arm, own experiment); the other
  rival-push entries' incumbents now set next-milestone-hint-v1 explicitly OFF.
COMMIT: `feat(experiments): register next-milestone-hint as a pending experiment` (d05acb4)
- The operator (22:31–22:34 UTC): hint must also be in the loop detection; all trials must run with no
  agent intervention. Supervisor briefing gains "Next milestone (hint)" when the hint switch is on.
  Next milestone is now the one after the furthest earned (checkpoint starts do not re-report
  NEW_GAME_CREATED, FIRST_TRUCK_EXIT, PLAYER_HOUSE_ENTERED). Agent 1027/1027.
- Unattended: driver now generic (cohort dir argument, optional endpointFile), retains failed trials
  and continues, holding only after three consecutive failures. Qwen 3.8 cohort prepared
  (navigation-factorial-qwen38-n4: same presets with renamed ids, same checkpoint and frozen build,
  local Hermes endpoint ~/.hermes/runtimes/llamacpp/server.json, model Qwen3.8-Flash-Next-UD-IQ4_XS).
  runs/launch-receipts/factorial-chain/run-all.sh runs Think Fast then Qwen under caffeinate;
  started 22:35:58Z, reparented to launchd (ppid 1, own process group), adopted trial 1.

## Archived

2026-10-17, 8:40 PM EDT, on the operator's request to archive worklogs whose implementation is already on main (9bda476e feat(agent): add game-evidence-priority-v1 prompt guidance switch). Unchecked boxes left above are bookkeeping from before that landing.
