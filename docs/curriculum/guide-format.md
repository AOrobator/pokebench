# Rayquaza guide format

Frozen 2026-11-05. Every guide file in this folder uses it, so one delivery switch can read them all.

A guide is Markdown with one table per stretch, in play order. Each row is one note:

| After | Map | Note | Source |
|---|---|---|---|
| `MILESTONE_ID` | `MapName` | One short instruction. | KI 7, GR |

- **After:** the milestone id from `packages/agent/src/milestones.ts` that triggers the note. Use `RUN_START` for the first row. Where no milestone exists, write `BAG:<ITEM>` for an item entering the bag, or `MAP:<MapName>` for first entry to a map, and list it under "Needs" at the end of the file.
- **Map:** the map the note is about, as named in the pokeemerald map data and `runs/keepingiticy-video/paths/`. The note repeats on entering this map, and on a stall there, until the next row fires. Use `-` if it has no single map.
- **Note:** 300 characters at most, plain text, one or two sentences, second person, present tense. Say what to do and how. Name the tool only when it matters. Nothing that changes per run (levels, money, exact party), except where the note is about the planned team.
- **Source:** every row cites at least one: `KI <n>` (findings route step) or `KI <section>`, `WT <part>`, `GR` (gold run), `PATH <segment>`, `ROM`, `TR <run>:<turn>` (recorded trace), `the operator`.
- **AT:** a row named `AT:<Map>:<x>:<y>` fires when the player stands on that tile.
- **GOT:** a row named `GOT:<ITEM_NAME>` fires when that item count rises in the Bag. These rows and `MAP:`/`AT:` rows fire only from the step just before them.
- **NEEDS:** add `NEEDS:POTION+REPEL` to Source to record `guide_purchase_missed` for any item missing from the Bag when the step passes. It is never shown to the model.
- **TO:** add `TO:<TownMap>` to Source when the note starts with a trip to that town, with nothing to do on the way. The Teleport note fires only on these rows, until the player reaches the town.
- **CHECK:** append `CHECK` to the note when it is not yet confirmed against ROM data or a recorded game state. A line is cleared only by the fact check.

Rules: facts come from those sources, never from a model's memory. Keep keepingiticy's order, Mudkip, no RNG manipulation. A note should prevent a mistake models really made wherever the traces show one.
