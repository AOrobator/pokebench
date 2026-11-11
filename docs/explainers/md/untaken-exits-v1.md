Harness switch · observation · `untaken-exits-v1` · needs world-targets-v1 · off by default · bundle-arm candidate (pending experiment)

# Untaken exits

> Markdown twin of [untaken-exits-v1.html](../untaken-exits-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

The readout gains one factual line under the player's position: the exits on this map that the run has not used yet. The system prompt gains one sentence: before leaving a building or area, consider those exits, especially any someone mentioned. Off: the readout and prompt are unchanged.

## Why: cook #2, T113–T116

In run `2026-10-16T02-23-17_qwen36-gpu1_sh02` the model walked into PROF. BIRCH'S HOUSE 1F (T113). The woman there said “Our daughter is upstairs, I think.” (T115). The readout's Warps line listed the stairs at (2,2). The model pressed DOWN on the door mat and left (T116), and spent the next 55 turns between the town and the lab. It reads every bookshelf, so it is curious; it skipped the one exit in the room it had not taken. The readout listed that exit among the others with nothing saying it was new.

## What the model reads

![Exits on the house map, taken and not taken](untaken-exits-v1/fig-1.svg)

*Recorded result seq 2314 (T113), annotated by the replay test. The same line is on every result in the house (T114, T115).*

Every line it produced in the sh02 replay, as the run went (one per change):

```
T46  INSIDE OF TRUCK: Exits here you have not taken: (4,1) or (4,2) or (4,3) -> dynamic destination
T55  LITTLEROOT TOWN: … (14,8) -> PROF. BIRCH'S HOUSE 1F (map 1/2); (5,8) -> GMREEN's HOUSE 1F (map 1/0); (7,16) -> PROF. BIRCH'S POKéMON LAB (map 1/4); NORTH edge -> ROUTE101 (map 0/16)
T57  GMREEN's HOUSE 1F: … (8,2) -> GMREEN's HOUSE 2F (map 1/1)
T60  GMREEN's HOUSE 2F: … none (you have taken every exit on this map this run)
T76  LITTLEROOT TOWN: … (14,8) -> PROF. BIRCH'S HOUSE 1F (map 1/2); (7,16) -> PROF. BIRCH'S POKéMON LAB (map 1/4); NORTH edge -> ROUTE101 (map 0/16)
T102 LITTLEROOT TOWN: … (14,8) -> PROF. BIRCH'S HOUSE 1F (map 1/2); NORTH edge -> ROUTE101 (map 0/16)
T113 PROF. BIRCH'S HOUSE 1F: Exits here you have not taken: (2,2) -> PROF. BIRCH'S HOUSE 2F (map 1/3)
T116 LITTLEROOT TOWN: Exits here you have not taken: NORTH edge -> ROUTE101 (map 0/16)
T122 PROF. BIRCH'S POKéMON LAB: … none (you have taken every exit on this map this run)
```

The system prompt sentence (ON), appended after every other section and before the objectives section:

```
Exits you have not taken: before you leave a building or area, consider the exits there you have not taken yet (the readout lists them), especially any exit someone mentioned.
```

It names no character, place or story step.

## Rules

| Part | Rule |
|---|---|
| Exits | Every warp event on the current map (all of them, not only those in the local map window), grouped by exact destination so a two-tile door is one exit; with `world-destinations-v1` on, every map connection too (the readout only shows connections with that switch). |
| Taken | The same exit history as `briefing-exits-v1`: on each recorded map change, the warp next to the last tile on the old map and the warp back next to the first tile on the new map (with same-destination siblings); a connection is crossed when the change used no warp. A same-map warp (teleporter pad, gym door) counts, with its whole doorway, when the player lands exactly on the warp it leads to; the landing warp counts too only when it leads back. Warps sharing one destination are listed as one exit; a gate whose two tiles name different warp ids is listed as two entries until used. A two-tile gate counts as one doorway even when its tiles name different warp ids. Of two nearby doorways to different places, only the one the arrival matches counts. The wrapper also feeds the result's own state to the history before writing the line, since a live result's state is recorded only after the tool returns. Kept for the whole run, never reset. |
| Names | The names the run's readouts gave to maps (Location lines, named warp and connection destinations); otherwise `map g/n`. Dynamic warps read `dynamic destination`. |
| Placement | Right after the Position line, else after the Location line, in observe, press and navigate_to results. Nothing is clipped. With every exit used: `none (you have taken every exit on this map this run)`; with none listed: `none (no exits are listed on this map)`. |
| Not shown | Outside a started overworld readout, or without interaction targets (world-targets-v1 off). |

## Separate from talk-to-people guidance

`explorer-guidance-v1` (landed 2026-10-16) is a prompt section about talking to people; with both on, this sentence follows it. This switch is about exits, with its own readout line, so the A/B can tell the two apart. `people-ledger-v1` (unmerged) also inserts a block after the Position line; with both on, each wrapper inserts right after Position in turn and neither line is lost.

## Wiring

`playGameTools` (live runs and decision probes) wraps observe, press and navigate_to with `withUntakenExits` when the switch is on; it subscribes once to the recorder for the exit history. `playSystemPrompt` appends the sentence. Off: the same tool objects, no subscriber, the same prompt bytes. The switch is refused in state-only mode, which has its own prompt.

## Status

Tests: `packages/agent/src/untaken-exits.test.ts` (sh02 readouts T113–T134, unit lines, prompt ON/OFF, production wiring, registry). Pending experiment `experiments/untaken-exits.json`, not queued. No measured runs.
