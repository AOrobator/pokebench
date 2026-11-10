# Surf movement and refusals

**Status:** Landed on main at `3b217ead9`.

- Opus 12bf turn 39 refused all manual RIGHT inputs from (60,6) because the next tile was water. Turn 40 navigated through the same tile. The guarded prefix used the land-only planner options despite native Surf mode. The generic Surf refusal also attributed failed searches to generic mechanics without evidence.
- The correctness switch uses the native avatar flag and existing Surf planner for each guarded input. The game server's existing frame-owned stride stops an ordinary water step at one tile. An interrupted receipt ends the batch. Foot and unknown-mode states keep the conservative behavior. Forced transitions without a verified stride can use the existing destination tools.
- Both current arms and Opus Rayquaza opt in. Old presets omit the switch and retain prior behavior. No runtime changes to the active run.
- Four hash-validated raw snapshots from run 12bf replayed via production GameState. Sequence 1494 authorizes the exact Surf stride to (61,6). Sequence 1486 reports an unverified route to (70,6), and 1713 identifies the solid tile at (72,11). Sequence 1544 independently shows native passage to (63,6). Proof under `runs/proofs/surf-navigation-correctness/`. Native source reference `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881` (`CanStopSurfing` and `DoForcedMovement`).
- Focused tests passed for confirmed Surf, walking, unknown mode, terrain facts, and a guarded stride interrupted by battle. Raw replay is offline and does not resume the model.
- Independent review of 076ba857 caught two cases. Surf bridge steps now also require a verified stride. An interrupted stride counts actual completed movement separately from submitted directions, including zero-tile receipts.
- The correction bit is on in both current arms. Existing Surf navigation and guarded prefix prerequisites retain each arm's existing configuration.

- Follow-up to 3020736c6 uses a typed text assertion for semantic refusal. No runtime change.

- Final regression fixtures exercise the production navigation factory, malformed Surf receipts, zero-tile battle interruptions and the under-bridge guard. The six separate deletion checks each failed the intended test, and 89 focused tests passed after restoration.

## Landing evidence

- Claude and GPT independently approved the frozen patch. The scheduler confirmed the standing Grok waiver. Full lint, pre-merge tests, vendor verification and post-merge tests passed. Logs are in `runs/proofs/surf-navigation-correctness-v4/`.
- All four archived GameState outputs matched byte for byte on the build from main.
