# Lesson: give the model the fact when it needs it; don't edit it in

2026-11-05, New York. From the 24-hour GPU weight-edit window on Qwen3.8-27B (11/4 11:55 AM to 11/5 11:55 AM). Full data: `/mnt/project-files/weight-editing/weight-space-programming-paper.md`.

## The lesson in one line

When the 27B "thinks until the token cap", it usually does **not know what to do next in the game**. One short, true fact, delivered at the moment it applies, fixes it. Weight edits, steering and effort settings did not.

## The evidence

| What we tried | Effect on stuck turns |
|---|---|
| Steering against a "keep thinking" direction (L47) or a class direction (L55) | No useful change; the strong setting broke normal turns |
| Biasing the model toward ending its thinking (lm_head) | About half the "fix" happened anyway on re-sampling; broke 2 of 6 normal turns at bias 12; bias 16 was worse |
| Reasoning effort xhigh / medium / low | Same cap rate at every level (4 of 12) |
| Removing the failed attempt and retry note from context | 15/18 → 13/18 capped, about the same |
| A rank-one MLP edit to write the fact into the weights | Did not install the fact (cottage door 1–3 of 33); normal turns slightly worse |
| **One sentence of game knowledge added as the last message** | **9/18 → 1/18 capped on unseen stuck turns; 13 of 18 went straight to the right door; mean thinking on unseen turns fell to 2,485 tokens (about 1,000 on the training turns)** |

The fact: *"Mr. Briney's boat cannot be boarded from the pier or by walking to it. Enter the house by the pier on Route 104 and talk to Mr. Briney inside; he then sails you to Dewford Town."*

## Why

- Reading the stuck traces, as the weight-space paper says to: the model was doing real map reasoning, rebuilding geography from memory (wrongly) and hunting for routes that don't exist. There were no repetition loops; the repeated-sentence share was 0.6%, about the same as long finished turns (0.4%).
- The weight-space programming paper (MIT, 11/2) says it directly: an edit "could remove an obstacle that hid an ability, but it could not add an ability the model lacked." Our failure is a missing ability (knowledge), not an obstacle.
- Being stuck is tied to the spot, not to chance. Turns that capped once capped again 24/36 times; turns that finished capped 1/18.

## How to prompt and push the model (rules going forward)

1. **Diagnose by reading failing outputs first.** Labels and probes misled us for hours.
2. **When a model thinks to the cap, suspect missing knowledge before a broken mechanism.** Test it by adding the one fact the model lacks and re-sampling the same turn 3+ times.
3. **Deliver knowledge just in time:** a short, capped line, triggered by game state (map, milestone, scene, opponent, stall), from a deterministic source (ROM/RAM, walkthrough, keepingiticy). Never stuff the system prompt (the operator 11/4).
4. **Judge every change over several samples per turn.** Whether a turn caps is partly chance; the same turn can finish in 358 tokens or hit 8,192.
5. **Check the harness before blaming the model.** The Dewford wall was partly a harness bug (Briney intercept; fixed after f604's pin).
6. Knowledge-on runs go in their own labelled lane (the **Rayquaza lane**), never pooled with benchmark arms.

## Side findings

- Before b1c5cbf37 the harness sent no `reasoning_effort`; f604's first request was confirmed to run at `xhigh` while records say `medium`. Older runs likely the same but not confirmed.
- The restored hyperqwen rejects the f604 harness's tools under strict grammar (`'triggers'`, from the `map_id` tuple). Check this before any Qwen run.
