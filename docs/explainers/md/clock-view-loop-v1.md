clock-view-loop-v1 · guard · bundle arm only · default off

# Clock view loop

> Markdown twin of [clock-view-loop-v1.html](../clock-view-loop-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

After the clock is set, opening it again lands the result on a transition the loop guard does not treat as an interface. Closing it and opening it again never added up.

## What the run did

On `2026-10-17T21-38-43_qwen36-gpu1_c18f` (the bundle arm), the clock was set at turn 110. From turn 114 through 138 the player stood at (5,2) facing the clock and pressed A thirteen times. Each opening press ended while the clock was still transitioning. The controls were “Clock transition; selection input is not active”, and the minute was ticking. The next A closed it. The controls on the view that followed were “A or B closes clock.” No loop-guard event fired in that window. The guard had already fired while the clock was being set.

![One reopen: A ends on the clock transition, the next A closes it](clock-view-loop-v1/fig-1.svg)

*One cycle from the recorded run. The opening result is the clock transition. The close puts the player back on the same tile, so the next A opens it again.*

## What the switch counts

Clock adjustment and the YES/NO confirmation already count: those results are a ready interface. This switch adds the look after the clock is set. A press whose result is the clock transition or the clock view counts once at that place. The minute is ignored. The third such result raises the cycle warning and the supervisor briefing. The threshold is the guard's existing ineffective count, 3.

![Three openings, warning on the third](clock-view-loop-v1/fig-2.svg)

*Off, all thirteen openings on that run stayed silent. On, the warning is the third opening. Closing the clock, still on the same tile, does not clear the count.*

Setting the clock does not count, including the opening transition before it is set. One look does not count. A result on a different tile starts over, including `navigate_to`. Turning while staying on the tile does not. Off, a result on the clock transition or the clock view does not count. With navigation-truth on, the warning is the existing cycle sentence and does not say a message reopened.

## Status

Default off. On in the bundle arm of `bundle-v-control`, off in the control arm. Pending experiment `clock-view-loop`, not queued and not measured on its own. The cook already running keeps the build it started on; this switch does not change it.
