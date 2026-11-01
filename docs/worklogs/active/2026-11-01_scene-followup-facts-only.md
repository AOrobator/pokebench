# scene-followup-prompt-v1: facts-only note

**Started:** 2026-11-01
**Status:** Active; operator chose facts-only (no talk/action order) and said "land it"
**Branch:** `cursor/scene-followup-facts-only`

## Problem Statement

`scene-followup-prompt-v1` quotes a useful anonymous cutscene (pages + on-screen cast) but then told the model to walk up and talk to the nearest participant. On the only scene this fires on (Petalburg Woods theft), those actors often leave before control returns, so the action order sends the model hunting ghosts. Keep the facts; drop the talk order.

## Skills Loaded

- `.claude/skills/feature-switch/SKILL.md` (OFF of this switch still means no note; ON wording corrected in place by operator choice for simplicity)
- `.claude/skills/feature-explainer/SKILL.md`
- `.claude/skills/execute-worklog/SKILL.md`
- `.claude/skills/talk-to-codex/SKILL.md`

## Architecture

Same trigger and delivery (`sceneFollowup` / `sceneFollowupContext`). Only `sceneFollowupNote` text changes: ends after “That was a story event, not background flavor.” Registry description and explainer updated; prior talk-order probe numbers labeled historical.

## Invariants

- **INV-1:** OFF still delivers no SUPERVISOR note. Test: existing OFF factory cases.
- **INV-2:** ON note is exactly the facts-only string for the recorded theft fixture. Test: `scene-followup.test.ts` NOTE pin.
- **INV-3:** Note still quotes whole pages and on-screen people; no new story destination invented. Test: same fixture expectation without talk clause.

## Security Review

Model-facing text only; no new tools, no ROM, no network, no secrets.

## Milestones

**M1 — Facts-only note**
- [x] Implement note + registry + explainer
- [x] Cheap checks: `vitest` scene-followup + gym-campaign 38/38; `just pages-theme` / `pages-check` clean
- [x] Full gates: `just lint`/`build`/`test`/`verify-vendor` PASS on `e752ea01a` (agent 5256, viewer 2387, python 4979, gateway 116, trainer-card 3; coverage ≥90). CPU START unilateral after empty lock/board + 2 unanswered relay pings; RELEASE after gates.
- [x] Principles self-review (0 FAIL)
- [x] Three cloud lanes: Claude LGTM; Grok/GPT waived by operator ("land. it.") after usage outage
- [x] Land ff-only onto main at `5f1b3a35a` (feature `e752ea01a`); post-merge `just test` PASS; `just land-done`

## Closing the Loop

Operator surface: SUPERVISOR note after the Woods theft scene. Proof: unit pin of exact note bytes; explainer quotes the same. Live run re-probe deferred (operator: facts only for now).

## Session Log

- 2026-11-01: Operator: content useful, talk-to-people wrong when actors left; keep facts only, simpler. Branch `cursor/scene-followup-facts-only`. Note truncated; registry/explainer updated. CPU START requested via tell-claude.
- 2026-11-01: Landed ff-only main `5f1b3a35a` after operator "land. it." (Grok/GPT waived). Post-merge `just test` PASS.

## Surprises

None yet.

## Multi-Model Review Log

- Frozen (resealed after worklog commit): base `8a2abbb74` head `a11506d39` (feature code `e752ea01a`) diff SHA-256 `8ace43e516a574784abc9f4fde521e8c799366d65e3e3e7a0430f52c19d6e9d7`
- Principles: `runs/reviews/scene-followup-facts-only/principles-adherence.md` (0 FAIL)
- Round 1 Cursor Task Claude/Grok/GPT: all failed — Cursor usage limit.
- Harness switch: Claude CLI (`~/.claude-review`, plan mode) → **VERDICT: LGTM** (`/tmp/review-sf-facts-20261101011000.claude.log`). Non-blocking notes: update worklog freeze SHA; split pre/post `e752ea01a` bundle runs by harness commit when comparing.
- Grok: `cursor-agent` `grok-4.7-high-fast` and `cursor-grok-4.5-high` → same Cursor usage limit. No alternate Grok harness.
- GPT: Cursor Task + `cursor-agent gpt-5.6-sol-xhigh` → usage limit. Codex CLI ChatGPT account rejected `gpt-6.1-sol` and `gpt-5.2` (`model_not_found`).
- Per execute-worklog: missing cloud lanes → no self-merge. Asked operator.
- 2026-11-01 operator: "land. it." — authorize land with Claude LGTM only; Grok/GPT waived for Cursor/Codex usage outage on this wording fix.

## Boy Scout Log

None.

## Archive Milestone

- [ ] ASK USER: archive when landed and operator agrees
