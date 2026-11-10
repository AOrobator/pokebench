# Verify the Waterfall handoff

Status: landed at `5cc85473c`.

Opus run 5a70 reported facing the B2F waterfall at (25,11), while settled GameState at (25,12) showed south. The shared navigation handoff emitted the planned facing after a direction attempt without verifying it. Emerald's GetInteractedWaterScript checks IsPlayerSurfingNorth, which uses the player's ObjectEvent movement direction, independently of visible facing. Source pin 731ad5bfd6e6f265508d0efcca0ba42f9dcf5881.

The new switch adds the native movement direction to the existing running readout while surfing and checks the settled map, coordinates, controls, Surf capability and northward facing/movement before suggesting A. Both current arms and the Opus Rayquaza preset opt in. Omitted switches and old event payloads remain valid. Surf starts keep their original behavior.

Eight checksum-validated raw frames from 5a70 and 12bf were decoded by the production reader. The previous south-facing handoffs and battle interruption withhold A. Only the confirmed northward approach in 12bf suggests A, after which the original run climbed the waterfall. Replay evidence is under `runs/proofs/waterfall-handoff/`. No gameplay inputs or changes to the live run.

Independent review of 52b465e19 found an input-preflight interruption could escape without a state result. The updated handoff honors checked stops and returns fresh GameState if the field changes. Added two tool-path regression tests.

Full lint, pre- and post-main tests, and vendor verification passed. All eight replay outputs matched on main. Claude and GPT approved, with Astra as fallback under the standing Grok outage waiver. Upstream worklog moves left the reviewed patch byte-identical. Evidence is in `runs/proofs/waterfall-handoff-v2/`.
