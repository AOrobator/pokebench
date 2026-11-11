# Briefing repeat count

> Markdown twin of [briefing-repeat-count-v1.html](../briefing-repeat-count-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`briefing-repeat-count-v1` · guidance · default off · needs `supervisor-briefing-v2`

When the loop guard sends a supervisor briefing, the focused briefing (`supervisor-briefing-v2`) lists the three most recent attempts. The harness already groups repeats of the same attempt with the same result and counts them; the full briefing prints that count as `×N`, but the focused one dropped it. A model that had made the same call a hundred times read it as if it had made it once.

## Same attempts, two briefings

![The only difference is the ×N after an attempt made more than once. A count of 1 prints nothing, as in the full briefing.](briefing-repeat-count-v1/fig-1.svg)

*The only difference is the `×N` after an attempt made more than once. A count of 1 prints nothing, as in the full briefing.*

## Where the count comes from

![Counting was already there for the full briefing; the switch only changes what the focused briefing prints. Presses inside an open interface (naming editor, menus) carry their count the same way.](briefing-repeat-count-v1/fig-2.svg)

*Counting was already there for the full briefing; the switch only changes what the focused briefing prints. Presses inside an open interface (naming editor, menus) carry their count the same way.*

## Status

Unit tests cover OFF (byte-identical to the recorded f28d line) and ON, for field attempts and interface presses. Bundle-only: it goes into the fixed bundle, not its own A/B. No measured runs yet.
