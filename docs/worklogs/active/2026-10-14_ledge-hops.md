# Ledge hops (2026-10-14)

Bug: ledge tiles (behaviors 0x38–0x3B, MB_JUMP_EAST/WEST/NORTH/SOUTH) carry collision, so the
live map drew them as `#` and `navigate_to` treated them as walls. Route 101 has 12 south
ledges. Source: `runs/explainers/navigation-followups.md` §4 in the main checkout.

## Game-source grounding

pret/pokeemerald 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881:

- `include/constants/metatile_behaviors.h`: MB_JUMP_EAST 0x38, WEST 0x39, NORTH 0x3A, SOUTH 0x3B.
- `src/field_player_avatar.c` `CheckForObjectEventCollision`: `ShouldJumpLedge` runs whatever the
  collision bit says; `GetLedgeJumpDirection` (`src/event_object_movement.c`) matches the
  behavior of the tile being moved into against the move direction. `PlayerJumpLedge` moves
  the player two tiles with one press.

## Change (one switch: `ledge-hops-v1`, guidance, needs `live-map-v1`)

- [x] Map text draws ledges as `v ^ < >` with a legend line: one-way hop in the arrow's
      direction, landing 2 tiles on, impassable from other sides. Off: `#` and no legend.
- [x] `planNavigation` hops a ledge only in its direction, one press, landing on a known,
      clear, unoccupied, non-warp, non-door tile at a compatible elevation. Off: walls.
- [x] `navigate_to` expects a 2-tile move after a hop press; anything else stops as
      unexpected movement. Tool description and system prompt say it hops ledges.
- [x] Recorded as a switchable server feature. Absent from older v2 presets and v1 flag presets
      means OFF, so frozen incumbents keep ledges as walls. Viewer drafts (ALL_ON) get it ON.

## Evidence

- Live, real ROM, vendored `tests/states/torchic.state` (Route 101, (9,15)), run dir
  `runs/ledge-proof/torchic` (gitignored): the model text shows `v v v v` at y=13; the real
  `navigate_to` (dist build, ledges on) walked to (9,12) in 7 presses, then (9,14) in
  1 press: "arrived at requested coordinate; 1 ordinary button attempts".

## Gates

- RED: `test: ledges render as one-way hops and navigate_to hops them` (bdec460). Fails on the
  ledge cases (Python 4, TS navigation 3, features/preset/config, viewer switch count).
- GREEN: `fix: render ledges as one-way hops and let navigate_to hop them` (f22d0f4).
- Review round 1: Claude CLI LGTM, Cursor Grok 4.5 LGTM, GPT lane BLOCKING (Cursor GPT hit its
  usage limit; Codex `gpt-5.6-sol` ran instead). Blocker: `just lint` mypy failed in this
  worktree because its venv lacked the native mGBA binding. Fixed by copying the built `mgba`
  package from the main checkout's venv; `just lint` now exits 0. Accepted hardening (raised by
  Claude and Codex): with the switch off, a ledge keeps its own collision glyph (`#` or `.`).
- Round-1 fix: `fix: keep a ledge's own collision glyph with ledge hops off`. Gates: agent
  870/870, viewer 417/417, env 1807/1807; `just coverage` 90% floor passes; `just lint` exit 0.
- Review round 2 (all three lanes BLOCKING): the review packet was built with `git diff main..HEAD`
  after main advanced to 8258ff9, so it showed main's newer work as deletions. Also the live
  receipt was a trimmed excerpt with no head/dist binding. Grok: feature OFF copy said only `#`.
- Round-2 fix: merged main 55e5a25 into the branch (conflicts in play-preset/play-config/
  features tests resolved by keeping navigation-evidence-memory-v1 and adding ledge-hops-v1;
  guidance count 10, viewer switch count 30); OFF copy now says ledges keep their collision
  glyph. Packet is now `git diff $(git merge-base main HEAD) HEAD`; live proof re-run from a
  clean build of the merge head with dist hashes and full stdout. Tests: agent 896/896,
  viewer 419/419, env 1807/1807.
