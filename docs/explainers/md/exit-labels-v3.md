POKÉBENCH • EXIT-LABELS-V3 • VERSIONED OBSERVATION TREATMENT

# Same map. Different section.

> Markdown twin of [exit-labels-v3.html](../exit-labels-v3.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Every physical exit keeps a distinct identity. A return to the same map says whether it reaches your current terrain section or another one.

![Woods connect two distinct sections of Route 104](exit-labels-v3/fig-1.svg)

The diagram illustrates the verified Route104/Woods terrain connections. It is explanatory; no route is chosen or executed for the gameplay model.

## V3 off: existing v2

```
Warp to PETALBURG WOODS (map 24/11)
… returns to this map at (10,30)
… returns to this map at (10,38)
```

The model must infer which return changes its reachable area.

## V3 on: distinct identity

```
Destination name + map ID
+ geographic terrain section
+ stable coordinate anchor

Return: same terrain section as you
Return: different terrain section from you
```

The map legend, prominent exits, untaken exits and supervisor reuse the same recorded labels.

## What defines a section?

A section groups tiles with terrain paths in both directions. A one-way ledge links different sections in only its permitted direction. Water and collision block walking; directional edge walls and elevation are respected. Automatic warp tiles end a terrain walk rather than silently connecting rooms.

Section names are geographic annotations derived from the layout, not new game location names. Their coordinate anchors preserve identity as the player moves. Separate physical entrances retain their own coordinates even when their destination name is the same.

## What the labels can establish

Sections describe the ROM terrain layout. With field-move-gates-v1 enabled, section paths reuse its closed obstacle and forced-step rules. Other temporary people, changed metatiles and scripts may still block the described paths. Dynamic, ambiguous and unreadable landings remain unknown. These observations do not promise uninterrupted travel, name a hidden objective or tell the model what to choose next.

## Recorded example and grounding

Regression observations: b300 state18814 (Woods) and18834 (Route104), complete archived RAM plus matching US Emerald ROM. Investigation:97a0 state13625/result13626, turn377. Game source: pret/pokeemerald731ad5bf, MapHeader/MapLayout/WarpEvent, GetCollisionAtCoords and MB_JUMP\_\*; existing topology.crossable handles directional edges and elevation.

## Switch and comparison

`exit-labels-v3` needs `exit-labels-v2`. New presets default it OFF. The authorized future bundle enables it; control stays OFF. V3 OFF preserves v2 state and readout bytes, checked against hashes frozen before implementation. V3 ON replaces destination detail text and adds typed `exit_sections`; it does not add a gameplay tool.

## Verification status

Implementation candidate: a working branch. Checks, review, landing and viewer verification are recorded in the active worklog. No measured run or performance improvement is claimed by this explainer.
