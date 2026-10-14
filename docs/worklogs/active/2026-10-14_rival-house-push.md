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
- [ ] M5 Operator review, then local merge into main (the operator approves the merge).
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
  15-minute budget, stop at RIVAL_MET, present-at-start milestones excluded. The confirmation batch
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
