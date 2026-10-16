# explorer-guidance-v2: generic talk-to-people guidance

Operator decision 2026-10-16 4:18 PM EDT (the operator): keep the talk-to-people guidance generic, with no guidance toward any particular NPC. v1's "families and neighbours of characters you have met" and "such as where someone has gone" read as a walkthrough toward particular people. v1 stays registered and unchanged.

Branch `claude/explorer-guidance-v2` in `/private/tmp/pokebench-explorer-v2`, cut from main 16a9787b. Default-off guidance switch. Not merged by this session; the parent session lands it.

## Design
- ON: system-prompt section, exactly: "Talk to people: talking to people gives you information about the world and can move the story forward. When you are unsure where to go, or after the story has moved on, talking to the people around you is a good way to learn more. What people tell you is evidence; use it to decide where to go." With dialogue-auto-advance-v1 on, followed by v1's EXPLORER_TALK_IS_CHEAP sentence, as v1 does.
- Placement: v1's slot (after battle triage, trainer heal and the map rules; before untaken exits and the objective prompt).
- Both v1 and v2 on: only v2's section (v2 supersedes v1). The registry has no conflict declarations; the codebase precedent for one switch replacing another's text is navigate-first-prompt-v1 suppressing NAVIGATE_TO_USAGE. Superseding keeps a one-switch flip valid on an incumbent that already has v1 on (bundle-v-control's bundle arm).
- Registry: guidance group, needs null, recorded last, default off in presets/flagFeatures/next-run defaults, state-only decisions refuse it (as v1).
- OFF: every main prompt byte-identical (sha256 golden over the incumbent and ALL_ON, each with every main switch flipped, targets null and RIVAL_HOUSE_ENTERED).

## Milestones
**M1 — RED, GREEN, gates.**
- [x] RED: `packages/agent/src/explorer-guidance-v2.test.ts` + registry position/count shifts + viewer explainer mapping.
- [x] GREEN: registry, presets, defaults, state-only, playSystemPrompt.
- [x] Wiring-removal check.
- [x] Gates: test, lint, build, coverage >=90, verify-vendor.

**M2 — explainer, pending experiment, review.**
- [x] `docs/explainers/explorer-guidance-v2.html`, README, FEATURE_EXPLAINERS, `just pages-check`.
- [x] `experiments/explorer-guidance-v2.json` (pending), readiness row, `just experiments-check`.
- [ ] Sync main, principles self-review, Claude CLI, Codex, Grok: VERDICT LGTM.

## Session Log
- 2026-10-16: worklog drafted from the operator decision relayed by the parent session.
- OFF golden computed on main 16a9787b before any change (built dist, 90 main switches, fixture `test-support/explorer-guidance-incumbent.json`): incumbent `1c204a888ae4ea34255f699638775240bfd3792b7b10ce02b37559e81163397a`, ALL_ON `6ba62177069b845923d12acae026242bfc8fe23454183293029a5b2e801707f5`.
- RED: new `explorer-guidance-v2.test.ts` (11 tests: OFF golden from the incumbent and from ALL_ON, exact text, no pointers toward particular people, v1-slot placement, order after map rules/battle triage/trainer heal and before untaken exits, talk-is-cheap pairing, v2 supersedes v1 when both on, v1 unchanged ON and OFF, production preset path, registry/state-only, preset defaults); 52 existing registry assertions shifted by one (`.at(-N)`, `.slice`), guidance count 37 -> 38, ALL_ON-derived sets in 7 test files and the viewer next-run tests name `explorer-guidance-v2: false`, switchboard row count 91 -> 92; viewer: v2 explainer card link and byte-for-byte serving, next-run default off. RED run with main's source: agent 51 failed / 1911 passed (1962), viewer 5 failed / 1003 passed (1008).
- GREEN: `explorer-guidance-v2` appended last to SWITCHABLE_FEATURES, FEATURES ("TALK TO PEOPLE V2", guidance, needs null) and playHarnessFeatures; optional in FeatureSetSchema, `??false` in normalizeFeatures, false in flagFeatures and DEFAULT_NEXT_RUN; stateOnlyProblems refuses it; playSystemPrompt picks v2, else v1, else nothing for the slot, then the talk-is-cheap sentence with dialogue auto-advance. FEATURE_EXPLAINERS maps it to `explorer-guidance-v2.html`. Not a server switch.
- Both-on decision: v2 supersedes v1 (the registry has no conflict declarations; navigate-first-prompt-v1 replacing NAVIGATE_TO_USAGE is the precedent; superseding keeps a one-switch flip valid on an incumbent with v1 on).
- Wiring-removal: forcing the v2 branch off (`const explorer = false ? ...`) turned 6 of 11 v2 tests red (OFF golden since ON==OFF, placement, ordering, talk-is-cheap, supersede, preset path); giving v1 precedence turned the supersede test red. Restored; 11/11 green.
- Viewer test refinement after RED: the v2 card test reads the v1 quote with the explainer's <mark> highlight tags stripped (the page highlights the two pointer lines).
- Explainer `docs/explainers/explorer-guidance-v2.html` (v1 vs v2 word for word with the pointer lines highlighted, prompt slot diagram, both-on table, wiring); `just pages-check` silent; README entry.
- Gates: agent vitest 1962 passed, viewer 1008 passed, pytest 2394 passed / 104 skipped; coverage agent statements 98.01 / branches 94.6 / functions 98.35 / lines 99.24, viewer 95.53 / 91.32 / 93.94 / 97.74, Python lines 97.47 / branches 93.46 / functions 99.39 (floor 90); lint: tsc, eslint, ruff clean, mypy fails only on the missing `mgba._pylib` binding in this worktree; build green; verify-vendor OK.
- Pending experiment `experiments/explorer-guidance-v2.json`: the finals incumbent from `experiments/explorer-guidance.json` with `explorer-guidance-v1` and `explorer-guidance-v2` explicitly false; activation NEW_GAME_CREATED, primary RIVAL_HOUSE_ENTERED; provisional source.commit = branch head 378afce2. Parsed with the branch build: candidate differs only by `explorer-guidance-v2`, and its prompt ends with the exact v2 section (the finals incumbent has dialogue auto-advance off, so no talk-is-cheap sentence). `just experiments-check` (reads main) ok. Readiness row added.
- Sync: merged main cefacbf1 (cross-map-goal-v1 landed, worklog archives). Conflicts in the registry, presets, next-run defaults and their tests: took main's side, then appended `explorer-guidance-v2` after `cross-map-goal-v1` everywhere (registry, FEATURES, playHarnessFeatures, schema filter and Exclude list, normalizeFeatures, flagFeatures, DEFAULT_NEXT_RUN, test sets); readiness rows keep both. Registry positions shifted once more (53 assertions), guidance count 39, switchboard rows 93. `experiments/cross-map-goal.json` names every switch (its test checks that), so its incumbent gains `"explorer-guidance-v2": false` (omitted already read OFF; no behavior change). OFF golden recomputed on main cefacbf1's own source (git archive of packages/agent at cefacbf1, built with tsc in the scratchpad): incumbent `3ebfcf0b…7e90f`, ALL_ON `9bca870b…c1207`, 92 main switches; the v2-OFF test reproduces both.
- Gates after the sync: agent 1986 passed, viewer 1026 passed, pytest 2394 passed / 104 skipped; coverage agent 98.04 / 94.63 / 98.35 / 99.24 (statements/branches/functions/lines), viewer 95.55 / 91.39 / 93.91 / 97.75, Python lines 97.47 / branches 93.46 / functions 99.39; lint clean except the worktree-only mypy `mgba._pylib`; pages-check silent; verify-vendor OK.
- Explainer: highlights narrowed to exactly the two phrases the operator quoted; rendered in the browser pane from http://127.0.0.1:8791/explorer-guidance-v2/explorer-guidance-v2.html (copy in the main checkout's runs/mockups, 200); pages-check silent; viewer explainer tests 116 passed.
