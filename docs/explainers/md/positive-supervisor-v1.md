# Positive supervisor

> Markdown twin of [positive-supervisor-v1.html](../positive-supervisor-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`positive-supervisor-v1` · guidance · bundle arm only · default off

Today's learning (the operator, 2026-10-20): telling the model what to do, and changing what it sees, beat warnings that it is looping. Loop-guard fires were followed by a story milestone only about as often as any turn. This switch keeps every loop detector and rewrites only what the supervisors send.

## The same note, off and on

SUPERVISOR: You are currently looping. You keep repeating the same input with no effect, and the game is not moving forward (loop guard, 3243 calls into the run). What you have been trying is not working, so do not try it again. Stop and get your bearings: - Where you are: ROUTE102 (map 0/17) at 35,6 facing down - Last story progress: … - Story steps the game confirms are done: … - Dialogue you were shown leading up to the last story step … - What you tried recently, newest first: navigate_to 0,6 ×3 … → no change; … - Listed here that you have not tried yet: … - Ways off this map across its edge (the game's map connections): WEST -&gt; PETALBURG CITY … Before your next action, look back at your goal … Make a new plan that is different from what you have been trying …

SUPERVISOR: Make one tool call based on the game state and what you observed. The game state has not changed after your recent calls (the same input with no effect). - Where you are: ROUTE102 (map 0/17) at 35,6 facing down - Shown here and not tried yet: BOY_1 at 36,3 (A); YOUNGSTER at 33,14 (A); Sign text "ROUTE 102 | ← PETALBURG CITY" at 17,2 (A) - Your latest attempts: navigate_to 0,6 ×3 → no change; navigate_to 0,6 ×2 → moved to 35,6; press UP,LEFT,LEFT,LEFT,LEFT,LEFT,LEFT,LEFT → moved to 35,4 - Choose a call other than navigate_to 0,6: it answered "no supported local path; choose a reachable local waypoint" 3 times in a row.

Control run `2026-10-20T03-02-13_qwen36-gpu0_8d39`, turn 3258, rebuilt from the recorded events (left shortened with …; right whole).

## What changes

| Note | Off | On |
|---|---|---|
| Loop guard (cycle, ineffective, …) | "You are currently looping … do not try it again" plus a long bearings list, ways off the map and the story goal | "Make one tool call …", one fact, where you are, untalked story characters here, up to 3 untried targets (warps left out), the latest 3 attempts; when the newest field attempt repeated in a row with one result (a menu or battle starts the count again), which call to replace and what it answered |
| Text-only supervisor | "Your last N replies called no tool, so nothing happened …" | "Make one tool call … Your last N replies called no tool." plus the same facts |
| Interface dwell | "You are stalling …" bearings | "Make one tool call … You have made N calls in the …" plus the open interface and how to finish naming |
| Milestone drought, map back-and-forth | sent | not sent; still recorded as a diagnostic loop_guard ("Not sent (positive-supervisor-v1): …") |

Detection, recovery rules and recorded loop_guard events are unchanged; only the message text differs. Nothing is clipped.

## Decision probes

![Raw samples in runs/decision-probes/2026-10-20_positive-supervisor/. The ledge loop comes from the 15×15 planner (a flood fill reaches the west exit); operator decision 2026-10-20: ship it in the bundle, whose whole-map navigation should keep that loop from forming. Watch it in the cook.](positive-supervisor-v1/fig-1.svg)

*Raw samples in `runs/decision-probes/2026-10-20_positive-supervisor/`. The ledge loop comes from the 15×15 planner (a flood fill reaches the west exit); operator decision 2026-10-20: ship it in the bundle, whose whole-map navigation should keep that loop from forming. Watch it in the cook.*

## Off

The supervisors' notes are byte-for-byte today's.

## Status

Tests: `positive-supervisor.test.ts` (real f28d events). Three probe rounds; variant A (the repeated-attempt line last) chosen.
