loop-guard-screen-v1 · guard · bundle arm only · default off

# Loop guard screen

> Markdown twin of [loop-guard-screen-v1.html](../loop-guard-screen-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The loop guard's note was describing the bedroom while the clock was open. The stall note already quotes the screen. This switch makes the loop guard's own note do that.

## What the run did

On `2026-10-18T01-30-48_qwen36-gpu1_cdb1` (the control arm) the bedroom clock was open from turn 87. The clock was set at turn 217. From turn 93 through 213 the loop guard posted a cycle note every 6 turns: 21 notes. Each one said the player was in GREEN's HOUSE 2F at 7,2 facing down, and listed the PC, notebook, GameCube, region map and television as untried. The screen for those turns was the clock adjustment, ready, controls “LEFT/RIGHT changes time; A opens confirmation”. The model pressed B 117 times, turns 98 through 214. B does not leave that screen.

![Twenty-one field notes, then one screen note, then the clock is set](loop-guard-screen-v1/fig-1.svg)

*The field notes ran the whole time the adjustment screen was open. The one note that named the screen came from the stall briefing, two turns before the clock was set.*

## What the note says

Off, `text()` briefs the last field tile and the untried objects there, even while a ready interface is open. On, that same note uses the stall path's interface wording when the latest result is a ready interface. It names the interface, the highlighted choice when there is one, and the controls string the game already sent.

![Off quotes the field; on quotes the controls the game shows](loop-guard-screen-v1/fig-2.svg)

*Same loop-guard headline either way. Off lists the bedroom. On quotes the controls on the open screen and drops the field list.*

A clock transition is not a ready interface. Its controls are “Clock transition; selection input is not active”, and `ready` is false, so the field note stays with the switch on. The stall briefing is unchanged and still quotes a ready screen when this switch is off.

## Status

Default off. Needs the loop supervisor. On in the bundle arm of `bundle-v-control`, off in the control arm. Pending experiment `loop-guard-screen`, not queued and not measured on its own. The cook already running keeps the build it started on; this switch does not change it.
