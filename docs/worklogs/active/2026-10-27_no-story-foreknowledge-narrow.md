# no-story-foreknowledge-v1 (narrow)

Branch `claude/no-story-foreknowledge-narrow` in `~/dev/pokebench-worktrees/no-story-foreknowledge-narrow`, from main 1b7ae8b96.
Replaces the blocked `claude/no-story-foreknowledge-min` (45f9847e3; review B1: rewriting the cast line at the outermost
wrapper emptied `storyCharacters`, so story-character-stall-gate-v1 and loop-recovery lost their rosters).

Scope approved by the operator 2026-10-27 7:37 PM (New York): remove only names the game has not shown yet; keep the advice.

## Design

Switch `no-story-foreknowledge-v1`, observation group, default OFF, OFF byte-identical.

- `ShownStoryNames` (story-foreknowledge.ts): a story name counts as shown once a delivered dialogue page (field or
  battle) carries it as its NAME: prefix or names it in upper case (people-id-cards' existing `nameShown` rule, now one
  shared `pageShowsName`). Pages of the call whose result is being written count too, since that result delivers them.
- Story characters line (Python's, the people ledger's copy): the line and its "here" list stay word for word; only the
  "Not on this map:" list is filtered to names the game has shown ("none the game has named yet" when empty). Applied
  at the outermost game-tool wrapper, so the recorded `tool_result` is what the model saw.
  - Every reader that parses the line (people-ledger `storyCharacters` -> stall gate, loop-recovery, heal-first;
    harness-trust `charactersLine`; gym-readiness) reads only the "here" list, which is untouched, so it parses the
    rewritten line exactly as the full one (tested; this is B1's fix).
  - disproved-beliefs-v1 reads the absent list. With the switch on it reconstructs the full list: the cast table
    (script-line-presence `STORY_CHARACTERS`, the same order as Python's CHARACTERS) minus the "here" names, which is
    exactly how Python builds it.
  - Python untouched.
- Heal warnings keep every sentence of advice (HP facts, blackout cost, heal sites, bag items, "cannot be run from"):
  low-hp-trainer-warning v1/v2, coherent-healing-feedback-v1's opponent clause, heal-before-trainers-v2 STORY_ROLE and
  story-battle-heal-first-v1 put a role word in place of a name the game has not shown: MAY/BRENDAN -> "your rival",
  ROXANNE -> "the Gym Leader", TEAM AQUA grunt -> "a trainer", DEVON researcher -> "a researcher".
- play-config TRAINER_HEAL_SECTION is untouched, rival sentence included.

Out of scope (narrow): names in the "here" list of present characters, sprite kinds (`sprite ROXANNE`), the
story-battle-heal-gate-v1 refusal (OFF in both arms), the DAD->NORMAN alias and battle_details labels.

## Milestones

- [ ] M1 RED: OFF goldens, ON copy per site, shown-name tracker, disproved-beliefs, factory and the B1 stall-gate test.
- [ ] M2 GREEN: implementation, registry, presets, next-run default; `just test`, `just lint`, coverage >= 90.
- [ ] M3 explainer + Harness Config link, readiness row.
- [ ] M4 review: one pass, full pokebench-review personas; lanes Claude CLI + Codex CLI gpt-5.6-sol + fresh Codex (Grok stand-in).
- [ ] M5 land ff-only via the landing board; ON in both arms of experiments/feature-configs/current.json (recipe hash changes: launch approvals need re-approval).
- [ ] M6 ablation probe on the Mac (current copy / narrow ON / advice removed).

## Log

- M1 RED: `packages/agent/src/no-story-foreknowledge.test.ts`, 18 tests: 7 pass (OFF goldens, prompt unchanged, B1 parse), 11 fail.
