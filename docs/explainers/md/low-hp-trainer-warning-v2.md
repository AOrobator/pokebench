Harness switch · guard · `low-hp-trainer-warning-v2` · needs `low-hp-trainer-warning-v1` · off by default

# Story battle heal warning

> Markdown twin of [low-hp-trainer-warning-v2.html](../low-hp-trainer-warning-v2.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

v2 of the low-HP trainer warning. v1 only warned on Route 103, for the rival, below half HP. v2 warns before every story battle the game state can see, whenever any party Pokémon is below its max HP, and lists each one. Operator, 2:43 PM: heal before story trainer battles at any HP below max; general game guidance, not route specific.

## v1 and v2 side by side

![v1 versus v2 conditions](low-hp-trainer-warning-v2/fig-1.svg)

*v2 needs v1 and widens it. Both keep the free-field rule: field controls unlocked, so a won battle's dialogue (which runs locked until the defeat flag is set) never triggers it.*

## Story battles it can see (pret/pokeemerald)

| Battle | Map | Unbeaten when | Present when | Starts by |
|---|---|---|---|---|
| Rival MAY / BRENDAN | ROUTE 103 (0/18) | `FLAG_DEFEATED_RIVAL_ROUTE103` clear | rival object loaded (gfx 105 / 100) | talking: `trainerbattle_no_intro` |
| Gym Leader ROXANNE | RUSTBORO CITY GYM (11/3) | trainer flag 0x609 clear | her object loaded (gfx 125) | talking: `trainerbattle_single TRAINER_ROXANNE_1` |
| TEAM AQUA grunt | PETALBURG WOODS (24/11) | trainer flag 0x50A clear | on the map (his object, gfx 117 at 26,17, is loaded but has no talk script; the battle starts only from the coord events at 26,23 and 27,23) | walking into the Devon researcher scene (coord events, `trainerbattle_no_intro`) |

Ordinary route trainers are not story battles and are left out. Story battles after the first gym need their flags read before they can be added.

## What the model reads

Run 54a7, turn 363 (exact text from the test on the recorded state):

```
SUPERVISOR: A story battle is on this map: your rival MAY, at (10,3). Talking to her starts a trainer battle you cannot run from. Your party is not at full HP: TORCHIC 3/21. If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home. Heal to full before this battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.
```

Petalburg Woods, with the grunt unbeaten:

```
SUPERVISOR: A story battle is on this map: a TEAM AQUA grunt. He stops you on the forest path when you reach the DEVON researcher, and that trainer battle cannot be run from. Your party is not at full HP: TORCHIC 3/21. If your party faints, you black out: you lose half your money (₽1500 of ₽3000) and wake up back at the last POKéMON CENTER you entered, or at home. Heal to full before this battle: the nurse at a POKéMON CENTER heals your whole party, and so does MOM at home.
```

Every party Pokémon below max is listed (`WURMPLE 0/15, ZIGZAGOON 7/18`), fainted ones too; healing items in the bag are named when a hurt Pokémon can use them: HP medicine and berries when one is still standing, revival medicine (REVIVE, MAX REVIVE, REVIVAL HERB) when one has fainted (`Your BAG has REVIVE ×1 and POTION ×2; using one restores HP.`). If any party Pokémon cannot be read, it stays silent rather than give a partial list.

## When it fires again

![Arm keyed by battle](low-hp-trainer-warning-v2/fig-2.svg)

*A different story battle fires on its own. Battles and unreadable states change nothing.*

## Where you see it

- The model: appended to the tool result (observe, press or navigate_to), after any other text.
- Activity History: a SUPERVISOR row "Story battle warning added to the … result · opponent · hurt party · paragraph", from the `story_battle_warning` event.
- The timeline: nothing (closed to new marks; a test checks it).

## Status

- Tests cover each battle, every negative case, v2 off = v1 exactly, the arm, the event schema, the tail line, Activity History, and delivery through the pinned pi loop.
- Not yet measured. Meant for the bundle arm (operator, 2:43 PM).
