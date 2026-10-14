# The operator’s first-Gym human baseline and strategy

Run: `2026-10-13T23-50-13_human_1848`. Finish applied at seq100261; terminal seq100267, operator_stop with Rock Tomb received. Gym completion/Stone Badge seq100001/100002; Rock Tomb seq100071. This is a completed first-Gym human baseline. No changes were made to original events or gameplay.

## Interview: The operator’s stated decisions

The operator has played Emerald several times and already knew the route, Gym location, Rock matchup and useful Water/Grass moves. Fire starter selection is personal preference; a model may choose any starter. He catches species he does not already own to build a varied team. Marill with Water Gun became the main Gym counter, and Shroomish was trained as Grass backup. Switch training means leading with the weaker Pokémon and switching to a stronger teammate for shared battle experience; it does not imply holding the Exp. Share item.

The first Gym loss was diagnosed as insufficient strength, rather than the wrong Pokémon or ineffective move choice. The training target was parity with or above Roxanne’s Pokémon. He healed at low HP to avoid fainting and money loss, and avoided grass during return trips to avoid interruptions. He favors damaging moves, occasionally uses Stun Spore early, and reports avoiding Growl/Howl. These are reported intentions and prior knowledge, not facts inferred from the recording alone.

## What the recording supports

The audit scans all 66 RAM-observed battle intervals and all 8,087 available battle screenshots. Interval 12 is Wally’s scripted tutorial; interval 37 is the failed Roxanne fight and 66 the successful rematch. Intervals 35–36 are earlier Gym trainer fights. These are observed battle intervals, not a native cumulative battle count.

| Observation | Evidence |
| --- | --- |
| Failed Gym attempt begins with Marill Lv11, Torchic Lv14 and Shroomish Lv5 | state66970 |
| Marill uses Water Gun; Shroomish later uses Absorb against Nosepass Lv15 | executed-move screenshots; Absorb sample70393 |
| Whole-party fainting and whiteout after failure | state70973; whiteout screenshot70971 |
| 28 battle intervals between failure and rematch; 14 begin with Marill first, 14 with Shroomish first | intervals 38–65, leading party snapshots |
| Switch training is visible for both Marill and Shroomish | recall screenshots47936 and72299 |
| Final pre-Gym Center restoration takes Marill from 4/49 HP to 49/49 | state97070 versus preceding sample |
| Rematch begins with Marill Lv15/fullHP; Shroomish Lv9 is backup | state97519 |
| Observed executed player moves in final Gym are Marill’s Water Gun, against Geodude and Nosepass | screenshots97723 and99428 |
| Rematch ends with Marill Lv16/15 HP; other teammates’ HP unchanged | state99866; victory screenshot99862 |
| Damaging moves observed: Scratch, Ember, Tackle, Water Gun, Absorb; status move observed: Stun Spore | screenshot OCR plus visual verification of each move type |
| Stun Spore observed in battle intervals 46, 47, 49, 51; first recognized player execution in 46 | e.g. screenshot76820 |

No executed player Growl/Howl text was found. At 2 Hz, screenshot gaps and partially printed messages prevent proving absence or calculating exact move frequencies. Enemy moves and move-menu choices were not credited as player execution. Repeated displayed text is not a new attack. Only Marill’s attacks were observed in the final Gym; unchanged teammate HP supports the report that it fought alone, but is not by itself proof that no switch occurred.

The old reader does not record battle-menu selection, native capture/heal counters, or stable party identity. Its party samples also contain some transient invalid species labels and Wally’s tutorial party. Those were not treated as captures. Center HP restorations are observable state transitions, not retrospectively fabricated new native heal events. New milestone/activity wiring applies to subsequent recordings.

## Candidate model policy, not an evaluated improvement

1. Keep a persistent objective: select a counter with a useful damaging move and train that counter to the observed boss level. Keep a backup when useful.
2. Separate training from travel: seek encounters while training; prefer encounter-free paths while traveling to healing or the Gym.
3. Use switch training when the chosen counter cannot safely win alone. Preserve the intended training recipient across turns.
4. Heal when continued fighting threatens the trained counter; enter the boss fight healthy. The operator supplied a qualitative low-HP rule, not a fixed percentage.
5. Prefer effective damaging moves; allow situational paralysis. Do not turn personal avoidance of stat moves into a universal game rule.
6. After losing, diagnose the cause before changing the team. Here, retain the effective counter and increase readiness.

Supply route/boss/type knowledge separately from strategy if testing its value. This human baseline includes substantial prior game knowledge. Broader collection is the operator’s preference; a first-Gym speed objective needs only useful team coverage. Any model policy change should be measured against the incumbent; this audit does not establish a performance benefit and changes no model behavior.

Durable receipts: `runs/human/2026-10-13T23-50-13_human_1848/strategy-audit/` contains the original-log hash, all battle intervals, screenshot coverage, raw OCR, candidate move episodes and summary. Original screenshots remain in the run’s frames directory.
