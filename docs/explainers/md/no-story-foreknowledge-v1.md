# No story foreknowledge

> Markdown twin of [no-story-foreknowledge-v1.html](../no-story-foreknowledge-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`no-story-foreknowledge-v1` · observation · default OFF, ON in both arms of the current recipe · narrow scope approved by the operator on 2026-10-27.

## Why

Run `2026-10-21T13-33-36_qwen36-gpu1_d548`, seq 10001 (turn 306), was told in PETALBURG WOODS, before anything had happened there:

`A story battle is on this map: a TEAM AQUA grunt. He stops you on the forest path when you reach the DEVON researcher`

when no delivered page had shown TEAM AQUA or DEVON. The same result said `Not on this map: PROF. BIRCH, MAY, BRENDAN, MOM, NORMAN, WALLY, ROXANNE, STEVEN.` By then the game had shown MOM (turn 56), PROF. BIRCH (66), MAY (81), WALLY (255) and ROXANNE (257), but never BRENDAN, NORMAN or STEVEN. With the switch on, that result would have dropped TEAM AQUA, DEVON, BRENDAN, NORMAN and STEVEN, and kept everything else.

With the switch on, the harness names a story character only after the game has shown that name in this run. The advice stays: the Story characters line, the rival sentence in the system prompt, and every low-HP and heal warning.

## When a name counts as shown

![The same rule the ID cards already use to say "the game first showed this name on turn N". "TEAM AQUA" inside a page counts; "DEVONSHIRE" does not count as DEVON.](no-story-foreknowledge-v1/fig-1.svg)

*The same rule the ID cards already use to say "the game first showed this name on turn N". "TEAM AQUA" inside a page counts; "DEVONSHIRE" does not count as DEVON.*

## Before and after, site by site

| Site | OFF (today, byte for byte) | ON, name not shown yet |
|---|---|---|
| Story characters line<br> (readout and people-ledger copy) | Story characters here (from this map's own object list): MAY at 10,3. Not on this map: PROF. BIRCH, BRENDAN, MOM. Sprite kinds such as … | Story characters here (from this map's own object list): MAY at 10,3. Not on this map: MOM. Sprite kinds such as …<br> (MOM shown; with nothing shown: `none named in dialogue yet`) |
| Story battle warning (v2) | A story battle is on this map: a TEAM AQUA grunt. He stops you on the forest path when you reach the DEVON researcher, and that trainer battle cannot be run from. Your party is not at full HP … | A story battle is on this map: a grunt. He stops you on the forest path when you reach the researcher, and that trainer battle cannot be run from. Your party is not at full HP … |
| Route 103 rival warning (v1) | … and your rival MAY is on this map at (10,3). Talking to her starts a trainer battle you cannot run from. … | … and your rival is on this map at (10,3). Talking to her starts a trainer battle you cannot run from. … |
| Heal before trainers v2 | the Gym Leader ROXANNE, object 1, sprite ROXANNE, at (5,2) | the Gym Leader, object 1, sprite ROXANNE, at (5,2) |
| Heal-first line | TORCHIC has 28/31 HP. The TEAM AQUA grunt's battle cannot be run from, so heal before he stops you on the forest path. | TORCHIC has 28/31 HP. The grunt's battle cannot be run from, so heal before he stops you on the forest path. |
| Coherent healing feedback | MAY's trainer battle cannot be run from. | Your rival's trainer battle cannot be run from. |
| Trainer heal guidance (system prompt) | … Your rival usually battles you when you talk to them. … | Unchanged, rival sentence included. |

HP, the blackout cost, heal places, BAG items and "cannot be run from" stay in every warning. Once the game shows a name, the ON text is the OFF text again (tested for every warning).

## Why the stall gate keeps its rosters this time

![The earlier attempt rewrote the whole line into sprite kinds, so every reader of the recorded result lost its roster (review finding B1). This one keeps the "here" list word for word and keeps the ". Not on this map: " separator, so those readers parse the same roster with the switch on (tested through the story-character stall gate). disproved-beliefs-v1, the one reader of the absent list, rebuilds it from the cast table less the characters here, as the game server does.](no-story-foreknowledge-v1/fig-2.svg)

*The earlier attempt rewrote the whole line into sprite kinds, so every reader of the recorded result lost its roster (review finding B1). This one keeps the "here" list word for word and keeps the ". Not on this map: " separator, so those readers parse the same roster with the switch on (tested through the story-character stall gate). disproved-beliefs-v1, the one reader of the absent list, rebuilds it from the cast table less the characters here, as the game server does.*

## Not covered, on purpose

- A present character is still named in the "here" list (for example MAY in her room before you meet her): the line exists to say who is on the map.
- Sprite kinds such as `sprite ROXANNE` stay; they are graphics names.
- Only dialogue and battle pages count as showing a name. A name seen only on a sign (`LEADER: NORMAN`) stays hidden; NORMAN, whom the game calls DAD, stays hidden all run. A run that starts from a save starts with no names shown.
- The warnings still state story facts, such as the ambush on the forest path, with the name taken out.
- `story-battle-heal-gate-v1`'s refusal text (OFF in both arms), the DAD to NORMAN alias and battle_details labels.

## Status

Landed on main at `f6efe433b`. Default OFF in the registry; ON in both arms (control and bundle) of `experiments/feature-configs/current.json` by the operator's decision on 2026-10-27, so it is not an A/B variable; it is measured with decision probes. OFF is byte for byte the earlier text (golden tests). Tests: `packages/agent/src/no-story-foreknowledge.test.ts`. Measured so far: one exploratory decision probe (study `no-story-foreknowledge-20261027`, 8 recorded contexts × 3 arms × 16 samples, scored after sampling, so descriptive). With the switch on, unshown names left the model's reasoning (TEAM AQUA in Petalburg Woods 12/16 → 0/16) and it still reasoned about healing, but it turned back to heal less often there (5/16 → 1/16); with the advice removed it never did (0/16). No gameplay comparison: the switch is on in both arms.
