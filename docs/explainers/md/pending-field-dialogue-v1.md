PENDING FIELD DIALOGUE · DEFAULT OFF

# Finish the message. Then make a new choice.

> Markdown twin of [pending-field-dialogue-v1.html](../pending-field-dialogue-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

An ordinary dialogue box can appear just after navigation returns. This treatment lets `observe` finish that dialogue automatically. If the agent asks for a battle action while the field message is open, the harness finishes the message and returns the new state for a fresh decision.

## OFF: the observed stall

Navigation stops as a trainer script takes control.

↓ message appears between calls

Observe shows an ordinary message waiting for A or B.

↓ agent asks for a battle move

“No battle is in progress.” Nothing is pressed. The message stays open.

## ON: the handoff

Observe or battle action finds an owned field message.

↓ automatic B; every page retained

Advance to free field, a battle choice, menu, naming screen, screen change or an existing bound.

↓ return the new screen and state

The model chooses again. A queued battle action is left unexecuted.

## Evidence from the running bundle

Run `2026-10-20T20-26-22_qwen36-gpu1_97a0`, clean source `ee11d5b8`: navigation at turn 635 returned during a trainer script. Observe at turn 636, result 28143, showed this message:

> “If you can't beat me, you won't stand a chance against ROXANNE!”

Raw RAM archive 10940, native frame 433805, confirms `dismiss_wait`, ready input, field controls locked and no active battle. From turn 637 the agent repeatedly called a battle move. This is an ineffective-call loop; it is not an absence of tool calls.

## Boundaries stay visible

- Only an owned ordinary field message starts this handoff. Unknown locks, open menus and naming screens are left alone.
- Existing limits remain: 50 automatic presses per call, 90 seconds per call, and 10 seconds waiting for a message or interface to become ready.
- Pages, automatic B inputs and the stop reason use the existing recording path. No new timeline marks.
- OFF preserves the previous calls and output. The running measured game keeps its frozen source.

## Why the breaker did not help here

This run has positive supervisor and fixed-point breaker OFF. Duplicate-turn collapse is ON; it removes duplicates but does not supply the stage-two positive prompt. The battle-refusal guard requires an initialized battle, so it does not catch these no-battle refusals. Those are separate guard and configuration issues.

## Game source

`pret/pokeemerald` revision `731ad5bfd6e6f265508d0efcca0ba42f9dcf5881`: `RustboroCity_Gym_EventScript_Tommy` starts trainer dialogue; `TextPrinterWait` and `TextPrinterWaitWithDownArrow` accept A or B. Running ROM SHA-1: `f3ae088181bf583e55daf962a92bb46f4f1d07b7`.

Candidate repair on a working branch. Recorded-state regression tests and production-factory verification; review and landing pending. No gameplay improvement claim, measured trial or live-run repair is implied.
