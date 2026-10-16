# explorer-guidance-v1: talk to people to learn where to go

Approved by the operator 2026-10-16 2:08 AM EDT (option 2, bundle): "The whole point of Pokemon ... is exploring, talking to people, finding things out, and then having those hints help you move forward." Forensics of `2026-10-16T00-34-26_qwen36-gpu1_show`: after the starter handoff the model skipped May's mom (the only "ROUTE 103" source), dismissed Birch's "MAY? Gone home, I think." as "generic advice" (T656), and spent 15+ min with no goal after OLDALE_TOWN.

Branch `claude/explorer-guidance` in `/private/tmp/pokebench-explorer-guidance`. Default-off bundle switch; bundle definition owned by the readiness thread. Standing merge OK once Claude, Codex and Grok LGTM.

## Design
- ON, system prompt section: in this game, people tell you where to go next. After each story step, and whenever you are unsure where to go, talk to the people in the rooms you are in and to story characters' families and neighbours before moving on; people often say something new after the story moves forward, so talk again to people you met earlier. Every conversation is cheap (dialogue auto-advance). Names no destination or story step.
- OFF: prompt byte-identical.

## Milestones
**M1 — switch, RED, GREEN, gates.**
- [x] RED: `packages/agent/src/explorer-guidance.test.ts` (OFF golden over every main prompt, ON placement, auto-advance sentence, no names, preset factory path, registry/state-only) + registry index/count shifts + viewer explainer mapping asserts.
- [x] GREEN: registry, presets, defaults OFF, state-only refusal, `playSystemPrompt` section.
- [x] Wiring-removal check (delete the prompt line, factory test goes red, restore).
- [x] Gates: test, lint, build, coverage ≥90, verify-vendor.

**M2 — explainer, pending experiment, review (Claude CLI, Codex, Grok) until LGTM.**
- [x] `docs/explainers/explorer-guidance-v1.html`, README, `FEATURE_EXPLAINERS`, `just pages-check`.
- [ ] `experiments/explorer-guidance.json` (pending), readiness line, `just experiments-check`.
- [ ] Principles self-review (PB1–PB13), Claude CLI, Codex, Grok: LGTM.

## Session Log
- 2026-10-16 02:10 AM EDT: worklog drafted (approved by the operator).
- 2026-10-16 02:14 AM EDT: OFF golden computed on main e8a46f22 before any change: sha256 over the incumbent prompt plus the incumbent with each of the 57 main switches flipped, targets null and RIVAL_HOUSE_ENTERED = `3242a86c…26826be` (incumbent copied to `packages/agent/test-support/explorer-guidance-incumbent.json`). Section names "families and neighbours" as in the approved design; the no-names test therefore omits `neighbour` from the banned list used for GAME_EVIDENCE_SECTION.
- RED: agent vitest 21 failed (7 new, 14 shifted registry assertions), as expected.
COMMIT: `test(RED): explorer-guidance-v1: a default-off talk-to-people prompt section, OFF byte-identical to main` (e11903ad)
- 2026-10-16 02:33 AM EDT GREEN: `explorer-guidance-v1` appended last to SWITCHABLE_FEATURES, FEATURES ("TALK TO PEOPLE", guidance, needs null) and playHarnessFeatures; optional in FeatureSetSchema, default false in normalizeFeatures/flagFeatures/DEFAULT_NEXT_RUN; added to stateOnlyProblems (state-only uses its own prompt, so ON would silently do nothing). `playSystemPrompt` appends EXPLORER_GUIDANCE_SECTION after game evidence/navigate_to and before objectives; EXPLORER_TALK_IS_CHEAP only with dialogue-auto-advance-v1 ON. Existing fixed lists got the new id OFF; positional asserts shifted by one.
- Wiring-removal: deleting the `features["explorer-guidance-v1"]` line in playSystemPrompt turned 4 of 7 explorer tests red (OFF golden mismatch since ON==OFF, ON placement, cheap sentence, preset factory path); restored, 7/7 green.
- Explainer `docs/explainers/explorer-guidance-v1.html` (pages-check silent), README entry, FEATURE_EXPLAINERS mapping.
- Gates: `just test` agent 1407/1407, viewer 797/797, pytest 2017 passed 2 skipped (after `git submodule update --init` in this worktree); `just lint` TS/eslint/ruff clean, mypy only the known `mgba._pylib` worktree error; `just build` ok; `just coverage` agent 97.73 st / 94.56 br / 97.98 fn / 99.08 ln, viewer 95.11 / 90.43 / 93.59 / 97.61, Python lines 97.08 branches 92.67 functions 100 (floor 90); `just verify-vendor` OK.
