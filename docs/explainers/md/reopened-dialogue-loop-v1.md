reopened-dialogue-loop-v1 · guard · bundle arm only · default off

# Reopened dialogue loop

> Markdown twin of [reopened-dialogue-loop-v1.html](../reopened-dialogue-loop-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

A press can show a sign and close it before the result comes back. The loop guard only counted a message that was still open on the result, so the same sign, opened again and again, never added up.

## What the run did

On `2026-10-18T01-30-48_qwen36-gpu0_e6ce` (the bundle arm), turns 52 through 109, the player stood at (2,2) inside the truck, facing a box, and pressed A. Each A printed “The box is printed with a POKéMON logo.” and then “It's a POKéMON brand moving and delivery service.” Dialogue auto-advance pressed B and closed the sign. The result was the free field, with no message. No `loop_guard` cycle event fired. A stall note fired later, at five minutes, for a different reason.

![A opens the sign, auto-advance closes it, the result has no message](reopened-dialogue-loop-v1/fig-1.svg)

*One reopen from the recorded run. The lines exist during the call. The result the guard used to read has already closed them.*

## What the switch counts

The lines shown during the call count when the result is the free field at the same place and the message is already gone. A locked menu, a ready interface, or a missing world context is not that free field. A message identity with no readable lines does not count. Native story progress clears the count. The same lines still open do not. The first showing is count 0. The fourth showing of the same lines raises the cycle warning and the supervisor briefing. The threshold is the guard's existing ineffective count, 3, reached on that fourth showing.

![Four showings, warning on the fourth](reopened-dialogue-loop-v1/fig-2.svg)

*Off, the truck box stayed silent. On, the warning is the fourth showing of those same lines at that tile.*

One showing does not count. A different line starts over. The same lines after leaving that tile start over. A result that still shows the message is the older counter, not this one. Off, a call whose result has no dialogue does not count as reopening it.

## Status

Default off. On in the bundle arm of `bundle-v-control`, off in the control arm. Pending experiment `reopened-dialogue-loop`, not queued and not measured on its own. The cook already running keeps the build it started on; this switch does not change it.
