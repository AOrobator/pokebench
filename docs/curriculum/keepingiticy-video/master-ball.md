# Master Ball: where it is and how far keepingiticy's route passes from it

Source: The operator's private notes copy of the peach_freak v1.30 walkthrough, part 09 ("Team Magma and Team Aqua hideouts").

## Correction: it is in the Aqua Hideout, not the Magma Hideout

Part 09 covers both hideouts. The Master Ball is in the **Team Aqua Hideout** (the Lilycove cave entrance), in the warp-panel maze. The Magma Hideout section lists no Master Ball. Across the whole walkthrough, "Master Ball" appears only in part 09 (the Aqua section), the items appendix and the post-game chapter.

## Exact location (walkthrough, quoted)

> "go all the way left to the bottom left corner of this room and you'll find another warp panel"

> "Take the left panel and you'll be taken to a room with 4 item balls … They are a Nugget and *GASP* a Master Ball!"

The warp chain, paraphrased from the same passage:

1. Start in the room where you fight the three Aqua grunts: one single trainer plus a pair you can take as a double. Go to the warp panel in the **bottom-left corner** of that room. Do not take the panel next to the double-battle pair.
2. You arrive in a room with three warp panels. Take the **right** one.
3. You arrive on a ledge with three panels, standing on the left one. Take the **middle** one.
4. You arrive in another three-panel room, standing on the middle panel. Take the **left** one.
5. You arrive in another three-panel room where you can walk around the panels. Take the **left** one.
6. That leads to the item room with 4 item balls. **The two on the left half are real: a Nugget and the Master Ball.** The two on the right half are fake; they are Lv30 Electrodes.

The way back is in the walkthrough too: step back through the panel, then take right → middle → left, which returns you to the first three-panel room. Then take the **top** panel, above the middle one. That drops you in the grunt room at the far end, where the double-battle pair stood.

Prerequisites:
- Surf, to enter the hideout and cross the first room.
- The submarine theft must have happened; before it, the Lilycove entrance is blocked. In this run the theft is at v1:35:55.
- Nothing else: no key and no switch. Only the double-battle pair's panel is blocked until those grunts are beaten.
- It is the only Master Ball in the game.

## Where keepingiticy's route passes closest

| Video | Room (from 720p frames) |
|---|---|
| 1:36:30 | Surfs into the entrance (AQUA HIDEOUT popup 1:36:30.8) |
| 1:36:38 | Room with two warp panels. He takes the **left** panel. |
| 1:36:41 | **The three-grunt room**: a corridor above a pool, then a lab area with grunts |
| 1:37:01–1:37:56 | Double battle against the grunt pair, won with one Surf |
| 1:37:56–1:38:20 | Takes the panel next to the double-battle grunts and continues through panel rooms toward the submarine |
| 1:38:35 | Second double battle |
| 1:39:06–1:39:50 | Aqua Admin Matt |
| 1:39:55–1:40:15 | Lower panel back to the first two-panel room. **Right** panel to the Max Elixir room ("found one MAX ELIXIR" at v1:40:10), then out. |

**Closest point:** the three-grunt room, v1:36:41–1:37:56. The Master Ball chain starts at that room's bottom-left panel. He fights the pair in the middle and leaves by their panel without going to the corner.

## Detour estimate

- **Warps:** 5 out (bottom-left → right → middle → left → left) and 5 back (back → right → middle → left → top). That is 10 panel uses and 4 intermediate rooms each visited twice.
- **Steps:** about 10–14 tiles to the bottom-left panel (judged from the 720p frames, not measured), roughly 10–20 inside the panel rooms, and 4–6 in the item room. Total about 25–40 steps, plus 10 warp animations and 2 item text boxes. The return drops you by the double-battle pair's panel, which is where his route goes next anyway.
- **Time:** about 35–45 s.
- **Risk:** don't touch the two right-hand balls (Electrode Lv30, which can Self-Destruct).

## Why it matters

His one-ball Rayquaza catch only works with RNG manipulation and a save; a full-HP Poké Ball succeeds about 0.4% of the time (see [rng-explained.md](rng-explained.md)). For our lane, the Master Ball detour is the non-RNG way to get Rayquaza: a fixed 10-warp sequence a model can follow from a waypoint list, for about 40 s.

## Every other item the walkthrough lists in the two hideouts

### Magma Hideout

| Item | Where (walkthrough) | keepingiticy |
|---|---|---|
| Full Restore | Optional room off the 2nd room: north up the steps past the forced double grunt pair | Skipped |
| Max Elixir | Same optional room: east, up the steps past two grunts | Skipped |
| Rare Candy | Through the last entrance up the steps in that optional area, past one Zubat grunt | Skipped |
| PP Max | Optional room at the bottom-right of the next room, past one Mightyena grunt | Skipped |
| Nugget | North of the entrance to the last trainer room | Not seen picked up |
| Max Revive | Last room, left of Tabitha's corner on the way to Maxie | Not seen picked up |
| Escape Rope | Room right of Maxie's spot | Not picked up; he uses a bought one at v1:35:08 |

### Aqua Hideout

| Item | Where (walkthrough) | keepingiticy |
|---|---|---|
| Max Elixir | First two-panel room → right panel → a room with only the item | **Taken**, v1:40:10 |
| Nugget | Master Ball room (left half) | Skipped |
| **Master Ball** | Master Ball room (left half) | **Skipped** |
| 2 fake items (Electrode Lv30) | Master Ball room (right half) | Avoided |
| Nest Ball | Room past the lone Carvanha grunt → the panel next to that grunt | Skipped |

Neither hideout has hidden (Itemfinder) items in part 09 or the items appendix.

## Tile-exact chain (computed from pokeemerald map data, 2026-11-04)
Computed from the decomp's tiles, warps and objects. The tile data puts the Master Ball at AquaHideout_B1F (15,9). He never takes this detour. It branches off his route at B1F (21,17), v5807.9, and takes 49 steps to (15,11), then one more step and two pickups:
1. D3 L18 onto panel (3,20); arrive (45,3).
2. D L D L2 onto panel (42,5); arrive (48,9).
3. L3 onto panel (45,9); arrive (45,13).
4. L3 onto panel (42,13); arrive (48,17).
5. D L4 U L2 onto panel (42,17); arrive (23,10).
6. D L8 to (15,11). Face up and take the Nugget at (15,10), step up, then take the Master Ball at (15,9).

The ball's other open side is an Electrode trap at (16,9). Step 2 differs from the walkthrough, which takes the right panel (48,5) and lands at (42,9); both reach (45,9) according to the warp data. Trainers and story blocks are not modelled, so check grunt line-of-sight on a real run.
