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
- [ ] GREEN: registry, presets, defaults, state-only, playSystemPrompt.
- [ ] Wiring-removal check.
- [ ] Gates: test, lint, build, coverage >=90, verify-vendor.

**M2 — explainer, pending experiment, review.**
- [ ] `docs/explainers/explorer-guidance-v2.html`, README, FEATURE_EXPLAINERS, `just pages-check`.
- [ ] `experiments/explorer-guidance-v2.json` (pending), readiness row, `just experiments-check`.
- [ ] Sync main, principles self-review, Claude CLI, Codex, Grok: VERDICT LGTM.

## Session Log
- 2026-10-16: worklog drafted from the operator decision relayed by the parent session.
- OFF golden computed on main 16a9787b before any change (built dist, 90 main switches, fixture `test-support/explorer-guidance-incumbent.json`): incumbent `1c204a888ae4ea34255f699638775240bfd3792b7b10ce02b37559e81163397a`, ALL_ON `6ba62177069b845923d12acae026242bfc8fe23454183293029a5b2e801707f5`.
- RED: new `explorer-guidance-v2.test.ts` (11 tests: OFF golden from the incumbent and from ALL_ON, exact text, no pointers toward particular people, v1-slot placement, order after map rules/battle triage/trainer heal and before untaken exits, talk-is-cheap pairing, v2 supersedes v1 when both on, v1 unchanged ON and OFF, production preset path, registry/state-only, preset defaults); 52 existing registry assertions shifted by one (`.at(-N)`, `.slice`), guidance count 37 -> 38, ALL_ON-derived sets in 7 test files and the viewer next-run tests name `explorer-guidance-v2: false`, switchboard row count 91 -> 92; viewer: v2 explainer card link and byte-for-byte serving, next-run default off. RED run with main's source: agent 51 failed / 1911 passed (1962), viewer 5 failed / 1003 passed (1008).
