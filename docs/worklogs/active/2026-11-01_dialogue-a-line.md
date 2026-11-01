# Worklog: dialogue button guidance — A stays the way to talk to a person

## Problem Statement

Operator (2026-11-01): the system prompt's `DIALOGUE_BUTTON_B_SECTION` ends with a general instruction to leave instead of pressing A. It was added by `05060925c` ("feat(truck-dialogue): count a closed sign and tell the model to press B") to stop A-spam at signs, but it generalizes to people and contradicts `explorer-guidance-v2`'s "Talk to people" section two thirds of the way up the same prompt.

Measured in the 24h Qwen run: turn 354 stood one tile west of a scripted Team Aqua NPC at (14,5) blocking the only corridor east and pressed RIGHT (a bump) instead of A. Recorded reasoning: "talking just made it move suggests this is a SCRIPTED NPC … Bumping might trigger a battle script, or might do nothing. Let me just try pressing RIGHT." The bump returned "blocked or unavailable"; turn 355 concluded it was "stuck on this Aqua member that won't budge" and abandoned the mandatory story path, with no further milestones for 11 hours. The one action never tried was A on the person.

Measured on this branch before the edit (current recipe features, `playSystemPrompt`): the old sentence is in **both arms** (control prompt 19,573 chars, bundle 21,703 chars); the Explorer talk paragraph sits at index 12,679 and the dialogue section at 15,631, so the leave sentence is the later, more specific-looking of the two. Not superseded: `dialogue-auto-advance-v1`'s section only covers messages already open ("never need A or B to read dialogue"), and nothing else tells the model how to start a conversation when the readout gives the person no `navigate_to_target` target.

## Skills Loaded

- `pokebench-agent-workflow` (worktree setup, gate ladder)
- `.claude/skills/feature-switch/SKILL.md` (activation placement only; no new switch added)
- `.claude/skills/talk-to-claude/SKILL.md` (landing board, CPU windows)

## Architecture

`dialog-button-b-v1` already gates the section and is already set `true` in the `features` dict of `experiments/feature-configs/current.json`, which both arms share; it is in neither `switches` nor `offInBoth`. The fix is text only, so both arms get it with no arming change and no new flag.

Two strings change in `packages/agent/src/play-config.ts`:

- `DIALOGUE_BUTTON_B_SECTION` — the leave sentence becomes a rule scoped to a message already read, plus one sentence that A is how to talk to a person or read a sign.
- `SEMANTIC_TALK_IS_CHEAP` — one trailing clause so the talk paragraph agrees: when the readout gives no target, face the person and press A.

`packages/agent/src/features.ts`'s registry copy for `dialog-button-b-v1` described the removed sentence and is updated with it. `docs/explainers/dialog-button-b-v1.html` quotes the section and gets the new text.

## Invariants

- INV-1: the section never states a general "leave instead of pressing A" rule, in the constant or in either arm's assembled prompt. Test: `dialog-button-b.test.ts` "drops the general leave rule…" and "the current recipe keeps the fixed section on in both arms…".
- INV-2: the section keeps the game facts — B advances or closes a message; A talks to whatever you face and starts that sign's or person's message again. Test: same block, positive assertions on those sentences.
- INV-3: the anti-A-spam rule survives, scoped to a message already read. Test: "…or press it again on a message you have already read".
- INV-4: A stays a legitimate way to talk, and `navigate_to_target` stays preferred when the readout gives a target. Test: the SEMANTIC_TALK_IS_CHEAP clause test.
- INV-5: arming unchanged — `features["dialog-button-b-v1"]===true`, not in `switches`/`offInBoth`. Test: the recipe read in the both-arms test.
- INV-6: no new game facts, NPCs, maps or story steps; the section still names no character or place (`not.toContain("MOM")`, `not.toContain("truck")`).

## Security Review

Prompt copy only; no new input, tool, server read or filesystem access.

## Milestones

### M1 — Reword the dialogue section and the talk clause
- [x] RED: `dialog-button-b.test.ts` asserts the leave rule is gone and the new sentences are present (3 failed, 2 passed before the edit)
- [ ] GREEN: `play-config.ts` (both strings), `features.ts` registry copy, explainer quote
- [ ] Full gates: `just test` / `just lint` / `just build` / `just coverage`
- [ ] Multi-model review
- [ ] Land (landing board slot)

## Closing the Loop

Fixed at the prompt surface the model reads: `playSystemPrompt` with the current recipe's shared features returns the new section in both arms and no leave rule. No live run restart without operator ask.

## Session Log

- 2026-11-01: worktree `/private/tmp/pb-dialogue-a-line`, branch `claude/dialogue-a-line-both`, off main `3623a82a4`. RED committed; GREEN next.

## Surprises

- `bundle-v-control`'s base features already carry `dialog-button-b-v1: true` while its registry copy still says "Bundle arm only"; the arming test pins that wording, so it stays untouched here.

## Multi-Model Review Log

(pending)

## Boy Scout Log

(none)

## Archive Milestone

ASK USER before archive.
