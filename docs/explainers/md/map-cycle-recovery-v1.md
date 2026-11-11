# Map-cycle briefings can repeat

> Markdown twin of [map-cycle-recovery-v1.html](../map-cycle-recovery-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`map-cycle-recovery-v1` · existing defaults retained

## What happens

With navigation-recovery-v1 enabled, this switch adds visit counts and exits not matched to departures. Exact warp coordinates distinguish separate doors to the same room. An unmatched departure makes the list uncertain, and the briefing says so. A later unresolved cycle produces another briefing.

![Warning → 12 eligible calls → detailed briefing → fresh map-cycle count → another window](map-cycle-recovery-v1/fig-1.svg)

Warning → 12 eligible calls → detailed briefing → fresh map-cycle count → another window

## Evidence and limits

OFF keeps the simple nonterminal navigation briefing. ON keeps history bounded by the game map/exit tables. Only visited maps receive observed names; missing reachability is unknown. Native story progress resets history.

Doors and warps are coordinates in the observed map state; foot reachability comes from exit_reach. Game reference 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, src/field_control_avatar.c: TryDoorWarp and GetWarpEventAtPosition. No new route knowledge, tools or timeline marks.

## Verification status

Item1 correctness repair. Recorded-fixture and pinned-pi tests establish delivery, not gameplay benefit. Cloud review, landing and served-build proof are recorded separately in the worklog. Current measured runs retain their original source.
