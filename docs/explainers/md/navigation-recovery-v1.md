# Navigation recovery keeps playing

> Markdown twin of [navigation-recovery-v1.html](../navigation-recovery-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`navigation-recovery-v1` · existing defaults retained

## What happens

Two stale-map requests or an observed map cycle open a warning. After delivery, 12 calls outside battle and menus produce a factual briefing. Every later episode can brief again. The guard sends no game input and selects no destination.

![Switch OFF → previous navigation feedback; switch ON → warning → 12 eligible calls → briefing → next decision](navigation-recovery-v1/fig-1.svg)

Switch OFF → previous navigation feedback; switch ON → warning → 12 eligible calls → briefing → next decision

## Evidence and limits

The ba89 recording ended at #8178 (turn275), state#8176: map1/4 position6,12. Its foot warps6,12 and7,12 were omitted from the old “none qualified” text. The new bearings include both. Other verified historical stops: f0c2#3122, 6bc3#3102, 597a#4656, 7c9f#3415, 1772#18841. Historical logs remain unchanged.

Doors and warps are coordinates in the observed map state; foot reachability comes from exit_reach. Game reference 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, src/field_control_avatar.c: TryDoorWarp and GetWarpEventAtPosition. No new route knowledge, tools or timeline marks.

## Verification status

Item1 correctness repair. Recorded-fixture and pinned-pi tests establish delivery, not gameplay benefit. Cloud review, landing and served-build proof are recorded separately in the worklog. Current measured runs retain their original source.
