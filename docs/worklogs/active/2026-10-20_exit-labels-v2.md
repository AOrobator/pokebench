# exit-labels-v2 (M1 of heal-respawn-sight)

Status: in progress. Plan approved by the operator 3:41 PM ET 2026-10-20 (shared design
`2026-10-20_heal-respawn-sight.md`, milestone M1). Branch `claude/exit-labels-v2`, worktree
`~/dev/pokebench-worktrees/exit-labels-v2`.

## Problem

b300 (`2026-10-20T13-54-28_qwen36-gpu0_b300`) turns 581-596: the Warps line, the Warp destination
lines and the interaction candidates print bare `map 24/11` / `map 0/19`, and the model quoted
them. Every PETALBURG WOODS exit leads to ROUTE104, so a name alone cannot tell the north exit
from the south ones.

## Design

- Server switch `exit-labels-v2` (observation, needs named-warp-destinations-v1), default off,
  bundle-only. OFF is byte-for-byte today's readout and state.
- (a) Each destination map is named with its region-map section name, as the location popup
  prints it (`GetMapName(gMapHeader.regionMapSectionId)`, src/map_name_popup.c
  ShowMapNamePopUpWindow; gRegionMapEntries at 0x085A147C on the pinned US ROM), plus the map ID.
  A displayed-place-names-v1 name (houses, the lab) wins. Dynamic and unset warps keep today's
  rules.
- (b) When two or more exits of the current map lead to the same name, each such warp's Warp
  destination line adds the arrival tile and the exits reachable on foot from it on the
  destination map: the server floods the destination map's ROM layout from the arrival warp
  with surf_gate.reachable / classify (exit_reach's rules); connection edges use topology's
  crossing rule against the connected map's ROM layout.
- (c) Audit Littleroot through the Dewford Gym.

## Milestones

- [ ] RED: failing tests (ROM-backed b300 raw-RAM fixtures + synthetic)
- [ ] GREEN: server implementation, agent registry, presets, viewer defaults
- [ ] Audit table (c) in this worklog and the explainer
- [ ] Explainer + FEATURE_EXPLAINERS + pending experiment entry
- [ ] Gates: just test, lint, build, coverage (90)
- [ ] Sync with main, Claude + Grok review (2 rounds max)

## Session Log

## Audit

## Multi-Model Review Log

## Surprises
