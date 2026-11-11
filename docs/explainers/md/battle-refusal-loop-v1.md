Default OFF · candidate · no measured benefit established

# Stop repeating a refused battle action

> Markdown twin of [battle-refusal-loop-v1.html](../battle-refusal-loop-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

`battle-refusal-loop-v1` covers normal tool results that explicitly say no buttons were pressed. It uses the existing rejection episode and existing loop-guard events.

## The failure

A recorded round-2 visited-map episode repeated 322 FIGHT calls while a message needed A or B. Each call refused correctly, pressed nothing and returned a normal result. Error-only rejection detection missed the repetition.

## What changes

First no-button refusal: retain its result sequence and qualified battle or field state.

↓ Same refusal reason and same native state

Second refusal: record the existing rejection warning with both result sequences (97a0: 28155 and 28167).

↓ Deliver warning before the next decision

The model chooses the next input. The guard presses nothing.

A second recorded failure, run 97a0 turns 637–692, made 56 battle_action calls while a field message waited for A or B. The existing guard missed them because no battle was active. The repaired rule also accepts an explicit “no battle is in progress” refusal on a qualified, unchanged field state. Requested move changes do not reset that refusal reason. Only battle_action results containing the tool-owned “Battle action: nothing pressed:” status line qualify, and only when the recorded call contains no button press and the paired native battle or field state qualifies: either an initialized, readable battle, or—for the explicit no-battle refusal—a readable field state. A locked field qualifies only when its message is ready for input. Two refusals must agree on the native state: the battle including its turn, controls, message and Pokémon state, or the field including its map, position, facing, party, story and message. Changing observation text below that status does not create a new reason. Different refusal reasons do not combine.

The existing warning appears after two matching refusals. The existing recovery window, supervisor, diagnostic mode and bounded stop policy remain in charge. Both supporting result sequences are included. A qualified change in native state recovers this refusal episode; an unknown or unavailable readout cannot establish repetition or recovery.

## OFF and ON

**OFF:** normal tool results remain outside rejection detection; tool descriptions keep their previous bytes.

**ON:** repeated no-button refusals enter rejection detection. The tool description states that refusing does not auto-advance text: use press with A or B when a message is waiting for those inputs; wait and observe while the game owns text or animation.

No automatic recovery button is added. A call that already pressed, another tool, an infrastructure error or an ordinary successful call is not classified as a semantic refusal.

## Grounding and proof

Message waits are reported by the existing native battle text reader. The game-source reference is pret/pokeemerald 731ad5bf: battle message wait handling and battle_controller_wally.c. The separate tutorial-party-owner-v1 correctness repair handles Wally’s borrowed ZIGZAGOON and exposes tutorial ownership.

Tests cover OFF parity, production loop attachment, schema-valid events, negative controls and the existing lifecycle. Pending experiments are unapproved. Runtime speed and benchmark recovery require separate evidence.
