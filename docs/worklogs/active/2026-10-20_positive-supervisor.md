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
## Multi-Model Review Log
## Boy Scout Log
## Archive Milestone (user-gated)
