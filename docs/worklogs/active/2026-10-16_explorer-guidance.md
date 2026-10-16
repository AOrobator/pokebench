# explorer-guidance-v1: talk to people to learn where to go

Approved by the operator 2026-10-16 2:08 AM EDT (option 2, bundle): "The whole point of Pokemon ... is exploring, talking to people, finding things out, and then having those hints help you move forward." Forensics of `2026-10-16T00-34-26_qwen36-gpu1_show`: after the starter handoff the model skipped May's mom (the only "ROUTE 103" source), dismissed Birch's "MAY? Gone home, I think." as "generic advice" (T656), and spent 15+ min with no goal after OLDALE_TOWN.

Branch `claude/explorer-guidance` in `/private/tmp/pokebench-explorer-guidance`. Default-off bundle switch; bundle definition owned by the readiness thread. Standing merge OK once Claude, Codex and Grok LGTM.

## Design
- ON, system prompt section: in this game, people tell you where to go next. After each story step, and whenever you are unsure where to go, talk to the people in the rooms you are in and to story characters' families and neighbours before moving on; people often say something new after the story moves forward, so talk again to people you met earlier. Every conversation is cheap (dialogue auto-advance). Names no destination or story step.
- OFF: prompt byte-identical.

## Milestones
**M1 — switch, RED, GREEN, gates.**
- [x] RED: `packages/agent/src/explorer-guidance.test.ts` (OFF golden over every main prompt, ON placement, auto-advance sentence, no names, preset factory path, registry/state-only) + registry index/count shifts + viewer explainer mapping asserts.
- [ ] GREEN: registry, presets, defaults OFF, state-only refusal, `playSystemPrompt` section.
- [ ] Wiring-removal check (delete the prompt line, factory test goes red, restore).
- [ ] Gates: test, lint, build, coverage ≥90, verify-vendor.

**M2 — explainer, pending experiment, review (Claude CLI, Codex, Grok) until LGTM.**
- [ ] `docs/explainers/explorer-guidance-v1.html`, README, `FEATURE_EXPLAINERS`, `just pages-check`.
- [ ] `experiments/explorer-guidance.json` (pending), readiness line, `just experiments-check`.
- [ ] Principles self-review (PB1–PB13), Claude CLI, Codex, Grok: LGTM.

## Session Log
- 2026-10-16 02:10 AM EDT: worklog drafted (approved by the operator).
- 2026-10-16 02:20 AM EDT: OFF golden computed on main e8a46f22 before any change: sha256 over the incumbent prompt plus the incumbent with each of the 57 main switches flipped, targets null and RIVAL_HOUSE_ENTERED = `3242a86c…26826be` (incumbent copied to `packages/agent/test-support/explorer-guidance-incumbent.json`). Section names "families and neighbours" as in the approved design; the no-names test therefore omits `neighbour` from the banned list used for GAME_EVIDENCE_SECTION.
- RED: agent vitest 21 failed (7 new, 14 shifted registry assertions), as expected.
