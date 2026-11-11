# Bounded supervisor briefing (supervisor-briefing-bound-v1)

> Markdown twin of [supervisor-briefing-bound-v1.html](../supervisor-briefing-bound-v1.html), generated from the HTML by `just explainer-twins`. The HTML is the source; edit it, not this file.

Default off. The switch changes three lines of the loop-guard and stall briefings that used to grow for as long as the stall lasted. Every other line stays the same. Items are kept or left out whole, and no text is cut.

## Why

GPT run 429f's loop-guard note at turn 2566 was 66,297 chars. Two of its lines made up 60,019 of them:

- **"Dialogue you were shown leading up to the last story step the game confirmed"**: 44,203 chars. It quotes every page between the previous story step and the latest one. That step was the first evolution, 1,160 turns earlier.
- **"Not tried yet on other maps you have been on since your last story progress"**: 15,816 chars, one entry for each map walked since that step.

Qwen run a702 at turn 1300 sent a 23,676-char briefing on the same turn as its 70K-char tool result. Its request overflowed the window three turns later.

## Rule

![The story lead-up dialogue line. The two map lists (untried targets on other maps, and exits to maps not entered) use the same fill with whole map entries. Kept pages are shown oldest first, as before. With dialogue-auto-advance-v1 on, the count adds "get_dialogue searches the pages the harness advanced through".](supervisor-briefing-bound-v1/fig-1.svg)

*The story lead-up dialogue line. The two map lists (untried targets on other maps, and exits to maps not entered) use the same fill with whole map entries. Kept pages are shown oldest first, as before. With dialogue-auto-advance-v1 on, the count adds "get_dialogue searches the pages the harness advanced through".*

| Line | Budget | Kept first | When something is left out |
|---|---|---|---|
| Dialogue leading up to the last story step | 4,000 chars (pages joined with " \| ") | Newest page | "oldest first (N earlier pages are left out\[; get_dialogue searches the pages the harness advanced through\]): …" |
| Not tried yet on other maps | 2,000 chars (maps joined with " \| ") | Most recently walked map | "…; N earlier maps are left out" |
| Exits to maps you have not entered | 2,000 chars (maps joined with " \| ") | Most recently walked map | "…; N earlier maps are left out" |

OFF is byte-identical to today. ON is also byte-identical when nothing is left out.

## Recorded briefings replayed

Each run's events were replayed into the supervisor up to its largest recorded briefing. With the switch off, both lines match the recording byte for byte.

| Run, turn | Recorded note | Dialogue line OFF → ON | Other-map line OFF → ON | Note ON |
|---|---|---|---|---|
| GPT 429f, T2566 | 66,297 | 44,203 → 4,204 | 15,816 → 1,947 | 12,429 |
| Qwen a702, T1300 | 23,676 | 9,794 → 4,209 | 6,186 → 1,214 | 13,119 |
| Qwen 88ea, T1352 | 23,348 | 13,178 → 4,144 | 5,034 → 1,063 | 10,343 |

Chars. Each line's length includes its label. The rest of each note did not change, and the exits line was under its budget in all three.

## What it does not change

- The exits line was added at the coordinator's request under Operator's rule that nothing given to the model may grow unbounded. In the three replays it was already under its budget (1,780, 907 and 619 chars), so those notes are unchanged by it.
- The "Recent dialogue" line (three pages), the tried list, the fixed lines and the readout are untouched.

## Status

- Not landed on main, so not in any run yet.
- Focused tests pass: the 12 tests in `supervisor-briefing-bound.test.ts` (bounds, code points, and the loop, text-only and stall production factories), and 132 across it and eight neighbouring supervisor test files (receipt: `runs/analysis/bounded-input-20261028/replays/supervisor-briefing-bound-v1.focused.txt`).
- Activation is committed on the branch: `experiments/feature-configs/current.json` lists the switch in the bundle arm's `switches` (ON) and sets it false in the shared base (control OFF), per Operator 2026-10-28 ("they all need to be on in the bundle"). It takes effect only after landing and a new launch.
- Review and gates: three-lane review in progress; full gate on the frozen head under the relayed CPU grant. No measured runs yet.
