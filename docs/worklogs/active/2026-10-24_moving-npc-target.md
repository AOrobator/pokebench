# Moving NPC semantic target

## Authorized outcome
The operator approved the minimal bounded follow repair, default OFF, ON in bundle arms, tested, reviewed and landed. Do not touch active runs. A loaded object selected by the model may move without changing identity. Reuse supported approach planning and checked native interaction; return on unavailable identity, interruption, unreachable geometry or a shared bounded attempt limit. No route selection, new game facts, static-template behavior changes, or launches.

## Scope and milestone
One implementation milestone: RED regression; GREEN behavior/registry/presets/explainer and future bundle settings; required gates; frozen three-cloud-lane review; landing board; fast-forward merge and protected live-viewer verification. All active run artifacts, leases, processes and frozen run checkouts are excluded.

## Evidence
User reports 190 aborts in 0517 and Briney stalls in three runs. Main semantic-navigation.ts rejects target coordinate drift during travel and facing; sameTargetIdentity also includes coordinates. We verify the code mechanism, not the reported run counts here.
Game source: clean pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881, field_control_avatar.c GetInteractedObjectEventScript selects the current object at the facing position/elevation (including counters). Reuse interactionRecipient rather than trusting a cached tile.

## Invariants and verification
- OFF follows the original code, description and result unchanged.
- ON follows only a loaded object with stable local ID/native slot/elevation/activation on the requested map.
- Fresh planning after every bounded movement action. Check the current native recipient before face/A. Shared attempt bound includes facing and precondition retries.
- Return immediately on battle/dialogue/script/map/UI ownership changes, disappearance or changed identity. Existing trainer sight and script-boundary checks remain effective.
- Production playGameTools wiring exercised; registry/preset/default/bundle declaration and explainer delivery tested.

## Session log
- Created isolated codex/moving-npc-target from ebed5a7f3. Dependencies installed offline. No active runs changed.
- RED: production-wiring regression file: 5 failures / 8 passes, including moved-target travel/facing/A races, budget and absent default registration. Receipt /tmp/moving-npc-red.log.

## Gates and review
Pending. No experiments authorized or launched.
