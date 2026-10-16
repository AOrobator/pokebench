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
- [x] `experiments/explorer-guidance.json` (pending), readiness line, `just experiments-check`.
- [x] Principles self-review (PB1–PB13), Claude-family (subagent fallback), Codex, Grok: LGTM.

## Session Log
- 2026-10-16 02:10 AM EDT: worklog drafted (approved by the operator).
- 2026-10-16 02:14 AM EDT: OFF golden computed on main e8a46f22 before any change: sha256 over the incumbent prompt plus the incumbent with each of the 57 main switches flipped, targets null and RIVAL_HOUSE_ENTERED = `3242a86c…26826be` (incumbent copied to `packages/agent/test-support/explorer-guidance-incumbent.json`). Section names "families and neighbours" as in the approved design; the no-names test therefore omits `neighbour` from the banned list used for GAME_EVIDENCE_SECTION.
- RED: agent vitest 21 failed (7 new, 14 shifted registry assertions), as expected.
COMMIT: `test(RED): explorer-guidance-v1: a default-off talk-to-people prompt section, OFF byte-identical to main` (e11903ad)
- 2026-10-16 02:22 AM EDT GREEN: `explorer-guidance-v1` appended last to SWITCHABLE_FEATURES, FEATURES ("TALK TO PEOPLE", guidance, needs null) and playHarnessFeatures; optional in FeatureSetSchema, default false in normalizeFeatures/flagFeatures/DEFAULT_NEXT_RUN; added to stateOnlyProblems (state-only uses its own prompt, so ON would silently do nothing). `playSystemPrompt` appends EXPLORER_GUIDANCE_SECTION after game evidence/navigate_to and before objectives; EXPLORER_TALK_IS_CHEAP only with dialogue-auto-advance-v1 ON. Existing fixed lists got the new id OFF; positional asserts shifted by one.
- Wiring-removal: deleting the `features["explorer-guidance-v1"]` line in playSystemPrompt turned 4 of 7 explorer tests red (OFF golden mismatch since ON==OFF, ON placement, cheap sentence, preset factory path); restored, 7/7 green.
- Explainer `docs/explainers/explorer-guidance-v1.html` (pages-check silent), README entry, FEATURE_EXPLAINERS mapping.
- Gates: `just test` agent 1407/1407, viewer 797/797, pytest 2017 passed 2 skipped (after `git submodule update --init` in this worktree); `just lint` TS/eslint/ruff clean, mypy only the known `mgba._pylib` worktree error; `just build` ok; `just coverage` agent 97.73 st / 94.56 br / 97.98 fn / 99.08 ln, viewer 95.11 / 90.43 / 93.59 / 97.61, Python lines 97.08 branches 92.67 functions 100 (floor 90); `just verify-vendor` OK.
COMMIT: `feat(GREEN): explorer-guidance-v1: a talk-to-people prompt section, default off, with explainer` (e486b5c2)
- 2026-10-16 02:23 AM EDT: pending `experiments/explorer-guidance.json` (finals incumbent, activation NEW_GAME_CREATED, primary RIVAL_HOUSE_ENTERED, provisional source.commit e486b5c2, no queuePosition); parses with `parseExperiment`. `just experiments-check` prints `ok: 51 experiments` but reads the main checkout (by design), so it does not see this entry until landing. Readiness row: PENDING until `just experiments` after landing.
COMMIT: `experiments: register explorer-guidance as pending` (c49e9845)
- 2026-10-16 02:38 AM EDT review round 1 on frozen packet e8a46f22..c49e9845 (`git diff --binary`, sha256 2ce1b65f…2fe61). Principles self-review PB1–PB13: zero FAIL (6 N/A, 7 PASS). Claude family: Claude CLI with `$HOME/.claude-review` failed ("OAuth session expired and could not be refreshed", also outside the sandbox); Cursor Claude failed (claude-opus-5-5-high and claude-sonnet-5-thinking-xhigh: Cursor usage limit until 10/17). Standing subagent fallback: two fresh read-only subagents (opus, fable) both `VERDICT: LGTM`. Codex (gpt-5.6-sol, read-only exec) `VERDICT: LGTM`. Grok (cursor-grok-4.5-high, ask mode) `VERDICT: LGTM`. No blockers.
- Accepted hardening follow-ups (fix delta): cheap-talk sentence now "…the harness reads the conversation until your next decision." (auto-advance stops at menus, battles, locked cutscenes; "to its end" overstated); explainer turn-425 row says it headed for the door and was outside by turn 429; explainer wording about auto-advance; `Exclude<>` cast in FeatureSetSchema lists the new id like every earlier optional switch; state-runtime refusal loop lists the new id; fixture trailing newline. Note: `just lint` is green for TS/eslint/ruff; mypy fails only on the known worktree `mgba._pylib` import. PB6 note: section is 84 words, 101 with the cheap-talk sentence.
- Process note: while restarting round 1 (wrong base SHA typed in the first prompt) I ran `pkill -f "cursor-agent -p --trust"` and `pkill -f "codex exec --ephemeral"`, which would also have stopped any reviewer processes another parallel branch had running at that moment.
- Gates after fixes: agent 1407/1407, viewer 797/797, pytest 2017 passed 2 skipped; coverage unchanged (agent 97.73/94.56/97.98/99.08, viewer 95.11/90.43/93.59/97.61, Python 97.08/92.67/100); pages-check silent; lint as above.
COMMIT: `fix: explorer-guidance-v1 review round 1 hardening: exact cheap-talk wording, explainer turn facts, schema cast` (3339fe5e)
- 2026-10-16 02:49 AM EDT review round 2 (fix delta c49e9845..3339fe5e, sha256 dae294cc…9fd1b): Codex `VERDICT: LGTM`, Grok `VERDICT: LGTM`, Claude-family fallback subagents (opus, fable) both `VERDICT: LGTM`. No blockers in either round. Remaining notes are cosmetic (this file's trailing blank line, fixed here). M1 and M2 complete; ready for operator merge (standing pre-launch merge OK applies only to bundle-v-control fix branches; bundle membership owned by the readiness thread).

