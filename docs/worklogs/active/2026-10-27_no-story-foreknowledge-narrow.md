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
  ROXANNE -> "the Gym Leader", a TEAM AQUA grunt -> "a grunt" (only the name TEAM AQUA goes), the DEVON researcher -> "the researcher" (round 2).
- play-config TRAINER_HEAL_SECTION is untouched, rival sentence included.

Out of scope (narrow): names in the "here" list of present characters, sprite kinds (`sprite ROXANNE`), the
story-battle-heal-gate-v1 refusal (OFF in both arms), the DAD->NORMAN alias and battle_details labels.

## Milestones

- [x] M1 RED: OFF goldens, ON copy per site, shown-name tracker, disproved-beliefs, factory and the B1 stall-gate test.
- [x] M2 GREEN: implementation, registry, presets, next-run default; `just test`, `just lint`, coverage >= 90.
- [x] M3 explainer + Harness Config link, readiness in this worklog (the readiness.md ledger and pending queue entries were retired 2026-10-22).
- [x] M4 review: one pass, full pokebench-review personas; lanes Claude CLI + Codex CLI gpt-5.6-sol + fresh Codex (Grok stand-in).
- [ ] M5 (landed f6efe433b; pin pending) land ff-only via the landing board; ON in both arms of experiments/feature-configs/current.json (recipe hash changes: launch approvals need re-approval).
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
- Harness engineer persona (holds with changes), fixed: "none the game has named yet" could be false when a sign shows a
  name, so the empty list now reads "none named in dialogue yet"; the registry text and explainer declare what ON still
  names (characters on this map, sprite kinds, warning story facts) and that sign-only names, NORMAN (said as DAD) and
  checkpoint starts stay hidden. Carried to M6: decision-probe.ts never re-renders tool results, so the probe's ON arm
  must render the copy itself from seeded shown names (all four personas). Carried to landing: a delivery rehearsal
  replaying a recorded run through the production wrapper.
- Delivery rehearsal (CPU-only, recorded data): runs/reviews/2026-10-27-nsf-narrow/rehearse.mjs replays every tool_result
  and dialogue event of a702, 057c and Opus 36b5 through the built ShownStoryNames + shownCast on 09ce3228c. 2076 results,
  2752 cast lines; results changed 574/818, 674/954, 185/304; storyCharacters roster mismatches 0; unshown names left in
  any absent list 0; absentCast vs Python's list mismatches 0. First shown (a702): MOM t51, PROF. BIRCH t59, MAY t74,
  WALLY t311, ROXANNE t312, TEAM AQUA/DEVON t360, STEVEN t630; BRENDAN and NORMAN never.
- Gates on 3121b0271 (coordinator CPU window, 8:36 PM NY): `just lint` 0; `just test` 0: agent 4639/4639 (stmts 96.49 / br 92.68 / fn 97.46 / ln 99.18), viewer 2093/2093 (95.81 / 91.68 / 95.32 / 98.26), Python 4446 (ln 97.48 / br 93.60 / fn 100), gateway 69 (99.41 / 97.44 / 100), trainer cards 3/3.
- Synced main 80d00d743 (scene-followup-prompt-v1): append-point conflicts only; switch re-applied after scene-followup-prompt-v1.

### Review round 2, packet 80d00d743..24c1535bf (SHA-256 in runs/reviews/2026-10-27-nsf-narrow/round2/packet.sha256)

All three lanes `VERDICT: BLOCKING`. Round-1 items confirmed fixed by all: d548 evidence, rival coherent wording, B1.
- REAL, fixed (Claude): main's merged scene-followup.test.ts pinned its switch with `at(-1)`, so appending this switch
  broke it; pinned by position after grass-strides-v1. Full gates had not run on the merged head (all three lanes).
- REAL, fixed (Grok stand-in): `ShownStoryNames` replaced a call's pending pages, so battle_action's preflight and
  post-action batches under one call id lost the first batch's names; batches now append. Test added.
- Fixed (GPT, Grok stand-in): Aqua wording still changed non-name words ("The trainer's battle" for "TEAM AQUA grunt's
  trainer battle"). Now only the name goes: "a grunt", "The grunt's (trainer) battle", "the researcher". Coherent-healing
  Woods test added.
- Fixed (GPT): server.test explainer loop read each source twice; reads once.
- Rebutted (GPT B1): "none named in dialogue yet" differs from the round-1 boundary's literal; it is the round-1 fix for
  the harness-engineer persona's finding that the old words could be false (a sign can show a name). Boundary amended
  in this worklog; not a correctness defect.
- Synced main 2c8240b8b (end-reason-orthogonal; no conflicts). This switch's own registry test re-pinned by position after scene-followup-prompt-v1 instead of at(-1).
- Synced main 791db6f3c (PokéNav fix: pokenav-short-list-v1, menu-option-honest-refusal-v1; it re-pinned scene-followup by absolute index, taken as theirs). This switch re-applied after menu-option-honest-refusal-v1 and its own pin follows it. The operator 9:14 PM: no checkpoint run or save seeding; evaluation is decision probes plus ON in both arms going forward. The operator 9:19 PM: wording "A" (the role words in code) as an operator amendment to the round-1 boundary.

### Review rounds 3 and 4, landing

- Round 3, packet 2c8240b8b..4c384f410: Claude `VERDICT: LGTM`; GPT and Grok stand-in `VERDICT: BLOCKING` on the missing
  exact-head gate receipt (gates on 4c384f410 then passed: lint 0, test 0) and, GPT only, the wording vs the round-1
  boundary literals. The operator's operator amendment, 2026-10-27 9:19 PM in the project thread: "A" (the role words in code:
  "a grunt", "The grunt's trainer battle", "the researcher", "none named in dialogue yet"). The operator 9:14 PM: no checkpoint
  run or save seeding; evaluation is decision probes plus ON in both arms going forward.
- Synced main fd621a45d. Gates on exactly f6efe433b (coordinator CPU window 9:48 PM): `just lint` 0; `just test` 0:
  agent 4663/4663 (stmts 96.5 / br 92.69 / fn 97.47 / ln 99.18), viewer 2154/2154 (95.23 / 91.15 / 95.12 / 98.27),
  Python 4463 (ln 97.48 / br 93.61 / fn 100), gateway 69, trainer cards 3/3.
- Round 4, packet fd621a45d..f6efe433b (runs/reviews/2026-10-27-nsf-narrow/round4): Claude CLI `VERDICT: LGTM`, Codex
  gpt-5.6-sol xhigh `VERDICT: LGTM`, fresh Codex gpt-5.6-sol xhigh (Grok stand-in) `VERDICT: LGTM`.
- LANDED: `git merge --ff-only` from landing-board slot 1; main = f6efe433b, exactly the reviewed head.
- Next: pin ON in both arms of experiments/feature-configs/current.json (the operator approved) as its own small reviewed change;
  `just viewer-main` after it lands; remaining probe chunk (d41e held-out).
