# Story progress clock

> Markdown twin of [story-progress-clock-v1.html](../story-progress-clock-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`story-progress-clock-v1` · agent guard switch · bundle-only, default off · correctness fix

Seven story milestones are *measurement-only*: they are recorded for splits but are never a run's target. They are PLAYER_BEDROOM_EXITED_AFTER_CLOCK, ROUTE_101_AFTER_HANDOFF, RIVAL_BATTLE_STARTED, RIVAL_BATTLE_DEFEATED, RIVAL_OLDALE_SEND_OFF, ROUTE_101_AFTER_RIVAL_BATTLE and LITTLEROOT_AFTER_RIVAL_BATTLE. Today the supervisor briefings skip them. So the stall briefing can say "no new story milestone for 15 minutes" while the model is in the rival battle, and the briefing's "Last story progress" line names a step from 133 turns earlier. With the switch on, each of these milestones counts as story progress everywhere the briefings count from the last story progress.

## Recorded run dc5a: the drought clock around the rival battle

![Off, the clock counts from FIRST_POKECENTER_HEAL and fires 14 seconds into the battle (recorded note at seq 13819). On, RIVAL_BATTLE_STARTED restarts it; the next note, 5 minutes after RIVAL_BATTLE_WON, is the same on both. Tested in story-progress-clock.test.ts on the dc5a fixture.](story-progress-clock-v1/fig-1.svg)

*Off, the clock counts from FIRST_POKECENTER_HEAL and fires 14 seconds into the battle (recorded note at seq 13819). On, RIVAL_BATTLE_STARTED restarts it; the next note, 5 minutes after RIVAL_BATTLE_WON, is the same on both. Tested in `story-progress-clock.test.ts` on the dc5a fixture.*

## The note at dc5a seq 13819, rebuilt off and on

\- Exits to maps you have not entered since your last story progress: ROUTE103 (map 0/18): Warp to ALTERING CAVE (map 24/106) at 45,6; EAST edge -&gt; ROUTE110 (map 0/25) | OLDALE TOWN (map 0/10): … | LITTLEROOT TOWN (map 0/9): … | OLDALE TOWN POKEMON CENTER 1F (map 2/2): … - Last story progress: first pokecenter heal at turn 380 (133 turns ago) - Not tried yet on other maps you have been on since your last story progress: OLDALE TOWN (map 0/10): …

\- Exits to maps you have not entered since your last story progress: none - Last story progress: rival battle started at turn 512 (1 turns ago) - Not tried yet on other maps you have been on since your last story progress: none

Rebuilt by the production `SupervisorBriefing` from the recorded events. With the switch on the note is not sent at all (the clock restarted); the right side shows what any briefing at that point reads. Every other line is byte-identical. The lists are empty because no field state has been shown since the battle began.

## What changes, and what does not

| Reader | Off (today) | On |
|---|---|---|
| Stall briefing drought clock ("no new story milestone for N minutes") | skips measurement-only milestones | restarts at each one |
| Stall briefing map back-and-forth trips and interface-dwell call count | keep counting across them | start again at each one |
| "Last story progress" in the loop guard, stall, text-only and v2 briefings | older counted step | the measurement-only step, with its turn |
| "Exits to maps you have not entered since your last story progress", "Not tried yet on other maps … since your last story progress" | maps since the older step | maps since the measurement-only step |
| positive-supervisor-v1 retired drought and map-cycle diagnostics | old clock | same clock as above |
| Dialogue of the last story step, story-character gate ("since your last story milestone", auto-talk), battle recap, milestone stall stop, loop guard | unchanged: none of them reads the drought clock or says "story progress" |  |

A measurement-only milestone present at start (a checkpoint start), and GAME_RUNNING, are never progress, on or off. No new words reach the model: the progress line already prints milestone names this way.

## Wiring

![The switch is read only from the FeatureSet each production factory passes in. The two green boxes are the only code that changes.](story-progress-clock-v1/fig-2.svg)

*The switch is read only from the FeatureSet each production factory passes in. The two green boxes are the only code that changes.*

## Evidence

- bd60 seq 11962 (T440): "no new story milestone for 10 minutes", 12 turns after RIVAL_OLDALE_SEND_OFF (T428); progress line "first pokecenter heal at turn 353 (87 turns ago)". On: no note; the progress line reads "rival oldale send off at turn 428 (12 turns ago)".
- dc5a seq 13819: 15 minutes, 14 s into the rival battle (above).
- fb46 seq 7174: 5 minutes, 27 s after RIVAL_BATTLE_STARTED (seq 7091).
- 10a2 seq 14567: 20 minutes, 41 s after RIVAL_BATTLE_STARTED (seq 14426).

In the bundle arm, positive-supervisor-v1 retires the drought and map-cycle notes, so there this switch changes the interface-dwell count and the recorded diagnostics only. The pending experiment uses the shared incumbent, where those notes reach the model.

## Status

Ported from `archive/claude/supervisor-truth-fixes`. Tests: `packages/agent/src/story-progress-clock.test.ts` on the bd60 and dc5a fixtures; OFF replays all 14 and 16 recorded supervisor notes byte for byte. Pending experiment `experiments/story-progress-clock.json`, activation CLOCK_SET. Not reviewed yet; no measured runs.
