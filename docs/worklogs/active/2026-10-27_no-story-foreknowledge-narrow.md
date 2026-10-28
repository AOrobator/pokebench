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
  ROXANNE -> "the Gym Leader", TEAM AQUA grunt -> "a trainer" (and "the trainer" where a sentence refers back to it,
  as heal-first's and coherent healing's possessive), DEVON researcher -> "a researcher".
- play-config TRAINER_HEAL_SECTION is untouched, rival sentence included.

Out of scope (narrow): names in the "here" list of present characters, sprite kinds (`sprite ROXANNE`), the
story-battle-heal-gate-v1 refusal (OFF in both arms), the DAD->NORMAN alias and battle_details labels.

## Milestones

- [x] M1 RED: OFF goldens, ON copy per site, shown-name tracker, disproved-beliefs, factory and the B1 stall-gate test.
- [x] M2 GREEN: implementation, registry, presets, next-run default; `just test`, `just lint`, coverage >= 90.
- [x] M3 explainer + Harness Config link, readiness in this worklog (the readiness.md ledger and pending queue entries were retired 2026-10-22).
- [ ] M4 review: one pass, full pokebench-review personas; lanes Claude CLI + Codex CLI gpt-5.6-sol + fresh Codex (Grok stand-in).
- [ ] M5 land ff-only via the landing board; ON in both arms of experiments/feature-configs/current.json (recipe hash changes: launch approvals need re-approval).
- [ ] M6 ablation probe on the Mac (current copy / narrow ON / advice removed).

## Log

- M1 RED: `packages/agent/src/no-story-foreknowledge.test.ts`, 18 tests: 7 pass (OFF goldens, prompt unchanged, B1 parse), 11 fail.
- M1 COMMIT: `test(observation): no-story-foreknowledge-v1 narrow: shown names only, advice kept (RED)` (cd88f6ba8)
- M2 GREEN: feature file 18/18. Wiring delete-check: `withShownCast(...,null)` at the outermost wrapper turned the factory test red; restored green.
- M2 gates: `just lint` exit 0. Agent 4588/4588, stmts 96.44 / branches 92.66 / funcs 97.48 / lines 99.17; viewer 2083/2083, 95.81 / 91.68 / 95.32 / 98.26; Python 4431 passed, lines 97.47 / branches 93.58 / functions 100 (floor 90). Worktree setup needed `just build`, `git submodule update --init` and the main checkout's .env symlinked (first pytest pass failed only on those).
- Readiness: the Story characters line is in every overworld readout from the truck (turn 0); the warnings act at Route 103 (rival), Petalburg Woods and the Rustboro gym, all reached by current runs (a702 at the Rustboro gym). Ready to test.
- GREEN COMMIT: `feat(observation): no-story-foreknowledge-v1 narrow: name story characters only once the game shows them` (97eed15cb)
- M3: docs/explainers/no-story-foreknowledge-v1.html (themed, `just pages-check` silent), FEATURE_EXPLAINERS mapping, README line, server.test.ts explainer list; viewer panels+server 340/340. Copied to runs/mockups/no-story-foreknowledge-v1/; 8791 link 200; headless desktop 1280 and phone 390 screenshots, no page overflow.
- Synced main 896088908 (type-gap-team, supplies, untalked-in-gym): conflicts only at append points; re-applied this switch after untalked-in-gym-v1.
- Merged tip: main's type-gap-registry.test.ts pinned its three switches as the last three (slice(-3)); re-pinned them by position after context-exact-count-v1 (feature-switch skill: registry tests pin absolute positions, so a new switch edits no other switch's test).
- Synced main 948095751 (grass-strides-v1; main's own fix to the type-gap registry test supersedes db59af397's, taken as theirs): this switch re-applied after grass-strides-v1.

### Review pass (one pass), packet 948095751..3686d60fa, diff SHA-256 in runs/reviews/2026-10-27-nsf-narrow/packet.sha256

Lanes: Claude CLI (~/.claude-review, plan mode) `VERDICT: LGTM`; Codex CLI gpt-5.6-sol xhigh `VERDICT: BLOCKING`; fresh
Codex CLI gpt-5.6-sol xhigh (Grok stand-in; Cursor out of usage) `VERDICT: BLOCKING`. Personas (Claude subagents, one
shared packet): eval integrity, ML engineer, data scientist "holds with changes"; harness engineer pending at this commit.

- REAL, fixed: the motivating sentence (features.ts, explainer, test header) said d548 had been shown none of the names
  by seq 10001. By the switch's own rule it had been shown MOM t56, PROF. BIRCH t66, MAY t81, WALLY t255, ROXANNE t257;
  ON would have dropped TEAM AQUA, DEVON, BRENDAN, NORMAN, STEVEN. Wording corrected to that (Grok stand-in B1, eval integrity).
- REAL, fixed: coherent-healing-feedback-v1 ON dropped the word "trainer" ("Your rival's battle"). Now only the name is
  swapped ("Your rival's trainer battle", "The Gym Leader's trainer battle"); the Aqua grunt keeps heal-first's wording
  ("The trainer's battle") to avoid "trainer's trainer battle". New test on 54a7 T363 with coherent healing on (GPT B1).
- Hardening added: direct ON tests for harness-trust charactersLine and GymProgress (Grok stand-in follow-up).
- Gates on the frozen head (GPT B2, Grok stand-in B2): correct, not yet run there; they run on the fix head when the
  coordinator grants the CPU window, before landing.
- Rebutted / out of scope, for the operator: names only count from dialogue pages, so NORMAN (said as DAD; sign text
  "LEADER: NORMAN" is a readout line) stays hidden for the whole run; checkpoint starts begin with an empty shown set;
  the "here" list and sprite kinds still name characters; ON changes the model's text on most overworld turns, so the
  landing pin is an incumbent change and before/after records are descriptive only.
