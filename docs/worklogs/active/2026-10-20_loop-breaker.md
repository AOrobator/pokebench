# Fixed-point loop breaker and the story-character stall gate

## Problem Statement

In the 6h-v2 bundle (`2026-10-20T03-02-13_qwen36-gpu1_f28d`, evidence `runs/reviews/2026-10-20-run-analysis-cook-6h-v2/evidence.md`):

- Turns 2200-2600: 400 turns on Route 101 (10,5), the same `navigate_to (10,5)` each turn, "arrived ... 0 bounded movement actions", byte-identical thinking. The loop guard sent 67 notes; none broke it. After the context trims (turns 2862-2891) 9 of 30 replies were degenerate thinking with no tool call.
- Turn 452: a 5-minute stall briefing fired while MAY stood 4 tiles away on Route 103, not yet talked to. Turn 455 the model decided "I am looping on ROUTE103 and need to leave" and walked away; the rival battle came 299 minutes later. The GPU queue thread's probe at turn 455 (runs/decision-probes/f28d_T455_*) found 6-7 of 8 samples still walk south with or without the stale lab goal, giving "I am looping and need to leave" as the reason.

## Operator decision

The operator, 2026-10-20 10:52 AM ET, "Cook runs analysis" thread (relayed by the coordinator):

- One fixed-point breaker. Trigger: same state plus same call 3 times, or a turn with no tool call. Stage 1 collapses duplicate repeated turns to one copy (never drops thinking in general). Stage 2 sends a short, distinct, positive prompt ("Make one tool call based on the game state and what you observed") with the repeat count. Stage 3 auto-talks to the nearest untalked person, story characters first: "talk to me on that one". Stage 3 waits for the operator's OK (design posted 11:0x AM ET in the "Loop breaker and stall gate" thread).
- The loop guard should do no harm: no stall or "leave" briefing while a named story character is on the map and has not been talked to since the last story step, or while the player is getting closer to one.
- Both switches bundle-only, default off. Tests: planted repetitive/degenerate thinking for the breaker; decision probe at f28d turn 452 for the gate (GPU use needs the coordinator's OK).

## Skills Loaded

feature-worklog, feature-switch, agent-observability, feature-explainer (M3), close-the-loop, experiment-queue (M3).

## Architecture

**fixed-point-breaker-v1** (`packages/agent/src/fixed-point-breaker.ts`)

- `FixedPointBreaker` subscribes to the recorder. Per completed turn it keeps the tool calls (name and arguments) and the state the results left (`planState` key from same-plan.ts; null when the readout cannot qualify the state). `streak()` counts trailing turns whose calls and result state equal the turn before; replies with no tool call count separately (`silent()`), from assistant events.
- Stage 1 (streak ≥ 3 anywhere in the window): in the request, a run of 3 or more consecutive identical turns (same assistant content: thinking, text and tool calls without ids; and the same result state for every tool result, from the recorded `tool_result.state_seq`) keeps only its newest turn. Identical text-only replies collapse the same way. Never edits a kept message; turns that differ by a byte are kept.
- Stage 2 (fixed-point streak ≥ 4, or the newest reply called no tool): the newest no-tool nudge is replaced by, or for a fixed point the request ends with, `SUPERVISOR: Make one tool call based on the game state and what you observed. ...` with the count.
- Applied inside `contextTools` (collapse first, the note after every other pinned note), so the decision probe rebuilds it from the recorded stream. Each stage delivery is recorded as a `loop_breaker` event (Activity History, raw inspector; no timeline mark).

**story-character-stall-gate-v1** (in `StallBriefing`, `packages/agent/src/stall-gate.ts`)

- Reads the readout's own `Story characters here (from this map's own object list): ...` line from game-tool results (character-presence-v1), the state's objects, and talks since the latest story milestone (people-ledger rule: the first field page of an auto-advanced conversation faced that object, after an A press or attributed to the faced sprite; or a page spoken under the character's name).
- Holds a due `map_cycle` or `milestone_drought` briefing while a named character is on this map and untalked since the last story step, or while the player's latest move on this map got closer to a placed named character. Each held briefing (kind and level) is recorded once as a `stall_gate` event. interface_dwell and the loop guard's own episodes are unchanged.

## Invariants

- INV-1: Either switch OFF is byte-identical (prompt, messages, notes, events) to today. Test: OFF factory and transform equality.
- INV-2: Nothing model-facing is clipped; collapse removes whole duplicate turns only, keeping the newest copy. Test: kept turn bytes equal the original.
- INV-3: Collapse never removes a turn whose content or result state differs. Test: one-byte thinking difference, different result state.
- INV-4: Timing comes from game state and event order, not sleeps. The gate uses the stall briefing's own clock.
- INV-5: No new timeline marks. New events reach Activity History and the raw inspector only.

## Security Review

No new subprocesses, network or file paths. Model text is only compared, never executed.

## Milestones

**M1 — fixed-point-breaker-v1 stages 1-2** and **M2 — story-character-stall-gate-v1** (one RED and one GREEN commit for both: they share the registry shift)
- [x] RED tests: `fixed-point-breaker.test.ts` (12), `stall-gate.test.ts` (8, real f28d events turns 383-455 in `test-support/stall-gate-f28d.json.gz`), registry position shifts (+2) in older switch tests, viewer trace sample. LEGACY_ALL_ON keeps both switches off.
  - COMMIT: `test: fixed-point breaker and story-character stall gate (RED)` (e57e8899). RED run on a scratch checkout of e57e8899: both new files fail to load (modules missing), features.test.ts fails 3 registry tests.
- [x] GREEN: `fixed-point-breaker.ts`, `stall-gate.ts`, gate in `StallBriefing` and `SupervisorBriefing`, `loop_breaker` and `stall_gate` events (recorder, probe replay, viewer Activity History, tail), registry, presets, next-run defaults, `TEXT_ONLY_REMINDER` constant moved to harness.ts. Agent 2722, viewer 1356 tests pass; lint clean.
- [ ] Gates
**M3 — explainers, pending experiments, readiness rows**
- [x] `docs/explainers/fixed-point-breaker-v1.html`, `docs/explainers/story-character-stall-gate-v1.html` (pages-check clean), README rows, `FEATURE_EXPLAINERS` entries plus `loop-breaker-explainers.test.ts`; pending `experiments/fixed-point-breaker-v1.json` and `experiments/story-character-stall-gate-v1.json` (not queued); readiness rows. Auto-talk stops when a battle starts mid-walk (test added). Agent 2730, viewer 1358 pass; lint clean.
**M4 — probes** (GPU queue thread, 16 per side, runs/decision-probes/2026-10-20_pre-cook/)
- Breaker T2301: off 16/16 repeat with identical thinking; on 14/16 do something else, none copy the thinking (p<0.001).
- Breaker T2862 (no tool call): 16/16 text only in both arms. The samples are one reply's thinking looping to the output cap, so no note can fix it. Asked for T2862 with fresh-retry-v1 and with presence-penalty-v1: fresh-retry 16/16 tool calls, presence penalty 0/16 (server application unconfirmed). Folded into stage 1: under the breaker, replies with no tool call are left out of the request (nudges and notes stay).
- Gate T451: 10/16 leave south off vs 4/16 on (p=0.07); none go to MAY (unreachable inside the 15x15 window). T453: no change.
**M5 — stage 3 auto-talk** (the operator OK 11:04 and 11:16 AM ET; signs last per run evidence, runs/reviews/2026-10-20-loop-breaker/sign-evidence.md)
- [x] RED: `auto-talk.test.ts` (7): off is the base transform; 8th identical turn walks next to MAY, faces, presses A, message last with screenshot; once per loop and retained until a newer game result; ranking story > person > sign, no item balls or unbeaten trainers; next side and next person when a walk goes nowhere; not_free in battle; 3 silent replies; gate learns from auto_talk.
  - COMMIT: `test: fixed-point breaker stage 3 auto-talk (RED)` (00b5d70b); fails to load without auto-talk.ts.
- [x] GREEN: `auto-talk.ts` wraps the live transform outside battle-decision readiness; `auto_talk` event (recorder, viewer, tail); breaker exposes loop ids; gate counts auto-talk talks. Agent 2729, viewer 1356 pass; lint clean.
**M6 — Claude + Grok review, merge slot from the coordinator, ff-only landing**

## Closing the Loop

Tests per milestone; probe receipts for M4; explainer pages checked with `just pages-check` and served on 8791.

## Session Log

- 2026-10-20 11:05 AM ET: worktree `/private/tmp/pokebench-loop-breaker`, branch `claude/loop-breaker` from main 2a2fe257.

## Sync

- 2026-10-20 ~11:50 AM ET: merged main 688b1764 (92 commits, incl. briefing-repeat-count-v1 and navigate-already-here-v1, which sit before original-speed-pacing-v1; ours stay after it). Conflicted registry tests took main's side and got the +2 shift again; presets, next-run and FEATURE_EXPLAINERS keep both. Agent 2826, viewer 1363 pass; lint clean.

## Surprises

- 2026-10-20 11:12 AM ET, GPU queue probe (coordinator relay): the f28d walk-away traces to the turn 450 loop-supervisor note, not the 452 stall briefing. It listed "Ways off this map: SOUTH -> OLDALE TOWN" and MAY was not among its untried targets (out of view, and a refused walk to her tile counted her tile as tried). Sampling turn 451 ×8: as recorded 4/8 leave; note removed 0/8; only the ways-off line removed 1/8. So the gate switch also keeps ways-off lines out of supervisor notes while it holds, lists the untalked story characters, and counts a walk's target as tried only when it ends on or next to it.
- The operator 11:04 AM ET approved stage 3 with signs as lower-priority candidates, to be backed by run evidence; 11:16 AM ET the 12-hour whole-map cook waits for these switches including auto-talk.

- The stock decision probe cannot read logs over 512 MB and replays recorded result text (coordinator note, 11:02 AM ET). f28d is 558 MB.

## Multi-Model Review Log

## Boy Scout Log

## Archive Milestone (user-gated)
- 11:47 ET: breaker no-tool fold-in, RED d4476bb3.
- Review r1 on 8e3bed94 (diff 56a42ff8…): Grok LGTM (non-blocking: not_free consumed the loop's one auto-talk attempt). Claude CLI OAuth expired. Fixed: a not-free field leaves the attempt for a later request (test added).
