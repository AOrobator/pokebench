# His paths vs our agents' paths (summary)

Full outputs are on the Mac: `~/dev/pokebench/runs/keepingiticy-video/path-compare.csv` (177 traversals) and `path-compare.md`. 791 recorded runs were scanned, read-only.

## Result
- Of 177 comparable traversals in his run, 87 also appear in our runs; our agents never made the other 90 that way.
- Across the 87 shared traversals:

| Shape | Count |
|---|---|
| Near his path | 66 |
| Slow | 10 |
| Long detour | 9 |
| Back-and-forth | 2 |

- Biggest excess, by a wide margin: **Rusturf → Route 116 → Rustboro**. He takes 57 steps; our median is 102 across 41 visits, with back-and-forth movement.
- Next:
  - Fiery Path → Route 112 → Route 111: 19 vs 33 steps, 7 visits.
  - Wattson's gym: 36 vs 46 steps, 9 visits.
- Where tile counts are close, the waste shows up as turns per tile instead:
  - Route 101: 49 turns for 13 tiles.
  - Birch's lab: 59 turns for 8 tiles.

So the bigger problem is turns spent per step, more than wrong routes.

## How far to trust it
- Our tile counts are summed between sparse state events, so they undercount wandering. Treat excess as a lower bound and "near his path" as weaker than it sounds; a few best values of 0–1 are artifacts of this.
- Only 11,772 map visits came out of 791 runs, which looks low. The event parser matches one field order and was not audited, so older or newer event formats may be missing.
- "Runs ended here" doesn't separate failures from planned cohort ends. For example, Route 116's 75 of 164 may be target-based ends, not stalls.
