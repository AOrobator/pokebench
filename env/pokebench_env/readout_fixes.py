"""Readout fixes from the 2026-10-17 top-50 run analysis (ram-audit.md items 1, 3 and 6).

- tutorial-party-owner-v1: Norman's Wally scene decodes the Zigzagoon LoadWallyZigzagoon builds
  (its empty move slots keep PP), and a party whose owner cannot be established leaves
  party_owner out of the state JSON instead of sending "unknown", which the agent's schema rejects.
- mid-frame-readout-v1: a snapshot taken while the main loop was not idle (transition-coherence-v1
  skips its save reads) says so instead of calling the save uninitialized.
- unset-dynamic-warp-v1: an all-zero SaveBlock1.dynamicWarp is unset, not PETALBURG CITY (map 0/0).
"""

OWNER = "tutorial-party-owner-v1"
MID_FRAME = "mid-frame-readout-v1"
UNSET_WARP = "unset-dynamic-warp-v1"

MID_FRAME_TEXT = (
    "Save-backed world state (player, location, party) not read in this snapshot: the game was"
    " in the middle of a frame. Observe again to read it."
)
