# Positive supervisor: loop-guard response redesign

## Problem Statement
Loop-guard fires are followed by a story milestone at about the base rate (cook-6h-v2 analysis). Decision probes on 2026-10-20 showed what works: changing what the model sees (breaker stage 1: T2301 0/16 → 14/16 break; T2862 failed replies left out 0/16 → 16/16 tool calls) and telling it what to do. Warnings and "ways off this map" lines hurt (f28d T451: the turn 450 note drove 4-10/16 samples off Route 103, away from MAY). The operator, 11:53 AM ET: LEARNING-POSITIVE-PROMPTING.md; 11:55 AM ET: build the redesign now, validate with probes against known loops, bundle only if validated; the 12-hour cook waits.

## Skills Loaded
feature-worklog, feature-switch, feature-explainer, close-the-loop.

## Architecture
`positive-supervisor-v1` (guidance, bundle-only, default off), in `SupervisorBriefing` and `StallBriefing`:
- Loop-guard, interface-dwell and text-only notes become "SUPERVISOR: Make one tool call based on the game state and what you observed." plus one factual clause, then where you are, the open interface (and how to finish naming), the untalked story characters on this map (StoryCharacterGate), up to 3 untried targets shown here (warps left out), and the latest 3 attempts with counts.
- Never: looping/stalling wording, "do not try it again", ways off the map, exits to other maps, the story goal line.
- Map back-and-forth and milestone-drought stall briefings are not sent.
Detection is unchanged. Builds on claude/loop-breaker (needs StoryCharacterGate).

## Invariants
- INV-1: OFF notes byte-identical (existing supervisor tests, bundle-3f21 fixtures).
- INV-2: no clipping; lists are the existing bounded lists (3 targets, 3 attempts).

## Security Review
No new I/O.

## Milestones
**M1 — positive-supervisor-v1**
- [x] RED: positive-supervisor.test.ts (registry, f28d replay T450 exact text, banned phrases, no drought/map-cycle briefings, text-only and dwell notes); registry +1 shifts.
- [x] GREEN: SupervisorBriefing.positive, stall briefing retirement, registry, presets, next-run. Agent 2830 tests pass.
- [ ] Probes (GPU queue, 16 a side): f28d T451, T2301, T2862, control 8d39 Route 104 battle-menu and woods party-menu loops
- [ ] Explainer, pending experiment, review, landing after claude/loop-breaker

## Closing the Loop
Probes decide bundle inclusion.

## Session Log
- 2026-10-20 ~12:00 PM ET: branch claude/positive-supervisor from claude/loop-breaker 5d07a65a.

## Surprises
- Probe r1 (runs/decision-probes/2026-10-20_positive-supervisor/, 16 a side): f28d 451/2301/2862 no change over breaker+gate; control 827 16/16 back out of the party menu with B vs 2/16; 3411 9/16 north vs ~6/16, 0 vs 2 wrong south warp; 3259 worse: 13/16 repeat the navigate_to (0,6) that failed 3 times and 13 copy thinking (vs 4 and 1). Revised: the newest attempt, when repeated with the same result, gets "Choose a call other than <attempt>: it gave the same result (...) N times in a row."
- Probe r2 on f2e11d3a (coordinator relay 12:10 PM ET, off vs on): T3259 repeats navigate_to (0,6) 10/16 vs 7/16 (p=0.48), word-for-word copied thinking 6/16 vs 1/16 (p=0.08), judged still worse than off; T827 16/16 vs 3/16 hold; T3411 north 12/16 vs ~10/16, wrong south warp 0 vs 3. Misses the bar: stays out of the bundle for the 12-hour cook (the operator's rule). Resume after the cook.

## Multi-Model Review Log
## Boy Scout Log
## Archive Milestone (user-gated)
- Round 3 variants (the operator 12:12 PM ET: iterate on 3259's observed failings, 32 samples a side, several prompt variations): the repeated-attempt line quotes navigate_to's own answer; layout a = last line (this branch), b = right under the instruction (claude/positive-supervisor-b), c = b with "Write a new plan ..., then make one tool call" (claude/positive-supervisor-c).
- Round 3 (32 a side, control 8d39, coordinator relay 12:24 PM ET): T3259 repeats navigate_to (0,6) off 9, A 21, B 27, C 27; copied thinking off 3, A 16, B 23, C 24 (all worse, p<=0.005; naming the failed call earlier is worse). T827 backs out of the party menu off 10, A 32, B 31, C 31. T3411 north/wrong south warp off 18/5, A 23/0, B 21/0, C 19/0. Takeaway: helps menu and woods loops, hurts "my last plan failed" loops; naming the failed call seems to prime repeating it. The 3259 loop comes from the 15x15 planner (flood fill reaches the west exit), so whole-map navigation may remove it; re-probe on cook settings after semantic-navigation-v2. Held out of this cook.
- Operator decision 12:28 PM ET (decision card, via coordinator): variant A into the bundle. Finalized: layout constant removed, feature copy with probe numbers, navigate_to-answer test, explainer, pending experiment, readiness row. Agent 2831, viewer 1364 pass; lint clean; coverage agent 97.1/92.9/97.6, viewer 95.1/91.0/93.9.
- Pending experiment pinned to c0a2190b93a159ed954ddbf09de8a8fb18a8af3c.
- Review r1 on 28b7fd8b: Grok BLOCKING: warps filtered by label prefix, so a "Dynamic warp" target stayed listed. Fixed: open(s,false) drops kind warp before labelling; test with Dynamic warp, Warp to and unnamed warps (deleting the filter turns it red).
- Claude r1 BLOCKING: B1 the repeat count counted every match in the 8-entry window (A, B, A said "2 times in a row"; interface presses merged by label); B2 the Dynamic warp leak (already fixed). Fixed B1: a consecutive streak (same room, label, result, answer) for field attempts only; test A,B,A gives no line and A,A gives 2 (old logic turns it red). Agent 2833, viewer 1364; lint, coverage clean.
- Claude r2 BLOCKING (Grok r2 LGTM): presses inside a field menu (START menu with briefing-exits-v1 off) extended the streak. Fixed: a press made in or leaving an interface, or any non-overworld result (battle), resets the streak; test with exits off covers START open/close and a battle between repeats; deleting either reset turns it red.
- Added (follow-up item 6, the operator yes 12:44 PM ET): retired drought and map back-and-forth briefings are still recorded as diagnostic loop_guard would_warn events; f28d test checks turn 452. Gates pass (agent 2833, viewer 1364; coverage agent 97.1/93.0/97.6, viewer 95.1/91.0/93.9).

## Review and landing
- r1 (28b7fd8b): Grok BLOCKING (Dynamic warp leak), Claude BLOCKING (same, plus non-consecutive "in a row" count). r2 (95b553d8): Grok LGTM, Claude BLOCKING (field-menu presses extended the streak). r3 (ddb2b4b2, base 5fe8b8bc, diff 36404d0afa1cba5e2f5e1e37a4bfbf02c5ab51e4aae36602218f9847c3ea0be0): Grok LGTM, Claude (read-only subagent; CLI OAuth expired) LGTM. Artifacts runs/reviews/positive-supervisor/.
- Coordinator merge slot 12:54 PM ET. Landed git merge --ff-only ddb2b4b2. just build, pnpm -r test on main: agent 2833, viewer 1386 passed.
