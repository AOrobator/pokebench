# Drought hold in battles and heals

> Markdown twin of [drought-battle-heal-hold-v1.html](../drought-battle-heal-hold-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`drought-battle-heal-hold-v1` · guard · needs `stall-briefing-v1` · default OFF · bundle arm only

The milestone-drought briefing fires after every 5 minutes of active play with no new story milestone. It says the game is not moving forward and that what the model has been trying is not working. With this switch on, a due drought briefing is not sent while a battle is on screen, while a trainer's sight script holds the field, or while the party is on a heal trip a harness heal warning asked for. It is recorded as a diagnostic instead. The drought clock starts again when a hold that kept a briefing back ends, or when the heal a warning asked for is done.

## What went wrong

In the four GLM-5.3-Flash runs the briefing fired during Route 102 trainer and rival battles (`2026-10-21T01-16-23_glm53-mac_e9ee` seq 8331, 10741, 11218; bbff seq 7768; ad34 seq 10846), as RICK's sight script took the field (e9ee seq 10445), and on the Pokémon Center trip a heal warning had just asked for (`2026-10-21T07-17-35_glm53-mac_acfa` seq 4962, 5790, 6035, 7262). In each case the model was doing what the game or the harness required.

## The drought clock with holds

![Illustrative timeline. The rules are the code's: a briefing is due at each new 5-minute level since the last milestone (STALL_DROUGHT_MS); a held level is recorded once; when a hold that held at least one briefing ends, the clock restarts from that moment and the level count goes back to 0. A heal trip that reaches full HP also restarts it (not with positive-supervisor-v1, which retires drought briefings and keeps its own schedule). Here the battle runs from minute 4 to 11 and the heal trip from 19 to 29. The briefings at 16 and 34 minutes fall outside any hold and are sent as before.](drought-battle-heal-hold-v1/fig-1.svg)

*Illustrative timeline. The rules are the code's: a briefing is due at each new 5-minute level since the last milestone (`STALL_DROUGHT_MS`); a held level is recorded once; when a hold that held at least one briefing ends, the clock restarts from that moment and the level count goes back to 0. A heal trip that reaches full HP also restarts it (not with positive-supervisor-v1, which retires drought briefings and keeps its own schedule). Here the battle runs from minute 4 to 11 and the heal trip from 19 to 29. The briefings at 16 and 34 minutes fall outside any hold and are sent as before.*

## What holds a briefing

| Hold | Starts | Ends | Recorded reason |
|---|---|---|---|
| Battle | The latest state has `in_battle` | The battle ends | "a battle is on screen" |
| Trainer sight script | Field controls locked, `trainer_opponent` set and not defeated, battle not yet active | The battle starts (then the battle hold takes over) or the script ends | "a trainer battle is starting" |
| Heal trip | A heal warning: `heal_first_line`, `story_battle_warning`, `heal_before_trainers_warning`, `gym_heal_warning`, or a refused `story_battle_heal_gate`. A trip already open is not renewed. | Every party Pokémon at full HP, a battle starts, or 48 tool results pass (`HEAL_HOLD_CALLS`) | "the party is on its way to heal after a heal warning" |

The recorded diagnostic is a `loop_guard` event, kind `milestone_drought`, mode `diagnostic`, phase `would_warn`. It shows in Activity History and the raw-event inspector, with no timeline mark. Its message, for example:

```
Not sent (drought-battle-heal-hold-v1): no new story milestone for 5 minutes of play, but a battle is on screen.
```

When the clock restarts: a battle or sight script that ends before any briefing came due changes nothing. A hold that kept at least one briefing back restarts the clock when it ends. A heal trip that ends at full party HP restarts it even if nothing was held, because the heal the warning asked for is a step forward; with `positive-supervisor-v1` on, which retires drought briefings instead, that heal restart does not happen and the retired schedule is unchanged.

Its evidence is the last milestone's seq, the heal warning's seq for a heal trip, and the seq at which the briefing came due. Map-cycle and interface-dwell briefings are unchanged.

## Replay of the GLM runs

The worklog's M2 section records a replay of the GLM runs through the production `stallBriefing`, with the wall clock taken from event times. Seq numbers as the replay recorded them (one below the recorded briefing events the registry cites):

| Run | OFF: drought briefings | ON: drought briefings sent |
|---|---|---|
| `…_acfa` | 7: 4961, 5789, 6034, 7261, 8004, 9827, 10965 (the recorded fires, exactly) | 1: 8004 |
| `…_e9ee` | 6: 2158, 7012, 8330, 10444, 10740, 11217 (the recorded fires, exactly) | 2: 2158, 7012, the true briefings that led to progress |
| `…_bbff`, `…_ad34` (control arm) | The worklog lists no per-seq replay counts for these two. It notes that their other false fires (bbff 5692, 8784) come from measurement-only milestones the control clock skips; `progress-aware-cycles-v1` and `story-progress-clock-v1` own that. |  |

## Status

- Commit b23f1ece (M2 GREEN), built on `progress-aware-cycles-v1` from main. Not yet merged into main.
- Default OFF. Not in any bundle yet; that waits for Operator's OK.
- Tests: `packages/agent/src/drought-battle-heal-hold.test.ts` (recorded heal warnings from acfa seq 3857, 4811, 6838 and run 8892 seq 12979). Multi-model review: see the worklog's M2 section.
- Not yet measured in runs.
